# ADR: ONNX Runtime Web training feasibility and backend decision

## Status

Accepted

## Context

ADR 0002 made issue #128 the blocking feasibility gate for the v0.5.0 browser-training backend. The supplied v0.5.0 plan prefers ONNX Runtime Web's training-enabled multithreaded WASM runtime, but also requires the project to fall back to a fixed local adapter-math backend if the pinned runtime cannot complete the tiny forward/backward/optimizer/checkpoint/export proof.

The current repository pins `onnxruntime-web@1.27.0`. The ONNX Runtime Web deployment documentation lists a training-enabled WASM binary named `ort-training-wasm-simd-threaded.wasm` and states that it is separate from the JSEP/WebGPU artifact. ONNX Runtime on-device training documentation also says training, checkpoint, optimizer, and optional eval artifacts are generated offline before edge-device training.

The installed `onnxruntime-web@1.27.0` npm package was inspected directly in this repository. Its public package export map exposes root, `all`, `wasm`, `webgl`, `webgpu`, `jspi`, and inference WASM/MJS subpaths. Its installed `dist/` directory does not include `ort-training-wasm-simd-threaded.wasm`, a training JavaScript entry point, or public `TrainingSession`/`CheckpointState`/optimizer symbols. Internal protobuf names such as `TrainingInfoProto` are model schema metadata, not a browser JavaScript training API.

Therefore the required tiny ORT Training worker proof cannot run against the pinned npm package without vendoring or custom-building additional ONNX Runtime Web training artifacts and a supported JavaScript API.

## Decision

For the current v0.5.0 implementation path, production browser training must proceed through the repository-owned `BrowserTrainingBackend` abstraction with a fixed adapter-math backend for `browser-top-adapter-frame-ce-v1` unless a later reviewed ONNX Runtime Web package or custom build supplies all of the following:

- same-origin `ort-training-wasm-simd-threaded.wasm` or equivalent training artifact;
- matching JavaScript module entry point and public TypeScript surface;
- training, eval, optimizer, nominal checkpoint, and runtime-adapter artifact compatibility;
- dedicated-worker forward, backward, optimizer-step, gradient-reset, checkpoint save/load, deterministic resume, and weight-export proof;
- deployment compatibility with the existing CSP, COOP/COEP, WebAssembly threads, and no-network local-training rules; and
- browser/Python numerical parity within the declared tolerance.

Issue #144 must keep `BrowserTrainingBackend` implementation-agnostic. Issue #145 must implement the fixed adapter-math backend or first introduce and prove a real ORT Training artifact/API before it can be used. Issue #134 must not promise npm-provided ORT Training artifacts until that proof passes.

The existing TypeScript worker prototype remains useful only as a synthetic capability and lifecycle harness. It is not the production adapter-training backend until the fixed adapter math, parity tests, checkpoint format, activation gates, and security reviews land.

## Consequences

- Ordinary inference remains decoupled from training assets and continues to use the existing ONNX Runtime Web inference package.
- WebGPU remains an inference/feature-preparation path for v0.5.0, not the training execution provider.
- Follow-on package and worker code must not import a nonexistent `onnxruntime-web/training` subpath or claim ORT Training support because deployment docs mention a training WASM artifact.
- Any future switch to ONNX Runtime Web Training requires a superseding ADR or an amendment that includes the worker proof, artifact provenance, exact package/custom-build version, and validation evidence.
