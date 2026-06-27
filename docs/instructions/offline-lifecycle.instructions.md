---
description: 'Offline app-shell, service-worker update, and model lifecycle UI rules.'
applyTo: 'apps/web/src/app/OfflineModelPanel.tsx,apps/web/src/app/pwa-lifecycle.ts,apps/web/src/workers/model-lifecycle.worker.ts,apps/web/e2e/offline-model-lifecycle.spec.ts,apps/web/vite.config.ts'
---

# Offline lifecycle

- Register the PWA service worker from the app entrypoint and surface offline-ready/update states in UI; never replace a running app shell silently during an active utterance.
- Keep service-worker app-shell caching separate from model file storage. The service worker may precache same-origin app assets, but model installs/deletes must go through `@speech/model-manager` storage backends.
- Run model catalog loading, manifest inspection, hashing, install, activation, and deletion from a dedicated worker rather than the React/main thread.
- Inspect and verify manifest metadata before enabling large model downloads. Do not download external model files in smoke tests.
- Browser tests for offline behavior should first wait for service-worker readiness/control, then assert a precached reload while the context is offline.
- App-shell Local status may summarize network, app-shell readiness, update availability, and required model-download count, but detailed service-worker/model lifecycle data stays in the dedicated offline/model lifecycle screen and worker.
- Dedicated offline/update screens should treat offline as normal when required assets are installed, show blockers only for missing required downloads or failed updates, and put catalog/update lifecycle tables behind a single accessible details disclosure.
- Dictate may show the required base-model setup state in place when no base model is installed, but it must still rely on the model-lifecycle worker for catalog, manifest, install, activation, retry, and partial-cleanup state. Keep detailed offline/update diagnostics separate from this setup card.
