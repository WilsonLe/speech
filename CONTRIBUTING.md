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
- Explain privacy, licensing, and performance impact when relevant.
- Include benchmark methodology before publishing performance claims.

## Documentation

Project documentation belongs in `docs/instructions/*.instructions.md`. Topic-specific troubleshooting notes belong in `docs/troubleshooting/troubleshoot-*.instructions.md` only after real debugging work.
