from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE_NOTES = ROOT / "docs/planning/v0.6.2-cdn-csp-hotfix-release-notes.json"
CHECKLIST = ROOT / "docs/planning/v0.6.2-release-publication-checklist.json"
V061_NOTES = ROOT / "docs/planning/v0.6.1-csp-hotfix-release-notes.json"
CURRENT_STATE = ROOT / "docs/planning/CURRENT_STATE.json"
PACKAGE_FILES = [
    ROOT / "package.json",
    ROOT / "apps/web/package.json",
    *sorted((ROOT / "packages").glob("*/package.json")),
]
VERCEL_CONFIG = ROOT / "vercel.json"
PERSONAL_MODELS_PANEL = ROOT / "apps/web/src/app/PersonalModelsPanel.tsx"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_all_package_versions_are_v0_6_2() -> None:
    versions = {
        path.relative_to(ROOT).as_posix(): read_json(path)["version"]
        for path in PACKAGE_FILES
    }

    assert versions
    assert set(versions.values()) == {"0.6.2"}
    assert "0.6.2" in PERSONAL_MODELS_PANEL.read_text(encoding="utf-8")


def test_v0_6_2_release_notes_describe_cdn_csp_only_hotfix() -> None:
    notes = read_json(RELEASE_NOTES)

    assert notes["schemaVersion"] == 1
    assert notes["issue"] == 314
    assert notes["release"] == "v0.6.2"
    assert notes["baseRelease"] == "v0.6.1"
    assert notes["baseReleaseImmutable"] is True
    assert notes["plannedTag"] == "v0.6.2"

    combined = "\n".join(
        [
            notes["summary"],
            *notes["changes"],
            *notes["unchangedFromV061"],
            *notes["knownLimitations"],
        ]
    )
    assert "https://huggingface.co" in combined
    assert "https://us.aws.cdn.hf.co" in combined
    assert "connect-src" in combined
    assert "CSP" in combined
    assert (
        "v0.6.0 and v0.6.1 release artifacts and tags are intentionally left immutable"
        in combined
    )
    assert "Issue #255 remains open" in combined
    assert (
        "No UI, model-pack, profile, adapter, portable-bundle, storage, training, or "
        "privacy schema"
        in combined
    )

    privacy = notes["privacy"]
    for key in [
        "containsParticipantData",
        "containsAudio",
        "containsTranscripts",
        "containsVocabularyTerms",
        "containsProfileArtifacts",
        "containsModelWeights",
        "addsTelemetryOrAnalytics",
        "allowsBroadThirdPartyNetwork",
    ]:
        assert privacy[key] is False


def test_v0_6_2_publication_checklist_keeps_release_gates_explicit() -> None:
    checklist = read_json(CHECKLIST)

    assert checklist["issue"] == 314
    assert checklist["release"] == "v0.6.2"
    assert checklist["baseRelease"] == "v0.6.1"
    assert checklist["baseReleaseImmutable"] is True
    assert any("All package versions are 0.6.2" in check for check in checklist["preTagChecks"])
    assert any("speech-web-v0.6.2-dist.tar.gz" in step for step in checklist["publicationSteps"])
    assert any("Do not close issue #255" in step for step in checklist["publicationSteps"])
    assert checklist["postPublicationEvidenceToRecord"]["modelDownloadCspVerified"] is False


def test_current_state_points_to_v0_6_2_without_closing_255() -> None:
    current = read_json(CURRENT_STATE)

    assert current["packageVersion"] == "0.6.2"
    assert current["currentRelease"] == "v0.6.2-cdn-csp-hotfix"
    assert "v0.6.2-cdn-csp-hotfix" in current["lineage"]
    assert (
        current["verifiedGates"]["releaseNotes"]
        == "docs/planning/v0.6.2-cdn-csp-hotfix-release-notes.json"
    )
    assert (
        current["verifiedGates"]["releasePublicationChecklist"]
        == "docs/planning/v0.6.2-release-publication-checklist.json"
    )

    gates = "\n".join(current["openReleaseGates"])
    assert "Issue #255 remains open" in gates
    assert "#314" in gates

    boundaries = "\n".join(current["intentionalBoundaries"])
    assert "CSP-only patch release" in boundaries
    assert "does not change UI" in boundaries
    assert "v0.6.0 and v0.6.1 release tags/assets remain immutable" in boundaries


def test_v0_6_1_release_artifacts_remain_immutable() -> None:
    notes = read_json(V061_NOTES)

    assert notes["release"] == "v0.6.1"
    assert notes["plannedTag"] == "v0.6.1"
    assert "v0.6.2" not in json.dumps(notes)


def test_vercel_csp_remains_exact_for_cdn_redirect_hotfix() -> None:
    vercel = read_json(VERCEL_CONFIG)
    headers = next(rule for rule in vercel["headers"] if rule["source"] == "/(.*)")["headers"]
    csp = next(header["value"] for header in headers if header["key"] == "Content-Security-Policy")

    connect_src = next(
        directive.strip().split()[1:]
        for directive in csp.split(";")
        if directive.strip().startswith("connect-src ")
    )

    assert connect_src == [
        "'self'",
        "https://huggingface.co",
        "https://us.aws.cdn.hf.co",
    ]
    assert "https:" not in connect_src
    assert "https://*.huggingface.co" not in connect_src
    assert "https://*.hf.co" not in connect_src
    assert "*" not in connect_src
