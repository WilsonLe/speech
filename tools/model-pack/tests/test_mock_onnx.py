import json
from pathlib import Path

from speech_model_pack.mock_onnx import generate_mock_graphs, update_manifest_file_entries

REPO_ROOT = Path(__file__).resolve().parents[3]
COMMITTED_FILES_DIR = REPO_ROOT / "model-packs/example-manifest/files"
EXAMPLE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"


def test_mock_onnx_generator_reproduces_committed_graph_files(tmp_path: Path) -> None:
    generated = generate_mock_graphs(tmp_path)

    for file_key, generated_path in generated.items():
        committed_path = COMMITTED_FILES_DIR / f"{file_key}.onnx"
        assert generated_path.read_bytes() == committed_path.read_bytes()


def test_update_manifest_file_entries_records_sizes_and_hashes(tmp_path: Path) -> None:
    manifest_path = tmp_path / "manifest.json"
    manifest = json.loads(EXAMPLE_MANIFEST_PATH.read_text())
    manifest["files"] = {}
    manifest_path.write_text(json.dumps(manifest))
    generated = generate_mock_graphs(tmp_path / "files")

    update_manifest_file_entries(manifest_path, generated)

    updated = json.loads(manifest_path.read_text())
    assert set(updated["files"]) == {"encoder", "predictor", "joiner"}
    for file_key, file_ref in updated["files"].items():
        assert file_ref["url"] == f"files/{file_key}.onnx"
        assert file_ref["mediaType"] == "application/onnx"
        assert file_ref["sizeBytes"] == (tmp_path / file_ref["url"]).stat().st_size
        assert len(file_ref["sha256"]) == 64
