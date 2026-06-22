---
description: 'Vercel deployment and browser security header requirements for the PWA.'
applyTo: 'vercel.json,apps/web/**,docs/instructions/deployment-vercel.instructions.md'
---

# Vercel deployment

- Deploy through Vercel using the root `vercel.json`.
- Required headers are configured in `vercel.json`, not Cloudflare `_headers`.
- Preserve cross-origin isolation headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Preserve `Permissions-Policy: microphone=(self), camera=(), geolocation=()` and a restrictive CSP.
- ONNX Runtime Web may require `wasm-unsafe-eval`; keep workers, scripts, WASM artifacts, app shell, and model assets same-origin where practical.
- Test the deployed headers before claiming SharedArrayBuffer Tier A support.
