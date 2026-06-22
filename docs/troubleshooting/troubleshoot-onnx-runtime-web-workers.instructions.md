---
description: 'Troubleshooting ONNX Runtime Web worker bundling, package fetches, and PWA asset precaching.'
applyTo: 'packages/inference/**,apps/web/src/workers/**,apps/web/vite.config.ts,apps/web/e2e/**,pnpm-lock.yaml,pnpm-workspace.yaml'
---

# ONNX Runtime Web worker troubleshooting

- If local `pnpm add onnxruntime-web@...` repeatedly times out on the large ORT tarball, use `npm pack onnxruntime-web@<version>` only as a local validation workaround. Before committing, normalize `packages/inference/package.json` and `pnpm-lock.yaml` back to the registry version spec; never commit `file:/tmp/...` tarball paths.
- If Vite fails with `Invalid value "iife" for option "worker.format" ... code-splitting builds`, set `worker.format = 'es'` in `apps/web/vite.config.ts`. ORT dynamic imports make worker code-splitting necessary.
- If `vite-plugin-pwa`/Workbox rejects ORT `.wasm` assets over the default 2 MiB limit, either intentionally raise `workbox.maximumFileSizeToCacheInBytes` for same-origin runtime assets or change the bundling strategy; do not silently drop required runtime assets from the offline app shell.
- If a bundled worker throws `ReferenceError: Cannot access '<symbol>' before initialization`, check for top-level constants that instantiate classes declared later in the module. Vite/esbuild minification can obscure class names; lazily initialize worker singletons after class declarations or from the message handler path.
- When browser verification keeps showing an old worker error after rebuilding, check for stale `vite preview` child processes on ports 4173+ and service-worker/browser cache. Kill the exact preview Node PIDs, restart a single preview server, and use a fresh browser context before retesting.
- Keep ORT runtime checks user-triggered in the UI and loaded inside the ASR worker so the main thread does not import ORT during initial render.
