---
description: 'Microphone permission, capture controller, and browser audio constraint rules.'
applyTo: 'packages/audio/**,apps/web/src/app/MicrophonePanel.tsx,apps/web/src/worklets/**'
---

# Audio capture

- Request microphone access only from explicit user gestures.
- Request mono audio, but always inspect and display the actual `MediaStreamTrack.getSettings()` values because browsers may ignore constraints.
- Expose browser echo cancellation, noise suppression, and automatic gain control as user-visible settings.
- Stop every media track, disconnect audio nodes, and close the `AudioContext` on stop/dispose; repeated stop calls must be safe.
- Keep capture setup separate from `AudioWorklet` processing and model inference. The worklet must only capture/enqueue audio in later issues.
- Do not persist dictation audio from the microphone check.
