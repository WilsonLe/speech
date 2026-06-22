import json
from copy import deepcopy
from pathlib import Path

from speech_model_pack import validate_manifest_minimum, validate_manifest_v2

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"


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
