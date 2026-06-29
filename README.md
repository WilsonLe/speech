# speech

Local-first Vietnamese/English speech-to-text PWA with private voice-model workflows.

`speech` is an installable browser app for local dictation, vocabulary steering, guided enrollment, browser training, encrypted voice-model portability, and offline use. The v0.6.0 UI is task-first: the persistent destinations are **Dictate**, **Vocabulary**, and **Models**. Settings, Storage, Privacy, Keyboard shortcuts, Diagnostics, About, and update actions live in the application menu.

## Current status

The current implementation target is the v0.6.0 minimal UI/UX release on package version `0.6.0`. It preserves the v0.5.0 speech, enrollment, browser-training, profile, portability, privacy, security, and compatibility contracts while replacing the default interface with focused routes:

- **Dictate** — install the required speech model, record, edit, copy, download, or clear local transcript text.
- **Vocabulary** — create sets, enable/disable them, add words, and use Advanced only for steering and diagnostics.
- **Models** — create a voice model, record prompts, train/check candidates, activate or roll back, import `.speechmodel`, export encrypted `.speechmodel`, and manage local model data.
- **Settings menu** — Audio, Storage, Privacy, Keyboard shortcuts, Diagnostics, About, and install/update actions.

Production ASR weights, private recordings, speech corpora, and personal profiles are intentionally not committed. The current VietASR catalog entry is a metadata-only external candidate; it is not yet advertised as a low-latency streaming model because its inspected encoder does not expose streaming cache tensors.

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

Open the dev server and use the app menu to reach Settings, Storage, Privacy, Keyboard shortcuts, Diagnostics, and About. Microphone permission is requested only when you intentionally run an input test or start recording.

## User guide

### Dictate

1. Open `/` or choose **Dictate**.
2. If the speech model is missing, choose **Install model**. Model details remain disclosed until needed.
3. Hold the microphone button or Space to record. Release to stop.
4. Edit the transcript locally. Copy appears when committed transcript text exists; download and clear live in the transcript menu.
5. Change language, voice model, or active vocabulary from the compact toolbar. Changes apply at the next utterance boundary.

### Vocabulary

1. Open **Vocabulary**.
2. Use **New set** to create a set, then add ordinary words from the basic editor.
3. Keep Advanced collapsed unless you need steering strength, category, prompt inclusion, or diagnostics.
4. Import/export controls are explicit because vocabulary files may contain sensitive names or project terms.

### Models

1. Open **Models**.
2. Choose **New** to name a voice model, choose speech coverage, select a recording plan, and start recording.
3. Enrollment shows one prompt at a time with concise feedback such as “Too quiet — move closer” or “Good.” Recording details stay disclosed.
4. Training readiness leads with blockers or **Ready to train**. Training progress uses Preparing, Training, Checking, and Ready by default.
5. Candidate results lead with the outcome and next action. Exact metrics stay under Results.
6. Import and export use dedicated routes. Encrypted `.speechmodel` export is the default, and recordings/training checkpoints are not included.

### Settings, Storage, Privacy, Shortcuts, Diagnostics, About

- **Audio** shows microphone choice, recording interaction mode, input test, reset calibration, and Advanced audio diagnostics.
- **Storage** shows aggregate local sizes and dedicated confirmation screens for deleting training data, one model, one speech-model version, or all local speech data.
- **Privacy** states that audio, transcripts, training, and personal models stay on this device; export/delete/diagnostics documentation stays visible.
- **Keyboard shortcuts** documents route-scoped shortcuts; no required action is hidden in a tooltip.
- **Diagnostics** is intentionally dense and grouped. Support bundles are redacted and aggregate-only.
- **About** shows version, source repository, code license, model provenance, acknowledgements, and update state.

## Documentation and screenshot evidence

- Final v0.6 documentation/screenshot manifest: `docs/planning/v0.6.0-documentation-screenshots.json`.
- Current-state snapshot: `docs/planning/CURRENT_STATE.json`.
- v0.5 archive snapshot: `docs/planning/snapshots/v0.5.0-current-state-archive.json`.
- v0.6 successor snapshot: `docs/planning/snapshots/v0.6.0-successor-current-state.json`.

Screenshot PNGs are captured locally under `/tmp` and are not committed. The manifest records route, viewport, local path, byte size, dimensions, and checksum using synthetic/fake browser state only.

## Contributor UI guide

- Use the three persistent primary destinations only: Dictate, Vocabulary, Models.
- Put Settings, Storage, Privacy, Shortcuts, Diagnostics, About, and update actions in the app menu.
- Keep required actions, blockers, privacy/destructive consequences, and recovery visible.
- Put optional metrics, hashes, runtime versions, and dense diagnostics in details, accordions, or dedicated diagnostic routes.
- Use `@speech/ui` primitives and `@speech/ui/testing` examples for new controls.
- Update the semantic tests, responsive visual matrix, accessibility matrix, and static docs guards when route labels, primary actions, copy budgets, or screenshot manifests change.

## Component-use and content-style guides

- Component-use guide: ADR 0014 and `docs/planning/v0.6.0-component-gallery-contract.json`.
- Content style guide: ADR 0012, `docs/planning/v0.6.0-terminology-copy-budgets.json`, and `docs/planning/v0.6.0-copy-deletion-pass.json`.
- Route/focus guide: ADR 0013 and `docs/planning/v0.6.0-route-map.json`.
- Accessibility guide: `docs/planning/v0.6.0-manual-accessibility-matrix.json`.
- Responsive visual guide: `docs/planning/v0.6.0-responsive-visual-regression-suite.json`.

Default UI should use user-facing terms such as Voice model, Speech model, Vocabulary, Quality check, Loud, Processing mode, and Device storage. Technical terms are reserved for Diagnostics, About, explicit technical details, copyable reports, and license/provenance contexts.

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

Release-validation coverage includes accessibility naming/section checks, keyboard focus through primary actions, rapid push-to-talk stress cycles, no fetch/XHR/websocket requests while push-to-talk is active, offline reload, model lifecycle inspection, screenshot-attachment visual regression checks, and diagnostics/support bundle schema checks. Shared CI timing is informational; hard latency gates require declared reference hardware.

## Documentation map

Durable project documentation lives under `docs/instructions/*.instructions.md`. Architecture decision records live under `docs/adr/*.md`. Research summaries live under `docs/research/*.md` only when paired with structured static-tested JSON artifacts. Troubleshooting notes are only added after real debugging work and must use `docs/troubleshooting/troubleshoot-*.instructions.md`.

Start with:

- `docs/instructions/repository.instructions.md` — workflow, docs placement, and repository guardrails.
- `docs/instructions/architecture.instructions.md` — thread ownership, route ownership, component primitives, and worker/UI boundaries.
- `docs/instructions/privacy-data.instructions.md` — privacy guide for local data, telemetry, licensing, screenshots, diagnostics, and sensitive-profile rules.
- `docs/instructions/voice-profile-threat-model.instructions.md` — threat model and review checklist for guided enrollment, profile storage, export/import, activation, diagnostics, and deletion.
- `docs/instructions/deployment-vercel.instructions.md` — Vercel deployment and required security headers.
- `docs/instructions/model-format.instructions.md` — model-pack, `.speechmodel`, graph-contract, checksum, and activation rules.
- `docs/instructions/model-storage.instructions.md` — speech-model storage lifecycle and deletion boundaries.
- `docs/instructions/personalization.instructions.md` — model training guide for enrollment, readiness, browser training, activation, and recovery.
- `docs/instructions/profile-trainer-docker.instructions.md` — local Docker image and end-to-end workflow for the personal adapter trainer.
- `docs/instructions/benchmark.instructions.md` — diagnostics export and performance methodology.
- `docs/instructions/release-validation.instructions.md` — accessibility, soak/stress, network-privacy, usability, visual, and performance evidence rules.
- `docs/instructions/release-process.instructions.md` — release tag, checksum, GitHub release, hosted PWA verification, and release-evidence limits.
- `docs/instructions/testing.instructions.md` — standard validation commands and CI expectations.

## Browser support and deployment

Tier-1 development targets current Chromium/Edge desktop browsers. Firefox/Safari support depends on API/operator availability and remains graceful-fallback until validated. Capability diagnostics probe APIs directly and report support without user-agent sniffing.

Deployments use Vercel and `vercel.json` headers. Preserve COOP/COEP for shared memory, `Permissions-Policy: microphone=(self)`, restrictive CSP, and same-origin worker/WASM assets. Do not claim Tier A shared-memory support until deployed headers are verified.

## Model packs and model card

Model weights and datasets are separate from the Apache-2.0 code license. A model pack must include a manifest, file sizes, SHA-256 checksums, graph tensor contracts, license metadata, and a model card before it is published or activated.

Current catalog:

- `vietasr-iter3-int8` — metadata-only external Vietnamese candidate pinned to a Hugging Face revision. See `MODEL_LICENSES.md` and `docs/instructions/model-card-vietasr-iter3-int8.instructions.md`.
- `model-packs/example-manifest/files/*.onnx` — tiny deterministic CI mock graphs generated by repository tooling, not trained ASR weights.

## Privacy and local data

- Audio, transcripts, vocabulary, enrollment recordings, training data, and personal models stay on this device unless the user explicitly imports or exports a file.
- No telemetry, analytics, remote logging, or crash uploads are enabled by default.
- During active transcription, the app must not call remote services; model downloads and app updates are explicit lifecycle events outside active dictation.
- Enrollment recordings, prompt text, feature shards, frame labels, checkpoints, speaker embeddings, adapters, `.speechmodel` bundles, exported legacy profiles, and local trainer packages are sensitive personal data.
- Code is licensed under Apache-2.0. Model weights, datasets, pseudo-labels, and fixtures require separate license notices and redistribution review.

## Release lineage and evidence boundaries

The previous release line was v0.5.0 browser Personal Voice Model infrastructure. v0.5.0 ships the local-first personal-model infrastructure and guardrails, but ADR 0004 and ADR 0005 keep production accuracy and reference-hardware performance claims blocked until aggregate evidence is available.

- `docs/adr/0004-v0-5-0-quality-cohort-gate.md` — do not claim production Personal Voice Model accuracy or quality gates pass until user-approved cohort evidence exists.
- `docs/adr/0005-v0-5-0-reference-benchmark-gate.md` — do not claim production memory, storage, latency, RTF, export/import, offline, or zero-network performance gates pass until declared reference-hardware evidence exists.
- `docs/adr/0006-v0-5-0-privacy-security-licensing-review.md` — v0.5 privacy/security/licensing review.
- `docs/adr/0007-v0-5-0-release-notes-and-planning-snapshot.md` — v0.5 release notes and follow-on planning snapshot.

v0.6 documentation must keep the release-usability gate open until issue #255 has consented participant evidence or a separate explicit human release decision. Synthetic fixtures, CI smoke tests, local diagnostics, semantic tests, and visual screenshots are regression evidence only; they are not substitutes for production quality, performance, or usability evidence. To verify #255, follow `docs/planning/v0.6.0-issue-255-verification-checklist.json` and update the release-usability research artifact with aggregate participant results only.

## Known limitations

- v0.6.0 release-usability participant evidence remains open in issue #255. The v0.6.0 release may be published under the explicit human release decision recorded for #258, but closing #255 still requires aggregate participant evidence or a separate explicit decision recorded in `docs/research/v0.6-release-usability-study.json`.
- v0.5.0 does not yet publish user-approved 30-speaker bilingual cohort evidence; do not claim production Personal Voice Model accuracy or quality gates pass until ADR 0004 is resolved.
- v0.5.0 does not yet publish declared reference-hardware Personal Voice Model benchmark evidence; do not claim production memory, storage, latency, RTF, export/import, offline, or zero-network performance gates pass until ADR 0005 is resolved.
- Synthetic fixtures, CI smoke tests, local diagnostics, semantic tests, and contract tests are regression evidence only.
- The VietASR candidate is Vietnamese-only and its inspected encoder is full-sequence/length based, not streaming-cache based.
- Global OS hotkeys, cross-application insertion, production bilingual/code-switching model packs, and evidence-backed public accuracy/performance/usability claims remain roadmap items for later milestones.
