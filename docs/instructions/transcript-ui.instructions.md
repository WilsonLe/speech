---
description: 'Transcript workspace, push-to-talk, and transcript action UI rules.'
applyTo: 'apps/web/src/app/TranscriptPanel.tsx,apps/web/src/app/transcript-state.ts,apps/web/e2e/transcript-controls.spec.ts'
---

# Transcript UI

- Treat the transcript screen as UI orchestration only; it may start/stop microphone capture from user gestures but must not run model inference, FFT-heavy work, or decoder loops on the main thread.
- Keep committed transcript text visually distinct from the provisional suffix. Live updates may replace provisional text, but committed text must follow the decoder/stable-prefix policy.
- The page-scoped push-to-talk shortcut is `Space`. Prevent page scroll while it is held, ignore editable form targets, and finalize capture on key/control release.
- Copy, clear, edit, and plain-text download actions must operate only on local in-memory committed transcript text and must not trigger network requests or hidden persistence. Hide Copy/Download/Clear while the committed transcript is empty; keep low-frequency transcript actions in the `Transcript actions` menu and require confirmation before clearing meaningful text.
- Provisional text is visual guidance only; exclude it from copy/download/export until finalization commits it.
- Transcript settings such as language mode, final formatting, spoken commands, and download metadata are local UI state unless a worker-owned runtime contract explicitly consumes them. Default Dictate UI should show only language/model/vocabulary context, editable transcript, one recording control, state-relevant actions, and a single `Dictation details` disclosure for latency/settings/language/privacy diagnostics.
- When no required base speech model is installed, Dictate must render a setup-only state before any recording controls: exact version/download size, Install/Retry, progress phases, and a `Model details` disclosure for license/provenance. Do not request microphone permission or render Hold-to-speak until the lifecycle worker reports a ready installed model.
- Microphone and worklet interruptions in Dictate should use the shared concise microphone-blocker wording with one recovery action; raw browser exception names, worklet implementation details, and diagnostic payloads belong in details/diagnostics, not the default workspace.
- Enrollment prompt UI may share Dictate capture primitives, but it remains a separate one-prompt workflow: progress, prompt text, Whisper/Normal/Loud condition, one record/stop action, state-relevant replay/retry/accept/skip controls, live quality feedback, and `Recording details` for metrics/storage. Do not expose raw utterance IDs, checksums, or worklet diagnostics in the default prompt surface.
- Dictate push-to-talk must send real PCM to the ASR worker (`START_UTTERANCE`, transferred `AUDIO_CHUNK`, `END_UTTERANCE`) and only commit worker `FINAL` text as recognized speech. Never present capture placeholders as recognized speech.
