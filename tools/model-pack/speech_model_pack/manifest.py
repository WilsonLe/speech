from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

LANGUAGES = {"vi", "en"}
LANGUAGE_MODES = {"vi", "en", "auto", "mixed"}
TENSOR_DATA_TYPES = {"float32", "float16", "int32", "int64", "uint8", "int8", "bool"}
TOKENIZER_TYPES = {"sentencepiece", "tokens"}
CONTEXT_BIASING_ALGORITHMS = {"token-trie", "aho-corasick"}
CONTEXT_BIASING_BOUNDARY_MODES = {"none", "token", "unicode-word"}
CONTEXT_BIASING_REVISION_SWAPS = {"utterance-boundary"}
RESIDUAL_ADAPTER_GRAPH_ROLES = {"encoder", "predictor", "joiner"}
RESIDUAL_ADAPTER_PRECISIONS = {"float32", "float16", "int8"}
RESIDUAL_ADAPTER_APPLICATIONS = {"residual-add", "lhuc-scale", "film-affine"}
BROWSER_TRAINING_BACKENDS = {"repository-fixed-adapter-math", "onnxruntime-web-training"}
BROWSER_TRAINING_PROOF_STATUSES = {
    "fixed-adapter-math-required",
    "ort-training-worker-proof-passed",
}
BROWSER_TRAINING_ARTIFACT_ROLES = {
    "training-model",
    "eval-model",
    "optimizer-model",
    "nominal-checkpoint",
    "runtime-adapter",
    "contract-test-vectors",
    "anchor-pack",
}
BROWSER_TRAINING_PARAMETER_TENSORS = {"w_down", "b_down", "w_up", "b_up", "lhuc"}
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
MODEL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def validate_manifest_v2(manifest: Mapping[str, Any]) -> list[str]:
    """Return human-readable errors for the SpeechModelManifestV2 contract."""
    errors: list[str] = []

    if manifest.get("schemaVersion") != 2:
        errors.append("schemaVersion must be 2")
    _pattern_string(manifest.get("id"), "id", MODEL_ID_RE, errors)
    _non_empty_string(manifest.get("version"), "version", errors)
    _non_empty_string(manifest.get("displayName"), "displayName", errors)
    if manifest.get("architecture") != "rnnt":
        errors.append("architecture must be rnnt")
    if manifest.get("sampleRateHz") != 16000:
        errors.append("sampleRateHz must be 16000")

    languages = _enum_array(manifest.get("languages"), "languages", LANGUAGES, errors)
    modes = _enum_array(
        manifest.get("supportedLanguageModes"), "supportedLanguageModes", LANGUAGE_MODES, errors
    )
    if languages is not None and modes is not None:
        _language_mode_coverage(languages, modes, errors)

    _license(manifest.get("license"), errors)
    _feature(manifest.get("feature"), errors)
    vocabulary_size = _tokenizer(manifest.get("tokenizer"), errors)
    _streaming(manifest.get("streaming"), errors)
    _context_biasing(
        manifest.get("contextBiasing"),
        languages,
        modes,
        manifest.get("tokenizer"),
        errors,
    )
    file_keys = _files(manifest.get("files"), errors)
    graphs = manifest.get("graphs")
    _graphs(graphs, file_keys, errors)
    _personalization(manifest.get("personalization"), file_keys, graphs, errors)
    _recommended(manifest.get("recommended"), errors)

    if vocabulary_size is not None:
        _tokenizer_ids(manifest.get("tokenizer"), vocabulary_size, modes, errors)

    return errors


def validate_manifest_v3(manifest: Mapping[str, Any]) -> list[str]:
    """Return human-readable errors for the SpeechModelManifestV3 contract."""
    v2_view = dict(manifest)
    v2_view["schemaVersion"] = 2
    errors = validate_manifest_v2(v2_view)
    if manifest.get("schemaVersion") != 3:
        errors.append("schemaVersion must be 3")
    _browser_training(manifest.get("browserTraining"), manifest, _file_keys(manifest), errors)
    return errors


def validate_manifest(manifest: Mapping[str, Any]) -> list[str]:
    """Validate supported model manifest versions while preserving v2 read compatibility."""
    if manifest.get("schemaVersion") == 2:
        return validate_manifest_v2(manifest)
    if manifest.get("schemaVersion") == 3:
        return validate_manifest_v3(manifest)
    return ["schemaVersion must be 2 or 3"]


def validate_manifest_minimum(manifest: Mapping[str, Any]) -> list[str]:
    """Compatibility alias for bootstrap tests; validates supported manifest versions."""
    return validate_manifest(manifest)


def _license(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("license must be an object")
        return
    _non_empty_string(value.get("name"), "license.name", errors)
    _optional_non_empty_string(value.get("spdx"), "license.spdx", errors)
    _optional_non_empty_string(value.get("noticeUrl"), "license.noticeUrl", errors)
    if not isinstance(value.get("redistributionAllowed"), bool):
        errors.append("license.redistributionAllowed must be boolean")


def _feature(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("feature must be an object")
        return
    if value.get("type") != "log-mel":
        errors.append("feature.type must be log-mel")
    _positive_int(value.get("bins"), "feature.bins", errors)
    frame_length_ms = _positive_number(value.get("frameLengthMs"), "feature.frameLengthMs", errors)
    _positive_number(value.get("frameShiftMs"), "feature.frameShiftMs", errors)
    fft_size = _positive_int(value.get("fftSize"), "feature.fftSize", errors)
    low_freq_hz = _non_negative_number(value.get("lowFreqHz"), "feature.lowFreqHz", errors)
    high_freq_hz = _positive_number(value.get("highFreqHz"), "feature.highFreqHz", errors)
    _non_negative_number(value.get("dither"), "feature.dither", errors)
    if not isinstance(value.get("snipEdges"), bool):
        errors.append("feature.snipEdges must be boolean")
    if fft_size is not None and not _is_power_of_two(fft_size):
        errors.append("feature.fftSize must be a power of two")
    if frame_length_ms is not None and fft_size is not None:
        frame_length_samples = round((16_000 * frame_length_ms) / 1_000)
        if fft_size < frame_length_samples:
            errors.append("feature.fftSize must be at least the frame length in samples")
    if (
        low_freq_hz is not None
        and high_freq_hz is not None
        and (high_freq_hz <= low_freq_hz or high_freq_hz > 8_000)
    ):
        errors.append("feature.highFreqHz must be above lowFreqHz and at or below Nyquist")


def _tokenizer(value: Any, errors: list[str]) -> int | None:
    if not isinstance(value, Mapping):
        errors.append("tokenizer must be an object")
        return None
    _enum_value(value.get("type"), "tokenizer.type", TOKENIZER_TYPES, errors)
    if not isinstance(value.get("byteFallback"), bool):
        errors.append("tokenizer.byteFallback must be boolean")
    return _positive_int(value.get("vocabularySize"), "tokenizer.vocabularySize", errors)


def _tokenizer_ids(
    value: Any,
    vocabulary_size: int,
    modes: list[str] | None,
    errors: list[str],
) -> None:
    if not isinstance(value, Mapping):
        return
    for key in ("blankId", "unkId", "bosId", "eosId"):
        token_id = value.get(key)
        if key == "blankId" or token_id is not None:
            _token_id(token_id, f"tokenizer.{key}", vocabulary_size, errors)
    language_token_ids = value.get("languageTokenIds")
    if language_token_ids is not None:
        if not isinstance(language_token_ids, Mapping):
            errors.append("tokenizer.languageTokenIds must be an object")
        else:
            for mode, token_id_value in language_token_ids.items():
                if mode not in LANGUAGE_MODES:
                    errors.append(
                        f"tokenizer.languageTokenIds.{mode} is not a supported language mode"
                    )
                    continue
                if modes is not None and mode not in modes:
                    errors.append(
                        f"tokenizer.languageTokenIds.{mode} "
                        "must reference a supported language mode"
                    )
                _token_id(
                    token_id_value,
                    f"tokenizer.languageTokenIds.{mode}",
                    vocabulary_size,
                    errors,
                )
    _optional_non_empty_string(
        value.get("wordBoundaryMarker"), "tokenizer.wordBoundaryMarker", errors
    )


def _streaming(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("streaming must be an object")
        return
    chunk_frames = _positive_int(value.get("chunkFrames"), "streaming.chunkFrames", errors)
    chunk_shift_frames = _positive_int(
        value.get("chunkShiftFrames"), "streaming.chunkShiftFrames", errors
    )
    _non_negative_int(value.get("rightContextFrames"), "streaming.rightContextFrames", errors)
    _positive_int(value.get("maxSymbolsPerFrame"), "streaming.maxSymbolsPerFrame", errors)
    if (
        chunk_frames is not None
        and chunk_shift_frames is not None
        and chunk_shift_frames > chunk_frames
    ):
        errors.append("streaming.chunkShiftFrames must be less than or equal to chunkFrames")


def _context_biasing(
    value: Any,
    languages: list[str] | None,
    modes: list[str] | None,
    tokenizer: Any,
    errors: list[str],
) -> None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing must be an object")
        return
    supported = value.get("supported")
    if not isinstance(supported, bool):
        errors.append("contextBiasing.supported must be boolean")
    _enum_value(
        value.get("algorithm"),
        "contextBiasing.algorithm",
        CONTEXT_BIASING_ALGORITHMS,
        errors,
    )
    supported_entry_languages = _enum_array_allow_empty(
        value.get("supportedEntryLanguages"),
        "contextBiasing.supportedEntryLanguages",
        LANGUAGE_MODES,
        errors,
    )
    if supported_entry_languages is not None and modes is not None:
        for entry_language in supported_entry_languages:
            if entry_language not in modes:
                errors.append(
                    f"contextBiasing.supportedEntryLanguages.{entry_language} "
                    "must reference a supported language mode"
                )

    max_active_entries = _non_negative_int(
        value.get("maxActiveEntries"), "contextBiasing.maxActiveEntries", errors
    )
    max_phrase_tokens = _non_negative_int(
        value.get("maxPhraseTokens"), "contextBiasing.maxPhraseTokens", errors
    )
    max_aliases_per_entry = _non_negative_int(
        value.get("maxAliasesPerEntry"), "contextBiasing.maxAliasesPerEntry", errors
    )
    max_alias_tokens = _non_negative_int(
        value.get("maxAliasTokens"), "contextBiasing.maxAliasTokens", errors
    )
    default_weight = _non_negative_number(
        value.get("defaultWeight"), "contextBiasing.defaultWeight", errors
    )
    max_cumulative_bonus = _non_negative_number(
        value.get("maxCumulativeBonus"), "contextBiasing.maxCumulativeBonus", errors
    )
    weight_range = _weight_range(value.get("weightRange"), errors)
    presets = _context_biasing_presets(value.get("presets"), errors)
    scoring = _context_biasing_scoring(value.get("scoring"), errors)
    _context_biasing_word_boundary(value.get("wordBoundary"), tokenizer, errors)
    _enum_value(
        value.get("revisionSwap"),
        "contextBiasing.revisionSwap",
        CONTEXT_BIASING_REVISION_SWAPS,
        errors,
    )
    diagnostics = _context_biasing_diagnostics(value.get("diagnostics"), errors)

    if max_aliases_per_entry == 0 and max_alias_tokens is not None and max_alias_tokens > 0:
        errors.append("contextBiasing.maxAliasTokens must be 0 when maxAliasesPerEntry is 0")
    if max_aliases_per_entry is not None and max_aliases_per_entry > 0 and max_alias_tokens == 0:
        errors.append("contextBiasing.maxAliasTokens must be positive when aliases are enabled")
    if default_weight is not None and weight_range is not None:
        _weight_in_range(default_weight, "contextBiasing.defaultWeight", weight_range, errors)
    if presets is not None and weight_range is not None:
        _weight_in_range(presets["light"], "contextBiasing.presets.light", weight_range, errors)
        _weight_in_range(presets["normal"], "contextBiasing.presets.normal", weight_range, errors)
        _weight_in_range(presets["strong"], "contextBiasing.presets.strong", weight_range, errors)
        if presets["light"] > presets["normal"] or presets["normal"] > presets["strong"]:
            errors.append("contextBiasing.presets must be ordered light <= normal <= strong")
    if scoring is not None and max_cumulative_bonus is not None:
        if scoring["prefixBonus"] > max_cumulative_bonus:
            errors.append("contextBiasing.scoring.prefixBonus must not exceed maxCumulativeBonus")
        if scoring["completionBonus"] > max_cumulative_bonus:
            errors.append(
                "contextBiasing.scoring.completionBonus must not exceed maxCumulativeBonus"
            )

    if supported is True:
        if supported_entry_languages is not None and len(supported_entry_languages) == 0:
            errors.append("contextBiasing.supportedEntryLanguages must be non-empty when supported")
        if max_active_entries == 0:
            errors.append("contextBiasing.maxActiveEntries must be positive")
        if max_phrase_tokens == 0:
            errors.append("contextBiasing.maxPhraseTokens must be positive")
        if default_weight == 0:
            errors.append("contextBiasing.defaultWeight must be positive")
        if max_cumulative_bonus == 0:
            errors.append("contextBiasing.maxCumulativeBonus must be positive")
        if weight_range is not None and weight_range["max"] <= weight_range["min"]:
            errors.append("contextBiasing.weightRange.max must be greater than weightRange.min")
        if scoring is not None and scoring["prefixBonus"] == 0 and scoring["completionBonus"] == 0:
            errors.append(
                "contextBiasing.scoring must include a positive prefix or completion bonus"
            )
        if diagnostics is not None and not diagnostics["emitMatchedVocabularyIds"]:
            errors.append(
                "contextBiasing.diagnostics.emitMatchedVocabularyIds must be true when supported"
            )
    elif supported is False:
        _disabled_context_biasing(
            supported_entry_languages,
            max_active_entries,
            max_phrase_tokens,
            max_aliases_per_entry,
            max_alias_tokens,
            default_weight,
            max_cumulative_bonus,
            weight_range,
            presets,
            scoring,
            diagnostics,
            errors,
        )

    if supported_entry_languages is not None and languages is not None:
        for entry_language in supported_entry_languages:
            if entry_language in {"auto", "mixed"} and not _has_bilingual_languages(languages):
                errors.append(
                    f"contextBiasing.supportedEntryLanguages.{entry_language} "
                    "requires both vi and en languages"
                )


def _language_mode_coverage(languages: list[str], modes: list[str], errors: list[str]) -> None:
    for language in languages:
        if language not in modes:
            errors.append(f"supportedLanguageModes must include language {language}")
    for mode in modes:
        if mode in {"vi", "en"} and mode not in languages:
            errors.append(f"supportedLanguageModes.{mode} requires languages to include {mode}")
        if mode in {"auto", "mixed"} and not _has_bilingual_languages(languages):
            errors.append(f"supportedLanguageModes.{mode} requires both vi and en languages")


def _has_bilingual_languages(languages: list[str]) -> bool:
    return "vi" in languages and "en" in languages


def _weight_range(value: Any, errors: list[str]) -> dict[str, float] | None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing.weightRange must be an object")
        return None
    min_value = _non_negative_number(value.get("min"), "contextBiasing.weightRange.min", errors)
    max_value = _non_negative_number(value.get("max"), "contextBiasing.weightRange.max", errors)
    if min_value is None or max_value is None:
        return None
    if max_value < min_value:
        errors.append("contextBiasing.weightRange.max must be greater than or equal to min")
    return {"min": min_value, "max": max_value}


def _weight_in_range(
    value: float, path: str, weight_range: Mapping[str, float], errors: list[str]
) -> None:
    if value < weight_range["min"] or value > weight_range["max"]:
        errors.append(f"{path} must be within contextBiasing.weightRange")


def _context_biasing_presets(value: Any, errors: list[str]) -> dict[str, float] | None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing.presets must be an object")
        return None
    light = _non_negative_number(value.get("light"), "contextBiasing.presets.light", errors)
    normal = _non_negative_number(value.get("normal"), "contextBiasing.presets.normal", errors)
    strong = _non_negative_number(value.get("strong"), "contextBiasing.presets.strong", errors)
    if light is None or normal is None or strong is None:
        return None
    return {"light": light, "normal": normal, "strong": strong}


def _context_biasing_scoring(value: Any, errors: list[str]) -> dict[str, float] | None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing.scoring must be an object")
        return None
    prefix_bonus = _non_negative_number(
        value.get("prefixBonus"), "contextBiasing.scoring.prefixBonus", errors
    )
    completion_bonus = _non_negative_number(
        value.get("completionBonus"), "contextBiasing.scoring.completionBonus", errors
    )
    mismatch_penalty = _non_negative_number(
        value.get("mismatchPenalty"), "contextBiasing.scoring.mismatchPenalty", errors
    )
    if prefix_bonus is None or completion_bonus is None or mismatch_penalty is None:
        return None
    return {
        "prefixBonus": prefix_bonus,
        "completionBonus": completion_bonus,
        "mismatchPenalty": mismatch_penalty,
    }


def _context_biasing_word_boundary(value: Any, tokenizer: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing.wordBoundary must be an object")
        return
    _enum_value(
        value.get("mode"),
        "contextBiasing.wordBoundary.mode",
        CONTEXT_BIASING_BOUNDARY_MODES,
        errors,
    )
    marker = _optional_non_empty_string_return(
        value.get("marker"), "contextBiasing.wordBoundary.marker", errors
    )
    if not isinstance(value.get("requireForSingleToken"), bool):
        errors.append("contextBiasing.wordBoundary.requireForSingleToken must be boolean")
    if value.get("mode") == "token":
        tokenizer_marker = (
            tokenizer.get("wordBoundaryMarker") if isinstance(tokenizer, Mapping) else None
        )
        if marker is None and not isinstance(tokenizer_marker, str):
            errors.append(
                "contextBiasing.wordBoundary.marker must be set when token boundary mode is used "
                "without tokenizer.wordBoundaryMarker"
            )


def _context_biasing_diagnostics(value: Any, errors: list[str]) -> dict[str, bool] | None:
    if not isinstance(value, Mapping):
        errors.append("contextBiasing.diagnostics must be an object")
        return None
    emit_matched = value.get("emitMatchedVocabularyIds")
    emit_scores = value.get("emitScoreBreakdown")
    if not isinstance(emit_matched, bool):
        errors.append("contextBiasing.diagnostics.emitMatchedVocabularyIds must be boolean")
    if not isinstance(emit_scores, bool):
        errors.append("contextBiasing.diagnostics.emitScoreBreakdown must be boolean")
    if not isinstance(emit_matched, bool) or not isinstance(emit_scores, bool):
        return None
    return {"emitMatchedVocabularyIds": emit_matched, "emitScoreBreakdown": emit_scores}


def _disabled_context_biasing(
    supported_entry_languages: list[str] | None,
    max_active_entries: int | None,
    max_phrase_tokens: int | None,
    max_aliases_per_entry: int | None,
    max_alias_tokens: int | None,
    default_weight: float | None,
    max_cumulative_bonus: float | None,
    weight_range: Mapping[str, float] | None,
    presets: Mapping[str, float] | None,
    scoring: Mapping[str, float] | None,
    diagnostics: Mapping[str, bool] | None,
    errors: list[str],
) -> None:
    if supported_entry_languages is not None and len(supported_entry_languages) > 0:
        errors.append("contextBiasing.supportedEntryLanguages must be empty when unsupported")
    if max_active_entries is not None and max_active_entries != 0:
        errors.append("contextBiasing.maxActiveEntries must be 0 when unsupported")
    if max_phrase_tokens is not None and max_phrase_tokens != 0:
        errors.append("contextBiasing.maxPhraseTokens must be 0 when unsupported")
    if max_aliases_per_entry is not None and max_aliases_per_entry != 0:
        errors.append("contextBiasing.maxAliasesPerEntry must be 0 when unsupported")
    if max_alias_tokens is not None and max_alias_tokens != 0:
        errors.append("contextBiasing.maxAliasTokens must be 0 when unsupported")
    if default_weight is not None and default_weight != 0:
        errors.append("contextBiasing.defaultWeight must be 0 when unsupported")
    if max_cumulative_bonus is not None and max_cumulative_bonus != 0:
        errors.append("contextBiasing.maxCumulativeBonus must be 0 when unsupported")
    if weight_range is not None and (weight_range["min"] != 0 or weight_range["max"] != 0):
        errors.append("contextBiasing.weightRange must be 0..0 when unsupported")
    if presets is not None and (
        presets["light"] != 0 or presets["normal"] != 0 or presets["strong"] != 0
    ):
        errors.append("contextBiasing.presets must be 0 when unsupported")
    if scoring is not None and (
        scoring["prefixBonus"] != 0
        or scoring["completionBonus"] != 0
        or scoring["mismatchPenalty"] != 0
    ):
        errors.append("contextBiasing.scoring must be 0 when unsupported")
    if diagnostics is not None and (
        diagnostics["emitMatchedVocabularyIds"] or diagnostics["emitScoreBreakdown"]
    ):
        errors.append("contextBiasing.diagnostics must be false when unsupported")


def _files(value: Any, errors: list[str]) -> set[str]:
    file_keys: set[str] = set()
    if not isinstance(value, Mapping):
        errors.append("files must be an object")
        return file_keys
    if not value:
        errors.append("files must list at least one model artifact")
    for file_key, file_value in value.items():
        if not isinstance(file_key, str) or not file_key:
            errors.append("files keys must be non-empty")
            continue
        file_keys.add(file_key)
        path = f"files.{file_key}"
        if not isinstance(file_value, Mapping):
            errors.append(f"{path} must be an object")
            continue
        _non_empty_string(file_value.get("url"), f"{path}.url", errors)
        _pattern_string(file_value.get("sha256"), f"{path}.sha256", SHA256_RE, errors)
        _positive_int(file_value.get("sizeBytes"), f"{path}.sizeBytes", errors)
        _non_empty_string(file_value.get("mediaType"), f"{path}.mediaType", errors)
    return file_keys


def _graphs(value: Any, file_keys: set[str], errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("graphs must be an object")
        return
    for graph_name in ("encoder", "predictor", "joiner"):
        if not isinstance(value.get(graph_name), Mapping):
            errors.append(f"graphs.{graph_name} is required")
        else:
            _graph(value[graph_name], f"graphs.{graph_name}", file_keys, errors)
    for graph_name in ("speakerEncoder", "adapter", "finalizer"):
        if graph_name in value:
            _graph(value[graph_name], f"graphs.{graph_name}", file_keys, errors)


def _graph(value: Any, path: str, file_keys: set[str], errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append(f"{path} must be an object")
        return
    file_key = _non_empty_string(value.get("fileKey"), f"{path}.fileKey", errors)
    if file_key is not None and file_key not in file_keys:
        errors.append(f"{path}.fileKey must reference an entry in files")
    input_names = _tensor_array(value.get("inputs"), f"{path}.inputs", errors)
    output_names = _tensor_array(value.get("outputs"), f"{path}.outputs", errors)
    _state_relationships(value.get("stateRelationships"), path, input_names, output_names, errors)


def _tensor_array(value: Any, path: str, errors: list[str]) -> set[str]:
    names: set[str] = set()
    if not isinstance(value, Sequence) or isinstance(value, str) or len(value) == 0:
        errors.append(f"{path} must be a non-empty array")
        return names
    for index, tensor in enumerate(value):
        tensor_path = f"{path}[{index}]"
        if not isinstance(tensor, Mapping):
            errors.append(f"{tensor_path} must be an object")
            continue
        name = _non_empty_string(tensor.get("name"), f"{tensor_path}.name", errors)
        if name is not None:
            if name in names:
                errors.append(f"{tensor_path}.name must be unique within {path}")
            names.add(name)
        _enum_value(tensor.get("dataType"), f"{tensor_path}.dataType", TENSOR_DATA_TYPES, errors)
        _non_empty_string(tensor.get("description"), f"{tensor_path}.description", errors)
        shape = tensor.get("shape")
        if not isinstance(shape, Sequence) or isinstance(shape, str) or len(shape) == 0:
            errors.append(f"{tensor_path}.shape must be a non-empty array")
            continue
        for dimension_index, dimension in enumerate(shape):
            dimension_path = f"{tensor_path}.shape[{dimension_index}]"
            if isinstance(dimension, str):
                if not dimension:
                    errors.append(f"{dimension_path} must not be empty")
            elif not isinstance(dimension, int) or dimension <= 0:
                errors.append(f"{dimension_path} must be a positive integer or symbolic string")
    return names


def _state_relationships(
    value: Any,
    graph_path: str,
    input_names: set[str],
    output_names: set[str],
    errors: list[str],
) -> None:
    if value is None:
        return
    if not isinstance(value, Sequence) or isinstance(value, str):
        errors.append(f"{graph_path}.stateRelationships must be an array")
        return
    for index, relationship in enumerate(value):
        path = f"{graph_path}.stateRelationships[{index}]"
        if not isinstance(relationship, Mapping):
            errors.append(f"{path} must be an object")
            continue
        input_name = _non_empty_string(relationship.get("input"), f"{path}.input", errors)
        output_name = _non_empty_string(relationship.get("output"), f"{path}.output", errors)
        if not isinstance(relationship.get("resetAtUtteranceBoundary"), bool):
            errors.append(f"{path}.resetAtUtteranceBoundary must be boolean")
        if input_name is not None and input_name not in input_names:
            errors.append(f"{path}.input must reference a graph input tensor")
        if output_name is not None and output_name not in output_names:
            errors.append(f"{path}.output must reference a graph output tensor")


def _personalization(
    value: Any,
    file_keys: set[str],
    graphs: Any,
    errors: list[str],
) -> None:
    if value is None:
        return
    if not isinstance(value, Mapping):
        errors.append("personalization must be an object")
        return
    speaker_embedding = value.get("speakerEmbedding")
    if speaker_embedding is not None:
        if not isinstance(speaker_embedding, Mapping):
            errors.append("personalization.speakerEmbedding must be an object")
        else:
            if not isinstance(speaker_embedding.get("supported"), bool):
                errors.append("personalization.speakerEmbedding.supported must be boolean")
            _positive_int(
                speaker_embedding.get("dimension"),
                "personalization.speakerEmbedding.dimension",
                errors,
            )
            _non_empty_string(
                speaker_embedding.get("inputName"),
                "personalization.speakerEmbedding.inputName",
                errors,
            )
            encoder_file_key = _non_empty_string(
                speaker_embedding.get("encoderFileKey"),
                "personalization.speakerEmbedding.encoderFileKey",
                errors,
            )
            if encoder_file_key is not None and encoder_file_key not in file_keys:
                errors.append(
                    "personalization.speakerEmbedding.encoderFileKey must reference files"
                )
    residual_adapter = value.get("residualAdapter")
    if residual_adapter is not None:
        _residual_adapter_contract(residual_adapter, graphs, errors)


def _residual_adapter_contract(value: Any, graphs: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("personalization.residualAdapter must be an object")
        return
    supported = value.get("supported")
    if not isinstance(supported, bool):
        errors.append("personalization.residualAdapter.supported must be boolean")
    _positive_int(
        value.get("contractVersion"),
        "personalization.residualAdapter.contractVersion",
        errors,
    )
    max_parameters = _non_negative_int(
        value.get("maxParameters"),
        "personalization.residualAdapter.maxParameters",
        errors,
    )
    max_adapter_size_bytes = _non_negative_int(
        value.get("maxAdapterSizeBytes"),
        "personalization.residualAdapter.maxAdapterSizeBytes",
        errors,
    )
    insertion_points = _residual_adapter_insertion_points(value.get("insertionPoints"), errors)
    allowed_precisions = _enum_array_allow_empty(
        value.get("allowedPrecisions"),
        "personalization.residualAdapter.allowedPrecisions",
        RESIDUAL_ADAPTER_PRECISIONS,
        errors,
    )
    if value.get("activationSwap") != "utterance-boundary":
        errors.append("personalization.residualAdapter.activationSwap must be utterance-boundary")

    adapter_graph = graphs.get("adapter") if isinstance(graphs, Mapping) else None
    if isinstance(adapter_graph, Mapping):
        _residual_adapter_graph_bindings(adapter_graph, insertion_points, errors)

    if supported is True:
        if not isinstance(adapter_graph, Mapping):
            errors.append("graphs.adapter is required when residual adapters are supported")
        if len(insertion_points) == 0:
            errors.append(
                "personalization.residualAdapter.insertionPoints must not be empty when supported"
            )
        if allowed_precisions is not None and len(allowed_precisions) == 0:
            errors.append(
                "personalization.residualAdapter.allowedPrecisions must not be empty when supported"
            )
        if max_parameters is not None and max_parameters <= 0:
            errors.append(
                "personalization.residualAdapter.maxParameters must be positive when supported"
            )
        if max_adapter_size_bytes is not None and max_adapter_size_bytes <= 0:
            errors.append(
                "personalization.residualAdapter.maxAdapterSizeBytes must be positive when "
                "supported"
            )


def _residual_adapter_insertion_points(
    value: Any,
    errors: list[str],
) -> list[tuple[int, str, str, str]]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        errors.append("personalization.residualAdapter.insertionPoints must be an array")
        return []
    seen: set[str] = set()
    insertion_points: list[tuple[int, str, str, str]] = []
    for index, entry in enumerate(value):
        path = f"personalization.residualAdapter.insertionPoints[{index}]"
        if not isinstance(entry, Mapping):
            errors.append(f"{path} must be an object")
            continue
        insertion_id = _non_empty_string(entry.get("id"), f"{path}.id", errors)
        if insertion_id is not None:
            if insertion_id in seen:
                errors.append(f"{path}.id must be unique")
            seen.add(insertion_id)
        _enum_value(
            entry.get("targetGraph"), f"{path}.targetGraph", RESIDUAL_ADAPTER_GRAPH_ROLES, errors
        )
        input_tensor = _non_empty_string(entry.get("inputTensor"), f"{path}.inputTensor", errors)
        output_tensor = _non_empty_string(entry.get("outputTensor"), f"{path}.outputTensor", errors)
        _enum_value(
            entry.get("application"),
            f"{path}.application",
            RESIDUAL_ADAPTER_APPLICATIONS,
            errors,
        )
        if insertion_id is not None and input_tensor is not None and output_tensor is not None:
            insertion_points.append((index, insertion_id, input_tensor, output_tensor))
    return insertion_points


def _residual_adapter_graph_bindings(
    graph: Mapping[str, Any],
    insertion_points: list[tuple[int, str, str, str]],
    errors: list[str],
) -> None:
    graph_inputs = _tensor_names(graph.get("inputs"))
    graph_outputs = _tensor_names(graph.get("outputs"))
    for index, _insertion_id, input_tensor, output_tensor in insertion_points:
        path = f"personalization.residualAdapter.insertionPoints[{index}]"
        if input_tensor not in graph_inputs:
            errors.append(f"{path}.inputTensor must reference graphs.adapter.inputs")
        if output_tensor not in graph_outputs:
            errors.append(f"{path}.outputTensor must reference graphs.adapter.outputs")


def _tensor_names(value: Any) -> set[str]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return set()
    names: set[str] = set()
    for tensor in value:
        if isinstance(tensor, Mapping) and isinstance(tensor.get("name"), str):
            names.add(tensor["name"])
    return names


def _browser_training(
    value: Any,
    manifest: Mapping[str, Any],
    file_keys: set[str],
    errors: list[str],
) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining must be an object")
        return
    if value.get("supported") is not True:
        errors.append("browserTraining.supported must be true")
    if value.get("contractVersion") != 1:
        errors.append("browserTraining.contractVersion must be 1")
    _browser_training_backend(value.get("backend"), errors)
    if value.get("algorithmId") != "browser-top-adapter-frame-ce-v1":
        errors.append("browserTraining.algorithmId must be browser-top-adapter-frame-ce-v1")
    if value.get("minimumAppVersion") != "0.5.0":
        errors.append("browserTraining.minimumAppVersion must be 0.5.0")
    _exact_base_model(value.get("exactBaseModel"), manifest, errors)
    feature_dimension = _browser_training_feature_tap(value.get("featureTap"), manifest, errors)
    _browser_training_adapter(value.get("adapter"), feature_dimension, file_keys, errors)
    _browser_training_artifacts(value.get("artifacts"), file_keys, errors)
    _browser_training_limits(value.get("limits"), errors)


def _browser_training_backend(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.backend must be an object")
        return
    if value.get("interface") != "BrowserTrainingBackend":
        errors.append("browserTraining.backend.interface must be BrowserTrainingBackend")
    _enum_value(
        value.get("kind"), "browserTraining.backend.kind", BROWSER_TRAINING_BACKENDS, errors
    )
    _enum_value(
        value.get("proofStatus"),
        "browserTraining.backend.proofStatus",
        BROWSER_TRAINING_PROOF_STATUSES,
        errors,
    )
    _optional_non_empty_string(
        value.get("runtimePackage"), "browserTraining.backend.runtimePackage", errors
    )
    if (
        value.get("kind") == "repository-fixed-adapter-math"
        and value.get("proofStatus") != "fixed-adapter-math-required"
    ):
        errors.append(
            "browserTraining.backend.proofStatus must be fixed-adapter-math-required for "
            "repository-fixed-adapter-math"
        )
    if (
        value.get("kind") == "onnxruntime-web-training"
        and value.get("proofStatus") != "ort-training-worker-proof-passed"
    ):
        errors.append(
            "browserTraining.backend.proofStatus must be ort-training-worker-proof-passed for "
            "onnxruntime-web-training"
        )


def _exact_base_model(value: Any, manifest: Mapping[str, Any], errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.exactBaseModel must be an object")
        return
    model_id = _pattern_string(
        value.get("id"), "browserTraining.exactBaseModel.id", MODEL_ID_RE, errors
    )
    version = _non_empty_string(
        value.get("version"), "browserTraining.exactBaseModel.version", errors
    )
    _pattern_string(
        value.get("manifestSha256"),
        "browserTraining.exactBaseModel.manifestSha256",
        SHA256_RE,
        errors,
    )
    _pattern_string(
        value.get("graphContractSha256"),
        "browserTraining.exactBaseModel.graphContractSha256",
        SHA256_RE,
        errors,
    )
    _pattern_string(
        value.get("tokenizerSha256"),
        "browserTraining.exactBaseModel.tokenizerSha256",
        SHA256_RE,
        errors,
    )
    if model_id is not None and model_id != manifest.get("id"):
        errors.append("browserTraining.exactBaseModel.id must match manifest id")
    if version is not None and version != manifest.get("version"):
        errors.append("browserTraining.exactBaseModel.version must match manifest version")


def _browser_training_feature_tap(
    value: Any,
    manifest: Mapping[str, Any],
    errors: list[str],
) -> int | None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.featureTap must be an object")
        return None
    graph_id = _non_empty_string(value.get("graphId"), "browserTraining.featureTap.graphId", errors)
    output_name = _non_empty_string(
        value.get("outputName"), "browserTraining.featureTap.outputName", errors
    )
    dimension = _positive_int(
        value.get("dimension"), "browserTraining.featureTap.dimension", errors
    )
    frame_shift_ms = _positive_number(
        value.get("frameShiftMs"), "browserTraining.featureTap.frameShiftMs", errors
    )
    if value.get("persistedDtype") != "float16":
        errors.append("browserTraining.featureTap.persistedDtype must be float16")
    graphs = manifest.get("graphs")
    graph = graphs.get(graph_id) if isinstance(graphs, Mapping) and graph_id is not None else None
    if graph_id is not None and not isinstance(graph, Mapping):
        errors.append("browserTraining.featureTap.graphId must reference a declared graph")
    if (
        output_name is not None
        and isinstance(graph, Mapping)
        and output_name not in _tensor_names(graph.get("outputs"))
    ):
        errors.append(
            "browserTraining.featureTap.outputName must reference the featureTap graph outputs"
        )
    feature = manifest.get("feature")
    manifest_frame_shift = feature.get("frameShiftMs") if isinstance(feature, Mapping) else None
    if (
        frame_shift_ms is not None
        and isinstance(manifest_frame_shift, int | float)
        and frame_shift_ms != float(manifest_frame_shift)
    ):
        errors.append("browserTraining.featureTap.frameShiftMs must match feature.frameShiftMs")
    return dimension


def _browser_training_adapter(
    value: Any,
    feature_dimension: int | None,
    file_keys: set[str],
    errors: list[str],
) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.adapter must be an object")
        return
    if value.get("architecture") != "residual-bottleneck-lhuc-v1":
        errors.append("browserTraining.adapter.architecture must be residual-bottleneck-lhuc-v1")
    input_dimension = _positive_int(
        value.get("inputDimension"), "browserTraining.adapter.inputDimension", errors
    )
    _positive_int(value.get("rank"), "browserTraining.adapter.rank", errors)
    residual_scale = _positive_number(
        value.get("residualScale"), "browserTraining.adapter.residualScale", errors
    )
    parameter_names = _tensor_array(
        value.get("parameterTensors"), "browserTraining.adapter.parameterTensors", errors
    )
    for required_name in sorted(BROWSER_TRAINING_PARAMETER_TENSORS):
        if required_name not in parameter_names:
            errors.append(f"browserTraining.adapter.parameterTensors must include {required_name}")
    _browser_training_parameter_tensor_types(value.get("parameterTensors"), errors)
    _browser_training_artifact_ref(
        value.get("runtimeGraph"),
        "browserTraining.adapter.runtimeGraph",
        "runtime-adapter",
        file_keys,
        errors,
    )
    preferred_max_bytes = _positive_int(
        value.get("preferredMaxBytes"), "browserTraining.adapter.preferredMaxBytes", errors
    )
    hard_max_bytes = _positive_int(
        value.get("hardMaxBytes"), "browserTraining.adapter.hardMaxBytes", errors
    )
    if (
        input_dimension is not None
        and feature_dimension is not None
        and input_dimension != feature_dimension
    ):
        errors.append("browserTraining.adapter.inputDimension must match featureTap.dimension")
    if residual_scale is not None and residual_scale > 1:
        errors.append("browserTraining.adapter.residualScale must be less than or equal to 1")
    if (
        preferred_max_bytes is not None
        and hard_max_bytes is not None
        and preferred_max_bytes > hard_max_bytes
    ):
        errors.append("browserTraining.adapter.preferredMaxBytes must not exceed hardMaxBytes")


def _browser_training_parameter_tensor_types(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return
    for index, tensor in enumerate(value):
        if not isinstance(tensor, Mapping):
            continue
        if tensor.get("dataType") not in {"float32", "float16"}:
            errors.append(
                f"browserTraining.adapter.parameterTensors[{index}].dataType must be float32 or "
                "float16"
            )


def _browser_training_artifacts(value: Any, file_keys: set[str], errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.artifacts must be an object")
        return
    _browser_training_artifact_ref(
        value.get("trainingModel"),
        "browserTraining.artifacts.trainingModel",
        "training-model",
        file_keys,
        errors,
    )
    _browser_training_artifact_ref(
        value.get("evalModel"),
        "browserTraining.artifacts.evalModel",
        "eval-model",
        file_keys,
        errors,
    )
    _browser_training_artifact_ref(
        value.get("optimizerModel"),
        "browserTraining.artifacts.optimizerModel",
        "optimizer-model",
        file_keys,
        errors,
    )
    _browser_training_artifact_array(
        value.get("nominalCheckpoint"),
        "browserTraining.artifacts.nominalCheckpoint",
        "nominal-checkpoint",
        file_keys,
        errors,
    )
    _browser_training_artifact_ref(
        value.get("contractTestVectors"),
        "browserTraining.artifacts.contractTestVectors",
        "contract-test-vectors",
        file_keys,
        errors,
    )
    _browser_training_artifact_array(
        value.get("anchorPack"),
        "browserTraining.artifacts.anchorPack",
        "anchor-pack",
        file_keys,
        errors,
    )


def _browser_training_artifact_array(
    value: Any,
    path: str,
    expected_role: str,
    file_keys: set[str],
    errors: list[str],
) -> None:
    if not isinstance(value, Sequence) or isinstance(value, str) or len(value) == 0:
        errors.append(f"{path} must be a non-empty array")
        return
    for index, entry in enumerate(value):
        _browser_training_artifact_ref(entry, f"{path}[{index}]", expected_role, file_keys, errors)


def _browser_training_artifact_ref(
    value: Any,
    path: str,
    expected_role: str,
    file_keys: set[str],
    errors: list[str],
) -> None:
    if not isinstance(value, Mapping):
        errors.append(f"{path} must be an object")
        return
    file_key = _non_empty_string(value.get("fileKey"), f"{path}.fileKey", errors)
    if file_key is not None and file_key not in file_keys:
        errors.append(f"{path}.fileKey must reference an entry in files")
    _enum_value(value.get("role"), f"{path}.role", BROWSER_TRAINING_ARTIFACT_ROLES, errors)
    if value.get("role") != expected_role:
        errors.append(f"{path}.role must be {expected_role}")
    _browser_training_artifact_license(value.get("license"), f"{path}.license", errors)
    _artifact_provenance(value.get("provenance"), f"{path}.provenance", errors)


def _browser_training_artifact_license(value: Any, path: str, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append(f"{path} must be an object")
        return
    _optional_non_empty_string(value.get("spdx"), f"{path}.spdx", errors)
    _non_empty_string(value.get("name"), f"{path}.name", errors)
    _optional_non_empty_string(value.get("noticeUrl"), f"{path}.noticeUrl", errors)
    if not isinstance(value.get("redistributionAllowed"), bool):
        errors.append(f"{path}.redistributionAllowed must be boolean")


def _artifact_provenance(value: Any, path: str, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append(f"{path} must be an object")
        return
    _non_empty_string(value.get("source"), f"{path}.source", errors)
    _non_empty_string(value.get("generatedBy"), f"{path}.generatedBy", errors)
    _optional_non_empty_string(value.get("createdAt"), f"{path}.createdAt", errors)


def _browser_training_limits(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("browserTraining.limits must be an object")
        return
    _positive_int(value.get("maxUtterances"), "browserTraining.limits.maxUtterances", errors)
    _positive_int(
        value.get("maxAcceptedSeconds"), "browserTraining.limits.maxAcceptedSeconds", errors
    )
    _positive_int(
        value.get("maxFramesPerBatch"), "browserTraining.limits.maxFramesPerBatch", errors
    )
    _positive_int(value.get("maxEpochs"), "browserTraining.limits.maxEpochs", errors)
    max_optimizer_steps = _positive_int(
        value.get("maxOptimizerSteps"), "browserTraining.limits.maxOptimizerSteps", errors
    )
    checkpoint_interval_steps = _positive_int(
        value.get("checkpointIntervalSteps"),
        "browserTraining.limits.checkpointIntervalSteps",
        errors,
    )
    if (
        max_optimizer_steps is not None
        and checkpoint_interval_steps is not None
        and checkpoint_interval_steps > max_optimizer_steps
    ):
        errors.append(
            "browserTraining.limits.checkpointIntervalSteps must not exceed maxOptimizerSteps"
        )


def _file_keys(manifest: Mapping[str, Any]) -> set[str]:
    files = manifest.get("files")
    if not isinstance(files, Mapping):
        return set()
    return {key for key in files if isinstance(key, str) and key}


def _recommended(value: Any, errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("recommended must be an object")
        return
    if not isinstance(value.get("webgpu"), bool):
        errors.append("recommended.webgpu must be boolean")
    _positive_int(value.get("wasmThreads"), "recommended.wasmThreads", errors)
    _positive_int(value.get("expectedMemoryMb"), "recommended.expectedMemoryMb", errors)


def _enum_array(value: Any, path: str, allowed: set[str], errors: list[str]) -> list[str] | None:
    if not isinstance(value, Sequence) or isinstance(value, str) or len(value) == 0:
        errors.append(f"{path} must be a non-empty array")
        return None
    seen: set[str] = set()
    result: list[str] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, str) or entry not in allowed:
            errors.append(f"{path}[{index}] is not supported")
            continue
        if entry in seen:
            errors.append(f"{path}[{index}] must be unique")
        seen.add(entry)
        result.append(entry)
    return result


def _enum_array_allow_empty(
    value: Any, path: str, allowed: set[str], errors: list[str]
) -> list[str] | None:
    if not isinstance(value, Sequence) or isinstance(value, str):
        errors.append(f"{path} must be an array")
        return None
    seen: set[str] = set()
    result: list[str] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, str) or entry not in allowed:
            errors.append(f"{path}[{index}] is not supported")
            continue
        if entry in seen:
            errors.append(f"{path}[{index}] must be unique")
        seen.add(entry)
        result.append(entry)
    return result


def _string_array(value: Any, path: str, errors: list[str]) -> None:
    if not isinstance(value, Sequence) or isinstance(value, str):
        errors.append(f"{path} must be an array")
        return
    seen: set[str] = set()
    for index, entry in enumerate(value):
        if not isinstance(entry, str) or not entry:
            errors.append(f"{path}[{index}] must be a non-empty string")
            continue
        if entry in seen:
            errors.append(f"{path}[{index}] must be unique")
        seen.add(entry)


def _enum_value(value: Any, path: str, allowed: set[str], errors: list[str]) -> None:
    if not isinstance(value, str) or value not in allowed:
        errors.append(f"{path} is not supported")


def _token_id(value: Any, path: str, vocabulary_size: int, errors: list[str]) -> None:
    token_id = _non_negative_int(value, path, errors)
    if token_id is not None and token_id >= vocabulary_size:
        errors.append(f"{path} must be less than tokenizer.vocabularySize")


def _positive_int(value: Any, path: str, errors: list[str]) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        errors.append(f"{path} must be a positive integer")
        return None
    return value


def _non_negative_int(value: Any, path: str, errors: list[str]) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        errors.append(f"{path} must be a non-negative integer")
        return None
    return value


def _positive_number(value: Any, path: str, errors: list[str]) -> float | None:
    if not isinstance(value, int | float) or isinstance(value, bool) or not value > 0:
        errors.append(f"{path} must be a positive number")
        return None
    return float(value)


def _non_negative_number(value: Any, path: str, errors: list[str]) -> float | None:
    if not isinstance(value, int | float) or isinstance(value, bool) or value < 0:
        errors.append(f"{path} must be a non-negative number")
        return None
    return float(value)


def _non_empty_string(value: Any, path: str, errors: list[str]) -> str | None:
    if not isinstance(value, str) or not value:
        errors.append(f"{path} must be a non-empty string")
        return None
    return value


def _optional_non_empty_string(value: Any, path: str, errors: list[str]) -> None:
    _optional_non_empty_string_return(value, path, errors)


def _optional_non_empty_string_return(value: Any, path: str, errors: list[str]) -> str | None:
    if value is not None:
        return _non_empty_string(value, path, errors)
    return None


def _pattern_string(
    value: Any, path: str, pattern: re.Pattern[str], errors: list[str]
) -> str | None:
    string_value = _non_empty_string(value, path, errors)
    if string_value is not None and pattern.fullmatch(string_value) is None:
        errors.append(f"{path} has invalid format")
    return string_value


def _is_power_of_two(value: int) -> bool:
    return value > 0 and value & (value - 1) == 0
