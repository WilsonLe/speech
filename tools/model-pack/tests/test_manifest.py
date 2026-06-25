import json
from copy import deepcopy
from pathlib import Path

from speech_model_pack import (
    validate_manifest,
    validate_manifest_minimum,
    validate_manifest_v2,
    validate_manifest_v3,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"
SCHEMA_V3_PATH = REPO_ROOT / "model-packs/schema/speech-model-manifest-v3.schema.json"


def load_example_manifest() -> dict[str, object]:
    return json.loads(EXAMPLE_MANIFEST_PATH.read_text())


def enabled_context_biasing() -> dict[str, object]:
    return {
        "supported": True,
        "algorithm": "aho-corasick",
        "supportedEntryLanguages": ["vi", "en", "mixed"],
        "maxActiveEntries": 250,
        "maxPhraseTokens": 12,
        "maxAliasesPerEntry": 4,
        "maxAliasTokens": 12,
        "defaultWeight": 3,
        "maxCumulativeBonus": 8,
        "weightRange": {"min": 0, "max": 10},
        "presets": {"light": 1.5, "normal": 3, "strong": 6},
        "scoring": {"prefixBonus": 1, "completionBonus": 4, "mismatchPenalty": 0.5},
        "wordBoundary": {"mode": "token", "marker": "▁", "requireForSingleToken": True},
        "revisionSwap": "utterance-boundary",
        "diagnostics": {"emitMatchedVocabularyIds": True, "emitScoreBreakdown": True},
    }


def enabled_residual_adapter() -> dict[str, object]:
    return {
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
        "allowedPrecisions": ["float32", "float16", "int8"],
        "activationSwap": "utterance-boundary",
    }


def add_adapter_graph(manifest: dict[str, object]) -> None:
    files = deepcopy(manifest["files"])
    assert isinstance(files, dict)
    files["adapter"] = {
        "url": "/models/mock/adapter.onnx",
        "sha256": "3" * 64,
        "sizeBytes": 1,
        "mediaType": "application/octet-stream",
    }
    graphs = deepcopy(manifest["graphs"])
    assert isinstance(graphs, dict)
    graphs["adapter"] = {
        "fileKey": "adapter",
        "inputs": [
            {
                "name": "encoder.block11.input",
                "dataType": "float16",
                "shape": ["batch", "frames", 256],
                "description": "Frozen base encoder activation.",
            }
        ],
        "outputs": [
            {
                "name": "encoder.block11.output",
                "dataType": "float16",
                "shape": ["batch", "frames", 256],
                "description": "Adapter residual output.",
            }
        ],
    }
    manifest["files"] = files
    manifest["graphs"] = graphs


ARTIFACT_LICENSE = {
    "spdx": "Apache-2.0",
    "name": "Synthetic browser-training contract fixture",
    "noticeUrl": "../../MODEL_LICENSES.md",
    "redistributionAllowed": True,
}
ARTIFACT_PROVENANCE = {
    "source": "repo-generated-synthetic-fixture",
    "generatedBy": "tools/model-pack tests",
    "createdAt": "2026-06-24T00:00:00.000Z",
}


def training_artifact(file_key: str, role: str) -> dict[str, object]:
    return {
        "fileKey": file_key,
        "role": role,
        "license": ARTIFACT_LICENSE,
        "provenance": ARTIFACT_PROVENANCE,
    }


def browser_training_contract() -> dict[str, object]:
    return {
        "supported": True,
        "contractVersion": 1,
        "backend": {
            "interface": "BrowserTrainingBackend",
            "kind": "repository-fixed-adapter-math",
            "proofStatus": "fixed-adapter-math-required",
        },
        "algorithmId": "browser-top-adapter-frame-ce-v1",
        "minimumAppVersion": "0.5.0",
        "exactBaseModel": {
            "id": "local-dev-rnnt-mock",
            "version": "0.0.1",
            "manifestSha256": "4" * 64,
            "graphContractSha256": "5" * 64,
            "tokenizerSha256": "6" * 64,
        },
        "featureTap": {
            "graphId": "encoder",
            "outputName": "encoded",
            "dimension": 4,
            "frameShiftMs": 10,
            "persistedDtype": "float16",
        },
        "ctcProjection": {
            "kind": "frozen-linear-ctc-projection-v1",
            "inputGraphId": "encoder",
            "inputName": "encoded",
            "inputDimension": 4,
            "logitsName": "ctc_logits",
            "logitsDtype": "float32",
            "vocabularySize": 4,
            "blankId": 0,
            "trainable": False,
            "artifact": training_artifact("eval-model", "eval-model"),
        },
        "adapter": {
            "architecture": "residual-bottleneck-lhuc-v1",
            "inputDimension": 4,
            "rank": 2,
            "residualScale": 0.25,
            "parameterTensors": [
                {
                    "name": "w_down",
                    "dataType": "float32",
                    "shape": [4, 2],
                    "description": "Down projection",
                },
                {"name": "b_down", "dataType": "float32", "shape": [2], "description": "Down bias"},
                {
                    "name": "w_up",
                    "dataType": "float32",
                    "shape": [2, 4],
                    "description": "Up projection",
                },
                {"name": "b_up", "dataType": "float32", "shape": [4], "description": "Up bias"},
                {"name": "lhuc", "dataType": "float32", "shape": [4], "description": "LHUC scale"},
            ],
            "runtimeGraph": training_artifact("adapter-runtime", "runtime-adapter"),
            "preferredMaxBytes": 2_000_000,
            "hardMaxBytes": 10_000_000,
        },
        "artifacts": {
            "trainingModel": training_artifact("training-model", "training-model"),
            "evalModel": training_artifact("eval-model", "eval-model"),
            "optimizerModel": training_artifact("optimizer-model", "optimizer-model"),
            "nominalCheckpoint": [training_artifact("nominal-checkpoint", "nominal-checkpoint")],
            "contractTestVectors": training_artifact(
                "contract-test-vectors", "contract-test-vectors"
            ),
            "anchorPack": [training_artifact("anchor-pack", "anchor-pack")],
        },
        "limits": {
            "maxUtterances": 180,
            "maxAcceptedSeconds": 1_800,
            "maxFramesPerBatch": 8_000,
            "maxEpochs": 20,
            "maxOptimizerSteps": 2_000,
            "checkpointIntervalSteps": 100,
        },
    }


def load_v3_manifest() -> dict[str, object]:
    manifest = load_example_manifest()
    manifest["schemaVersion"] = 3
    files = deepcopy(manifest["files"])
    assert isinstance(files, dict)
    for index, file_key in enumerate(
        [
            "training-model",
            "eval-model",
            "optimizer-model",
            "nominal-checkpoint",
            "adapter-runtime",
            "contract-test-vectors",
            "anchor-pack",
        ],
        start=7,
    ):
        files[file_key] = {
            "url": f"/models/mock/{file_key}.bin",
            "sha256": f"{index:x}" * 64,
            "sizeBytes": 1,
            "mediaType": "application/octet-stream",
        }
    manifest["files"] = files
    manifest["browserTraining"] = browser_training_contract()
    return manifest


def test_validate_manifest_v2_accepts_example_manifest() -> None:
    assert validate_manifest_v2(load_example_manifest()) == []
    assert validate_manifest_minimum(load_example_manifest()) == []
    assert validate_manifest(load_example_manifest()) == []


def test_validate_manifest_v3_accepts_browser_training_contract() -> None:
    manifest = load_v3_manifest()

    assert validate_manifest_v3(manifest) == []
    assert validate_manifest(manifest) == []
    assert validate_manifest_minimum(manifest) == []


def test_validate_manifest_v3_rejects_backend_and_identity_mismatches() -> None:
    manifest = load_v3_manifest()
    browser_training = deepcopy(manifest["browserTraining"])
    assert isinstance(browser_training, dict)
    backend = browser_training["backend"]
    assert isinstance(backend, dict)
    backend["proofStatus"] = "ort-training-worker-proof-passed"
    exact_base_model = browser_training["exactBaseModel"]
    assert isinstance(exact_base_model, dict)
    exact_base_model["id"] = "other-model"
    exact_base_model["version"] = "9.9.9"
    exact_base_model["manifestSha256"] = "not-a-sha"
    manifest["browserTraining"] = browser_training

    errors = validate_manifest_v3(manifest)

    assert (
        "browserTraining.backend.proofStatus must be fixed-adapter-math-required for "
        "repository-fixed-adapter-math"
    ) in errors
    assert "browserTraining.exactBaseModel.id must match manifest id" in errors
    assert "browserTraining.exactBaseModel.version must match manifest version" in errors
    assert "browserTraining.exactBaseModel.manifestSha256 has invalid format" in errors


def test_validate_manifest_v3_rejects_training_artifact_and_limit_mismatches() -> None:
    manifest = load_v3_manifest()
    browser_training = deepcopy(manifest["browserTraining"])
    assert isinstance(browser_training, dict)
    feature_tap = browser_training["featureTap"]
    assert isinstance(feature_tap, dict)
    feature_tap["graphId"] = "missing-graph"
    feature_tap["frameShiftMs"] = 20
    feature_tap["persistedDtype"] = "float32"
    ctc_projection = browser_training["ctcProjection"]
    assert isinstance(ctc_projection, dict)
    ctc_projection["kind"] = "wrong-kind"
    ctc_projection["inputGraphId"] = "predictor"
    ctc_projection["inputName"] = "other-output"
    ctc_projection["inputDimension"] = 8
    ctc_projection["logitsDtype"] = "float16"
    ctc_projection["vocabularySize"] = 5
    ctc_projection["blankId"] = 1
    ctc_projection["trainable"] = True
    ctc_projection["artifact"] = training_artifact("missing-eval-model", "training-model")
    adapter = browser_training["adapter"]
    assert isinstance(adapter, dict)
    adapter["inputDimension"] = 8
    adapter["residualScale"] = 2
    adapter["parameterTensors"] = [
        {
            "name": "w_down",
            "dataType": "int32",
            "shape": [4, 2],
            "description": "Invalid trainable dtype.",
        }
    ]
    adapter["runtimeGraph"] = training_artifact("missing-runtime", "training-model")
    adapter["preferredMaxBytes"] = 11
    adapter["hardMaxBytes"] = 10
    artifacts = browser_training["artifacts"]
    assert isinstance(artifacts, dict)
    artifacts["contractTestVectors"] = training_artifact("missing-vectors", "anchor-pack")
    artifacts["anchorPack"] = []
    limits = browser_training["limits"]
    assert isinstance(limits, dict)
    limits["maxOptimizerSteps"] = 10
    limits["checkpointIntervalSteps"] = 20
    manifest["browserTraining"] = browser_training

    errors = validate_manifest_v3(manifest)

    assert "browserTraining.featureTap.graphId must reference a declared graph" in errors
    assert "browserTraining.featureTap.persistedDtype must be float16" in errors
    assert "browserTraining.featureTap.frameShiftMs must match feature.frameShiftMs" in errors
    assert "browserTraining.ctcProjection.kind must be frozen-linear-ctc-projection-v1" in errors
    assert "browserTraining.ctcProjection.logitsDtype must be float32" in errors
    assert "browserTraining.ctcProjection.trainable must be false" in errors
    assert (
        "browserTraining.ctcProjection.artifact.fileKey must reference an entry in files" in errors
    )
    assert "browserTraining.ctcProjection.artifact.role must be eval-model" in errors
    assert (
        "browserTraining.ctcProjection.inputName must reference the input graph outputs" in errors
    )
    assert "browserTraining.ctcProjection.inputGraphId must match featureTap.graphId" in errors
    assert "browserTraining.ctcProjection.inputName must match featureTap.outputName" in errors
    assert "browserTraining.ctcProjection.inputDimension must match featureTap.dimension" in errors
    assert (
        "browserTraining.ctcProjection.vocabularySize must match tokenizer.vocabularySize" in errors
    )
    assert "browserTraining.ctcProjection.blankId must match tokenizer.blankId" in errors
    assert (
        "browserTraining.ctcProjection.artifact.fileKey must match "
        "browserTraining.artifacts.evalModel.fileKey" in errors
    )
    assert "browserTraining.adapter.inputDimension must match featureTap.dimension" in errors
    assert "browserTraining.adapter.residualScale must be less than or equal to 1" in errors
    assert "browserTraining.adapter.parameterTensors must include b_down" in errors
    assert (
        "browserTraining.adapter.parameterTensors[0].dataType must be float32 or float16" in errors
    )
    assert "browserTraining.adapter.runtimeGraph.fileKey must reference an entry in files" in errors
    assert "browserTraining.adapter.runtimeGraph.role must be runtime-adapter" in errors
    assert "browserTraining.adapter.preferredMaxBytes must not exceed hardMaxBytes" in errors
    assert (
        "browserTraining.artifacts.contractTestVectors.fileKey must reference an entry in files"
        in errors
    )
    assert (
        "browserTraining.artifacts.contractTestVectors.role must be contract-test-vectors" in errors
    )
    assert "browserTraining.artifacts.anchorPack must be a non-empty array" in errors
    assert (
        "browserTraining.limits.checkpointIntervalSteps must not exceed maxOptimizerSteps" in errors
    )


def test_validate_manifest_dispatch_rejects_unknown_schema_version() -> None:
    assert validate_manifest({"schemaVersion": 4}) == ["schemaVersion must be 2 or 3"]


def test_manifest_v3_json_schema_declares_browser_training_contract() -> None:
    schema = json.loads(SCHEMA_V3_PATH.read_text())

    assert schema["properties"]["schemaVersion"] == {"const": 3}
    assert "browserTraining" in schema["required"]
    assert schema["properties"]["browserTraining"] == {"$ref": "#/$defs/browserTraining"}
    assert "ctcProjection" in schema["$defs"]["browserTraining"]["required"]
    assert schema["$defs"]["browserTraining"]["properties"]["ctcProjection"] == {
        "$ref": "#/$defs/browserTrainingCtcProjection"
    }
    ctc_projection_schema = schema["$defs"]["browserTrainingCtcProjection"]
    assert ctc_projection_schema["properties"]["kind"] == {
        "const": "frozen-linear-ctc-projection-v1"
    }
    assert ctc_projection_schema["properties"]["logitsDtype"] == {"const": "float32"}
    assert ctc_projection_schema["properties"]["trainable"] == {"const": False}
    assert ctc_projection_schema["properties"]["artifact"]["allOf"][1]["properties"]["role"] == {
        "const": "eval-model"
    }
    adapter_schema = schema["$defs"]["browserTrainingAdapter"]
    assert adapter_schema["properties"]["runtimeGraph"]["allOf"][1]["properties"]["role"] == {
        "const": "runtime-adapter"
    }
    parameter_tensor_checks = adapter_schema["properties"]["parameterTensors"]["allOf"]
    required_names = {
        check["contains"]["properties"]["name"]["const"] for check in parameter_tensor_checks
    }
    assert required_names == {"w_down", "b_down", "w_up", "b_up", "lhuc"}


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
    tokenizer["languageTokenIds"] = {"vi": 10, "en": 2, "klingon": 2}
    manifest["tokenizer"] = tokenizer

    errors = validate_manifest_v2(manifest)

    assert "supportedLanguageModes must include language vi" in errors
    assert "supportedLanguageModes.auto requires both vi and en languages" in errors
    assert "tokenizer.blankId must be less than tokenizer.vocabularySize" in errors
    assert "tokenizer.languageTokenIds.vi must be less than tokenizer.vocabularySize" in errors
    assert "tokenizer.languageTokenIds.en must reference a supported language mode" in errors
    assert "tokenizer.languageTokenIds.klingon is not a supported language mode" in errors


def test_validate_manifest_v2_accepts_enabled_context_biasing_contract() -> None:
    manifest = load_example_manifest()
    manifest["contextBiasing"] = enabled_context_biasing()

    assert validate_manifest_v2(manifest) == []


def test_validate_manifest_v2_rejects_unsupported_context_biasing_limits() -> None:
    manifest = load_example_manifest()
    context_biasing = deepcopy(manifest["contextBiasing"])
    assert isinstance(context_biasing, dict)
    context_biasing["supportedEntryLanguages"] = ["vi"]
    context_biasing["maxActiveEntries"] = 1
    context_biasing["defaultWeight"] = 1
    context_biasing["weightRange"] = {"min": 0, "max": 10}
    context_biasing["diagnostics"] = {
        "emitMatchedVocabularyIds": True,
        "emitScoreBreakdown": False,
    }
    manifest["contextBiasing"] = context_biasing

    errors = validate_manifest_v2(manifest)

    assert "contextBiasing.supportedEntryLanguages must be empty when unsupported" in errors
    assert "contextBiasing.maxActiveEntries must be 0 when unsupported" in errors
    assert "contextBiasing.defaultWeight must be 0 when unsupported" in errors
    assert "contextBiasing.weightRange must be 0..0 when unsupported" in errors
    assert "contextBiasing.diagnostics must be false when unsupported" in errors


def test_validate_manifest_v2_rejects_context_biasing_scoring_and_language_limits() -> None:
    manifest = load_example_manifest()
    manifest["supportedLanguageModes"] = ["vi", "en", "mixed"]
    context_biasing = enabled_context_biasing()
    context_biasing["supportedEntryLanguages"] = ["vi", "auto"]
    context_biasing["maxAliasTokens"] = 0
    context_biasing["defaultWeight"] = 12
    context_biasing["maxCumulativeBonus"] = 3
    context_biasing["presets"] = {"light": 2, "normal": 1, "strong": 12}
    context_biasing["scoring"] = {
        "prefixBonus": 4,
        "completionBonus": 5,
        "mismatchPenalty": 0,
    }
    context_biasing["diagnostics"] = {
        "emitMatchedVocabularyIds": False,
        "emitScoreBreakdown": True,
    }
    manifest["contextBiasing"] = context_biasing

    errors = validate_manifest_v2(manifest)

    assert (
        "contextBiasing.supportedEntryLanguages.auto must reference a supported language mode"
        in errors
    )
    assert "contextBiasing.maxAliasTokens must be positive when aliases are enabled" in errors
    assert "contextBiasing.defaultWeight must be within contextBiasing.weightRange" in errors
    assert "contextBiasing.presets.strong must be within contextBiasing.weightRange" in errors
    assert "contextBiasing.presets must be ordered light <= normal <= strong" in errors
    assert "contextBiasing.scoring.prefixBonus must not exceed maxCumulativeBonus" in errors
    assert "contextBiasing.scoring.completionBonus must not exceed maxCumulativeBonus" in errors
    assert (
        "contextBiasing.diagnostics.emitMatchedVocabularyIds must be true when supported" in errors
    )


def test_validate_manifest_v2_accepts_residual_adapter_contract() -> None:
    manifest = load_example_manifest()
    add_adapter_graph(manifest)
    manifest["personalization"] = {"residualAdapter": enabled_residual_adapter()}

    assert validate_manifest_v2(manifest) == []


def test_validate_manifest_v2_rejects_residual_adapter_graph_binding_mismatch() -> None:
    manifest = load_example_manifest()
    add_adapter_graph(manifest)
    graphs = manifest["graphs"]
    assert isinstance(graphs, dict)
    adapter = graphs["adapter"]
    assert isinstance(adapter, dict)
    adapter["inputs"] = [
        {
            "name": "actual.input",
            "dataType": "float16",
            "shape": ["batch", "frames", 256],
            "description": "Actual adapter input.",
        }
    ]
    adapter["outputs"] = [
        {
            "name": "actual.output",
            "dataType": "float16",
            "shape": ["batch", "frames", 256],
            "description": "Actual adapter output.",
        }
    ]
    manifest["personalization"] = {"residualAdapter": enabled_residual_adapter()}

    errors = validate_manifest_v2(manifest)

    assert (
        "personalization.residualAdapter.insertionPoints[0].inputTensor "
        "must reference graphs.adapter.inputs"
    ) in errors
    assert (
        "personalization.residualAdapter.insertionPoints[0].outputTensor "
        "must reference graphs.adapter.outputs"
    ) in errors


def test_validate_manifest_v2_rejects_residual_adapter_runtime_bounds() -> None:
    manifest = load_example_manifest()
    manifest["personalization"] = {
        "residualAdapter": {
            **enabled_residual_adapter(),
            "insertionPoints": [],
            "maxParameters": 0,
            "maxAdapterSizeBytes": 0,
            "allowedPrecisions": [],
            "activationSwap": "while-listening",
        }
    }

    errors = validate_manifest_v2(manifest)

    assert "graphs.adapter is required when residual adapters are supported" in errors
    assert (
        "personalization.residualAdapter.insertionPoints must not be empty when supported" in errors
    )
    assert (
        "personalization.residualAdapter.allowedPrecisions must not be empty when supported"
        in errors
    )
    assert "personalization.residualAdapter.maxParameters must be positive when supported" in errors
    assert (
        "personalization.residualAdapter.maxAdapterSizeBytes must be positive when supported"
        in errors
    )
    assert "personalization.residualAdapter.activationSwap must be utterance-boundary" in errors


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
