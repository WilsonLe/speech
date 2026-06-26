from __future__ import annotations

import base64
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

import pytest
from speech_profile_trainer import (
    evaluate_adapter_activation,
    load_activation_gate_config,
    load_training_config,
    package_adapter_package_as_speechmodel,
    package_personal_adapter,
    package_personal_adapter_as_speechmodel,
    validate_personal_adapter_package,
)
from speech_profile_trainer.__main__ import main as trainer_main
from speech_profile_trainer.training import train_frozen_base_adapter, write_training_outputs
from test_profile_trainer import make_profile_package
from test_training import DEFAULT_CONFIG_PATH, _adapter_manifest

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GATE_PATH = REPO_ROOT / "training/configs/personalization/default-activation-gate.json"


def test_package_personal_adapter_emits_browser_profile_manifest_without_private_text() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)

    package_result = package_personal_adapter(
        adapter_bytes=training_result.adapter_bytes,
        training_metadata=training_result.metadata,
        evaluation_report=evaluation_result.report,
        display_name="Local adapter package",
        exported_at="2026-06-23T00:00:00.000Z",
    )
    package = package_result.package
    manifest = package_result.manifest

    validate_personal_adapter_package(package)
    assert package["packageType"] == "speech-personal-adapter-package"
    assert manifest["schemaVersion"] == 1
    assert manifest["id"] == "profile-local"
    assert manifest["baseModel"] == {
        key: training_result.metadata["baseModel"][key]
        for key in ("id", "version", "manifestSha256", "graphContractSha256")
    }
    assert manifest["languages"] == ["vi", "en"]
    assert manifest["enrollment"]["acceptedUtterances"] == 5
    assert manifest["enrollment"]["acceptedSeconds"] > 0
    assert manifest["adaptation"]["type"] == "residual-adapter"
    assert manifest["adaptation"]["adapter"]["graphFileKey"] == "adapterGraph"
    assert manifest["adaptation"]["adapter"]["activationSwap"] == "utterance-boundary"
    assert manifest["adaptation"]["training"]["runtime"] == "python-profile-trainer"
    assert manifest["evaluation"]["activationGatePassed"] is True
    assert package["privacy"] == {
        "containsRawAudio": False,
        "containsTranscriptText": False,
        "containsRawProfileData": False,
        "containsAdapterWeights": True,
        "containsBaseModelWeights": False,
        "exportEncrypted": False,
        "localOnly": True,
    }
    package_text = json.dumps(package, ensure_ascii=False)
    assert "Tôi vừa update dashboard" not in package_text
    assert "case-personal" not in package_text
    assert "SecretInactiveTerm" not in package_text


def test_validate_personal_adapter_package_rejects_embedded_manifest_mismatch() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    package = package_personal_adapter(
        adapter_bytes=training_result.adapter_bytes,
        training_metadata=training_result.metadata,
        evaluation_report=evaluation_result.report,
    ).package
    manifest_path = "profiles/profile-local/profile.json"
    embedded_manifest = package["manifest"] | {"displayName": "tampered"}
    body = json.dumps(embedded_manifest, sort_keys=True, separators=(",", ":")).encode()
    file_entry = package["files"][manifest_path]
    file_entry["base64"] = base64.b64encode(body).decode("ascii")
    file_entry["sha256"] = hashlib.sha256(body).hexdigest()
    file_entry["sizeBytes"] = len(body)
    package["checksums"]["files"][manifest_path] = {
        "sha256": file_entry["sha256"],
        "sizeBytes": len(body),
    }

    with pytest.raises(ValueError, match="embedded profile.json"):
        validate_personal_adapter_package(package)


def test_validate_personal_adapter_package_rejects_manifest_adapter_ref_mismatch() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    package = package_personal_adapter(
        adapter_bytes=training_result.adapter_bytes,
        training_metadata=training_result.metadata,
        evaluation_report=evaluation_result.report,
    ).package
    manifest_path = "profiles/profile-local/profile.json"
    package["manifest"]["adaptation"]["files"]["adapterGraph"]["sha256"] = "0" * 64
    manifest_body = json.dumps(
        package["manifest"], sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()
    manifest_entry = package["files"][manifest_path]
    manifest_entry["base64"] = base64.b64encode(manifest_body).decode("ascii")
    manifest_entry["sha256"] = hashlib.sha256(manifest_body).hexdigest()
    manifest_entry["sizeBytes"] = len(manifest_body)
    package["checksums"]["files"][manifest_path] = {
        "sha256": manifest_entry["sha256"],
        "sizeBytes": len(manifest_body),
    }

    with pytest.raises(ValueError, match="adapter file ref sha256"):
        validate_personal_adapter_package(package)


def test_package_personal_adapter_rejects_tampered_adapter_bytes() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)

    with pytest.raises(ValueError, match="adapter.sha256"):
        package_personal_adapter(
            adapter_bytes=training_result.adapter_bytes + b"tampered",
            training_metadata=training_result.metadata,
            evaluation_report=evaluation_result.report,
        )


def test_package_personal_adapter_rejects_failed_activation_gate() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata, failing_anchor=True)

    with pytest.raises(ValueError, match="activation gate"):
        package_personal_adapter(
            adapter_bytes=training_result.adapter_bytes,
            training_metadata=training_result.metadata,
            evaluation_report=evaluation_result.report,
        )


def test_package_personal_adapter_as_speechmodel_wraps_cli_residual_adapter() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    base_manifest, base_manifest_bytes = _adapter_manifest()

    result = package_personal_adapter_as_speechmodel(
        adapter_bytes=training_result.adapter_bytes,
        training_metadata=training_result.metadata,
        evaluation_report=evaluation_result.report,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
        display_name="Local adapter package",
        exported_at="2026-06-23T00:00:00.000Z",
        allow_unencrypted=True,
    )

    parsed = _parse_speechmodel(result.bytes)
    manifest = parsed["manifest"]
    assert parsed["envelopeHeader"] == {"formatVersion": 1, "mode": "unencrypted"}
    assert manifest["adaptation"]["type"] == "cli-residual-adapter"
    assert manifest["adaptation"]["algorithmId"] == "cli-residual-adapter-v1"
    assert (
        manifest["adaptation"]["files"]["adapterGraph"]["sha256"]
        == training_result.metadata["adapter"]["sha256"]
    )
    assert manifest["adaptation"]["files"]["profileManifest"]["path"] == (
        "metadata/profile-manifest.json"
    )
    assert manifest["baseModel"] == {
        "id": training_result.metadata["baseModel"]["id"],
        "version": training_result.metadata["baseModel"]["version"],
        "manifestSha256": training_result.metadata["baseModel"]["manifestSha256"],
        "graphContractSha256": training_result.metadata["baseModel"]["graphContractSha256"],
        "tokenizerSha256": _sha256(_canonical_json(base_manifest["tokenizer"]).encode()),
    }
    assert manifest["privacy"] == {
        "containsRawAudio": False,
        "containsPreparedFeatures": False,
        "containsVoiceDerivedWeights": True,
    }
    assert "manifest.json" in parsed["files"]
    assert "profiles/profile-local/adapters/" in " ".join(parsed["files"])
    assert "test-vectors/cli-residual-adapter-smoke.json" in parsed["files"]
    for private_text in ["Tôi vừa update dashboard", "case-personal", "SecretInactiveTerm"]:
        assert private_text.encode("utf-8") not in result.bytes


def test_package_personal_adapter_as_speechmodel_requires_explicit_unencrypted_flag() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    base_manifest, base_manifest_bytes = _adapter_manifest()

    with pytest.raises(ValueError, match="allow_unencrypted"):
        package_personal_adapter_as_speechmodel(
            adapter_bytes=training_result.adapter_bytes,
            training_metadata=training_result.metadata,
            evaluation_report=evaluation_result.report,
            base_model_manifest=base_manifest,
            base_model_manifest_bytes=base_manifest_bytes,
        )


def test_package_personal_adapter_as_speechmodel_rejects_failed_activation_gate() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata, failing_anchor=True)
    base_manifest, base_manifest_bytes = _adapter_manifest()

    with pytest.raises(ValueError, match="activation gate"):
        package_personal_adapter_as_speechmodel(
            adapter_bytes=training_result.adapter_bytes,
            training_metadata=training_result.metadata,
            evaluation_report=evaluation_result.report,
            base_model_manifest=base_manifest,
            base_model_manifest_bytes=base_manifest_bytes,
            allow_unencrypted=True,
        )


def test_package_adapter_package_as_speechmodel_requires_training_metadata() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    base_manifest, base_manifest_bytes = _adapter_manifest()
    package = package_personal_adapter(
        adapter_bytes=training_result.adapter_bytes,
        training_metadata=training_result.metadata,
        evaluation_report=evaluation_result.report,
    ).package
    del package["manifest"]["adaptation"]["training"]
    _rewrite_embedded_manifest(package)

    with pytest.raises(ValueError, match="training"):
        package_adapter_package_as_speechmodel(
            adapter_package=package,
            base_model_manifest=base_manifest,
            base_model_manifest_bytes=base_manifest_bytes,
            allow_unencrypted=True,
        )


def test_package_personal_adapter_as_speechmodel_requires_exact_base_manifest() -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    base_manifest, base_manifest_bytes = _adapter_manifest()
    tampered_manifest = base_manifest | {"version": "wrong-version"}

    with pytest.raises(ValueError, match="profile baseModel.version"):
        package_personal_adapter_as_speechmodel(
            adapter_bytes=training_result.adapter_bytes,
            training_metadata=training_result.metadata,
            evaluation_report=evaluation_result.report,
            base_model_manifest=tampered_manifest,
            base_model_manifest_bytes=base_manifest_bytes,
            allow_unencrypted=True,
        )


def test_package_cli_writes_speechprofile_package(tmp_path: Path, capsys: Any) -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    output_paths = write_training_outputs(training_result, tmp_path / "training")
    evaluation_path = tmp_path / "evaluation-report.json"
    evaluation_path.write_text(json.dumps(evaluation_result.report), encoding="utf-8")
    package_path = tmp_path / "profile-adapter.speechprofile"

    exit_code = trainer_main(
        [
            "package",
            "--adapter",
            str(output_paths.adapter_path),
            "--training-metadata",
            str(output_paths.metadata_path),
            "--evaluation-report",
            str(evaluation_path),
            "--output",
            str(package_path),
            "--display-name",
            "Local adapter package",
            "--json",
        ]
    )

    payload = json.loads(capsys.readouterr().out)
    package = json.loads(package_path.read_text())
    assert exit_code == 0
    assert payload["profileId"] == "profile-local"
    assert payload["outputPath"] == str(package_path)
    assert payload["activationGatePassed"] is True
    validate_personal_adapter_package(package)


def test_package_speechmodel_cli_writes_portable_container(tmp_path: Path, capsys: Any) -> None:
    training_result = _training_result()
    evaluation_result = _evaluation_result(training_result.metadata)
    output_paths = write_training_outputs(training_result, tmp_path / "training")
    evaluation_path = tmp_path / "evaluation-report.json"
    evaluation_path.write_text(json.dumps(evaluation_result.report), encoding="utf-8")
    base_manifest, base_manifest_bytes = _adapter_manifest()
    base_manifest_path = tmp_path / "base-model-manifest.json"
    base_manifest_path.write_bytes(base_manifest_bytes)
    package_path = tmp_path / "profile-adapter.speechmodel"

    exit_code = trainer_main(
        [
            "package-speechmodel",
            "--adapter",
            str(output_paths.adapter_path),
            "--training-metadata",
            str(output_paths.metadata_path),
            "--evaluation-report",
            str(evaluation_path),
            "--base-model-manifest",
            str(base_manifest_path),
            "--output",
            str(package_path),
            "--display-name",
            "Local adapter package",
            "--allow-unencrypted",
            "--json",
        ]
    )

    payload = json.loads(capsys.readouterr().out)
    parsed = _parse_speechmodel(package_path.read_bytes())
    assert exit_code == 0
    assert payload["profileId"] == "profile-local"
    assert payload["outputPath"] == str(package_path)
    assert payload["activationGatePassed"] is True
    assert payload["adaptationType"] == "cli-residual-adapter"
    assert payload["encrypted"] is False
    assert parsed["manifest"]["bundleId"] == payload["bundleId"]
    assert parsed["manifest"]["baseModel"]["tokenizerSha256"] == _sha256(
        _canonical_json(base_manifest["tokenizer"]).encode()
    )


def _training_result():
    manifest, manifest_bytes = _adapter_manifest()
    profile_package = make_profile_package(manifest, manifest_bytes)
    return train_frozen_base_adapter(
        profile_package=profile_package,
        base_model_manifest=manifest,
        config=load_training_config(DEFAULT_CONFIG_PATH),
        profile_package_bytes=json.dumps(profile_package, sort_keys=True).encode(),
        base_model_manifest_bytes=manifest_bytes,
        config_bytes=DEFAULT_CONFIG_PATH.read_bytes(),
        created_at="2026-06-23T00:00:00.000Z",
    )


def _evaluation_result(training_metadata: dict[str, Any], *, failing_anchor: bool = False):
    cases = _evaluation_cases()
    if failing_anchor:
        cases[2] = cases[2] | {"adaptedText": "Sai hoàn toàn câu kiểm tra chung."}
    return evaluate_adapter_activation(
        evaluation_cases=cases,
        training_metadata=training_metadata,
        gate_config=load_activation_gate_config(DEFAULT_GATE_PATH),
    )


def _rewrite_embedded_manifest(package: dict[str, Any]) -> None:
    manifest_path = f"profiles/{package['profileId']}/profile.json"
    manifest_body = _canonical_json(package["manifest"]).encode()
    file_entry = package["files"][manifest_path]
    file_entry["base64"] = base64.b64encode(manifest_body).decode("ascii")
    file_entry["sha256"] = hashlib.sha256(manifest_body).hexdigest()
    file_entry["sizeBytes"] = len(manifest_body)
    package["checksums"]["files"][manifest_path] = {
        "sha256": file_entry["sha256"],
        "sizeBytes": len(manifest_body),
    }


def _parse_speechmodel(body: bytes) -> dict[str, Any]:
    outer_magic = b"WLSPEECHMODEL\x00\x01"
    inner_magic = b"WLSPEECHBUNDLE\x00\x01"
    assert body.startswith(outer_magic)
    assert body[len(outer_magic)] == 1
    assert body[len(outer_magic) + 1] == 0
    header_length = struct.unpack_from("<I", body, len(outer_magic) + 2)[0]
    header_start = len(outer_magic) + 2 + 4
    header = json.loads(body[header_start : header_start + header_length].decode())
    inner = body[header_start + header_length :]
    assert inner.startswith(inner_magic)
    index_length = struct.unpack_from("<I", inner, len(inner_magic))[0]
    index_start = len(inner_magic) + 4
    index = json.loads(inner[index_start : index_start + index_length].decode())
    data_offset = index_start + index_length
    files: dict[str, bytes] = {}
    for entry in index["files"]:
        start = data_offset + entry["offset"]
        end = start + entry["sizeBytes"]
        file_body = inner[start:end]
        assert hashlib.sha256(file_body).hexdigest() == entry["sha256"]
        files[entry["path"]] = file_body
    return {
        "envelopeHeader": header,
        "index": index,
        "manifest": json.loads(files["manifest.json"].decode()),
        "files": files,
    }


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _evaluation_cases() -> list[dict[str, Any]]:
    return [
        {
            "id": "case-personal-1",
            "split": "personal-holdout",
            "language": "en",
            "voiceCondition": "normal",
            "referenceText": "Please open Wilson Speech private launch.",
            "baseText": "Please open Speech private launch.",
            "adaptedText": "Please open Wilson Speech private launch.",
            "expectedCustomTerms": ["Wilson Speech"],
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 3000,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-personal-2",
            "split": "personal-holdout",
            "language": "mixed",
            "voiceCondition": "projected",
            "referenceText": "Tôi vừa update dashboard hôm nay.",
            "baseText": "Tôi vừa dashboard hôm nay.",
            "adaptedText": "Tôi vừa update dashboard hôm nay.",
            "expectedCustomTerms": ["update dashboard"],
            "inactiveCustomTerms": ["SecretInactiveTerm", "dash"],
            "durationMs": 2800,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-anchor-1",
            "split": "anchor",
            "language": "vi",
            "voiceCondition": "normal",
            "referenceText": "Đây là câu kiểm tra chung.",
            "baseText": "Đây là câu kiểm tra chung.",
            "adaptedText": "Đây là câu kiểm tra chung.",
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 2500,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-anchor-2",
            "split": "anchor",
            "language": "en",
            "voiceCondition": "normal",
            "referenceText": "This is a generic anchor sentence.",
            "baseText": "This is a generic anchor sentence.",
            "adaptedText": "This is a generic anchor sentence.",
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 2600,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
    ]
