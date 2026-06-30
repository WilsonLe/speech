from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE_NOTES = ROOT / "docs/planning/v0.6.3-real-asr-dictation-release-notes.json"
CHECKLIST = ROOT / "docs/planning/v0.6.3-release-publication-checklist.json"
V062_NOTES = ROOT / "docs/planning/v0.6.2-cdn-csp-hotfix-release-notes.json"
CURRENT_STATE = ROOT / "docs/planning/CURRENT_STATE.json"
PACKAGE_FILES = [
    ROOT / "package.json",
    ROOT / "apps/web/package.json",
    *sorted((ROOT / "packages").glob("*/package.json")),
]
PERSONAL_MODELS_PANEL = ROOT / "apps/web/src/app/PersonalModelsPanel.tsx"
PRODUCTION_DICTATION_SPEC = ROOT / "apps/web/e2e/production-dictation.spec.ts"
ASR_WORKER = ROOT / "apps/web/src/workers/asr.worker.ts"
TRANSCRIPT_PANEL = ROOT / "apps/web/src/app/TranscriptPanel.tsx"
VERCEL_CONFIG = ROOT / "vercel.json"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_all_package_versions_are_v0_6_3() -> None:
    versions = {
        path.relative_to(ROOT).as_posix(): read_json(path)["version"]
        for path in PACKAGE_FILES
    }

    assert versions
    assert set(versions.values()) == {"0.6.3"}
    assert "0.6.3" in PERSONAL_MODELS_PANEL.read_text(encoding="utf-8")


def test_v0_6_3_release_notes_describe_real_asr_dictation_hotfix() -> None:
    notes = read_json(RELEASE_NOTES)

    assert notes["schemaVersion"] == 1
    assert notes["issue"] == 323
    assert notes["release"] == "v0.6.3"
    assert notes["baseRelease"] == "v0.6.2"
    assert notes["baseReleaseImmutable"] is True
    assert notes["plannedTag"] == "v0.6.3"

    combined = "\n".join(
        [
            notes["summary"],
            *notes["changes"],
            *notes["unchangedFromV062"],
            *notes["knownLimitations"],
            *notes["verificationPlan"],
        ]
    )
    assert "production dictation" in combined
    assert "fake microphone" in combined or "fake-microphone" in combined
    assert "START_UTTERANCE" in combined
    assert "AUDIO_CHUNK" in combined
    assert "END_UTTERANCE" in combined
    assert "RNN-T" in combined
    assert "Issue #255 remains open" in combined
    assert "old service-worker app shell" in combined
    assert (
        "v0.6.0, v0.6.1, and v0.6.2 release artifacts and tags are "
        "intentionally left immutable"
        in combined
    )
    assert "No model-pack, profile, adapter" in combined
    assert "privacy schema contract changes" in combined

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


def test_v0_6_3_publication_checklist_keeps_release_gates_explicit() -> None:
    checklist = read_json(CHECKLIST)

    assert checklist["issue"] == 323
    assert checklist["release"] == "v0.6.3"
    assert checklist["baseRelease"] == "v0.6.2"
    assert checklist["baseReleaseImmutable"] is True
    assert any("All package versions are 0.6.3" in check for check in checklist["preTagChecks"])
    assert any("speech-web-v0.6.3-dist.tar.gz" in step for step in checklist["publicationSteps"])
    assert any("production dictation smoke" in step for step in checklist["publicationSteps"])
    assert any("Do not close issue #255" in step for step in checklist["publicationSteps"])
    assert checklist["postPublicationEvidenceToRecord"]["aboutVersionVerified"] is False
    assert checklist["postPublicationEvidenceToRecord"]["productionDictationSmokeVerified"] is False


def test_current_state_points_to_v0_6_3_without_closing_255() -> None:
    current = read_json(CURRENT_STATE)

    assert current["packageVersion"] == "0.6.3"
    assert current["currentRelease"] == "v0.6.3-real-asr-dictation-hotfix"
    assert "v0.6.3-real-asr-dictation-hotfix" in current["lineage"]
    assert current["verifiedGates"]["releaseNotes"] == str(
        RELEASE_NOTES.relative_to(ROOT).as_posix()
    )
    assert current["verifiedGates"]["releasePublicationChecklist"] == str(
        CHECKLIST.relative_to(ROOT).as_posix()
    )
    assert current["verifiedGates"]["productionDictationSmoke"] == str(
        PRODUCTION_DICTATION_SPEC.relative_to(ROOT).as_posix()
    )

    gates = "\n".join(current["openReleaseGates"])
    assert "Issue #255 remains open" in gates
    assert "#323" in gates

    boundaries = "\n".join(current["intentionalBoundaries"])
    assert "real-ASR production dictation patch release" in boundaries
    assert "v0.6.0, v0.6.1, and v0.6.2 release tags/assets remain immutable" in boundaries
    assert "redacted" in boundaries


def test_v0_6_2_release_artifacts_remain_immutable() -> None:
    notes = read_json(V062_NOTES)

    assert notes["release"] == "v0.6.2"
    assert notes["plannedTag"] == "v0.6.2"
    assert "v0.6.3" not in json.dumps(notes)


def test_real_asr_and_production_smoke_are_present_and_opt_in() -> None:
    spec = PRODUCTION_DICTATION_SPEC.read_text(encoding="utf-8")
    asr_worker = ASR_WORKER.read_text(encoding="utf-8")
    transcript_panel = TRANSCRIPT_PANEL.read_text(encoding="utf-8")

    assert "SPEECH_PRODUCTION_DICTATION_E2E" in spec
    assert "chromium --use-fake-device-for-media-stream" not in spec
    assert "--use-file-for-fake-audio-capture" in spec
    assert "SPEECH_PRODUCTION_DICTATION_PROFILE_DIR" in spec
    assert "SPEECH_PRODUCTION_DICTATION_TEXT" in spec
    assert "production-model-install-state.json" in spec
    assert "production-dictation-failure-state.json" in spec
    assert "START_UTTERANCE" in transcript_panel
    assert "AUDIO_CHUNK" in transcript_panel
    assert "END_UTTERANCE" in transcript_panel
    assert "createOrtInferenceSession" in asr_worker
    assert "GreedyRnntDecoder" in asr_worker
    assert "detokenizePieces" in asr_worker
    assert "createDefaultModelStorageBackend" in asr_worker


def test_vercel_csp_still_allows_exact_model_download_origins_only() -> None:
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
