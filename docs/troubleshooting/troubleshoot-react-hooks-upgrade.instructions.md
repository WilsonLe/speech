---
description: 'Troubleshooting eslint-plugin-react-hooks upgrade failures from stricter React compiler rules.'
applyTo: 'apps/web/src/app/**/*.tsx,eslint.config.*,.github/dependabot.yml,package.json,pnpm-lock.yaml'
---

# React Hooks plugin upgrade troubleshooting

- Symptom: after upgrading `eslint-plugin-react-hooks` to v7, `pnpm lint` fails with `react-hooks/set-state-in-effect` on mount effects that synchronously call `setState`.
- Root cause: v7 enables React Compiler-oriented rules; synchronous state updates inside effect bodies are flagged because they can cause cascading renders.
- Fix: prefer lazy initial state when the value is SSR-safe, or defer browser-only localStorage/worker initialization updates through a callback, microtask, or subscription rather than calling `setState` directly in the effect body.
- Verification: run `pnpm lint`, `pnpm --filter @speech/web typecheck`, and `pnpm --filter @speech/web test`; for UI behavior changes, run the relevant Playwright smoke spec.
