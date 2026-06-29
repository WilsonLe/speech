from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE_NOTES = ROOT / "docs/planning/v0.6.1-csp-hotfix-release-notes.json"
CHECKLIST = ROOT / "docs/planning/v0.6.1-release-publication-checklist.json"
V060_NOTES = ROOT / "docs/planning/v0.6.0-release-notes.json"
VERCEL_CONFIG = ROOT / "vercel.json"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_v0_6_1_release_notes_describe_csp_only_hotfix() -> None:
    notes = read_json(RELEASE_NOTES)

    assert notes["schemaVersion"] == 1
    assert notes["issue"] == 310
    assert notes["release"] == "v0.6.1"
    assert notes["baseRelease"] == "v0.6.0"
    assert notes["baseReleaseImmutable"] is True
    assert notes["plannedTag"] == "v0.6.1"

    combined = "\n".join(
        [
            notes["summary"],
            *notes["changes"],
            *notes["unchangedFromV060"],
            *notes["knownLimitations"],
        ]
    )
    assert "https://huggingface.co" in combined
    assert "connect-src" in combined
    assert "CSP" in combined
    assert "v0.6.0 release artifacts and tag are intentionally left immutable" in combined
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


def test_v0_6_1_publication_checklist_keeps_release_gates_explicit() -> None:
    checklist = read_json(CHECKLIST)

    assert checklist["issue"] == 310
    assert checklist["release"] == "v0.6.1"
    assert checklist["baseReleaseImmutable"] is True
    assert any("All package versions are 0.6.1" in check for check in checklist["preTagChecks"])
    assert any("speech-web-v0.6.1-dist.tar.gz" in step for step in checklist["publicationSteps"])
    assert any("Do not close issue #255" in step for step in checklist["publicationSteps"])
    assert checklist["postPublicationEvidenceToRecord"]["modelDownloadCspVerified"] is False


def test_v0_6_0_release_artifacts_remain_immutable() -> None:
    notes = read_json(V060_NOTES)

    assert notes["release"] == "v0.6.0"
    assert notes["plannedTag"] == "v0.6.0"
    assert "v0.6.1" not in json.dumps(notes)


def test_vercel_csp_remains_exact_for_model_download_hotfix() -> None:
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
