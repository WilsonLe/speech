import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = ROOT / "docs/research/v0.6-release-usability-study.json"
SUMMARY_PATH = ROOT / "docs/research/v0.6-release-usability.md"

REQUIRED_TASKS = {
    "first-transcript",
    "enable-vocabulary",
    "continue-enrollment",
    "start-ready-training",
    "export-model",
    "import-model",
    "delete-local-data",
}

REQUIRED_COMPREHENSION_GATES = {
    "local-data-storage",
    "vocabulary-versus-voice-model",
    "no-hover-required-action",
}

REQUIRED_GATE_RESULTS = {
    "unassistedCompletion90Percent",
    "zeroUnrecoveredCriticalTaskFailures",
    "medianFirstTranscriptInteractionsReduced",
    "localDataStorageComprehension80Percent",
    "vocabularyVersusVoiceModelComprehension80Percent",
    "noRequiredActionHoverOnly",
    "highSeverityFindingsFixedOrAccepted",
}


def load_artifact() -> dict:
    return json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))


def test_release_usability_artifact_records_insufficient_evidence_blocker() -> None:
    artifact = load_artifact()

    assert artifact["schemaVersion"] == 1
    assert artifact["release"] == "v0.6.0"
    assert artifact["artifact"] == "release-usability-study"
    assert artifact["status"] == "blocked-participant-evidence-unavailable"
    assert artifact["gateStatus"] == "open"
    assert artifact["issue"] == 255

    availability = artifact["participantAvailability"]
    assert availability["sessionsRun"] == 0
    assert availability["participantNotesProvided"] is False
    assert "cannot synthesize human participant evidence" in availability["blocker"]
    assert "usability gates passed" in availability["blocker"]

    release_decision = artifact["releaseDecision"]
    assert release_decision["mayMergeThisEvidencePr"] is True
    assert release_decision["mayCloseIssue255"] is False
    assert release_decision["mayCloseOverallUsabilityGate"] is False
    assert "must not be treated as a completed study" in release_decision["rationale"]


def test_release_usability_tasks_and_gates_remain_unmeasured() -> None:
    artifact = load_artifact()

    task_ids = {task["id"] for task in artifact["requiredTasks"]}
    assert REQUIRED_TASKS <= task_ids
    assert all(task["status"] == "not-run" for task in artifact["requiredTasks"])
    assert all(
        task["gate"] == "at-least-90-percent-unassisted-completion"
        for task in artifact["requiredTasks"]
    )

    comprehension_ids = {gate["id"] for gate in artifact["comprehensionGates"]}
    assert REQUIRED_COMPREHENSION_GATES <= comprehension_ids
    assert all(
        gate["status"] == "not-measured" for gate in artifact["comprehensionGates"]
    )

    gate_results = artifact["gateResults"]
    assert REQUIRED_GATE_RESULTS <= set(gate_results)
    assert all(value == "not-measured" for value in gate_results.values())

    assert artifact["findings"] == []
    assert artifact["highSeverityFindings"] == []
    assert artifact["incorporatedChanges"] == []
    assert all(
        follow_up["status"] == "open" for follow_up in artifact["openFollowUps"]
    )


def test_release_usability_privacy_and_summary_boundaries() -> None:
    artifact = load_artifact()
    summary = SUMMARY_PATH.read_text(encoding="utf-8")

    assert artifact["privacy"] == {
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
    assert all("not replace" in row["limitation"] for row in substitute_evidence)

    combined = json.dumps(artifact, ensure_ascii=False).lower() + "\n" + summary.lower()
    forbidden_claims = (
        "participant passed",
        "sessions completed",
        "recruited participants",
        "90% gate passed",
        "80% comprehension passed",
        "recording.webm",
        ".png",
        ".jpg",
        "transcript excerpt",
    )
    for phrase in forbidden_claims:
        assert phrase not in combined

    assert "issue #255 remains open" in combined
    assert "release usability gate remains open" in combined
    assert "no participant findings exist yet" in combined
