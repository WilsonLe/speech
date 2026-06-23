# ADR: Defer browser-only adapter training as a shipping path

## Status

Accepted

## Context

The implementation plan included a non-blocking `v0.5.0` experiment to decide whether browser-only adaptation should ship, be deferred, or be removed. The experiment had to preserve local-first privacy, avoid blocking transcription, keep the local Python/Docker trainer independent, and prove that browser-trained artifacts can satisfy the same compatibility, checksum, and regression gates as CLI-trained adapters.

Evidence from the completed browser-training experiment:

- Issue #65 found that pinned `onnxruntime-web@1.27.0` exposes browser inference bundles and no public `TrainingSession` or training subpath. Internal protobuf or operator mentions are metadata/implementation details, not a supported browser training API.
- Issue #66 proved a dedicated browser training worker can run a tiny deterministic frozen-feature adapter prototype without sharing the UI thread, `AudioWorklet`, or real-time ASR worker. The prototype is synthetic/experimental and does not establish production training quality.
- Issue #67 added pause, cancel, checkpoint, and reload-recovery behavior for the browser prototype. Checkpoints are resumable training state, not activated profile artifacts, and cancellation leaves the previous active profile intact.
- Issue #68 added an aggregate-only browser-vs-Python comparison contract. It treats missing browser held-out quality as insufficient evidence rather than parity and compares only aggregate quality/performance metrics, activation-gate status, adapter size/checksum, and base-model compatibility.

The supported `v0.4.0` personalization path is the local Python/Docker trainer plus explicit adapter package import, checksum verification, base-model compatibility checks, activation gate, and reversible activation. That path is reproducible, testable without browser training APIs, and keeps private recordings/profile data under explicit user export/import boundaries.

## Decision

Defer browser-only adapter training as a shipping user path.

The project will retain the browser frozen-feature tiny-adapter prototype as an experimental diagnostics/developer surface only. It must not be described as production training, must not automatically activate artifacts, and must not replace the local Python/Docker trainer. The local trainer remains the supported adapter-training path until a future ADR supersedes this decision.

Any future proposal to ship browser training must first satisfy all of these gates:

1. A public browser training API/artifact is proven for the pinned ONNX Runtime Web version or an explicitly reviewed replacement runtime.
2. Training runs in a dedicated training worker, never on the UI thread, `AudioWorklet`, service worker, or real-time ASR worker.
3. Private frozen features, checkpoints, profile data, adapter weights, and evaluation details remain local/profile-owned and are never logged, screenshotted, uploaded, or exported except by explicit user action.
4. Browser-trained adapter packages pass the same `SpeechProfileManifestV1` compatibility, checksum, graph-contract, activation-gate, adapter-size, and RTF-overhead checks as Python-trained adapters.
5. Browser-vs-Python comparison reports provide held-out quality evidence, not only synthetic loss reduction, and show no material quality, stability, bundle-size, training-time, or runtime-overhead regression.
6. Pause, cancel, checkpoint, reload recovery, and previous-profile fallback are covered by focused tests and browser validation.

## Consequences

- Product copy and documentation must state that browser-only training is deferred and experimental; short enrollment/adaptation must not be described as training a new ASR base model from scratch.
- The runtime diagnostics panel may keep the synthetic browser-training prototype for worker/checkpoint validation, but it is not a supported profile activation route.
- The roadmap remains local-first: vocabulary steering, no-gradient speaker profiles, and Python/Docker residual-adapter packages are the supported personalization paths.
- Future work that touches browser training must update or supersede this ADR instead of silently changing the decision.
- Validation for this decision is documentation/static only unless implementation changes are introduced; the standard repository gate still keeps `main` green.
