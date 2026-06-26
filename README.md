# speech

Local-first Vietnamese/English streaming speech-to-text PWA with private voice personalization.

`speech` is an installable browser app for on-device Vietnamese, English, and Vietnamese-English code-switching dictation. The repository keeps the browser runtime, model-pack contract, transcript workspace, benchmark/reporting contracts, enrollment/profile contracts, and future trainer tooling independent so each can evolve without coupling model or personal-data formats to the UI.

## Current status

The current release line is v0.5.0 browser Personal Voice Model infrastructure:

- responsive transcript workspace with page-scoped push-to-talk controls;
- microphone permission, `AudioWorklet` PCM capture, shared-memory and transferable-buffer audio transport primitives;
- streaming resampler, log-Mel feature extraction, RNN-T decoder primitives, stable-prefix/finalization controllers, and deterministic transcript parity fixtures;
- ONNX Runtime Web loading in a dedicated worker with WebGPU/WASM provider benchmark and fallback reporting;
- model catalog, manifest validation, OPFS/Cache-backed model storage, checksum verification, atomic activation, offline app shell, and diagnostics/benchmark exports;
- guided enrollment, local profile storage, vocabulary steering, browser-training readiness, frozen revisions, feature shards, frame labels, checkpoints, evaluation, activation review, rollback, and multi-profile lifecycle controls;
- worker-owned browser-training infrastructure behind `@speech/browser-training`, with fixed adapter math, deterministic resume, Web Locks coordination, ASR-priority pause, accessible progress UI, and private local recovery;
- deterministic `.speechmodel` bundles, default Web Crypto encrypted export, hostile import validation, exact base-model compatibility, smoke vectors, atomic staging, CLI residual-adapter compatibility, and V1-to-V2 profile migration.

Production ASR weights, private recordings, speech corpora, and personal profiles are intentionally not committed. The current VietASR catalog entry is a metadata-only external candidate; it is not yet advertised as a low-latency streaming model because its inspected ONNX encoder does not expose streaming cache tensors. v0.5.0 ships the local-first personal-model infrastructure and guardrails, but ADR 0004 and ADR 0005 keep production accuracy and reference-hardware performance claims blocked until aggregate evidence is available.

## Quick start

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The PWA is served by Vite during development. `localhost` is a secure-context exception for browser microphone APIs, but production deployment must use HTTPS and the cross-origin isolation/security headers in `vercel.json`.

Open the dev server, grant microphone permission only when you intentionally run the microphone check or push-to-talk flow, and use the diagnostics/benchmark panels to download local JSON reports.

## Validation commands

```bash
pnpm lint
pnpm format-check
pnpm typecheck
pnpm test
pnpm build
pnpm chromium-smoke
```

`pnpm chromium-smoke` uses Playwright Chromium. Install the browser locally with `pnpm --filter @speech/web exec playwright install chromium` if it is not already available. When a compatible Chromium is already cached, use:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome pnpm chromium-smoke
```

Release-validation coverage includes accessibility naming/section checks, keyboard focus through primary actions, rapid push-to-talk stress cycles, no fetch/XHR/websocket requests while push-to-talk is active, offline reload, model lifecycle inspection, and benchmark export schema checks. Shared CI timing is informational; hard latency gates require declared reference hardware.

## Documentation map

Durable project documentation lives under `docs/instructions/*.instructions.md`. Architecture decision records live under `docs/adr/*.md`. Troubleshooting notes are only added after real debugging work and must use `docs/troubleshooting/troubleshoot-*.instructions.md`.

Start with:

- `docs/instructions/repository.instructions.md` — workflow, docs placement, and repository guardrails.
- `docs/instructions/architecture.instructions.md` — thread ownership and worker/UI boundaries.
- `docs/instructions/privacy-data.instructions.md` — local-data, telemetry, licensing, and sensitive-profile rules.
- `docs/instructions/voice-profile-threat-model.instructions.md` — threat model and review checklist for guided enrollment, profile storage, export/import, activation, and future adapters.
- `docs/instructions/deployment-vercel.instructions.md` — Vercel deployment and required security headers.
- `docs/instructions/model-format.instructions.md` — model-pack manifest, graph-contract, checksum, and activation rules.
- `docs/instructions/profile-trainer-docker.instructions.md` — local Docker image and end-to-end workflow for the personal adapter trainer.
- `docs/adr/0001-defer-browser-training-path.md` — historical decision to defer browser-only adapter training for the current shipped baseline.
- `docs/adr/0002-v0-5-0-personal-model-semantics.md` — accepted v0.5.0 Personal Voice Model semantics, schema names, support tier, release gates, and production browser-training conditions.
- `docs/adr/0003-onnx-runtime-web-training-feasibility.md` — accepted #128 feasibility result: the documented ORT Training WASM artifact is not exposed by the pinned npm package, so production work uses `BrowserTrainingBackend` with a fixed adapter-math backend unless a real ORT Training artifact/API is later proven.
- `docs/adr/0004-v0-5-0-quality-cohort-gate.md` — records the missing user-approved 30-speaker bilingual cohort evidence and blocks production quality claims.
- `docs/adr/0005-v0-5-0-reference-benchmark-gate.md` — records the missing declared reference-hardware personal-model benchmark evidence and blocks production performance claims.
- `docs/adr/0006-v0-5-0-privacy-security-licensing-review.md` — final v0.5.0 privacy/security/licensing review and release-note limitations.
- `docs/adr/0007-v0-5-0-release-notes-and-planning-snapshot.md` — v0.5.0 release notes, tag checklist, and follow-on planning snapshot.
- `docs/instructions/model-card-vietasr-iter3-int8.instructions.md` — current external VietASR candidate model card.
- `docs/instructions/benchmark.instructions.md` — diagnostics export and performance methodology.
- `docs/instructions/release-validation.instructions.md` — accessibility, soak/stress, network-privacy, and performance evidence rules.
- `docs/instructions/release-process.instructions.md` — release tag, checksum, GitHub release, and hosted PWA verification rules.
- `docs/instructions/testing.instructions.md` — standard validation commands and CI expectations.

## Browser support and deployment

Tier-1 development targets current Chromium/Edge desktop browsers. Firefox/Safari support depends on API/operator availability and will remain graceful-fallback until validated. Capability diagnostics probe APIs directly and report execution Tier A/B/C/D without user-agent sniffing.

Deployments use Vercel and `vercel.json` headers. Preserve COOP/COEP for `SharedArrayBuffer`, `Permissions-Policy: microphone=(self)`, restrictive CSP, and same-origin worker/WASM assets. Do not claim SharedArrayBuffer Tier A support until deployed headers are verified.

## Model packs and model card

Model weights and datasets are separate from the Apache-2.0 code license. A model pack must include a manifest, file sizes, SHA-256 checksums, graph tensor contracts, license metadata, and a model card before it is published or activated.

Current catalog:

- `vietasr-iter3-int8` — metadata-only external Vietnamese candidate pinned to a Hugging Face revision. See `MODEL_LICENSES.md` and `docs/instructions/model-card-vietasr-iter3-int8.instructions.md`.
- `model-packs/example-manifest/files/*.onnx` — tiny deterministic CI mock graphs generated by repository tooling, not trained ASR weights.

## Privacy and licensing baseline

- Audio and transcripts remain local unless the user explicitly exports them.
- No telemetry, analytics, remote logging, or crash uploads are enabled by default.
- During active transcription, the app must not call remote services; model downloads and app updates are explicit lifecycle events outside active dictation.
- Enrollment recordings, prompt text, feature shards, frame labels, checkpoints, speaker embeddings, adapters, `.speechmodel` bundles, exported profiles, and local trainer packages are sensitive personal data.
- Code is licensed under Apache-2.0. Model weights, datasets, pseudo-labels, and fixtures require separate license notices and redistribution review.

## Known limitations

- v0.5.0 does not yet publish user-approved 30-speaker bilingual cohort evidence; do not claim production Personal Voice Model accuracy or quality gates pass until ADR 0004 is resolved.
- v0.5.0 does not yet publish declared reference-hardware Personal Voice Model benchmark evidence; do not claim production memory, storage, latency, RTF, export/import, offline, or zero-network performance gates pass until ADR 0005 is resolved.
- Synthetic fixtures, CI smoke tests, local diagnostics, and contract tests are regression evidence only; they are not substitutes for production quality or performance evidence.
- The VietASR candidate is Vietnamese-only and its inspected ONNX encoder is full-sequence/length based, not streaming-cache based.
- The fixed `BrowserTrainingBackend` adapter-math path is the supported browser-training backend for v0.5.0. ORT Training can replace or augment it only after a real browser training artifact/API is proven and reviewed.
- Global OS hotkeys, cross-application insertion, production bilingual/code-switching model packs, and evidence-backed public accuracy/performance claims remain roadmap items for later milestones.

## Roadmap

The issue backlog tracks the implementation plan from engineering foundation through audio transport, model runtime, streaming ASR, PWA release, bilingual vocabulary steering, guided personalization, local adapter training, browser-training experiments, and the `v0.5.0-browser-personal-models` milestone. After v0.5.0, the highest-priority follow-ups are aggregate cohort evidence, declared reference-hardware benchmarks, and release-cleared production bilingual/code-switching model packs.
