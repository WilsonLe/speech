# ADR: v0.5.0 release notes and planning snapshot

## Status

Accepted

## Context

Issue #168 is the final dependency-ordered item in the `v0.5.0-browser-personal-models` milestone. Issues #127 through #167 implemented and reviewed the Personal Voice Model contract, browser-local training infrastructure, portable `.speechmodel` package, multi-profile lifecycle, hardening suites, evidence gates, and privacy/security/licensing review.

The repository package versions now align to the `v0.5.0` release tag. This snapshot records the intended release notes and remaining evidence limits so the Git tag, GitHub release, and deployment verification can be created from a clean, CI-passing `main` commit without inventing quality or performance evidence.

## Release identity

- Release tag: `v0.5.0`
- Package version: `0.5.0` across the root workspace, web app, and private workspace packages
- Release theme: local-first browser Personal Voice Model infrastructure, private `.speechmodel` portability, and release-gate hardening

## Implemented release notes

The v0.5.0 codebase includes:

- Personal Voice Model semantics and schema contracts: `SpeechModelManifestV3`, `BrowserTrainingContractV1`, `SpeechProfileManifestV2`, `BrowserTrainingJobV1`, `TrainingFeatureShardV1`, and `PortableSpeechModelManifestV1`.
- Browser-training infrastructure behind `@speech/browser-training`: fixed adapter-math backend, residual bottleneck/LHUC adapter reference math, balanced sampling, AdamW, validation/early stopping, deterministic checkpoints/resume, cross-tab Web Locks coordination, ASR-priority pause, and accessible progress/recovery UI.
- Local preparation and evaluation: training-readiness reports, frozen enrollment/vocabulary revisions, deterministic prompt-identity splits, FP16 feature shards, CTC frame labels, selected-vocabulary metadata, personal/anchor evaluation, activation decisions, rollback, and aggregate release gates.
- Personal Models UI: profile cards, capability preflight, readiness tasks, activation comparison/override/rollback, multi-profile dedupe/import-as-new/replace/rename/delete, and worker-owned lifecycle operations.
- Portable `.speechmodel` lifecycle: deterministic inner bundles, default Web Crypto encrypted envelopes, hostile importer validation, exact base-model compatibility, worker-owned smoke vectors, atomic staging, CLI residual-adapter compatibility, and V1-to-V2 speech-profile migration/recovery.
- Hardening and release evidence plumbing: cross-browser/fault-injection smoke coverage, parser/import-security corpus, synthetic fixture licensing, privacy/security/licensing review, bilingual cohort gate contract, and reference-hardware benchmark gate contract.

## Release limitations and claim boundaries

v0.5.0 documentation and release notes must keep these limitations explicit:

- ADR 0004: no user-approved 30-speaker bilingual quality cohort evidence is available in this repository. Do not claim production Personal Voice Model accuracy or quality gates pass.
- ADR 0005: no declared reference-hardware Personal Voice Model benchmark evidence is available in this repository. Do not claim production memory, storage, latency, RTF, export/import, offline, or zero-network performance gates pass.
- ADR 0006: no new privacy/security/licensing blocker was found for release documentation and tag planning, but the release must preserve local-first privacy boundaries and must not upload or publish raw audio, transcript text, feature tensors, checkpoints, adapter weights, profile JSON, private vocabulary, prompt/case/profile IDs, storage paths, or network payloads.
- Synthetic fixtures, CI smoke tests, local diagnostics, and contract tests are regression evidence only; they are not substitutes for cohort or reference-hardware release evidence.
- Production model weights remain out of Git. The current external VietASR catalog entry remains metadata-only and not advertised as a low-latency bilingual streaming model.

## Tag and publication checklist

After the #168 PR lands on `main` and required checks pass:

1. Confirm `main` is clean and all required CI checks for the merge commit passed.
2. Create annotated tag `v0.5.0` on that merge commit.
3. Build release assets from the tagged commit only.
4. Publish a GitHub release named `v0.5.0 — Browser personal-model infrastructure` with notes that include the implemented items and limitations above.
5. Attach source and web build archives plus `SHA256SUMS.txt`.
6. Verify hosted Vercel production over HTTPS, app load, service-worker/offline reload, and COOP/COEP/CSP/Permissions-Policy headers before claiming hosted deployment verification.
7. Close the `v0.5.0-browser-personal-models` milestone only after the tag/release/deployment verification steps are complete.

## Follow-on planning snapshot

No feasibility evidence changed the accepted implementation path during issue #168. Follow-on work should focus on:

- collecting user-approved aggregate 30-speaker bilingual cohort evidence;
- running declared reference-hardware Personal Voice Model benchmarks;
- validating any production bilingual/code-switching model pack and model card before activation claims;
- re-evaluating ORT Training only if a real supported browser training artifact/API is proven;
- preserving the local-first privacy, import-safety, and licensing boundaries recorded in ADR 0002 through ADR 0006.
