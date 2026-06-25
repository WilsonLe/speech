---
description: 'ONNX Runtime Web loading, worker ownership, and provider/session rules.'
applyTo: 'packages/inference/**,apps/web/src/workers/**,apps/web/src/app/ModelRuntimePanel.tsx'
---

# Inference runtime

- Load `onnxruntime-web` only inside dedicated workers or UI-independent inference helpers that are called by workers; do not import ORT from the main UI render path.
- Use conditional ORT imports: `onnxruntime-web/wasm` for the WASM path and `onnxruntime-web/webgpu` only when WebGPU is explicitly requested or later selected by benchmark/fallback logic.
- Default to single-threaded WASM when cross-origin isolation or `SharedArrayBuffer` is unavailable; multithreaded WASM must be capability-gated.
- Keep ORT WebAssembly artifacts same-origin through the bundler/deployment pipeline; do not depend on remote CDN WASM paths for local-first transcription.
- Vite workers that include ORT dynamic imports must use ES worker output so worker code-splitting remains valid.
- ORT WASM runtime assets can exceed Workbox's default precache limit; consciously include same-origin runtime assets in the offline shell or document an alternative runtime caching strategy.
- Session creation must use manifest graph contracts for tensor names and provider options; never rely on undocumented tensor ordering.
- Personal residual-adapter runtime loading belongs in worker-owned inference helpers: verify profile/base-model identity, adapter bytes checksum/size, graph contract/insertion-point bindings, activation-gate pass state, and adapter parameter/size/precision limits before creating an ORT session.
- As of pinned `onnxruntime-web@1.27.0`, ONNX Runtime Web deployment docs list `ort-training-wasm-simd-threaded.wasm`, but the installed npm package does not expose that artifact, a public `TrainingSession`, or a training subpath. Follow `docs/adr/0003-onnx-runtime-web-training-feasibility.md`: do not add fake ORT training execution; implement production browser training behind the `@speech/browser-training` `BrowserTrainingBackend` interface with the fixed adapter-math backend unless a future reviewed ORT Training artifact/API passes the worker proof. Ordinary transcription must not load training assets.
- Streaming encoder cache adapters must feed and update recurrent state only through manifest `stateRelationships`; reset utterance-scoped caches at utterance boundaries.
- Provider benchmark/fallback must preserve a working WASM path, benchmark only explicit candidate providers, cache choices by model/browser/device key, and surface fallback warnings in diagnostics.
- ASR workers must accept `SET_LANGUAGE_MODE` as a state update and emit local `LANGUAGE_MODE_READY` diagnostics; unsupported-mode fallback must be visible and must not fetch network resources.
