from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "docs" / "planning" / "v0.6.0-baseline-task-metrics.json"
ADR_PATH = ROOT / "docs" / "adr" / "0009-v0-6-0-baseline-task-metrics.md"

REQUIRED_TASK_IDS = [
    "first-transcript",
    "change-language",
    "enable-vocabulary-set",
    "add-custom-term",
    "create-model-begin-enrollment",
    "resume-enrollment",
    "begin-training",
    "interpret-candidate-result",
    "export-personal-model",
    "import-personal-model",
    "delete-local-speech-data",
]

PRIVATE_FLAGS = [
    "containsPrivateAudio",
    "containsPrivateTranscript",
    "containsPrivateVocabularyTerms",
    "containsPrivateProfileData",
    "telemetryOrRemoteAnalytics",
]


def load_report() -> dict[str, object]:
    return json.loads(REPORT_PATH.read_text(encoding="utf-8"))


def test_v0_6_baseline_task_metrics_metadata_and_adr() -> None:
    report = load_report()
    metadata = report["metadata"]

    assert metadata["reportId"] == "v0.6.0-baseline-task-metrics"
    assert metadata["sourceIssue"] == "https://github.com/WilsonLe/speech/issues/212"
    assert metadata["baselineRelease"] == "v0.5.0"
    assert metadata["baselineCommit"] == "8e72dd120e41e69cc52458804fa8b8804e74b9bc"
    assert metadata["captureCommit"] == "47dc6d65b80f4acb63c248b3e1c20830dc06514d"
    assert metadata["screenshotsCommitted"] is False
    assert metadata["localOnlyEvidence"] is True
    assert metadata["artifactRoot"] == "/tmp/speech-v0.6-baseline-212"

    adr = ADR_PATH.read_text(encoding="utf-8")
    assert "docs/planning/v0.6.0-baseline-task-metrics.json" in adr
    assert "/tmp/speech-v0.6-baseline-212/screenshots/" in adr
    assert "not a moderated usability study" in adr
    assert "No telemetry" in adr


def test_v0_6_baseline_task_metrics_cover_required_tasks() -> None:
    report = load_report()
    tasks = report["baselineTasks"]

    assert [task["id"] for task in tasks] == REQUIRED_TASK_IDS
    assert [task["planTaskNumber"] for task in tasks] == list(range(1, 12))
    assert report["aggregateBaseline"]["taskCount"] == 11

    for task in tasks:
        assert task["baselineRelease"] == "v0.5.0"
        assert task["baselineCommit"] == "8e72dd120e41e69cc52458804fa8b8804e74b9bc"
        assert task["title"].strip()
        assert len(task["completionPath"]) >= 2
        assert task["qualitativeObservations"]
        assert task["accessibilityObstacles"]
        assert task["qualitativeConfidence"] in {"low", "medium", "high"}


def test_v0_6_baseline_task_metrics_are_counted_and_privacy_safe() -> None:
    report = load_report()
    total_clicks = 0
    total_keystrokes = 0
    total_wrong_turns = 0

    for task in report["baselineTasks"]:
        metrics = task["metrics"]
        assert metrics["completionStatus"] == "completed-for-baseline-observation"
        assert metrics["pointerClickCount"] >= 0
        assert metrics["keystrokeCount"] >= 0
        assert metrics["wrongTurnCount"] >= 0
        assert "Manual count" in metrics["countBasis"]
        total_clicks += metrics["pointerClickCount"]
        total_keystrokes += metrics["keystrokeCount"]
        total_wrong_turns += metrics["wrongTurnCount"]

        privacy = task["privacy"]
        assert privacy["usesSyntheticAudio"] is True
        for flag in PRIVATE_FLAGS:
            assert privacy[flag] is False, task["id"]

    aggregate = report["aggregateBaseline"]
    assert aggregate["totalPointerClicks"] == total_clicks
    assert aggregate["totalKeystrokes"] == total_keystrokes
    assert aggregate["totalWrongTurns"] == total_wrong_turns
    assert "not a usability-study result" in " ".join(aggregate["notes"])


def test_v0_6_baseline_screenshot_manifest_is_local_and_complete() -> None:
    report = load_report()
    seen_sha256: set[str] = set()

    for task in report["baselineTasks"]:
        screenshot = task["screenshot"]
        assert screenshot["taskId"] == task["id"]
        assert screenshot["fileName"].endswith(".png")
        assert screenshot["localPath"].startswith("/tmp/speech-v0.6-baseline-212/screenshots/")
        assert screenshot["committedToRepository"] is False
        assert len(screenshot["sha256"]) == 64
        assert screenshot["sha256"] not in seen_sha256
        seen_sha256.add(screenshot["sha256"])
        assert screenshot["bytes"] > 10_000
        assert screenshot["viewport"] == {"width": 1440, "height": 900}
        box = screenshot["boundingBox"]
        assert box["width"] > 300
        assert box["height"] > 300
        assert screenshot["note"].strip()

    assert len(seen_sha256) == 11


def test_v0_6_baseline_report_has_no_embedded_private_or_binary_payloads() -> None:
    text = REPORT_PATH.read_text(encoding="utf-8")
    forbidden_fragments = [
        "data:image/",
        "base64",
        "BEGIN PRIVATE",
        "OPENAI",
        "password",
    ]
    for fragment in forbidden_fragments:
        assert fragment not in text
    assert re.search(r"sk-[A-Za-z0-9_\-]{20,}", text) is None

    report = load_report()
    assert report["metadata"]["screenshotsCommitted"] is False
    assert "PNG screenshots were captured locally" in report["metadata"]["screenshotCommitDecision"]
