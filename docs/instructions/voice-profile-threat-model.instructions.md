---
description: 'Voice-profile privacy and threat-model review for guided enrollment, profile storage, export/import, activation, and future adapters.'
applyTo: 'packages/enrollment/**,packages/personalization/**,packages/profile-manager/**,apps/web/src/app/MicrophonePanel.tsx,apps/web/src/workers/profile-store*.ts,tools/profile-trainer/**,training/personalization/**'
---

# Voice-profile threat model

Voice profiles are sensitive voice-biometric-like personal data. Treat accepted enrollment recordings, prompt text, microphone metadata, speaker embeddings, channel statistics, profile packages, adapters, and future trainer outputs as private user data even when no account or cloud sync exists.

## Assets and boundaries

- **In-memory only:** live dictation PCM, provisional transcripts, calibration RMS/peak/clipping metrics, and unsaved enrollment takes.
- **Private profile storage:** accepted WAV files, utterance JSON, profile manifests, checksums, derived speaker embeddings/statistics, adapter files, evaluations, browser-training frozen features/checkpoints when enabled, and active/previous profile pointers under `@speech/profile-manager` paths.
- **User-controlled exports:** `.speechprofile.json` packages and future adapter/trainer packages. Exports can contain raw recordings and prompt text and are no longer protected by origin storage once downloaded.
- **Out of scope by default:** account sync, telemetry, crash uploads, support bundles, server-side training, and automatic model/profile uploads.

## Data-flow rules

- Microphone capture starts only after a user gesture. Enrollment audio remains in memory until the user explicitly accepts/saves a take.
- Analyze enrollment quality and profile storage/package operations in workers; do not move raw audio, hashing of large files, or profile packaging onto the UI thread.
- Store raw enrollment audio only in the private profile store, preferably OPFS. Never store raw audio or profile packages in localStorage, analytics, logs, screenshots, fixtures, or CI artifacts.
- Keep app-shell/service-worker caches, model storage, vocabulary localStorage, and profile storage separate. A service-worker update or model lifecycle action must not delete or upload voice profiles.
- Enable, disable, rollback, import, and delete profiles only between utterances. Reject a profile when the active base model identity or graph-contract hash does not match.
- Imports must validate package schema, safe paths, file sizes, SHA-256 checksums, embedded metadata consistency, and profile ID consistency before writing or activating anything.
- Deletion must remove raw recordings, utterance metadata, derived files, checksum indexes, and active/previous profile pointers for the target profile.
- Personal Models compact rows, row menus, cards, `/models/new` create-model drafts, `/models/:profileId/train` readiness screens, detail accordions, reason-code messages, enrollment prompt screens, and navigation may show only aggregate profile/vocabulary/speech-model/enrollment/training-support status plus explicit lifecycle controls; keep raw profile/model/utterance identifiers, hashes, storage paths, checksums, hidden prompt metadata, vocabulary terms, audio, features, checkpoints, adapter weights, and full profile JSON out of rendered summaries. `/models/new` must remain a UI-only wizard that asks one question per screen and does not create profile-store domain data until the existing enrollment/profile-store path saves an accepted take. Training readiness must keep blockers and the exact next action visible while hiding passed checks/support/privacy detail behind disclosures. Enrollment prompt UI should expose current prompt text only for the active recording task, keep one dominant recording action, use safe Loud guidance, keep replay/retry/accept/skip state-relevant, map quality reasons to stable concise recovery/acceptance copy, and place derived metrics/stored-recording summaries under `Recording details` without rendering raw reason codes by default. Export, deactivate, rollback, duplicate, and delete actions must stay worker-owned and confirmation-backed when they affect sensitive or destructive local voice data. Incompatibilities, required quality checks, recovery, and primary actions stay visible above accordions so sensitive next steps are never hidden only in collapsed technical detail.
- Multi-profile import/dedupe/replace/import-as-new/rename/delete controls must use worker-owned profile-store operations, redact UI-facing import results, resolve name collisions deterministically, and preserve rollback/fallback semantics when deleting the active profile.

## Threats and required mitigations

| Threat                               | Required mitigation                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accidental cloud disclosure          | No telemetry/crash uploads by default; active transcription/enrollment tests must assert no fetch/XHR/websocket requests during capture windows.                                                                                          |
| Persistent raw audio without consent | Save accepted takes only after explicit user action; unsaved takes stay in memory and are cleared on retry/skip/dispose.                                                                                                                  |
| Profile or adapter package tampering | Verify schema, safe paths, size, checksum, top-level vs embedded metadata consistency, adapter-byte metadata match, and base-model identity before import/enable.                                                                         |
| Wrong-model activation               | Store and compare base model ID, version, manifest SHA-256, and graph-contract SHA-256 whenever the active model identity is known.                                                                                                       |
| Stale or partial writes              | Use atomic temporary files and checksum indexes; never overwrite active profile files in place without validation.                                                                                                                        |
| Over-broad deletion claims           | Deletion copy and tests must state exactly which local profile files/pointers are cleared; downloaded exports remain the user's responsibility.                                                                                           |
| Sensitive prompt/vocabulary leakage  | Generated custom-vocabulary prompts and prompt text stay local, require review before recording, and must not become release fixtures.                                                                                                    |
| UI-thread exposure or jank           | Profile analysis, hashing, packaging, and storage remain worker-owned; UI renders status and user controls only.                                                                                                                          |
| Misleading training claims           | Short enrollment creates/adapts a profile for a pretrained model; never describe it as training a new base ASR model from scratch.                                                                                                        |
| Debug/support leakage                | Do not include raw audio, transcript text, profile JSON, embeddings, adapter weights, or exported packages in logs, screenshots, fixtures, support bundles, or benchmark exports.                                                         |
| Docker image layer leakage           | Build local trainer images from code/config/license only, exclude speech/profile/model artifacts through `.dockerignore`, and mount user-approved inputs at runtime instead of copying them into layers.                                  |
| Browser-training data leakage        | Keep private frozen features/checkpoints in the dedicated training worker or private profile storage, expose only aggregate loss/progress/artifact metadata to UI, and require normal import/checksum/regression gates before activation. |
| Browser-vs-Python comparison leakage | Compare only aggregate quality/performance metrics, adapter size/checksum, activation-gate flags, and base-model identity; omit raw prompts, case IDs, frozen-feature values, adapter weights, profile JSON, audio, and transcript text.  |

## Review checklist for voice-profile changes

- Does the change introduce any new raw audio, prompt text, embedding, adapter, profile, or evaluation artifact? Document where it lives and how it is deleted/exported.
- Does any path leave the browser origin or local filesystem? If yes, it must be an explicit user export/import/trainer action with visible sensitivity language.
- Are active capture/enrollment windows protected by no-network browser tests or an equivalent focused check?
- Are package/import paths safe, checksummed, size-checked, and schema-versioned?
- Does the UI expose actionable recovery for permission, storage, quota, checksum, speech-model compatibility, and quality-review failures through stable reason-code copy rather than raw exception text or internal IDs?
- Does documentation distinguish local speaker profiles, vocabulary steering, residual adapters, and full base-model training?
- If a trainer is added, does it split by prompt identity, keep held-out prompts separate, validate exported profile checksums/base-model identity before reading audio, keep base graphs frozen by default, omit raw audio/transcript text/case IDs from metadata and evaluation reports, and refuse automatic activation when regression gates fail?
- If a trainer Docker image is added, does the guide use `--network none`, narrow bind mounts, host UID/GID mapping, and a publication checklist that records the base image digest without committing user data?
- If browser training is prototyped, is it isolated to a dedicated training worker, does it avoid UI/AudioWorklet/ASR-worker ownership, does the UI receive only aggregate progress/results rather than private frozen-feature matrices, and do pause/cancel/reload-recovery checkpoints leave the previous active profile intact?
- If browser-vs-Python adapter comparison is added, does it mark missing browser held-out quality as insufficient evidence and keep all exported comparison data aggregate-only with no prompt text, case IDs, frozen features, adapter weights, or profile JSON?
- If personal/anchor end-to-end evaluation or activation review is added, does it compare generic/P1/candidate configurations with aggregate-only personal-heldout, anchor, language, voice-condition, custom-term, latency, RTF, and size metrics while omitting raw case IDs, prompt/reference text, selected-vocabulary entry IDs, audio, feature tensors, checkpoints, adapter weights, raw profile IDs, and profile JSON? Are hard gates non-overridable, soft gates overridable only by explicit advanced action, and rollback/generic fallback still visible?
- If a portable `.speechmodel` bundle is added, does it validate the `WLSPEECHMODEL` magic and size before allocating or decrypting, enforce file-count/per-file/expanded/compression/path-segment limits, reject absolute/parent/backslash/control-char paths, require AES-256-GCM + PBKDF2-HMAC-SHA-256 (>=600,000 iterations) for encrypted browser exports, authenticate salt/IV/iterations as AAD, never store the passphrase, clear passphrase byte copies after Web Crypto operations, reject wrong passphrases/tampering with generic errors, exclude raw audio/features/optimizer/base model by default, require deterministic inner-bundle manifest refs for notices/checksums/test vectors and byte-level SHA-256/size/media-type matches, preserve CLI residual-adapter profile manifests only as checksummed metadata when wrapping existing CLI adapters, reject imported raw privacy flags plus base-model/operator/external-data payloads, enforce exact active base-model identity including tokenizer SHA-256, run smoke vectors before commit, and stage imports under temporary profile storage before writing the committed record/active pointer last?
- If a speech profile manifest migration is added, does it keep migration metadata-only, retain the original V1 `profile.json` for downgrade compatibility, write V2 to `profile.v2.json` atomically, clean stale temp files, recover from a valid existing V2 target, replace invalid V2 targets only from a valid V1 source, and keep migration summaries free of raw profile IDs, storage paths, adapter paths/bytes, prompt text, feature tensors, checkpoints, and private vocabulary?

## Validation evidence

For changes touching voice-profile flows, include the relevant subset of:

- focused unit tests for quality reports, profile checksums/import/export/delete/rollback, embedding aggregation, evaluation privacy flags, and scheduler output;
- Playwright coverage for explicit save, reload resume, delete-all, enable/rollback, export/import, and no-network capture windows;
- `pnpm lint`, `pnpm format-check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and cached-Chromium `pnpm chromium-smoke` before PR merge.
