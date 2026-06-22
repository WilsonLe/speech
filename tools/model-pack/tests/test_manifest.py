from speech_model_pack import validate_manifest_minimum


def test_validate_manifest_minimum_accepts_required_contract() -> None:
    manifest = {
        "schemaVersion": 2,
        "id": "mock",
        "version": "0.0.0",
        "displayName": "Mock",
        "architecture": "rnnt",
        "sampleRateHz": 16000,
        "files": {"encoder": {"url": "mock.onnx"}},
        "graphs": {"encoder": {}, "predictor": {}, "joiner": {}},
    }

    assert validate_manifest_minimum(manifest) == []


def test_validate_manifest_minimum_reports_missing_graphs() -> None:
    errors = validate_manifest_minimum({"schemaVersion": 2})

    assert "graphs contract is required" in errors
