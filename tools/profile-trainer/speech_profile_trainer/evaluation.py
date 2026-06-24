from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from .validation import load_json_file

EvaluationSplit = Literal["personal-holdout", "anchor"]
Language = Literal["vi", "en", "mixed"]
VoiceCondition = Literal["whisper", "normal", "projected", "unknown"]

_WORD_RE = re.compile(r"[\wÀ-ỹ]+", re.UNICODE)


@dataclass(frozen=True)
class EvaluationCase:
    case_id: str
    split: EvaluationSplit
    language: Language
    voice_condition: VoiceCondition
    reference_text: str
    base_text: str
    adapted_text: str
    expected_custom_terms: tuple[str, ...]
    inactive_custom_terms: tuple[str, ...]
    duration_ms: int
    base_rtf: float
    adapted_rtf: float


@dataclass(frozen=True)
class ActivationGateConfig:
    schema_version: int
    min_personal_relative_wer_improvement: float
    min_personal_relative_cer_improvement: float
    min_custom_term_recall_improvement: float
    max_anchor_wer_regression: float
    max_rtf_overhead_ratio: float
    max_adapter_size_bytes: int
    require_anchor_pack: bool


@dataclass(frozen=True)
class AdapterEvaluationResult:
    report: dict[str, Any]
    activation_gate: dict[str, Any]


def load_activation_gate_config(path: str | Path) -> ActivationGateConfig:
    return parse_activation_gate_config(load_json_file(path))


def parse_activation_gate_config(value: dict[str, Any]) -> ActivationGateConfig:
    if value.get("schemaVersion") != 1:
        raise ValueError("activation gate config schemaVersion must be 1")
    return ActivationGateConfig(
        schema_version=1,
        min_personal_relative_wer_improvement=_bounded_number(
            value, "minPersonalRelativeWerImprovement"
        ),
        min_personal_relative_cer_improvement=_bounded_number(
            value, "minPersonalRelativeCerImprovement"
        ),
        min_custom_term_recall_improvement=_bounded_number(value, "minCustomTermRecallImprovement"),
        max_anchor_wer_regression=_bounded_number(value, "maxAnchorWerRegression"),
        max_rtf_overhead_ratio=_non_negative_number(value, "maxRtfOverheadRatio"),
        max_adapter_size_bytes=_positive_int(value, "maxAdapterSizeBytes"),
        require_anchor_pack=_required_bool(value, "requireAnchorPack"),
    )


def evaluate_adapter_activation(
    *,
    evaluation_cases: list[dict[str, Any]],
    training_metadata: dict[str, Any],
    gate_config: ActivationGateConfig,
) -> AdapterEvaluationResult:
    cases = tuple(parse_evaluation_case(case) for case in evaluation_cases)
    if not cases:
        raise ValueError("evaluation cases must not be empty")
    personal_cases = tuple(case for case in cases if case.split == "personal-holdout")
    anchor_cases = tuple(case for case in cases if case.split == "anchor")
    if not personal_cases:
        raise ValueError("evaluation cases must include personal-holdout cases")
    if gate_config.require_anchor_pack and not anchor_cases:
        raise ValueError("evaluation cases must include an anchor pack")

    adapter_size = _adapter_size_bytes(training_metadata)
    overall = _summarize_cases(cases)
    personal = _summarize_cases(personal_cases)
    anchor = _summarize_cases(anchor_cases) if anchor_cases else _empty_summary()
    report = {
        "schemaVersion": 1,
        "adapter": {
            "sha256": _string_at(training_metadata, ["adapter", "sha256"]),
            "sizeBytes": adapter_size,
        },
        "baseModel": {
            "id": _string_at(training_metadata, ["baseModel", "id"]),
            "version": _string_at(training_metadata, ["baseModel", "version"]),
            "manifestSha256": _string_at(training_metadata, ["baseModel", "manifestSha256"]),
            "graphContractSha256": _string_at(
                training_metadata, ["baseModel", "graphContractSha256"]
            ),
        },
        "evaluation": {
            "caseCounts": {
                "total": len(cases),
                "personalHoldout": len(personal_cases),
                "anchor": len(anchor_cases),
            },
            "overall": overall,
            "personalHoldout": personal,
            "anchor": anchor,
            "byLanguage": {
                language: _summarize_cases(
                    tuple(case for case in cases if case.language == language)
                )
                for language in ("vi", "en", "mixed")
                if any(case.language == language for case in cases)
            },
            "byVoiceCondition": {
                voice_condition: _summarize_cases(
                    tuple(case for case in cases if case.voice_condition == voice_condition)
                )
                for voice_condition in ("whisper", "normal", "projected", "unknown")
                if any(case.voice_condition == voice_condition for case in cases)
            },
        },
        "privacy": {
            "containsRawAudio": False,
            "containsTranscriptText": False,
            "containsCaseIds": False,
            "containsBaseModelWeights": False,
            "containsAdapterWeights": False,
        },
    }
    activation_gate = _activation_gate(report, gate_config)
    report["activationGate"] = activation_gate
    return AdapterEvaluationResult(report=report, activation_gate=activation_gate)


def evaluate_adapter_activation_from_files(
    *,
    evaluation_path: str | Path,
    training_metadata_path: str | Path,
    gate_config_path: str | Path,
) -> AdapterEvaluationResult:
    evaluation_json = load_json_file(evaluation_path)
    training_metadata = load_json_file(training_metadata_path)
    if not isinstance(evaluation_json, dict):
        raise ValueError("evaluation JSON must be an object")
    cases = evaluation_json.get("cases")
    if not isinstance(cases, list):
        raise ValueError("evaluation JSON cases must be an array")
    if not isinstance(training_metadata, dict):
        raise ValueError("training metadata must be an object")
    return evaluate_adapter_activation(
        evaluation_cases=cases,
        training_metadata=training_metadata,
        gate_config=load_activation_gate_config(gate_config_path),
    )


def write_evaluation_report(result: AdapterEvaluationResult, output_path: str | Path) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result.report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def parse_evaluation_case(value: dict[str, Any]) -> EvaluationCase:
    split = _enum(value.get("split"), "split", {"personal-holdout", "anchor"})
    language = _enum(value.get("language"), "language", {"vi", "en", "mixed"})
    voice_condition = _enum(
        value.get("voiceCondition"),
        "voiceCondition",
        {"whisper", "normal", "projected", "unknown"},
    )
    reference_text = _required_string(value, "referenceText")
    base_text = _required_string(value, "baseText")
    adapted_text = _required_string(value, "adaptedText")
    expected_custom_terms = tuple(_string_list(value, "expectedCustomTerms", required=False))
    inactive_custom_terms = tuple(_string_list(value, "inactiveCustomTerms", required=False))
    if split == "anchor" and expected_custom_terms:
        raise ValueError("anchor evaluation cases must not declare expectedCustomTerms")
    return EvaluationCase(
        case_id=_required_string(value, "id"),
        split=split,  # type: ignore[arg-type]
        language=language,  # type: ignore[arg-type]
        voice_condition=voice_condition,  # type: ignore[arg-type]
        reference_text=reference_text,
        base_text=base_text,
        adapted_text=adapted_text,
        expected_custom_terms=expected_custom_terms,
        inactive_custom_terms=inactive_custom_terms,
        duration_ms=_positive_int(value, "durationMs"),
        base_rtf=_non_negative_number(value, "baseRtf"),
        adapted_rtf=_non_negative_number(value, "adaptedRtf"),
    )


def _summarize_cases(cases: tuple[EvaluationCase, ...]) -> dict[str, Any]:
    if not cases:
        return _empty_summary()
    base_word_errors = 0
    adapted_word_errors = 0
    word_count = 0
    base_char_errors = 0
    adapted_char_errors = 0
    char_count = 0
    base_custom_hits = 0
    adapted_custom_hits = 0
    custom_targets = 0
    base_false_insertions = 0
    adapted_false_insertions = 0
    inactive_targets = 0
    total_duration_ms = 0
    base_rtf_sum = 0.0
    adapted_rtf_sum = 0.0
    for case in cases:
        reference_words = _word_tokens(case.reference_text)
        base_words = _word_tokens(case.base_text)
        adapted_words = _word_tokens(case.adapted_text)
        base_word_errors += _edit_distance(reference_words, base_words)
        adapted_word_errors += _edit_distance(reference_words, adapted_words)
        word_count += len(reference_words)
        reference_chars = tuple(_normal_text(case.reference_text).replace(" ", ""))
        base_chars = tuple(_normal_text(case.base_text).replace(" ", ""))
        adapted_chars = tuple(_normal_text(case.adapted_text).replace(" ", ""))
        base_char_errors += _edit_distance(reference_chars, base_chars)
        adapted_char_errors += _edit_distance(reference_chars, adapted_chars)
        char_count += len(reference_chars)
        for term in case.expected_custom_terms:
            custom_targets += 1
            base_custom_hits += int(_contains_term(case.base_text, term))
            adapted_custom_hits += int(_contains_term(case.adapted_text, term))
        for term in case.inactive_custom_terms:
            inactive_targets += 1
            base_false_insertions += int(_contains_term(case.base_text, term))
            adapted_false_insertions += int(_contains_term(case.adapted_text, term))
        total_duration_ms += case.duration_ms
        base_rtf_sum += case.base_rtf
        adapted_rtf_sum += case.adapted_rtf
    base_custom_recall = _rate(base_custom_hits, custom_targets)
    adapted_custom_recall = _rate(adapted_custom_hits, custom_targets)
    base_false_insertion_rate = _rate(base_false_insertions, inactive_targets)
    adapted_false_insertion_rate = _rate(adapted_false_insertions, inactive_targets)
    base_avg_rtf = base_rtf_sum / len(cases)
    adapted_avg_rtf = adapted_rtf_sum / len(cases)
    return {
        "cases": len(cases),
        "durationMs": total_duration_ms,
        "wer": _metric(base_word_errors, adapted_word_errors, word_count),
        "cer": _metric(base_char_errors, adapted_char_errors, char_count),
        "customTermRecall": {
            "base": round(base_custom_recall, 6) if custom_targets else None,
            "adapted": round(adapted_custom_recall, 6) if custom_targets else None,
            "delta": round(adapted_custom_recall - base_custom_recall, 6)
            if custom_targets
            else None,
            "hits": {"base": base_custom_hits, "adapted": adapted_custom_hits},
            "targets": custom_targets,
        },
        "falseInsertionRate": {
            "base": round(base_false_insertion_rate, 6) if inactive_targets else None,
            "adapted": round(adapted_false_insertion_rate, 6) if inactive_targets else None,
            "delta": round(adapted_false_insertion_rate - base_false_insertion_rate, 6)
            if inactive_targets
            else None,
            "insertions": {"base": base_false_insertions, "adapted": adapted_false_insertions},
            "inactiveTargets": inactive_targets,
        },
        "rtf": {
            "base": round(base_avg_rtf, 6),
            "adapted": round(adapted_avg_rtf, 6),
            "overheadRatio": round(_overhead_ratio(base_avg_rtf, adapted_avg_rtf), 6),
        },
    }


def _empty_summary() -> dict[str, Any]:
    return {
        "cases": 0,
        "durationMs": 0,
        "wer": _metric(0, 0, 0),
        "cer": _metric(0, 0, 0),
        "customTermRecall": {
            "base": None,
            "adapted": None,
            "delta": None,
            "hits": {"base": 0, "adapted": 0},
            "targets": 0,
        },
        "falseInsertionRate": {
            "base": None,
            "adapted": None,
            "delta": None,
            "insertions": {"base": 0, "adapted": 0},
            "inactiveTargets": 0,
        },
        "rtf": {"base": None, "adapted": None, "overheadRatio": None},
    }


def _metric(base_errors: int, adapted_errors: int, denominator: int) -> dict[str, Any]:
    base = _rate(base_errors, denominator)
    adapted = _rate(adapted_errors, denominator)
    return {
        "base": round(base, 6) if denominator else None,
        "adapted": round(adapted, 6) if denominator else None,
        "delta": round(adapted - base, 6) if denominator else None,
        "relativeImprovement": round(_relative_improvement(base, adapted), 6)
        if denominator and base > 0
        else None,
        "errors": {"base": base_errors, "adapted": adapted_errors},
        "denominator": denominator,
    }


def _activation_gate(report: dict[str, Any], config: ActivationGateConfig) -> dict[str, Any]:
    personal = report["evaluation"]["personalHoldout"]
    anchor = report["evaluation"]["anchor"]
    overall = report["evaluation"]["overall"]
    adapter = report["adapter"]
    checks = []
    personal_wer_improvement = _optional_number(personal["wer"].get("relativeImprovement"))
    personal_cer_improvement = _optional_number(personal["cer"].get("relativeImprovement"))
    recall_delta = _optional_number(personal["customTermRecall"].get("delta"))
    personal_improved = (
        (
            personal_wer_improvement is not None
            and personal_wer_improvement >= config.min_personal_relative_wer_improvement
        )
        or (
            personal_cer_improvement is not None
            and personal_cer_improvement >= config.min_personal_relative_cer_improvement
        )
        or (recall_delta is not None and recall_delta >= config.min_custom_term_recall_improvement)
    )
    checks.append(
        _gate_check(
            "personal-improvement",
            personal_improved,
            {
                "relativeWerImprovement": personal_wer_improvement,
                "relativeCerImprovement": personal_cer_improvement,
                "customTermRecallDelta": recall_delta,
            },
        )
    )
    anchor_wer_delta = _optional_number(anchor["wer"].get("delta"))
    anchor_ok = (
        anchor_wer_delta is not None and anchor_wer_delta <= config.max_anchor_wer_regression
    )
    checks.append(
        _gate_check(
            "anchor-regression",
            anchor_ok,
            {"anchorWerDelta": anchor_wer_delta},
        )
    )
    rtf_overhead = _optional_number(overall["rtf"].get("overheadRatio"))
    rtf_ok = rtf_overhead is not None and rtf_overhead <= config.max_rtf_overhead_ratio
    checks.append(_gate_check("rtf-overhead", rtf_ok, {"rtfOverheadRatio": rtf_overhead}))
    adapter_size_ok = adapter["sizeBytes"] <= config.max_adapter_size_bytes
    checks.append(_gate_check("adapter-size", adapter_size_ok, {"sizeBytes": adapter["sizeBytes"]}))
    passed = all(check["passed"] for check in checks)
    return {
        "passed": passed,
        "automaticActivationAllowed": passed,
        "checks": checks,
        "summary": "passed" if passed else "failed",
    }


def _gate_check(name: str, passed: bool, values: dict[str, Any]) -> dict[str, Any]:
    return {"name": name, "passed": passed, "values": values}


def _adapter_size_bytes(training_metadata: dict[str, Any]) -> int:
    adapter = training_metadata.get("adapter")
    if not isinstance(adapter, dict):
        raise ValueError("training metadata adapter must be an object")
    size_bytes = adapter.get("sizeBytes")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes <= 0:
        raise ValueError("training metadata adapter.sizeBytes must be a positive integer")
    return size_bytes


def _word_tokens(text: str) -> tuple[str, ...]:
    return tuple(_WORD_RE.findall(_normal_text(text)))


def _normal_text(text: str) -> str:
    return " ".join(text.casefold().strip().split())


def _contains_term(text: str, term: str) -> bool:
    term_tokens = _word_tokens(term)
    if not term_tokens:
        return False
    text_tokens = _word_tokens(text)
    window = len(term_tokens)
    return any(
        text_tokens[index : index + window] == term_tokens for index in range(len(text_tokens))
    )


def _edit_distance(left: tuple[str, ...], right: tuple[str, ...]) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_item in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_item in enumerate(right, start=1):
            substitution = previous[right_index - 1] + int(left_item != right_item)
            insertion = current[right_index - 1] + 1
            deletion = previous[right_index] + 1
            current.append(min(substitution, insertion, deletion))
        previous = current
    return previous[-1]


def _rate(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def _relative_improvement(base: float, adapted: float) -> float:
    if base <= 0:
        return 0.0
    return (base - adapted) / base


def _overhead_ratio(base: float, adapted: float) -> float:
    if base <= 0:
        return 0.0 if adapted <= 0 else float("inf")
    return (adapted - base) / base


def _string_at(value: dict[str, Any], path: list[str]) -> str:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    return current if isinstance(current, str) else ""


def _required_string(value: dict[str, Any], key: str) -> str:
    entry = value.get(key)
    if not isinstance(entry, str) or not entry:
        raise ValueError(f"{key} must be a non-empty string")
    return entry


def _string_list(value: dict[str, Any], key: str, *, required: bool) -> list[str]:
    entry = value.get(key)
    if entry is None and not required:
        return []
    if not isinstance(entry, list):
        raise ValueError(f"{key} must be an array")
    output: list[str] = []
    for index, item in enumerate(entry):
        if not isinstance(item, str) or not item:
            raise ValueError(f"{key}[{index}] must be a non-empty string")
        output.append(item)
    return output


def _enum(value: Any, path: str, allowed: set[str]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{path} must be one of {', '.join(sorted(allowed))}")
    return value


def _positive_int(value: dict[str, Any], key: str) -> int:
    entry = value.get(key)
    if not isinstance(entry, int) or isinstance(entry, bool) or entry <= 0:
        raise ValueError(f"{key} must be a positive integer")
    return entry


def _non_negative_number(value: dict[str, Any], key: str) -> float:
    entry = value.get(key)
    if not isinstance(entry, int | float) or isinstance(entry, bool) or entry < 0:
        raise ValueError(f"{key} must be a non-negative number")
    return float(entry)


def _bounded_number(value: dict[str, Any], key: str) -> float:
    entry = _non_negative_number(value, key)
    if entry > 1:
        raise ValueError(f"{key} must be between 0 and 1")
    return entry


def _required_bool(value: dict[str, Any], key: str) -> bool:
    entry = value.get(key)
    if not isinstance(entry, bool):
        raise ValueError(f"{key} must be a boolean")
    return entry


def _optional_number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None
