---
description: 'Microphone permission, capture controller, and browser audio constraint rules.'
applyTo: 'packages/audio/**,apps/web/src/app/MicrophonePanel.tsx,apps/web/src/worklets/**'
---

# Audio capture

- Request microphone access only from explicit user gestures.
- Request mono audio, but always inspect and display the actual `MediaStreamTrack.getSettings()` values because browsers may ignore constraints.
- Expose browser echo cancellation, noise suppression, and automatic gain control as user-visible settings.
- Stop every media track, disconnect audio nodes, and close the `AudioContext` on stop/dispose; repeated stop calls must be safe.
- Keep capture setup separate from `AudioWorklet` processing and model inference. The worklet must only capture, downmix, meter, and enqueue or emit PCM transport messages.
- Worklet output connected to the audio graph must be silent; never play microphone audio back through the speakers.
- Shared-memory capture uses a single-producer/single-consumer PCM ring with monotonic `Int32` read/write sequence counters and an explicit overrun counter.
- On ring-buffer overrun, drop the oldest unread samples to preserve the newest low-latency audio and increment the overrun counter; never silently corrupt ordering.
- Do not enable the shared ring in UI smoke paths until an ASR worker consumer is attached; otherwise an idle consumer will intentionally fill and overrun the ring.
- Transferable-buffer fallback chunks must come from a bounded reusable pool; the receiving side must return transferred buffers to the worklet after copying/counting them.
- Resampling from device rate to model rate belongs after capture transport, not in the `AudioWorklet`; preserve phase/history across chunks and flush short utterances explicitly.
- Do not persist dictation audio from the microphone check or worklet smoke path.
- v0.6 microphone UI should map permission, no-device, constraint, and worklet failures to concise user-recovery copy by default; keep raw `DOMException` names, worklet internals, and diagnostic detail behind explicit details/diagnostics surfaces.
