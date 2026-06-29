from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE = "v0.6.0"
VERSION = "0.6.0"

PACKAGE_JSONS = [
    ROOT / "package.json",
    ROOT / "apps/web/package.json",
    *sorted((ROOT / "packages").glob("*/package.json")),
]
CURRENT_STATE = ROOT / "docs/planning/CURRENT_STATE.json"
SUCCESSOR = ROOT / "docs/planning/snapshots/v0.6.0-successor-current-state.json"
RELEASE_NOTES = ROOT / "docs/planning/v0.6.0-release-notes.json"
PUBLICATION_CHECKLIST = ROOT / "docs/planning/v0.6.0-release-publication-checklist.json"
ISSUE_255_CHECKLIST = ROOT / "docs/planning/v0.6.0-issue-255-verification-checklist.json"
SCREENSHOTS = ROOT / "docs/planning/v0.6.0-documentation-screenshots.json"
RELEASE_USABILITY = ROOT / "docs/research/v0.6-release-usability-study.json"
README = ROOT / "README.md"
PERSONAL_MODELS_PANEL = ROOT / "apps/web/src/app/PersonalModelsPanel.tsx"
ABOUT_TEST = ROOT / "apps/web/src/app/about-screen.test.ts"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def assert_privacy_flags_false(document: dict[str, object]) -> None:
    privacy = document["privacy"]
    assert isinstance(privacy, dict)
    for key in [
        "containsParticipantData",
        "containsAudio",
        "containsTranscripts",
        "containsVocabularyTerms",
        "containsProfileArtifacts",
        "containsModelWeights",
    ]:
        assert privacy[key] is False


def test_workspace_versions_are_aligned_for_v0_6_release() -> None:
    versions = {
        path.relative_to(ROOT).as_posix(): read_json(path)["version"]
        for path in PACKAGE_JSONS
    }

    assert versions
    assert set(versions.values()) == {VERSION}
    assert "sourceAppVersion: '0.6.0'" in read_text(PERSONAL_MODELS_PANEL)
    assert "appVersion: '0.6.0'" in read_text(ABOUT_TEST)


def test_successor_current_state_replaces_documentation_candidate() -> None:
    current = read_json(CURRENT_STATE)
    successor = read_json(SUCCESSOR)
    screenshots = read_json(SCREENSHOTS)

    assert current["packageVersion"] == VERSION
    assert current["currentRelease"] == "v0.6.0-minimal-ui-ux"
    assert current["informationArchitecture"]["persistentPrimaryDestinations"] == [
        "Dictate",
        "Vocabulary",
        "Models",
    ]
    verified_gates = set(current["verifiedGates"].values())
    assert "docs/planning/v0.6.0-release-notes.json" in verified_gates
    assert "docs/planning/v0.6.0-release-publication-checklist.json" in verified_gates
    assert "docs/planning/v0.6.0-issue-255-verification-checklist.json" in verified_gates
    assert "Issue #255 remains open" in "\n".join(current["openReleaseGates"])
    assert "ADR 0004" in "\n".join(current["intentionalProductBoundaries"])
    assert_privacy_flags_false(current)

    assert successor["release"] == "v0.6.0-minimal-ui-ux"
    assert successor["currentStatePath"] == "docs/planning/CURRENT_STATE.json"
    assert "docs/planning/CURRENT_STATE.json" in successor["lineage"]
    assert "Issue #255 remains open" in "\n".join(successor["blockedOrAcceptedLimitations"])
    assert "Do not close #255" in "\n".join(successor["instructionsForNextPlanningAgent"])
    assert_privacy_flags_false(successor)

    assert screenshots["appVersionAtCapture"] == VERSION
    assert screenshots["releaseCandidate"] == RELEASE


def test_release_notes_and_publication_checklist_preserve_open_gates() -> None:
    notes = read_json(RELEASE_NOTES)
    checklist = read_json(PUBLICATION_CHECKLIST)

    assert notes["release"] == RELEASE
    assert notes["plannedTag"] == RELEASE
    assert "Task-first application shell" in "\n".join(notes["highlights"])
    assert "Issue #255 remains open" in "\n".join(notes["knownLimitations"])
    assert "ADR 0004" in "\n".join(notes["knownLimitations"])
    assert "ADR 0005" in "\n".join(notes["knownLimitations"])
    assert any(
        "speech-web-v0.6.0-dist.tar.gz" in asset
        for asset in notes["releaseAssetsPlanned"]
    )
    assert_privacy_flags_false(notes)

    assert checklist["approvedWithOpenGates"]["releaseUsabilityIssue"] == 255
    assert checklist["approvedWithOpenGates"]["approvedByUserInSession"] is True
    assert checklist["approvedWithOpenGates"]["mustNotCloseIssue255FromThisChecklist"] is True
    assert "Create annotated tag v0.6.0" in "\n".join(checklist["publicationSteps"])
    assert "Do not close issue #255" in "\n".join(checklist["publicationSteps"])
    assert checklist["postPublicationEvidenceToRecord"]["githubReleaseUrl"] is None
    assert_privacy_flags_false(checklist)


def test_issue_255_verification_checklist_is_actionable_and_privacy_safe() -> None:
    checklist = read_json(ISSUE_255_CHECKLIST)
    release_usability = read_json(RELEASE_USABILITY)

    assert checklist["issue"] == 255
    assert checklist["status"] == "open-until-participant-evidence-or-separate-human-decision"
    assert "first transcript" in checklist["participantEvidenceRequiredToPass"]["tasks"]
    assert "At least 90% unassisted completion" in "\n".join(
        checklist["participantEvidenceRequiredToPass"]["gates"]
    )
    assert "raw audio" in checklist["privacySafeArtifactUpdate"]["forbidden"]
    assert "The #258 release publication approval alone" in "\n".join(
        checklist["notSatisfiedBy"]
    )
    assert_privacy_flags_false(checklist)

    assert release_usability["gateStatus"] == "open"
    assert release_usability["status"] == "blocked-participant-evidence-unavailable"
    assert release_usability["releaseDecision"]["mayCloseIssue255"] is False


def test_public_readme_describes_release_without_overclaiming_evidence() -> None:
    readme = read_text(README)

    assert "package version `0.6.0`" in readme
    assert "docs/planning/snapshots/v0.6.0-successor-current-state.json" in readme
    assert "docs/planning/v0.6.0-issue-255-verification-checklist.json" in readme
    assert "The v0.6.0 release may be published" in readme
    assert "closing #255 still requires aggregate participant evidence" in readme

    forbidden_claims = [
        "all usability gates pass",
        "release usability gates pass",
        "production accuracy gates pass",
        "production performance gates pass",
    ]
    lower = readme.lower()
    for claim in forbidden_claims:
        assert claim not in lower
