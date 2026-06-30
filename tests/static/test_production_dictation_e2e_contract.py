from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = REPO_ROOT / "apps/web/e2e/production-dictation.spec.ts"
CONFIG_PATH = REPO_ROOT / "apps/web/playwright.production.config.ts"
PACKAGE_PATH = REPO_ROOT / "apps/web/package.json"
TRANSCRIPT_PANEL_PATH = REPO_ROOT / "apps/web/src/app/TranscriptPanel.tsx"
ASR_WORKER_PATH = REPO_ROOT / "apps/web/src/workers/asr.worker.ts"


def test_production_dictation_e2e_is_opt_in_and_targets_vercel() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")
    config = CONFIG_PATH.read_text(encoding="utf-8")
    package_json = PACKAGE_PATH.read_text(encoding="utf-8")

    assert "SPEECH_PRODUCTION_DICTATION_E2E" in spec
    assert "test.skip(" in spec
    assert "https://speech-amber-beta.vercel.app" in spec
    assert "https://speech-amber-beta.vercel.app" in config
    assert "production-dictation-smoke" in package_json


def test_production_dictation_e2e_downloads_real_model_and_uses_fake_mic_audio() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")

    assert "Install model" in spec
    assert "--use-file-for-fake-audio-capture=" in spec
    assert "ffmpeg" in spec
    assert "flite=textfile=" in spec
    assert "SPEECH_PRODUCTION_DICTATION_TEXT" in spec
    assert "production-model-install-state.json" in spec
    assert "production-dictation-result.json" in spec
    assert "redactUrl(" in spec
    assert "page.route(" not in spec
    assert "mockTinyBaseModelInstall" not in spec
    assert "seedInstalledBaseModel" not in spec


def test_production_dictation_e2e_asserts_transcript_and_csp_errors() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")

    assert "normalizeTranscript(transcriptText)" in spec
    assert "normalizeTranscript(sourcePhrase)" in spec
    assert "content security policy" in spec.lower()
    assert "violates.*connect-src" in spec
    assert "pageErrors" in spec


def test_dictate_audio_path_reaches_real_asr_worker() -> None:
    transcript_panel = TRANSCRIPT_PANEL_PATH.read_text(encoding="utf-8")
    asr_worker = ASR_WORKER_PATH.read_text(encoding="utf-8")

    assert "createAsrWorker" in transcript_panel
    assert "type: 'AUDIO_CHUNK'" in transcript_panel
    assert "type: 'END_UTTERANCE'" in transcript_panel
    assert "finishTranscriptUtterance" in transcript_panel
    assert "createOrtInferenceSession" in asr_worker
    assert "GreedyRnntDecoder" in asr_worker
    assert "detokenizePieces" in asr_worker
    assert "not implemented until later ASR issues" not in asr_worker
