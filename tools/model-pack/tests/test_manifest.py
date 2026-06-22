import json
from copy import deepcopy
from pathlib import Path

from speech_model_pack import validate_manifest_minimum, validate_manifest_v2

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"


def load_example_manifest() -> dict[str, object]:
    return json.loads(EXAMPLE_MANIFEST_PATH.read_text())


def test_validate_manifest_v2_accepts_example_manifest() -> None:
    assert validate_manifest_v2(load_example_manifest()) == []
    assert validate_manifest_minimum(load_example_manifest()) == []


def test_validate_manifest_v2_reports_missing_graphs() -> None:
    errors = validate_manifest_v2({"schemaVersion": 2, "graphs": {}})

    assert "graphs.encoder is required" in errors
    assert "graphs.predictor is required" in errors
    assert "graphs.joiner is required" in errors


def test_validate_manifest_v2_rejects_bad_file_and_graph_references() -> None:
    manifest = load_example_manifest()
    manifest["files"] = {
        "encoder": {
            "url": "/models/mock/encoder.onnx",
            "sha256": "not-a-sha",
            "sizeBytes": 0,
            "mediaType": "",
        }
    }

    errors = validate_manifest_v2(manifest)

    assert "files.encoder.sha256 has invalid format" in errors
    assert "files.encoder.sizeBytes must be a positive integer" in errors
    assert "files.encoder.mediaType must be a non-empty string" in errors
    assert "graphs.predictor.fileKey must reference an entry in files" in errors
    assert "graphs.joiner.fileKey must reference an entry in files" in errors


def test_validate_manifest_v2_rejects_token_ids_outside_vocabulary() -> None:
    manifest = load_example_manifest()
    manifest["languages"] = ["vi"]
    manifest["supportedLanguageModes"] = ["auto"]
    tokenizer = deepcopy(manifest["tokenizer"])
    assert isinstance(tokenizer, dict)
    tokenizer["blankId"] = 4
    tokenizer["languageTokenIds"] = {"vi": 10, "klingon": 2}
    manifest["tokenizer"] = tokenizer

    errors = validate_manifest_v2(manifest)

    assert "supportedLanguageModes must include language vi" in errors
    assert "tokenizer.blankId must be less than tokenizer.vocabularySize" in errors
    assert "tokenizer.languageTokenIds.vi must be less than tokenizer.vocabularySize" in errors
    assert "tokenizer.languageTokenIds.klingon is not a supported language mode" in errors


def test_validate_manifest_v2_rejects_bad_state_relationships() -> None:
    manifest = load_example_manifest()
    graphs = deepcopy(manifest["graphs"])
    assert isinstance(graphs, dict)
    encoder = graphs["encoder"]
    assert isinstance(encoder, dict)
    encoder["stateRelationships"] = [
        {"input": "missing-input", "output": "missing-output", "resetAtUtteranceBoundary": True}
    ]
    manifest["graphs"] = graphs

    errors = validate_manifest_v2(manifest)

    assert (
        "graphs.encoder.stateRelationships[0].input must reference a graph input tensor" in errors
    )
    assert (
        "graphs.encoder.stateRelationships[0].output must reference a graph output tensor" in errors
    )
