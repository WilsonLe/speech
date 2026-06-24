---
description: 'Troubleshooting @vitejs/plugin-react major upgrades and Vite/Vitest peer compatibility.'
applyTo: 'apps/web/package.json,apps/web/vite.config.ts,package.json,packages/*/package.json,pnpm-lock.yaml,pnpm-workspace.yaml'
---

# Vite React plugin upgrade troubleshooting

- Symptom: after upgrading `@vitejs/plugin-react` to v6, web tests/builds fail with `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './internal' is not defined by "exports" in vite/package.json`.
- Root cause: `@vitejs/plugin-react@6` declares a Vite 8 peer and imports Vite internals not available from Vite 6.
- Fix: upgrade the compatible peer stack together (`vite`, `vite-plugin-pwa`, and `vitest` when tests load Vite config), import `defineConfig` from `vitest/config` when the config includes a `test` block, and preserve pnpm supply-chain release-age exceptions only for reviewed fresh versions.
- Vitest 4 note: package test scripts must exclude `dist/**` with `--exclude=dist/**`; using a space can let the shell expand generated files into test filters.
- Verification: run `pnpm lint`, `pnpm format-check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm chromium-smoke`.
