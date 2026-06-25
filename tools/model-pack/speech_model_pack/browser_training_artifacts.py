from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Any

BASE_MODEL_ID = "local-dev-rnnt-mock"
BASE_MODEL_VERSION = "0.0.1"
ARTIFACT_MEDIA_TYPE = "application/vnd.wilsonle.speech.browser-training-artifact+json"
CREATED_AT = "2026-06-25T00:00:00.000Z"
GENERATED_BY = "tools/model-pack/speech_model_pack/browser_training_artifacts.py"
ARTIFACT_DIRECTORY_NAME = "browser-training"
BROWSER_TRAINING_MANIFEST_NAME = "local-dev-rnnt-mock-browser-training.json"

ARTIFACT_LICENSE = {
    "spdx": "Apache-2.0",
    "name": "Synthetic browser-training artifact fixture",
    "noticeUrl": "../../MODEL_LICENSES.md",
    "redistributionAllowed": True,
}
ARTIFACT_PROVENANCE = {
    "source": "repo-generated-synthetic-fixture",
    "generatedBy": GENERATED_BY,
    "createdAt": CREATED_AT,
}
ARTIFACT_FILES: tuple[tuple[str, str, str], ...] = (
    ("training-model", "training-model", "training-model.json"),
    ("eval-model", "eval-model", "eval-model.json"),
    ("optimizer-model", "optimizer-model", "optimizer-model.json"),
    ("nominal-checkpoint", "nominal-checkpoint", "nominal-checkpoint.json"),
    ("adapter-runtime", "runtime-adapter", "adapter-runtime.json"),
    ("contract-test-vectors", "contract-test-vectors", "contract-test-vectors.json"),
    ("anchor-pack", "anchor-pack", "anchor-pack.json"),
)


def artifact_payloads() -> dict[str, dict[str, Any]]:
    adapter = _adapter_contract()
    privacy = _artifact_privacy()
    common = _common_artifact_metadata()
    return {
        "training-model": {
            **common,
            "artifactRole": "training-model",
            "description": (
                "Repository-owned fixed adapter-math training descriptor; this is not an ORT "
                "Training graph and contains no private examples or trainable user weights."
            ),
            "backend": _backend(),
            "adapter": adapter,
            "trainingContract": {
                "objective": "frame-ce-over-frozen-ctc-projection-v1",
                "trainableTensors": ["w_down", "b_down", "w_up", "b_up", "lhuc"],
                "frozenBaseGraphs": ["encoder", "predictor", "joiner"],
                "featureTap": _feature_tap(),
                "frozenCtcProjection": _ctc_projection_artifact_descriptor(),
                "gradientPrecision": "float32",
                "parameterInitialization": "identity-zero",
                "activationGateRequired": True,
                "privateDatasetRequired": True,
            },
            "privacy": privacy,
        },
        "eval-model": {
            **common,
            "artifactRole": "eval-model",
            "description": (
                "Aggregate-only evaluation descriptor for browser-trained adapters; it never "
                "stores raw audio, transcripts, frozen feature matrices, or adapter weights."
            ),
            "backend": _backend(),
            "adapter": adapter,
            "evaluationContract": {
                "input": "base-vs-browser-adapter-aggregate-metrics-v1",
                "frozenCtcProjection": _ctc_projection_artifact_descriptor(),
                "requiredMetrics": [
                    "wordErrorRate",
                    "characterErrorRate",
                    "customTermRecall",
                    "falseInsertionsPer100NonTargetUtterances",
                    "realTimeFactor",
                ],
                "activationGateRequired": True,
                "anchorRegressionRequired": True,
                "caseIdentifiers": "hashed-or-omitted",
            },
            "privacy": privacy,
        },
        "optimizer-model": {
            **common,
            "artifactRole": "optimizer-model",
            "description": (
                "Deterministic optimizer descriptor for the fixed browser adapter math backend; "
                "optimizer state is private checkpoint data and is not included here."
            ),
            "backend": _backend(),
            "optimizer": {
                "algorithm": "deterministic-sgd-v1",
                "learningRate": 0.04,
                "l2Regularization": 0.001,
                "gradientClipNorm": 1.0,
                "batchOrder": "stable-input-order",
                "checkpointResume": True,
            },
            "privacy": privacy,
        },
        "nominal-checkpoint": {
            **common,
            "artifactRole": "nominal-checkpoint",
            "description": (
                "Public identity-zero nominal checkpoint descriptor. It records tensor shapes, "
                "fill values, and deterministic zero-buffer hashes, not private user weights."
            ),
            "checkpoint": {
                "checkpointType": "identity-zero-nominal-v1",
                "step": 0,
                "epoch": 0,
                "adapter": adapter,
                "tensorInitializers": _zero_tensor_initializers(),
            },
            "privacy": {**privacy, "containsOptimizerState": False},
        },
        "adapter-runtime": {
            **common,
            "artifactRole": "runtime-adapter",
            "description": (
                "Runtime descriptor for applying residual-bottleneck/LHUC adapter tensors with "
                "the repository fixed math backend."
            ),
            "backend": _backend(),
            "adapter": adapter,
            "runtimeContract": {
                "implementation": "@speech/personalization/residual-bottleneck-lhuc",
                "formula": (
                    "output = (input + residualScale * "
                    "(tanh(input·w_down + b_down)·w_up + b_up)) * (2 * sigmoid(lhuc))"
                ),
                "identityPreservingInitialization": True,
                "swapPolicy": "utterance-boundary",
                "inputDtype": "float32",
                "outputDtype": "float32",
            },
            "privacy": privacy,
        },
        "contract-test-vectors": {
            **common,
            "artifactRole": "contract-test-vectors",
            "description": (
                "Synthetic public test vectors for browser-training contract wiring. These are "
                "not enrollment features, audio, transcripts, or user adapter weights."
            ),
            "vectors": _contract_test_vectors(),
            "ctcProjectionVectors": _ctc_projection_test_vectors(),
            "privacy": privacy,
        },
        "anchor-pack": {
            **common,
            "artifactRole": "anchor-pack",
            "description": (
                "Generic synthetic anchor feature pack for browser-training regression gates. "
                "It includes public synthetic feature frames, hash identifiers, license/provenance "
                "gates, and metric expectations; no prompt text or audio."
            ),
            "anchorPack": _anchor_pack_contract(),
            "privacy": privacy,
        },
    }


def generate_browser_training_artifacts(output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    payloads = artifact_payloads()
    paths: dict[str, Path] = {}
    for file_key, _role, filename in ARTIFACT_FILES:
        path = output_dir / filename
        _write_json(path, payloads[file_key])
        paths[file_key] = path
    return paths


def build_browser_training_manifest(
    base_manifest_path: Path,
    artifact_paths: dict[str, Path],
    manifest_path: Path,
) -> dict[str, Any]:
    manifest = json.loads(base_manifest_path.read_text())
    manifest["schemaVersion"] = 3
    files = dict(manifest["files"])
    for file_key, _role, _filename in ARTIFACT_FILES:
        path = artifact_paths[file_key]
        body = path.read_bytes()
        files[file_key] = {
            "url": path.relative_to(manifest_path.parent).as_posix(),
            "sha256": hashlib.sha256(body).hexdigest(),
            "sizeBytes": len(body),
            "mediaType": ARTIFACT_MEDIA_TYPE,
        }
    manifest["files"] = files
    manifest["browserTraining"] = _browser_training_contract(base_manifest_path, role_by_key())
    return manifest


def write_browser_training_manifest(
    base_manifest_path: Path,
    artifact_paths: dict[str, Path],
    manifest_path: Path,
) -> None:
    manifest = build_browser_training_manifest(base_manifest_path, artifact_paths, manifest_path)
    _write_json(manifest_path, manifest)


def role_by_key() -> dict[str, str]:
    return {file_key: role for file_key, role, _filename in ARTIFACT_FILES}


def _browser_training_contract(
    base_manifest_path: Path,
    roles: dict[str, str],
) -> dict[str, Any]:
    base_manifest = json.loads(base_manifest_path.read_text())
    return {
        "supported": True,
        "contractVersion": 1,
        "backend": _backend(),
        "algorithmId": "browser-top-adapter-frame-ce-v1",
        "minimumAppVersion": "0.5.0",
        "exactBaseModel": {
            "id": base_manifest["id"],
            "version": base_manifest["version"],
            "manifestSha256": hashlib.sha256(base_manifest_path.read_bytes()).hexdigest(),
            "graphContractSha256": _canonical_sha256(base_manifest["graphs"]),
            "tokenizerSha256": _canonical_sha256(base_manifest["tokenizer"]),
        },
        "featureTap": _feature_tap(),
        "ctcProjection": _ctc_projection_manifest_ref(roles),
        "adapter": {
            **_adapter_contract(),
            "runtimeGraph": _artifact_ref("adapter-runtime", roles["adapter-runtime"]),
            "preferredMaxBytes": 4096,
            "hardMaxBytes": 1_048_576,
        },
        "artifacts": {
            "trainingModel": _artifact_ref("training-model", roles["training-model"]),
            "evalModel": _artifact_ref("eval-model", roles["eval-model"]),
            "optimizerModel": _artifact_ref("optimizer-model", roles["optimizer-model"]),
            "nominalCheckpoint": [_artifact_ref("nominal-checkpoint", roles["nominal-checkpoint"])],
            "contractTestVectors": _artifact_ref(
                "contract-test-vectors", roles["contract-test-vectors"]
            ),
            "anchorPack": [_artifact_ref("anchor-pack", roles["anchor-pack"])],
        },
        "limits": {
            "maxUtterances": 12,
            "maxAcceptedSeconds": 120,
            "maxFramesPerBatch": 128,
            "maxEpochs": 50,
            "maxOptimizerSteps": 500,
            "checkpointIntervalSteps": 25,
        },
    }


def _common_artifact_metadata() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "artifactFamily": "browser-training-fixed-adapter-math",
        "baseModel": {
            "id": BASE_MODEL_ID,
            "version": BASE_MODEL_VERSION,
        },
        "license": ARTIFACT_LICENSE,
        "provenance": ARTIFACT_PROVENANCE,
    }


def _backend() -> dict[str, str]:
    return {
        "interface": "BrowserTrainingBackend",
        "kind": "repository-fixed-adapter-math",
        "proofStatus": "fixed-adapter-math-required",
    }


def _feature_tap() -> dict[str, Any]:
    return {
        "graphId": "encoder",
        "outputName": "encoded",
        "dimension": 4,
        "frameShiftMs": 10,
        "persistedDtype": "float16",
    }


def _ctc_projection_manifest_ref(roles: dict[str, str]) -> dict[str, Any]:
    return {
        "kind": "frozen-linear-ctc-projection-v1",
        "inputGraphId": "encoder",
        "inputName": "encoded",
        "inputDimension": 4,
        "logitsName": "ctc_logits",
        "logitsDtype": "float32",
        "vocabularySize": 4,
        "blankId": 0,
        "trainable": False,
        "artifact": _artifact_ref("eval-model", roles["eval-model"]),
    }


def _ctc_projection_artifact_descriptor() -> dict[str, Any]:
    weights = _ctc_projection_weight()
    bias = _ctc_projection_bias()
    return {
        "kind": "frozen-linear-ctc-projection-v1",
        "inputGraphId": "encoder",
        "inputName": "encoded",
        "inputDimension": 4,
        "logitsName": "ctc_logits",
        "logitsDtype": "float32",
        "vocabularySize": 4,
        "blankId": 0,
        "trainable": False,
        "parameterTensors": [
            {
                "name": "ctc_projection_weight",
                "dataType": "float32",
                "shape": [4, 4],
                "layout": "row-major [inputDimension, vocabularySize]",
                "values": weights,
                "littleEndianFloat32Sha256": _sha256_float32_values(weights),
            },
            {
                "name": "ctc_projection_bias",
                "dataType": "float32",
                "shape": [4],
                "layout": "[vocabularySize]",
                "values": bias,
                "littleEndianFloat32Sha256": _sha256_float32_values(bias),
            },
        ],
    }


def _adapter_contract() -> dict[str, Any]:
    return {
        "architecture": "residual-bottleneck-lhuc-v1",
        "inputDimension": 4,
        "rank": 2,
        "residualScale": 0.25,
        "parameterTensors": _parameter_tensors(),
    }


def _parameter_tensors() -> list[dict[str, Any]]:
    return [
        {
            "name": "w_down",
            "dataType": "float32",
            "shape": [4, 2],
            "description": "Residual bottleneck down projection, row-major [inputDimension, rank].",
        },
        {
            "name": "b_down",
            "dataType": "float32",
            "shape": [2],
            "description": "Residual bottleneck down-projection bias.",
        },
        {
            "name": "w_up",
            "dataType": "float32",
            "shape": [2, 4],
            "description": "Residual bottleneck up projection, row-major [rank, inputDimension].",
        },
        {
            "name": "b_up",
            "dataType": "float32",
            "shape": [4],
            "description": "Residual bottleneck output bias before residual scaling.",
        },
        {
            "name": "lhuc",
            "dataType": "float32",
            "shape": [4],
            "description": "LHUC logit parameters; zero maps to unit scale.",
        },
    ]


def _zero_tensor_initializers() -> dict[str, dict[str, Any]]:
    lengths = {
        "w_down": (4 * 2, [4, 2]),
        "b_down": (2, [2]),
        "w_up": (2 * 4, [2, 4]),
        "b_up": (4, [4]),
        "lhuc": (4, [4]),
    }
    return {
        name: {
            "dataType": "float32",
            "shape": shape,
            "fill": 0,
            "littleEndianFloat32Sha256": _sha256_float32_fill(0.0, length),
        }
        for name, (length, shape) in lengths.items()
    }


def _anchor_pack_contract() -> dict[str, Any]:
    cases = _anchor_cases()
    return {
        "kind": "generic-anchor-feature-pack-v1",
        "contractVersion": 1,
        "anchorPackId": "local-dev-browser-training-anchor-pack-v1",
        "featureTap": _feature_tap(),
        "featureEncoding": {
            "valueEncoding": "json-float32",
            "sourceDtype": "float16",
            "frameDimension": 4,
            "frameShiftMs": 10,
        },
        "licenseGate": {
            "redistributionAllowed": True,
            "sourceProvenanceRequired": True,
            "syntheticOnly": True,
            "participantConsentRequired": False,
        },
        "privacyGate": {
            "containsRawAudio": False,
            "containsTranscriptText": False,
            "containsPrivateFrozenFeatureValues": False,
            "containsPublicSyntheticFrozenFeatureValues": True,
            "containsVoiceDerivedWeights": False,
            "localOnly": True,
        },
        "caseCount": len(cases),
        "caseIdSha256": [case["caseIdSha256"] for case in cases],
        "cases": cases,
        "metrics": [
            "wordErrorRate",
            "characterErrorRate",
            "customTermRecall",
            "falseInsertionsPer100NonTargetUtterances",
            "realTimeFactor",
        ],
        "regressionBudget": {
            "maxRelativeWordErrorRegression": 0.0,
            "maxRelativeCharacterErrorRegression": 0.0,
            "minCustomTermRecall": 1.0,
            "maxFalseInsertionsPer100NonTargetUtterances": 0.0,
            "maxRelativeRealTimeFactorRegression": 0.1,
        },
    }


def _anchor_cases() -> list[dict[str, Any]]:
    specs: tuple[tuple[str, str, list[list[float]], dict[str, float]], ...] = (
        (
            "vi",
            "normal",
            [[0.12, -0.04, 0.2, 0.08], [0.1, -0.02, 0.18, 0.05]],
            {
                "wordErrorRate": 0.0,
                "characterErrorRate": 0.0,
                "customTermRecall": 1.0,
                "falseInsertionsPer100NonTargetUtterances": 0.0,
                "realTimeFactor": 0.05,
            },
        ),
        (
            "en",
            "normal",
            [[-0.08, 0.16, 0.04, -0.12], [-0.05, 0.14, 0.06, -0.1]],
            {
                "wordErrorRate": 0.0,
                "characterErrorRate": 0.0,
                "customTermRecall": 1.0,
                "falseInsertionsPer100NonTargetUtterances": 0.0,
                "realTimeFactor": 0.05,
            },
        ),
        (
            "mixed",
            "projected",
            [[0.03, 0.11, -0.07, 0.19], [0.05, 0.09, -0.05, 0.17]],
            {
                "wordErrorRate": 0.0,
                "characterErrorRate": 0.0,
                "customTermRecall": 1.0,
                "falseInsertionsPer100NonTargetUtterances": 0.0,
                "realTimeFactor": 0.06,
            },
        ),
    )
    cases = []
    for index, (language, voice_condition, frames, expected_metrics) in enumerate(specs):
        flattened = [value for frame in frames for value in frame]
        cases.append(
            {
                "caseIdSha256": _sha256_text(
                    f"anchor-feature:{BASE_MODEL_ID}:{language}:{voice_condition}:{index}"
                ),
                "language": language,
                "voiceCondition": voice_condition,
                "featureFrameCount": len(frames),
                "featureDimension": 4,
                "syntheticFeatureFrames": frames,
                "littleEndianFloat32FeatureSha256": _sha256_float32_values(flattened),
                "expectedMetrics": expected_metrics,
                "license": ARTIFACT_LICENSE,
                "provenance": ARTIFACT_PROVENANCE,
            }
        )
    return cases


def _ctc_projection_weight() -> list[float]:
    return [
        0.2,
        -0.1,
        0.05,
        0.0,
        -0.3,
        0.25,
        0.1,
        -0.05,
        0.15,
        0.05,
        -0.2,
        0.3,
        0.0,
        -0.15,
        0.25,
        0.1,
    ]


def _ctc_projection_bias() -> list[float]:
    return [0.0, 0.1, -0.05, 0.02]


def _contract_test_vectors() -> list[dict[str, Any]]:
    identity_input = [1.0, -0.5, 0.25, 0.0]
    nonzero_tensors = {
        "w_down": [0.5, -0.1, 0.25, 0.2, -0.75, 0.3, 0.1, -0.4],
        "b_down": [0.1, -0.2],
        "w_up": [0.2, -0.4, 0.1, 0.05, -0.3, 0.25, 0.15, -0.2],
        "b_up": [0.05, -0.02, 0.0, 0.03],
        "lhuc": [0.0, math.log(3), -math.log(3), 0.0],
    }
    nonzero_input = [0.4, -0.2, 0.6, 0.1]
    return [
        {
            "id": "identity-zero-frame",
            "inputFrame": identity_input,
            "tensors": "nominal-checkpoint:identity-zero",
            "expectedOutput": identity_input,
            "tolerance": 1e-9,
        },
        {
            "id": "synthetic-residual-lhuc-frame",
            "inputFrame": nonzero_input,
            "tensors": nonzero_tensors,
            "expectedOutput": _forward(nonzero_input, nonzero_tensors),
            "tolerance": 1e-9,
        },
    ]


def _ctc_projection_test_vectors() -> list[dict[str, Any]]:
    input_frame = [0.25, -0.5, 0.75, 0.1]
    return [
        {
            "id": "synthetic-frozen-ctc-projection-frame",
            "inputFrame": input_frame,
            "expectedLogits": _ctc_projection_logits(input_frame),
            "blankId": 0,
            "vocabularySize": 4,
            "tolerance": 1e-9,
        }
    ]


def _ctc_projection_logits(input_frame: list[float]) -> list[float]:
    weights = _ctc_projection_weight()
    bias = _ctc_projection_bias()
    vocabulary_size = 4
    logits = []
    for token_index in range(vocabulary_size):
        logit = bias[token_index]
        for input_index, value in enumerate(input_frame):
            logit += value * weights[input_index * vocabulary_size + token_index]
        logits.append(round(logit, 12))
    return logits


def _forward(input_frame: list[float], tensors: dict[str, list[float]]) -> list[float]:
    rank = 2
    input_dimension = 4
    bottleneck = []
    for rank_index in range(rank):
        activation = tensors["b_down"][rank_index]
        for input_index, value in enumerate(input_frame):
            activation += value * tensors["w_down"][input_index * rank + rank_index]
        bottleneck.append(math.tanh(activation))
    output = []
    for output_index, value in enumerate(input_frame):
        residual = tensors["b_up"][output_index]
        for rank_index, activation in enumerate(bottleneck):
            residual += activation * tensors["w_up"][rank_index * input_dimension + output_index]
        scale = 2 / (1 + math.exp(-tensors["lhuc"][output_index]))
        output.append(round((value + 0.25 * residual) * scale, 12))
    return output


def _artifact_privacy() -> dict[str, bool]:
    return {
        "containsRawAudio": False,
        "containsTranscriptText": False,
        "containsPrivateFrozenFeatureValues": False,
        "containsProfileData": False,
        "containsVoiceDerivedWeights": False,
        "containsOptimizerState": False,
        "networkUpload": False,
        "telemetry": False,
        "localOnly": True,
    }


def _artifact_ref(file_key: str, role: str) -> dict[str, Any]:
    return {
        "fileKey": file_key,
        "role": role,
        "license": ARTIFACT_LICENSE,
        "provenance": ARTIFACT_PROVENANCE,
    }


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _canonical_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _sha256_float32_fill(value: float, length: int) -> str:
    return hashlib.sha256(struct.pack("<f", value) * length).hexdigest()


def _sha256_float32_values(values: list[float]) -> str:
    return hashlib.sha256(b"".join(struct.pack("<f", value) for value in values)).hexdigest()


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate browser-training fixture artifacts.")
    parser.add_argument(
        "--base-manifest",
        type=Path,
        default=Path("model-packs/example-manifest/local-dev-rnnt-mock.json"),
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("model-packs/example-manifest") / ARTIFACT_DIRECTORY_NAME,
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("model-packs/example-manifest") / BROWSER_TRAINING_MANIFEST_NAME,
    )
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Hash existing artifact files and rewrite only the V3 manifest.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.manifest_only:
        artifact_paths = {
            file_key: args.artifact_dir / filename for file_key, _role, filename in ARTIFACT_FILES
        }
    else:
        artifact_paths = generate_browser_training_artifacts(args.artifact_dir)
    write_browser_training_manifest(args.base_manifest, artifact_paths, args.manifest)


if __name__ == "__main__":
    main()
