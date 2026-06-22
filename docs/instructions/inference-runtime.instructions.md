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
- Provider benchmark/fallback work belongs in later model-runtime issues and must preserve a working WASM path even when WebGPU is optimized.
