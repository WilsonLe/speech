# ADR: v0.5.0 personal voice model semantics and release gates

## Status

Accepted

## Context

The project previously completed a non-shipping browser-training experiment and accepted ADR 0001 to defer browser-only adapter training as a user-facing path. The new v0.5.0 plan intentionally changes the roadmap: browser-created personal voice models should become the normal personal-model workflow once the required runtime, security, privacy, quality, performance, and portability gates pass.

Current repository metadata still describes the public app as the v0.1.0 runtime foundation. The supplied v0.5.0 plan assumes a fully implemented v0.4.0 personalization baseline and requests a `+0.1.0` release delta. The implementation backlog therefore treats v0.5.0 as the target release identity and leaves package-version changes to the final release issue, where the mismatch between current package metadata and the planning assumption must be reconciled in release notes.

The release must keep the base bilingual ASR model immutable. A few minutes of enrollment cannot train a general ASR base model from scratch, and a user model must never be presented as authentication or identity proof. Browser training also cannot weaken existing local-first privacy, worker ownership, model-pack licensing, or exact compatibility rules.

## Decision

The v0.5.0 product term is **Personal Voice Model**.

A Personal Voice Model is a compact user-specific adapter plus speaker-profile metadata, evaluation evidence, compatibility metadata, and optional selected vocabulary sets. It is bound to an exact shared base model and does not duplicate, replace, or retrain the full Vietnamese/English encoder, predictor, joiner, tokenizer, or formatter.

The target v0.5.0 local lifecycle is:

```text
record -> prepare -> train -> checkpoint -> evaluate -> activate
       -> export -> import -> validate -> transcribe
```

The release contract freezes these names and compatibility surfaces for follow-on issues:

- model manifest schema: `SpeechModelManifestV3`;
- browser-training contract: `BrowserTrainingContractV1`;
- profile manifest schema: `SpeechProfileManifestV2`;
- browser adaptation member: `BrowserTopAdapterAdaptationV1`;
- training job schema: `BrowserTrainingJobV1`;
- feature-shard schema: `TrainingFeatureShardV1`;
- portable bundle schema: `PortableSpeechModelManifestV1`;
- portable file extension: `.speechmodel`;
- portable MIME type: `application/vnd.wilsonle.speech.personal-model`;
- portable magic prefix: `WLSPEECHMODEL\0\x01`;
- adapter algorithm ID: `browser-top-adapter-frame-ce-v1`;
- adapter architecture ID: `residual-bottleneck-lhuc-v1`.

The browser-training backend decision was resolved by ADR 0003 after the issue #128 feasibility gate:

1. Prefer ONNX Runtime Web's training-enabled multithreaded WASM artifact only if a current pinned or deliberately updated version exposes a supported browser training entry point and completes the tiny forward/backward/optimizer/checkpoint/export proof.
2. The pinned `onnxruntime-web@1.27.0` npm package does not satisfy that proof, so production work must implement a fixed local backend for the exact residual-bottleneck/LHUC adapter math behind the same `BrowserTrainingBackend` interface unless a future ORT Training artifact/API is proven.
3. Ordinary transcription must not download, initialize, or depend on training assets.

The required support tier for production browser training is desktop-first Chrome and Edge with all of the following capability gates:

- HTTPS secure context;
- cross-origin isolation;
- dedicated workers;
- WebAssembly SIMD and threads;
- OPFS with adequate quota and storage persistence handling;
- successful training-runtime self-test;
- adequate synthetic training-step throughput and memory headroom.

Firefox and Safari may support import/inference or later training only after the same capability and benchmark suites pass.

Hard release limits and gates are:

- browser adapter serialized size: preferred <= 2 MB, hard <= 10 MB;
- default `.speechmodel` export without raw audio: <= 10 MB;
- training companion compressed download: preferred <= 40 MB;
- peak additional training storage for the recommended session: <= 500 MB;
- peak browser process memory during training on reference systems: <= 1.5 GB;
- adapter inference overhead: <= 15% RTF relative to the P1 speaker-profile path;
- profile swap between utterances when cached: < 500 ms;
- export/import of a 10 MB bundle: <= 15 seconds excluding passphrase entry;
- network requests during local preparation, training, evaluation, activation, export, and import: 0;
- generic-anchor degradation: <= 2 absolute WER points;
- no language or voice-condition slice degradation greater than 3 absolute points;
- no configured false-custom-term-insertion budget violation;
- no activation when compatibility, integrity, tensor-shape, NaN/Inf, runtime-smoke, or hard regression gates fail.

Soft success requires at least one of:

- personal held-out WER/CER improves by at least 5% relative; or
- selected custom-term exact recall improves by at least 10 percentage points without violating false-insertion limits.

Cohort release gates require at least 30 evaluation speakers, median relative personal holdout improvement of at least 8%, at least 70% of speakers improving on the primary personal metric, no more than 10% degrading by more than 1 absolute point, median generic-anchor degradation <= 0.5 absolute WER points, and no systematic regression by Vietnamese regional accent, English, mixed speech, or voice condition. Any revision to these gates requires a follow-up ADR backed by reproducible data.

Portable `.speechmodel` export is encrypted by default, excludes raw enrollment audio, excludes prepared feature shards, excludes optimizer/checkpoint state, excludes the shared base model, and treats adapter weights and speaker embeddings as sensitive voice-derived data. Import treats every file as hostile, validates the binary envelope before allocation, enforces archive/file/path/schema/tensor limits, runs exact compatibility and smoke tests, stages under temporary OPFS paths, and commits atomically only after every check passes.

ADR 0001 is superseded for the v0.5.0 implementation plan. It remains historically accurate for the current shipped baseline until the v0.5.0 feature set is implemented and released. Product copy must not claim production browser training before the v0.5.0 issues, validation, documentation, and release tag are complete.

## Consequences

- The new v0.5.0 milestone and issues #127-#168 are the dependency-ordered roadmap for production browser personal models.
- Follow-on issues must update schema, protocol, worker, storage, import/export, threat-model, and release docs against the names and limits in this ADR.
- Issue #128 is a blocking feasibility gate for the training backend. If ONNX Runtime Web training cannot satisfy the proof, the fallback backend must be implemented before shipping claims continue.
- The existing Python/Docker trainer remains supported as a reference and advanced fallback; it is not removed or deprecated by this release.
- Current README/status copy may continue to say browser training is not yet shipped, but must point to this ADR as the accepted v0.5.0 direction.
- Future work that changes the adapter objective, backend, export encryption, cohort gates, hard performance limits, or compatibility policy must add or supersede an ADR rather than silently changing the release contract.
