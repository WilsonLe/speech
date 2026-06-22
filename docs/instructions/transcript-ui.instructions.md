---
description: 'Transcript workspace, push-to-talk, and transcript action UI rules.'
applyTo: 'apps/web/src/app/TranscriptPanel.tsx,apps/web/src/app/transcript-state.ts,apps/web/e2e/transcript-controls.spec.ts'
---

# Transcript UI

- Treat the transcript screen as UI orchestration only; it may start/stop microphone capture from user gestures but must not run model inference, FFT-heavy work, or decoder loops on the main thread.
- Keep committed transcript text visually distinct from the provisional suffix. Live updates may replace provisional text, but committed text must follow the decoder/stable-prefix policy.
- The page-scoped push-to-talk shortcut is `Space`. Prevent page scroll while it is held, ignore editable form targets, and finalize capture on key/control release.
- Copy, clear, and plain-text download actions must operate only on local in-memory transcript text and must not trigger network requests or hidden persistence.
- Until a real ASR worker stream is connected, label placeholder/provisional text as pending model integration; do not present capture placeholders as recognized speech.
