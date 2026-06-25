import hashlib
import json
import struct
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
    assert manifest["browserTraining"]["featureTap"] == {
        "graphId": "encoder",
        "outputName": "encoded",
        "dimension": 4,
        "frameShiftMs": 10,
        "persistedDtype": "float16",
    }
    assert manifest["browserTraining"]["ctcProjection"] == {
        "kind": "frozen-linear-ctc-projection-v1",
        "inputGraphId": "encoder",
        "inputName": "encoded",
        "inputDimension": 4,
        "logitsName": "ctc_logits",
        "logitsDtype": "float32",
        "vocabularySize": 4,
        "blankId": 0,
        "trainable": False,
        "artifact": manifest["browserTraining"]["artifacts"]["evalModel"],
    }

    for file_key, _role, filename in ARTIFACT_FILES:
        file_ref = manifest["files"][file_key]
        artifact_path = COMMITTED_ARTIFACT_DIR / filename
        artifact_body = artifact_path.read_bytes()

        assert file_ref["url"] == f"browser-training/{filename}"
        assert file_ref["mediaType"] == ARTIFACT_MEDIA_TYPE
        assert file_ref["sizeBytes"] == len(artifact_body)
        assert file_ref["sha256"] == hashlib.sha256(artifact_body).hexdigest()


def test_committed_anchor_pack_is_generic_licensed_and_privacy_preserving() -> None:
    artifact = json.loads((COMMITTED_ARTIFACT_DIR / "anchor-pack.json").read_text())
    anchor_pack = artifact["anchorPack"]

    assert artifact["artifactRole"] == "anchor-pack"
    assert artifact["license"]["redistributionAllowed"] is True
    assert artifact["provenance"]["source"] == "repo-generated-synthetic-fixture"
    assert anchor_pack["kind"] == "generic-anchor-feature-pack-v1"
    assert anchor_pack["contractVersion"] == 1
    assert anchor_pack["featureTap"]["outputName"] == "encoded"
    assert anchor_pack["featureEncoding"] == {
        "valueEncoding": "json-float32",
        "sourceDtype": "float16",
        "frameDimension": 4,
        "frameShiftMs": 10,
    }
    assert anchor_pack["licenseGate"] == {
        "redistributionAllowed": True,
        "sourceProvenanceRequired": True,
        "syntheticOnly": True,
        "participantConsentRequired": False,
    }
    assert anchor_pack["privacyGate"] == {
        "containsRawAudio": False,
        "containsTranscriptText": False,
        "containsPrivateFrozenFeatureValues": False,
        "containsPublicSyntheticFrozenFeatureValues": True,
        "containsVoiceDerivedWeights": False,
        "localOnly": True,
    }
    assert anchor_pack["caseCount"] == len(anchor_pack["cases"])
    assert anchor_pack["caseIdSha256"] == [case["caseIdSha256"] for case in anchor_pack["cases"]]

    for case in anchor_pack["cases"]:
        assert set(case) == {
            "caseIdSha256",
            "language",
            "voiceCondition",
            "featureFrameCount",
            "featureDimension",
            "syntheticFeatureFrames",
            "littleEndianFloat32FeatureSha256",
            "expectedMetrics",
            "license",
            "provenance",
        }
        assert case["license"] == artifact["license"]
        assert case["provenance"] == artifact["provenance"]
        assert case["featureFrameCount"] == len(case["syntheticFeatureFrames"])
        assert case["featureDimension"] == 4
        assert all(
            len(frame) == case["featureDimension"] for frame in case["syntheticFeatureFrames"]
        )
        flattened = [value for frame in case["syntheticFeatureFrames"] for value in frame]
        feature_bytes = b"".join(struct.pack("<f", value) for value in flattened)
        assert case["littleEndianFloat32FeatureSha256"] == hashlib.sha256(feature_bytes).hexdigest()


def test_committed_ctc_projection_vectors_match_exported_projection_parameters() -> None:
    eval_model = json.loads((COMMITTED_ARTIFACT_DIR / "eval-model.json").read_text())
    vector_pack = json.loads((COMMITTED_ARTIFACT_DIR / "contract-test-vectors.json").read_text())

    projection = eval_model["evaluationContract"]["frozenCtcProjection"]
    weight_tensor, bias_tensor = projection["parameterTensors"]
    weights = weight_tensor["values"]
    bias = bias_tensor["values"]
    vocabulary_size = projection["vocabularySize"]

    for vector in vector_pack["ctcProjectionVectors"]:
        logits = []
        for token_index in range(vocabulary_size):
            logit = bias[token_index]
            for input_index, value in enumerate(vector["inputFrame"]):
                logit += value * weights[input_index * vocabulary_size + token_index]
            logits.append(round(logit, 12))

        assert vector["blankId"] == projection["blankId"]
        assert vector["vocabularySize"] == projection["vocabularySize"]
        assert logits == vector["expectedLogits"]
