---
description: 'Troubleshooting TypeScript/Python acoustic feature parity fixtures.'
applyTo: 'packages/features/**,tools/feature-reference/**,test-data/expected/**'
---

# Acoustic feature parity troubleshooting

- If TypeScript/Python log-Mel parity fails only in very low-energy bins, check numeric contracts before loosening tolerance: browser PCM inputs are `Float32Array`, so the Python reference fixtures should quantize synthetic PCM to float32 when matching browser behavior.
- Keep deterministic fixture generation separate from formatting. After regenerating `test-data/expected/log-mel-reference.json`, run `pnpm exec prettier --write test-data/expected/log-mel-reference.json` before committing.
- Re-run both sides of the parity gate after fixture changes: `pnpm --filter @speech/features test` and `uv run pytest tools/feature-reference`.
- Use only synthetic or explicitly redistribution-safe fixture data; do not add private recordings or unknown-license audio to parity fixtures.
