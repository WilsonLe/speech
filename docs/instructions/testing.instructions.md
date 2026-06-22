---
description: 'Validation commands, CI expectations, and test categories for speech.'
applyTo: '**/*.{ts,tsx,js,mjs,py,json,yml,yaml},apps/**,packages/**,tools/**,training/**'
---

# Testing and validation

Run the smallest useful validation set for each change, but keep these repository-level commands healthy:

```bash
pnpm lint
pnpm format-check
pnpm typecheck
pnpm test
pnpm build
pnpm chromium-smoke
```

Required CI checks are lint, format-check, typecheck, unit tests, Python tests, production build, Chromium smoke, and license/generated-file checks.

Performance gates must be measured from audio timestamps and documented with browser, OS, hardware, model version, provider, thread count, and power state. Shared CI performance is informational unless it runs on designated reference hardware.
