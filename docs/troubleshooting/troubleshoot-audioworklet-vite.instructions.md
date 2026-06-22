---
description: 'Troubleshooting Vite-built AudioWorklet modules and local Playwright preview conflicts.'
applyTo: 'apps/web/src/worklets/**, apps/web/src/app/**/*.tsx, apps/web/playwright.config.ts, apps/web/e2e/**'
---

# AudioWorklet and Vite troubleshooting

- If `audioWorklet.addModule()` fails after a production build, inspect `apps/web/dist/assets/*worklet*`; worklet assets must be compiled JavaScript (`.js`), not raw TypeScript.
- Import worklet URLs through Vite worker URL bundling, for example `import workletUrl from '../worklets/name.worklet.ts?worker&url';`, before passing the URL to `audioWorklet.addModule()`.
- A Playwright `webServer` timeout can be caused by a stale `vite preview` process already listening on port 4173; check `ss -ltnp 'sport = :4173'` and stop the stale Node process before rerunning smoke tests.
- For microphone/worklet E2E tests, launch Chromium with fake media flags and use a secure localhost context.
