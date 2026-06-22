---
description: 'Architecture boundaries and core contracts for the local-first bilingual ASR PWA.'
applyTo: 'apps/**,packages/**,model-packs/**,tools/**,training/**'
---

# Architecture boundaries

- Main thread owns UI only. Do not run model inference, FFT-heavy work, large hashing, or long synchronous loops on it.
- `AudioWorkletProcessor` owns capture and enqueue only. It must not fetch, decode tokens, allocate large buffers repeatedly, or invoke ONNX Runtime.
- Dedicated ASR worker owns model sessions, decoder state, feature state, vocabulary automata, active profile state, and timing instrumentation.
- Enrollment/profile workers own recording analysis, sentence coverage, alignment, embedding aggregation, profile packaging, and future adapter preparation.
- Service worker owns app-shell caching only; model/profile lifecycle belongs to dedicated stores and workers.
- Model-pack, worker-protocol, vocabulary, enrollment, and profile contracts must be UI-independent and versioned.
- Keep WebGPU, shared memory, graph capture, and FP16/INT8 as optimizations; correctness must preserve the WASM and transferable-buffer paths.
