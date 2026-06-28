import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = ROOT / "docs/research/v0.6-prototype-usability-study.json"
SUMMARY_PATH = ROOT / "docs/research/v0.6-prototype-findings.md"

REQUIRED_PARTICIPANT_ROWS = {
    "vietnamese-dominant",
    "bilingual-vietnamese-english",
    "novice-speech-tool-users",
    "experienced-speech-tool-users",
    "keyboard-or-assistive-technology-participants",
}

REQUIRED_TASKS = {
    "first-transcript",
    "enable-vocabulary",
    "create-model-and-enroll",
    "training-readiness",
    "import-export",
    "delete-local-data",
}


def load_artifact() -> dict:
    return json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))


def test_prototype_usability_artifact_records_participant_blocker() -> None:
    artifact = load_artifact()

    assert artifact["schemaVersion"] == 1
    assert artifact["release"] == "v0.6.0"
    assert artifact["artifact"] == "prototype-usability-study"
    assert artifact["status"] == "blocked-participants-unavailable"
    assert artifact["gateStatus"] == "open"
    assert artifact["participantAvailability"]["sessionsRun"] == 0
    assert artifact["participantAvailability"]["participantNotesProvided"] is False
    assert (
        "cannot synthesize human participant evidence"
        in artifact["participantAvailability"]["blocker"]
    )

    release_decision = artifact["releaseDecision"]
    assert release_decision["mayCloseIssue254"] is True
    assert release_decision["mayCloseOverallUsabilityGate"] is False
    assert "issue #255" in release_decision["requiredBeforeRelease"]


def test_prototype_usability_plan_keeps_required_mix_and_tasks() -> None:
    artifact = load_artifact()

    participant_ids = {row["id"] for row in artifact["requiredParticipantMix"]}
    assert REQUIRED_PARTICIPANT_ROWS <= participant_ids
    assert all(row["status"] == "not-run" for row in artifact["requiredParticipantMix"])

    task_ids = {task["id"] for task in artifact["prototypeTasks"]}
    assert REQUIRED_TASKS <= task_ids
    assert all(task["status"] == "not-run" for task in artifact["prototypeTasks"])

    assert artifact["findings"] == []
    assert artifact["highSeverityFindings"] == []
    assert artifact["incorporatedChanges"] == []
    assert artifact["openFollowUps"]
    assert all(follow_up["status"] == "open" for follow_up in artifact["openFollowUps"])


def test_prototype_usability_privacy_and_summary_boundaries() -> None:
    artifact = load_artifact()
    summary = SUMMARY_PATH.read_text(encoding="utf-8")

    privacy = artifact["privacy"]
    assert privacy == {
        "usesTelemetry": False,
        "usesRemoteAnalytics": False,
        "storesParticipantIdentifiers": False,
        "storesAudio": False,
        "storesTranscripts": False,
        "storesPrivateVocabulary": False,
        "storesScreenshotsOrRecordings": False,
        "usesSyntheticLocalEvidenceOnly": True,
    }

    substitute_evidence = artifact["localSubstituteEvidence"]
    assert substitute_evidence
    assert all("do not replace" in row["limitation"] for row in substitute_evidence)

    forbidden_claims = (
        "participant passed",
        "sessions completed",
        "recruited participants",
        "recording.webm",
        ".png",
        ".jpg",
        "transcript excerpt",
    )
    combined = json.dumps(artifact, ensure_ascii=False).lower() + "\n" + summary.lower()
    for phrase in forbidden_claims:
        assert phrase not in combined

    assert "prototype usability gate remains open" in summary.lower()
    assert "no participant findings exist yet" in summary.lower()
