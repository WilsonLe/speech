# ADR: v0.5.0 privacy, security, and licensing review

## Status

Accepted

## Context

The v0.5.0 Personal Voice Model milestone adds browser-local enrollment, profile storage, browser-training preparation, checkpoints, evaluation, activation, portable `.speechmodel` export/import, CLI-adapter compatibility, multi-profile lifecycle controls, and release gates.

These changes handle sensitive voice-biometric-like data and voice-derived adapter artifacts. Before release documentation and tagging, the repository needs a final privacy, security, import-safety, licensing, and data-governance review across the implemented package, worker, UI, tooling, and documentation boundaries.

## Review scope

The review covered:

- microphone capture, enrollment, profile storage, deletion, export, import, activation, rollback, and multi-profile lifecycle controls;
- browser-training readiness, frozen revisions, prompt splits, FP16 feature shards, CTC frame labels, checkpoints, ASR-priority pause, Web Locks/BroadcastChannel coordination, and accessible progress UI;
- personal/anchor evaluation, activation decisions, cohort gates, and reference benchmark gates;
- deterministic `.speechmodel` inner bundles, Web Crypto envelope encryption, hostile importer validation, exact compatibility, smoke vectors, atomic staging, CLI residual-adapter wrapping, and V1-to-V2 speech-profile migration;
- model-pack manifest V3 browser-training companion artifacts, generic anchor packs, model catalog entries, model cards, license notices, test-data fixtures, and third-party notices.

## Decision

No new privacy, security, licensing, or data-governance blocker was found for proceeding to v0.5.0 release documentation and tag planning, subject to the release-note limitations below.

The implemented local-first boundary remains accepted:

- raw enrollment audio, prompt text, feature tensors, checkpoints, adapter weights, profile JSON, private vocabulary, selected-vocabulary IDs, profile IDs, prompt IDs, case IDs, storage paths, and network payloads do not leave browser/profile-owned storage except through explicit user export or explicitly user-supplied local trainer inputs;
- UI surfaces, diagnostics, release gates, and benchmark/evaluation reports expose aggregate counts, timings, checksums, pass/fail decisions, redacted labels, or insufficient-evidence states only;
- runtime-heavy or sensitive operations remain worker/package owned, while UI code depends on stable package interfaces and renders statuses/actions only;
- `.speechmodel` import treats every file as hostile, verifies envelope and inner-bundle integrity before exposing files, enforces exact base-model compatibility, runs worker-owned smoke vectors, stages under temporary profile storage, and writes committed records last;
- browser exports are encrypted by default, and explicit unencrypted CLI `.speechmodel` packaging remains an advanced local-trainer opt-in;
- public model artifacts committed to the repository are metadata-only or synthetic Apache-2.0 fixtures, with production weights and private recordings excluded from Git.

Two evidence limitations remain intentional release blockers for claims, not privacy/security blockers:

- ADR 0004 records that no user-approved bilingual 30-speaker cohort evidence exists in the repository.
- ADR 0005 records that no declared reference-hardware personal-model benchmark evidence exists in the repository.

Therefore v0.5.0 documentation and release notes must not claim production quality or performance gates pass until those evidence gaps are resolved with aggregate, user-approved/reference-hardware evidence.

## Review notes

| Area                   | Review outcome                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Voice-profile privacy  | Accepted. Sensitive data stays local/profile-owned; exports/imports are explicit; summaries are aggregate/redacted.                                                                                          |
| Import security        | Accepted. `.speechmodel` parsing verifies magic, sizes, schema, checksums, paths, raw-data flags, tensor/operator/external-data payloads, compatibility, smoke vectors, timeout cleanup, and atomic staging. |
| Training data handling | Accepted. Frozen features, frame labels, checkpoints, sampler/optimizer state, and training-job revisions remain private worker/profile data and are not default exports.                                    |
| UI exposure            | Accepted. Personal Models cards, readiness/preflight, activation review, training progress, and diagnostics avoid raw identifiers/artifacts and use worker-mediated actions.                                 |
| Runtime isolation      | Accepted. ASR-priority pause, Web Locks/BroadcastChannel coordination, and worker ownership avoid blocking transcription and avoid raw cross-tab messages.                                                   |
| Licensing and notices  | Accepted after confirming model weights are not committed, blocked candidates remain non-installable, external metadata is documented, and synthetic fixtures/notices are covered.                           |
| Evidence claims        | Limited. Cohort and reference benchmark reports remain insufficient-evidence; release copy must preserve that limitation.                                                                                    |

## Consequences

- Issue #168 may prepare v0.5.0 documentation, release notes, tag, and planning snapshot, but must explicitly distinguish implemented local-first functionality from unresolved quality/performance evidence gates.
- Future changes that add production weights, real cohort data, reference-hardware benchmark evidence, server-side sync/training, telemetry, or support-bundle upload paths require a new or superseding ADR plus updated threat-model/licensing instructions.
- The review evidence is maintained through the focused static release-review test, `MODEL_LICENSES.md`, `THIRD_PARTY_NOTICES.md`, `test-data/LICENSES.md`, `SECURITY.md`, and the focused instruction files.
