from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from speech_profile_trainer import (
    config_to_json,
    load_training_config,
    parse_training_config,
    train_frozen_base_adapter,
    write_training_outputs,
)
from speech_profile_trainer.__main__ import main as trainer_main
from test_profile_trainer import _load_base_manifest, make_profile_package

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG_PATH = REPO_ROOT / "training/configs/personalization/default-adapter-trainer.json"


def test_frozen_base_adapter_training_emits_reproducibility_metadata(tmp_path: Path) -> None:
    manifest, manifest_bytes = _adapter_manifest()
    profile_package = make_profile_package(manifest, manifest_bytes)
    profile_package_bytes = json.dumps(profile_package, sort_keys=True).encode()
    config = load_training_config(DEFAULT_CONFIG_PATH)
    config_bytes = DEFAULT_CONFIG_PATH.read_bytes()

    result = train_frozen_base_adapter(
        profile_package=profile_package,
        base_model_manifest=manifest,
        config=config,
        profile_package_bytes=profile_package_bytes,
        base_model_manifest_bytes=manifest_bytes,
        config_bytes=config_bytes,
        created_at="2026-06-23T00:00:00.000Z",
    )
    paths = write_training_outputs(result, tmp_path)

    assert len(result.adapter_bytes) == config.adapter.parameter_count * 4
    assert paths.adapter_path.read_bytes() == result.adapter_bytes
    metadata = json.loads(paths.metadata_path.read_text())
    assert metadata["baseModel"]["frozen"] is True
    assert metadata["baseModel"]["modified"] is False
    assert metadata["optimization"]["baseGradientEnabled"] is False
    assert metadata["adapter"] == result.metadata["adapter"]
    assert metadata["adapter"]["trainableParameterGroups"] == ["residual-adapter"]
    assert metadata["adapter"]["insertionPointIds"] == ["encoder-block-11"]
    assert metadata["reproducibility"]["randomSeed"] == 20260623
    assert metadata["reproducibility"]["configSha256"]
    assert metadata["dataset"]["records"] == 5
    assert metadata["dataset"]["splits"] == {"train": 3, "validation": 1, "test": 1}
    prompt_splits = metadata["dataset"]["promptSplits"]
    assert len(prompt_splits) == 4
    assert {entry["split"] for entry in prompt_splits} == {"train", "validation", "test"}
    assert all(len(entry["promptIdSha256"]) == 64 for entry in prompt_splits)
    assert metadata["dataset"]["selectedVocabulary"]["selectedEntryCount"] == 2
    assert metadata["dataset"]["selectedVocabulary"]["selectedUtteranceCount"] == 3
    assert all(
        len(value) == 64
        for value in metadata["dataset"]["selectedVocabulary"]["selectedEntryIdSha256"]
    )
    assert all(
        len(value) == 64
        for entry in prompt_splits
        for value in entry["selectedVocabularyEntryIdSha256"]
    )
    metadata_text = json.dumps(metadata, ensure_ascii=False)
    assert "prompt-001" not in metadata_text
    assert "Tôi vừa update dashboard" not in metadata_text
    assert "Please open Wilson Speech" not in metadata_text
    assert "term-secret" not in metadata_text
    assert "term-dashboard" not in metadata_text


def test_frozen_base_training_rejects_manifest_without_residual_adapter_support() -> None:
    manifest, manifest_bytes = _load_base_manifest()
    profile_package = make_profile_package(manifest, manifest_bytes)
    config = load_training_config(DEFAULT_CONFIG_PATH)

    with pytest.raises(ValueError, match="personalization.residualAdapter"):
        train_frozen_base_adapter(
            profile_package=profile_package,
            base_model_manifest=manifest,
            base_model_manifest_bytes=manifest_bytes,
            config=config,
        )


def test_frozen_base_training_rejects_config_outside_manifest_contract() -> None:
    manifest, manifest_bytes = _adapter_manifest()
    profile_package = make_profile_package(manifest, manifest_bytes)
    config_json = config_to_json(load_training_config(DEFAULT_CONFIG_PATH))
    config_json["adapter"]["insertionPointIds"] = ["missing-point"]
    config = parse_training_config(config_json)

    with pytest.raises(ValueError, match="missing-point"):
        train_frozen_base_adapter(
            profile_package=profile_package,
            base_model_manifest=manifest,
            base_model_manifest_bytes=manifest_bytes,
            config=config,
        )


def test_train_cli_writes_adapter_and_metadata_without_private_text(
    tmp_path: Path, capsys: Any
) -> None:
    manifest, manifest_bytes = _adapter_manifest()
    profile_package = make_profile_package(manifest, manifest_bytes)
    profile_path = tmp_path / "profile.speechprofile.json"
    profile_path.write_text(json.dumps(profile_package, sort_keys=True), encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_bytes(manifest_bytes)
    output_dir = tmp_path / "out"

    exit_code = trainer_main(
        [
            "train",
            "--profile",
            str(profile_path),
            "--base-model-manifest",
            str(manifest_path),
            "--config",
            str(DEFAULT_CONFIG_PATH),
            "--output-dir",
            str(output_dir),
            "--json",
        ]
    )

    payload = json.loads(capsys.readouterr().out)
    metadata = json.loads((output_dir / "training-metadata.json").read_text())
    assert exit_code == 0
    assert Path(payload["adapterPath"]).exists()
    assert Path(payload["metadataPath"]).exists()
    assert payload["baseModelModified"] is False
    assert metadata["privacy"]["containsTranscriptText"] is False
    assert metadata["privacy"]["exposesRawVocabularyEntryIds"] is False
    metadata_text = json.dumps(metadata, ensure_ascii=False)
    assert "Tôi vừa update dashboard" not in metadata_text
    assert "term-secret" not in metadata_text


def _adapter_manifest() -> tuple[dict[str, Any], bytes]:
    manifest, _manifest_bytes = _load_base_manifest()
    manifest = copy.deepcopy(manifest)
    files = manifest["files"]
    assert isinstance(files, dict)
    files["adapter"] = {
        "url": "/models/mock/adapter.onnx",
        "sha256": "3" * 64,
        "sizeBytes": 1,
        "mediaType": "application/octet-stream",
    }
    graphs = manifest["graphs"]
    assert isinstance(graphs, dict)
    graphs["adapter"] = {
        "fileKey": "adapter",
        "inputs": [
            {
                "name": "encoder.block11.input",
                "dataType": "float32",
                "shape": ["batch", "frames", 256],
                "description": "Frozen base encoder activation before the adapter.",
            }
        ],
        "outputs": [
            {
                "name": "encoder.block11.output",
                "dataType": "float32",
                "shape": ["batch", "frames", 256],
                "description": "Adapter residual output for the base encoder.",
            }
        ],
    }
    manifest["personalization"] = {
        "residualAdapter": {
            "supported": True,
            "contractVersion": 1,
            "insertionPoints": [
                {
                    "id": "encoder-block-11",
                    "targetGraph": "encoder",
                    "inputTensor": "encoder.block11.input",
                    "outputTensor": "encoder.block11.output",
                    "application": "residual-add",
                }
            ],
            "maxParameters": 500_000,
            "maxAdapterSizeBytes": 10_000_000,
            "allowedPrecisions": ["float32", "float16"],
            "activationSwap": "utterance-boundary",
        }
    }
    manifest_bytes = json.dumps(manifest, sort_keys=True).encode()
    return manifest, manifest_bytes
