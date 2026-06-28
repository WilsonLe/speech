---
description: 'Browser capability probing, execution tier selection, and diagnostics UI rules.'
applyTo: 'apps/web/src/capabilities/**,apps/web/src/app/DiagnosticsPanel.tsx,apps/web/src/workers/capability-benchmark.worker.ts'
---

# Capability diagnostics

- Probe browser APIs directly; do not infer support from user-agent strings.
- Keep capability probes testable through injected environment objects.
- Select execution tiers from secure context, microphone APIs, AudioWorklet, Workers, SharedArrayBuffer/cross-origin isolation, WASM SIMD/threads, and WebGPU device creation.
- Personal-model preflight may add Web Locks, BroadcastChannel, and localStorage recovery checks to the capability report, but these are readiness diagnostics only and must not change the core execution-tier contract.
- Warn visibly when cross-origin isolation is missing because the app must use transferable buffers instead of shared memory.
- Keep the worker round-trip benchmark independent from ASR/model workers.
- Capability report downloads must be local JSON generated in the browser; do not send diagnostics to a network service by default.
- The v0.6 `/settings/diagnostics` route owns grouped diagnostics accordions for Browser/capabilities, Audio, Inference, Model/tokenizer, Vocabulary, Enrollment/training, Storage, and Recent errors. Default Dictate/Vocabulary/Models routes should not render dense capability reports; copy/support-bundle actions must remain local and aggregate-only.
- Passive diagnostics must not request microphone permission or persistent-storage permission; reserve those prompts for explicit user actions.
- Capability/preflight UI may show storage quota/usage, worker benchmark latency, provider fallback, and coordination availability, but must keep reports local and free of raw audio, transcripts, feature tensors, checkpoints, adapter weights, profile IDs, prompt IDs, and private vocabulary terms.
