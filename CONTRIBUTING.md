# Contributing

Thanks for helping build `speech`.

## Development workflow

1. Use `pnpm install` from the repository root.
2. Keep changes small and issue-backed after the initial bootstrap.
3. Add or update tests with behavior changes.
4. Run the relevant validation commands before opening a pull request.
5. Never commit production model weights, private recordings, speech corpora, secrets, or generated build output.

## Pull request expectations

- Use a conventional PR title, for example `feat(audio): add worklet capture`.
- Link the issue with `Closes #123` in the PR body.
- Explain privacy, licensing, accessibility, and performance impact when relevant.
- Include benchmark methodology before publishing performance claims.
- Do not claim production accuracy, performance, or usability gates pass without the matching cohort, reference-hardware, or participant evidence.

## v0.6 UI contribution guide

- Keep the persistent primary destinations to **Dictate**, **Vocabulary**, and **Models**.
- Put Settings, Storage, Privacy, Keyboard shortcuts, Diagnostics, About, and update actions behind the application menu.
- Keep required actions, blockers, privacy/destructive consequences, and recovery visible at the point of need.
- Use `@speech/ui` primitives for buttons, menus, dialogs, disclosures, accordions, form controls, notices, status, loading, and progress.
- Keep optional metrics, hashes, runtime versions, storage internals, and dense diagnostics in details/accordions or dedicated diagnostic routes.
- Update semantic copy-budget/accessibility tests, route focus tests, responsive visual matrix, and manual accessibility evidence when a UI route or primary action changes.
- Do not commit binary screenshots; visual checks should attach runtime artifacts or commit privacy-safe manifests only.

## Documentation

Project documentation belongs in `docs/instructions/*.instructions.md`, `docs/adr/*.md`, static-tested `docs/research/*.md` summaries, root community files, or structured JSON under `docs/planning/`. Topic-specific troubleshooting notes belong in `docs/troubleshooting/troubleshoot-*.instructions.md` only after real debugging work.
