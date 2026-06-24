---
description: 'Troubleshooting release-validation no-network assertions that race app lifecycle fetches.'
applyTo: 'apps/web/e2e/release-validation.spec.ts, apps/web/src/app/OfflineModelPanel.tsx, apps/web/src/workers/model-lifecycle*'
---

# Release validation network-idle troubleshooting

- Symptom: `active push-to-talk stress cycles do not make network requests or surface errors` fails with a local lifecycle request such as `GET http://127.0.0.1:4173/model-catalog.json` recorded during the active-request window.
- Root cause: `page.waitForLoadState('networkidle')` can complete before worker-owned app/model lifecycle UI has finished its asynchronous catalog initialization.
- Fix the test by waiting for lifecycle readiness before setting the active-recording request flag, for example the offline status backend (`opfs`) and the expected model catalog card, then wait for network idle again.
- Do not weaken the assertion by filtering network requests after the active-recording flag is enabled; active transcription should still assert no fetch/xhr/websocket requests.
- Verification: rerun the focused release-validation stress test, then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/minh/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm chromium-smoke`.
