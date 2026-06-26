# ADR: v0.5.0 bilingual quality cohort gate evidence

## Status

Accepted

## Context

ADR 0002 requires v0.5.0 Personal Voice Model release quality evidence from at least 30 evaluation speakers. The gate requires median relative personal holdout WER improvement of at least 8%, at least 70% of speakers improving on the primary personal metric, no more than 10% degrading by more than 1 absolute WER point, median generic-anchor degradation at most 0.5 absolute WER points, and no systematic regression by Vietnamese regional accent, English, mixed speech, or voice condition.

No user-approved 30-speaker cohort data is available in this repository. Synthetic fixtures are useful for schema and gate-math tests, but they are not quality evidence.

## Decision

The project will keep v0.5.0 production Personal Voice Model quality claims and release readiness blocked until user-approved aggregate 30-speaker cohort evidence is available.

`@speech/personalization` owns the aggregate-only cohort report contract through `createBilingualQualityCohortReport()` and `createMissingBilingualQualityCohortReport()`. Missing data must be recorded as an insufficient-evidence gate instead of fabricating or substituting synthetic data.

Acceptable cohort evidence may include per-speaker aggregate WER rates, public language/accent/voice-condition slice labels, counts, medians/ratios, and gate decisions. It must not include raw audio, transcript text, prompt/case IDs, feature tensors, checkpoints, adapter weights, private vocabulary terms, raw profile IDs, or raw speaker identifiers in committed reports.

## Consequences

- Issue #165 can complete by landing the gate contract and explicit missing-evidence status.
- Later work can satisfy the gate only by adding user-approved aggregate cohort evidence or by superseding ADR 0002/this ADR with a new evidence-backed decision.
- Release notes for v0.5.0 must not claim production-quality Personal Voice Model accuracy until the cohort gate passes.
- Synthetic tests remain contract tests only and must not be cited as quality evidence.
