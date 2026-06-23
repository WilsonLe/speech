from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from speech_profile_trainer import (
    evaluate_adapter_activation,
    load_activation_gate_config,
    parse_evaluation_case,
    write_evaluation_report,
)
from speech_profile_trainer.__main__ import main as trainer_main

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GATE_PATH = REPO_ROOT / "training/configs/personalization/default-activation-gate.json"


def test_activation_gate_passes_with_personal_improvement_and_clean_anchor(
    tmp_path: Path,
) -> None:
    result = evaluate_adapter_activation(
        evaluation_cases=_passing_cases(),
        training_metadata=_training_metadata(size_bytes=64),
        gate_config=load_activation_gate_config(DEFAULT_GATE_PATH),
    )
    report_path = write_evaluation_report(result, tmp_path / "evaluation-report.json")
    report = json.loads(report_path.read_text())

    assert result.activation_gate["passed"] is True
    assert result.activation_gate["automaticActivationAllowed"] is True
    assert report["evaluation"]["caseCounts"] == {
        "total": 4,
        "personalHoldout": 2,
        "anchor": 2,
    }
    assert report["evaluation"]["personalHoldout"]["wer"]["relativeImprovement"] > 0.05
    assert report["evaluation"]["anchor"]["wer"]["delta"] == 0
    assert report["evaluation"]["anchor"]["customTermRecall"]["base"] is None
    assert report["evaluation"]["overall"]["falseInsertionRate"]["inactiveTargets"] == 5
    assert report["evaluation"]["overall"]["falseInsertionRate"]["insertions"]["adapted"] == 0
    assert report["privacy"] == {
        "containsRawAudio": False,
        "containsTranscriptText": False,
        "containsCaseIds": False,
        "containsBaseModelWeights": False,
        "containsAdapterWeights": False,
    }
    report_text = json.dumps(report, ensure_ascii=False)
    assert "Wilson Speech private launch" not in report_text
    assert "case-personal" not in report_text
    assert "SecretInactiveTerm" not in report_text


def test_activation_gate_fails_on_anchor_regression_and_adapter_size() -> None:
    result = evaluate_adapter_activation(
        evaluation_cases=_failing_anchor_cases(),
        training_metadata=_training_metadata(size_bytes=12_000_000),
        gate_config=load_activation_gate_config(DEFAULT_GATE_PATH),
    )
    checks = {check["name"]: check for check in result.activation_gate["checks"]}

    assert result.activation_gate["passed"] is False
    assert result.activation_gate["automaticActivationAllowed"] is False
    assert checks["personal-improvement"]["passed"] is True
    assert checks["anchor-regression"]["passed"] is False
    assert checks["adapter-size"]["passed"] is False


def test_anchor_cases_cannot_declare_expected_custom_terms() -> None:
    case = _passing_cases()[2] | {"expectedCustomTerms": ["should-not-be-here"]}

    with pytest.raises(ValueError, match="anchor evaluation cases"):
        parse_evaluation_case(case)


def test_evaluate_cli_writes_report_and_uses_exit_status(tmp_path: Path, capsys: Any) -> None:
    evaluation_path = tmp_path / "evaluation.json"
    metadata_path = tmp_path / "training-metadata.json"
    output_path = tmp_path / "report.json"
    evaluation_path.write_text(json.dumps({"cases": _passing_cases()}), encoding="utf-8")
    metadata_path.write_text(json.dumps(_training_metadata(size_bytes=64)), encoding="utf-8")

    exit_code = trainer_main(
        [
            "evaluate",
            "--evaluation",
            str(evaluation_path),
            "--training-metadata",
            str(metadata_path),
            "--gate-config",
            str(DEFAULT_GATE_PATH),
            "--output",
            str(output_path),
            "--json",
        ]
    )

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert payload["activationGatePassed"] is True
    assert payload["automaticActivationAllowed"] is True
    assert payload["outputPath"] == str(output_path)
    assert json.loads(output_path.read_text())["activationGate"]["passed"] is True


def _training_metadata(*, size_bytes: int) -> dict[str, Any]:
    return {
        "adapter": {"sha256": "a" * 64, "sizeBytes": size_bytes},
        "baseModel": {
            "id": "local-dev-rnnt-mock",
            "version": "0.0.0-test",
            "manifestSha256": "b" * 64,
            "graphContractSha256": "c" * 64,
        },
    }


def _passing_cases() -> list[dict[str, Any]]:
    return [
        {
            "id": "case-personal-1",
            "split": "personal-holdout",
            "language": "en",
            "voiceCondition": "normal",
            "referenceText": "Please open Wilson Speech private launch.",
            "baseText": "Please open Speech private launch.",
            "adaptedText": "Please open Wilson Speech private launch.",
            "expectedCustomTerms": ["Wilson Speech"],
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 3000,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-personal-2",
            "split": "personal-holdout",
            "language": "mixed",
            "voiceCondition": "projected",
            "referenceText": "Tôi vừa update dashboard hôm nay.",
            "baseText": "Tôi vừa dashboard hôm nay.",
            "adaptedText": "Tôi vừa update dashboard hôm nay.",
            "expectedCustomTerms": ["update dashboard"],
            "inactiveCustomTerms": ["SecretInactiveTerm", "dash"],
            "durationMs": 2800,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-anchor-1",
            "split": "anchor",
            "language": "vi",
            "voiceCondition": "normal",
            "referenceText": "Đây là câu kiểm tra chung.",
            "baseText": "Đây là câu kiểm tra chung.",
            "adaptedText": "Đây là câu kiểm tra chung.",
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 2500,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
        {
            "id": "case-anchor-2",
            "split": "anchor",
            "language": "en",
            "voiceCondition": "normal",
            "referenceText": "This is a generic anchor sentence.",
            "baseText": "This is a generic anchor sentence.",
            "adaptedText": "This is a generic anchor sentence.",
            "inactiveCustomTerms": ["SecretInactiveTerm"],
            "durationMs": 2600,
            "baseRtf": 0.1,
            "adaptedRtf": 0.11,
        },
    ]


def _failing_anchor_cases() -> list[dict[str, Any]]:
    cases = _passing_cases()
    cases[2] = cases[2] | {"adaptedText": "Sai hoàn toàn câu kiểm tra chung."}
    return cases
