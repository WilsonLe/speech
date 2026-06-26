# ADR: v0.5.0 reference benchmark evidence gate

## Status

Accepted

## Context

ADR 0002 defines hard v0.5.0 Personal Voice Model performance and privacy limits: peak browser memory <= 1.5 GB, peak additional training storage <= 500 MB, adapter inference overhead <= 15% RTF relative to the P1 speaker-profile path, cached profile swap < 500 ms, export/import of a 10 MB bundle <= 15 seconds excluding passphrase entry, zero network requests during local preparation/training/evaluation/activation/export/import, successful offline app-shell reload, and deterministic checkpoint-resume behavior.

The repository has synthetic worker benchmarks, CI smoke tests, and package-level deterministic resume/import/export tests. Those are necessary regressions tests, but they are not declared reference-hardware release evidence.

No declared reference-hardware benchmark report for the full v0.5.0 Personal Voice Model lifecycle is available in this repository.

## Decision

`@speech/benchmark` owns an aggregate-only `personal-model-release-benchmark` report. A release benchmark check can pass only when the required metric is measured on declared reference hardware. CI-smoke, synthetic, manual, and missing measurements are recorded as insufficient release evidence.

Diagnostics bundles may include a missing-evidence personal-model release benchmark report to make the release blocker explicit, but they must not promote synthetic worker timings as production Personal Voice Model performance evidence.

Acceptable reference evidence may include aggregate training duration, peak browser memory, peak additional storage, adapter RTF overhead, profile-swap latency, export/import duration, checkpoint loss delta, local-phase network request count, offline reload result, declared browser/OS/hardware labels, and pass/fail gate decisions.

Reference benchmark reports must not include raw audio, transcript text, feature tensors, checkpoints, adapter weights, raw profile JSON, private vocabulary terms, prompt IDs, case IDs, profile IDs, storage paths, or network telemetry payloads.

## Consequences

- Issue #166 can land the benchmark gate contract and diagnostics export hook without fabricating reference data.
- v0.5.0 production Personal Voice Model performance claims remain blocked until declared reference-hardware evidence satisfies the gate.
- Release notes must distinguish synthetic/CI smoke diagnostics from reference-hardware benchmark evidence.
- Future work that changes budgets or reference-hardware pass criteria must supersede ADR 0002 and this ADR with evidence-backed reasoning.
