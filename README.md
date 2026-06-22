# speech

Local-first Vietnamese/English streaming speech-to-text PWA with private voice personalization.

`speech` is an installable browser app for on-device Vietnamese, English, and Vietnamese-English code-switching dictation. The repository is intentionally structured so the browser runtime, model-pack contract, enrollment/profile contracts, and future trainer tooling can evolve independently.

## Current status

This repository is at the engineering-foundation stage. It includes the monorepo scaffold, PWA shell, TypeScript/Python quality gates, CI, documentation/instruction structure, and versioned contracts. Production ASR model weights, private recordings, and speech corpora are intentionally not committed.

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

The PWA is served by Vite during development. `localhost` is a secure-context exception for browser microphone APIs, but production deployment must use HTTPS and the cross-origin isolation headers in `vercel.json`.

## Validation commands

```bash
pnpm lint
pnpm format-check
pnpm typecheck
pnpm test
pnpm build
pnpm chromium-smoke
```

`pnpm chromium-smoke` uses Playwright Chromium. Install the browser locally with `pnpm --filter @speech/web exec playwright install chromium` if it is not already available. When a compatible Chromium is already cached, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome pnpm chromium-smoke` can be used for local validation.

## Documentation and project instructions

Durable project guidance lives under `docs/instructions/*.instructions.md`. Troubleshooting notes are only added after real debugging work and must use `docs/troubleshooting/troubleshoot-*.instructions.md`.

Start with:

- `docs/instructions/repository.instructions.md`
- `docs/instructions/architecture.instructions.md`
- `docs/instructions/privacy-data.instructions.md`
- `docs/instructions/deployment-vercel.instructions.md`
- `docs/instructions/testing.instructions.md`

## Privacy and licensing baseline

- Audio and transcripts must remain local unless the user explicitly exports them.
- No telemetry is enabled by default.
- Production model weights, private voice recordings, and unknown-license fixtures must not be committed.
- Code is licensed under Apache-2.0. Model weights and datasets require separate license notices and redistribution review.

## Roadmap

The initial issue backlog tracks the implementation plan from engineering foundation through audio transport, model runtime, streaming ASR, PWA release, bilingual vocabulary steering, guided personalization, local adapter training, and browser-training experiments.
