# ADR 0015: v0.6.0 Dictate performance parity evidence

## Status

Accepted

## Context

Issue #232 requires v0.6.0 to verify that the redesigned Dictate workspace does not regress startup, route transition, recording responsiveness, main-thread work, layout stability, and ASR-related timing relative to v0.5.0.

The repository has v0.5.0 task screenshots and task-efficiency observations in `docs/planning/v0.6.0-baseline-task-metrics.json`, but it does not contain declared reference-hardware timing baselines for initial Dictate gzip bytes, first partial latency, stable-word latency, finalization latency, or browser-training throughput. The current CI/browser smoke can measure aggregate UI timings and capture-loop responsiveness with fake microphone input, but fake microphone capture is not real ASR evidence.

## Decision

Add a versioned aggregate-only `dictate-performance-parity` report contract in `@speech/benchmark`.

The contract records:

- initial Dictate JavaScript and CSS resource bytes;
- interaction readiness;
- cached route transition latency;
- main-thread long-task count and maximum duration;
- cumulative layout shift;
- recording UI response latency;
- first partial, stable-word, and finalization latency fields when available; and
- the missing v0.5.0 reference-baseline evidence needed for true release parity claims.

CI/browser smoke evidence is accepted as an automated instrumentation check only. It may pass UI sanity checks, but the overall release parity report remains `insufficient-evidence` when the v0.5.0 reference baseline or real-ASR latency measurements are absent.

Diagnostics bundles may include the Dictate parity report, but the report must remain aggregate-only and must not include audio, transcript text, feature tensors, checkpoints, adapter weights, raw profile data, private vocabulary, storage paths, URLs, or telemetry.

## Consequences

- v0.6.0 can keep an automated Dictate performance smoke in CI without overstating production/reference-hardware evidence.
- The release notes must not claim real ASR latency parity or initial-bundle regression parity until declared reference-hardware baselines exist.
- Future reference runs can reuse the same report schema and mark the gate `passed` only when all required v0.5.0 baselines and v0.6.0 measurements are present.
- Synthetic worker benchmarks and fake-microphone Dictate smoke remain useful diagnostics, not release-performance proof.
