---
description: 'Vercel deployment and browser security header requirements for the PWA.'
applyTo: 'vercel.json,apps/web/**,docs/instructions/deployment-vercel.instructions.md'
---

# Vercel deployment

- Deploy through Vercel using the root `vercel.json`.
- Required headers are configured in `vercel.json`, not Cloudflare `_headers`.
- Preserve cross-origin isolation headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Preserve `Permissions-Policy: microphone=(self), camera=(), geolocation=()` and a restrictive CSP. `connect-src` may include only `'self'` plus exact external origins required by committed installable model manifests and verified redirect destinations; for the current Hugging Face Xet-backed base model this includes `https://huggingface.co` and `https://us.aws.cdn.hf.co`. Do not add wildcard hosts, broad `https:`, telemetry origins, or unreviewed CDNs.
- ONNX Runtime Web may require `wasm-unsafe-eval`; keep workers, scripts, WASM artifacts, app shell, and model assets same-origin where practical.
- Test the deployed headers before claiming SharedArrayBuffer Tier A support.
- Before a public release, verify the hosted PWA loads over HTTPS, installs as a PWA, serves app-shell assets offline after first load, and returns the expected COOP/COEP/CSP/Permissions-Policy headers from production URLs.
- Static Vercel PWA deployments must include an app-shell fallback rewrite for direct v0.6 routes such as `/about`, `/settings/audio`, and `/models/import`; verify route refresh/deep links do not return 404 before publishing.
- Production release/hotfix verification must exercise a fresh base-model install path or at least confirm the CSP permits the committed model download origins; a passing app-shell/offline check alone does not prove model downloads work.
