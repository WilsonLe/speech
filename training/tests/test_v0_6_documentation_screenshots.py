from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCREENSHOTS = ROOT / "docs/planning/v0.6.0-documentation-screenshots.json"
CURRENT_STATE = ROOT / "docs/planning/CURRENT_STATE.json"
V0_5_ARCHIVE = ROOT / "docs/planning/snapshots/v0.5.0-current-state-archive.json"
V0_6_CANDIDATE = ROOT / "docs/planning/snapshots/v0.6.0-documentation-candidate-snapshot.json"
README = ROOT / "README.md"
CONTRIBUTING = ROOT / "CONTRIBUTING.md"
ADR_CONTENT = ROOT / "docs/adr/0012-v0-6-0-terminology-and-copy-budgets.md"
ADR_COMPONENTS = ROOT / "docs/adr/0014-v0-6-0-component-gallery-and-usage-docs.md"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_documentation_screenshot_manifest_is_metadata_only_and_complete() -> None:
    manifest = read_json(SCREENSHOTS)

    assert manifest["schemaVersion"] == 1
    assert manifest["issue"] == 256
    assert manifest["releaseCandidate"] == "v0.6.0"
    assert manifest["screenshotPolicy"]["committedScreenshots"] is False
    assert manifest["screenshotPolicy"]["committedArtifact"] == "metadata-only manifest"
    assert str(manifest["screenshotPolicy"]["localRoot"]).startswith("/tmp/")

    privacy = manifest["privacy"]
    for key in [
        "includesParticipantData",
        "includesAudio",
        "includesTranscripts",
        "includesVocabularyTerms",
        "includesProfileArtifacts",
        "includesModelWeights",
        "includesScreenshotsInRepository",
    ]:
        assert privacy[key] is False

    routes = {entry["route"] for entry in manifest["entries"]}
    assert routes == {
        "/",
        "/vocabulary",
        "/models",
        "/settings",
        "/settings/storage",
        "/settings/privacy",
        "/settings/diagnostics",
        "/about",
    }
    assert {entry["viewport"] for entry in manifest["entries"]} == {"desktop", "mobile"}
    assert len(manifest["entries"]) == 16

    for entry in manifest["entries"]:
        assert entry["element"] == "main"
        assert str(entry["localPath"]).startswith("/tmp/speech-v0.6-docs-256/screenshots/")
        assert entry["fileName"].endswith(".png")
        assert entry["bytes"] > 2_000
        assert re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])


def test_guide_map_covers_required_release_docs() -> None:
    manifest = read_json(SCREENSHOTS)
    guide_map = manifest["guideMap"]

    assert set(guide_map) == {
        "userGuide",
        "privacyGuide",
        "modelTrainingGuide",
        "contributorUiGuide",
        "componentUseGuide",
        "contentStyleGuide",
    }
    for required_path in [
        "README.md#user-guide",
        "README.md#privacy-and-local-data",
        "CONTRIBUTING.md#v06-ui-contribution-guide",
        "docs/instructions/privacy-data.instructions.md",
        "docs/instructions/personalization.instructions.md",
        "docs/instructions/profile-trainer-docker.instructions.md",
        "docs/adr/0014-v0-6-0-component-gallery-and-usage-docs.md",
        "docs/adr/0012-v0-6-0-terminology-and-copy-budgets.md",
        "docs/planning/v0.6.0-terminology-copy-budgets.json",
        "docs/planning/v0.6.0-copy-deletion-pass.json",
    ]:
        assert any(required_path in entries for entries in guide_map.values())


def test_current_state_and_snapshots_preserve_release_gate_boundaries() -> None:
    current = read_json(CURRENT_STATE)
    archive = read_json(V0_5_ARCHIVE)
    candidate = read_json(V0_6_CANDIDATE)

    assert current["currentRelease"] == "v0.6.2-cdn-csp-hotfix"
    assert current["packageVersion"] == "0.6.2"
    assert current["informationArchitecture"]["persistentPrimaryDestinations"] == [
        "Dictate",
        "Vocabulary",
        "Models",
    ]
    assert "issue #255" in "\n".join(current["openReleaseGates"]).lower()
    assert "Production accuracy/performance claims" in "\n".join(current["openReleaseGates"])
    assert current["privacy"]["containsAudio"] is False
    assert current["privacy"]["containsProfileArtifacts"] is False

    assert archive["release"] == "v0.5.0"
    assert "ADR 0004" in "\n".join(archive["evidenceBoundaries"])
    assert "ADR 0005" in "\n".join(archive["evidenceBoundaries"])
    assert archive["privacy"]["containsTranscripts"] is False

    assert candidate["release"] == "v0.6.0-minimal-ui-ux"
    assert candidate["currentStatePath"] == "docs/planning/CURRENT_STATE.json"
    assert candidate["screenshotsPath"] == "docs/planning/v0.6.0-documentation-screenshots.json"
    assert "superseded" in "\n".join(candidate["notReleaseCompleteBecause"]).lower()
    assert "Issue #255" in "\n".join(candidate["notReleaseCompleteBecause"])
    assert "issue #258" in "\n".join(candidate["notReleaseCompleteBecause"])


def test_public_docs_match_v0_6_ui_without_overclaiming_release_evidence() -> None:
    readme = read_text(README)
    contributing = read_text(CONTRIBUTING)
    content_adr = read_text(ADR_CONTENT)
    components_adr = read_text(ADR_COMPONENTS)

    for phrase in [
        "v0.6.2 CDN/Xet CSP hotfix",
        "**Dictate**, **Vocabulary**, and **Models**",
        "Encrypted `.speechmodel` export is the default",
        "Screenshot PNGs are captured locally under `/tmp` and are not committed",
        "v0.6 documentation must keep the release-usability gate open until issue #255",
        "v0.5.0 browser Personal Voice Model infrastructure",
        "do not claim production Personal Voice Model accuracy",
        "do not claim production memory, storage, latency",
    ]:
        assert phrase in readme

    for phrase in [
        "v0.6 UI contribution guide",
        "Do not claim production accuracy, performance, or usability gates pass",
        "Do not commit binary screenshots",
        "docs/planning/",
    ]:
        assert phrase in contributing

    assert "release content style guide" in content_adr
    assert "task-first Dictate workspace" in components_adr

    combined = "\n".join([readme, contributing, content_adr, components_adr])
    forbidden_claims = [
        "all usability gates pass",
        "release usability gates pass",
        "production accuracy gates pass",
        "production performance gates pass",
    ]
    for claim in forbidden_claims:
        assert claim not in combined.lower()


def test_no_binary_screenshots_are_committed_for_documentation_update() -> None:
    committed_pngs = [
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*.png")
        if ".git" not in path.parts and "node_modules" not in path.parts
    ]

    assert committed_pngs == []
