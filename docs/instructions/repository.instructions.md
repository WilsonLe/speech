---
description: 'Repository workflow, file layout, and durable agent rules for wilsonle/speech.'
applyTo: '**'
---

# Repository workflow

- Use `pnpm` workspaces and keep `pnpm-lock.yaml` committed.
- After the initial bootstrap commit on `main`, implement plan items through issue-backed branches and pull requests.
- Use conventional commit and PR titles. Include `Closes #<issue>` in PR bodies.
- Keep durable project docs in `docs/instructions/*.instructions.md`; keep accepted architecture decision records in `docs/adr/*.md` using the ADR template instruction.
- Add topic-specific troubleshooting notes only after real debugging work, using `docs/troubleshooting/troubleshoot-*.instructions.md`.
- Do not commit production model weights, private recordings, speech corpora, transcripts, generated build output, secrets, or unknown-license fixtures.
- Root community files (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, etc.) are allowed because GitHub expects them at the repository root; detailed guidance should point into `docs/instructions/`.
