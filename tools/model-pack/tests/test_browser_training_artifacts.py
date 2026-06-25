import hashlib
import json
from pathlib import Path

from speech_model_pack import validate_manifest_v3
from speech_model_pack.browser_training_artifacts import (
    ARTIFACT_FILES,
    ARTIFACT_MEDIA_TYPE,
    build_browser_training_manifest,
    generate_browser_training_artifacts,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"
BROWSER_TRAINING_MANIFEST_PATH = (
    REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock-browser-training.json"
)
COMMITTED_ARTIFACT_DIR = REPO_ROOT / "model-packs/example-manifest/browser-training"


def test_browser_training_artifact_generator_matches_committed_json_semantics(
    tmp_path: Path,
) -> None:
    generated = generate_browser_training_artifacts(tmp_path)

    for file_key, role, filename in ARTIFACT_FILES:
        generated_payload = json.loads(generated[file_key].read_text())
        committed_payload = json.loads((COMMITTED_ARTIFACT_DIR / filename).read_text())

        assert generated_payload == committed_payload
        assert committed_payload["artifactRole"] == role
        assert committed_payload["privacy"]["containsRawAudio"] is False
        assert committed_payload["privacy"]["containsTranscriptText"] is False
        assert committed_payload["privacy"]["containsPrivateFrozenFeatureValues"] is False
        assert committed_payload["privacy"]["networkUpload"] is False
        assert committed_payload["privacy"]["localOnly"] is True


def test_browser_training_manifest_builder_matches_committed_manifest_semantics() -> None:
    artifact_paths = {
        file_key: COMMITTED_ARTIFACT_DIR / filename for file_key, _role, filename in ARTIFACT_FILES
    }

    generated_manifest = build_browser_training_manifest(
        BASE_MANIFEST_PATH,
        artifact_paths,
        BROWSER_TRAINING_MANIFEST_PATH,
    )
    committed_manifest = json.loads(BROWSER_TRAINING_MANIFEST_PATH.read_text())

    assert generated_manifest == committed_manifest


def test_committed_browser_training_manifest_validates_and_hashes_artifacts() -> None:
    manifest = json.loads(BROWSER_TRAINING_MANIFEST_PATH.read_text())

    assert validate_manifest_v3(manifest) == []
    assert manifest["schemaVersion"] == 3
    assert manifest["browserTraining"]["backend"] == {
        "interface": "BrowserTrainingBackend",
        "kind": "repository-fixed-adapter-math",
        "proofStatus": "fixed-adapter-math-required",
    }

    for file_key, _role, filename in ARTIFACT_FILES:
        file_ref = manifest["files"][file_key]
        artifact_path = COMMITTED_ARTIFACT_DIR / filename
        artifact_body = artifact_path.read_bytes()

        assert file_ref["url"] == f"browser-training/{filename}"
        assert file_ref["mediaType"] == ARTIFACT_MEDIA_TYPE
        assert file_ref["sizeBytes"] == len(artifact_body)
        assert file_ref["sha256"] == hashlib.sha256(artifact_body).hexdigest()
