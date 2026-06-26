---
description: 'Architecture boundaries and core contracts for the local-first bilingual ASR PWA.'
applyTo: 'apps/**,packages/**,model-packs/**,tools/**,training/**'
---

# Architecture boundaries

- Main thread owns UI only. Do not run model inference, FFT-heavy work, large hashing, or long synchronous loops on it.
- `AudioWorkletProcessor` owns capture and enqueue only. It must not fetch, decode tokens, allocate large buffers repeatedly, or invoke ONNX Runtime.
- Dedicated ASR worker owns model sessions, decoder state, feature state, vocabulary automata, active profile state, and timing instrumentation.
- Enrollment/profile workers own recording analysis, sentence coverage, alignment, embedding aggregation, profile packaging, and future adapter preparation.
- Browser training must run behind the repository-owned `@speech/browser-training` `BrowserTrainingBackend` from ADR 0003 in its own dedicated training worker and never share the UI thread, AudioWorklet, or real-time ASR worker. UI surfaces may start/observe the worker, pause/cancel it, and resume from a validated checkpoint, but must receive only aggregate progress/results for private datasets. Cross-tab coordination belongs at the worker/client boundary using Web Locks plus BroadcastChannel so only one tab trains a given redacted profile/dataset scope at a time. ASR runtime activity has priority: training workers must subscribe to redacted ASR-priority events, pause cooperatively at safe boundaries, checkpoint, and release training resources rather than competing with live transcription.
- Service worker owns app-shell caching only; model/profile lifecycle belongs to dedicated stores and workers.
- Model-pack, worker-protocol, vocabulary, enrollment, and profile contracts must be UI-independent and versioned.
- Personal Models UI may render navigation, cards, aggregate capability/readiness preflight, profile/vocabulary/base-model status, and user controls, but profile import/export/delete/activation, model manifest inspection, runtime self-tests, and heavy profile reads remain worker/package-owned.
- Keep WebGPU, shared memory, graph capture, and FP16/INT8 as optimizations; correctness must preserve the WASM and transferable-buffer paths.
