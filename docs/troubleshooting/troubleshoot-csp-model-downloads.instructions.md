---
description: 'Troubleshoot production model downloads blocked by Content Security Policy.'
applyTo: 'vercel.json,apps/web/public/model-packs/**,tests/static/test_vercel_spa_fallback.py'
---

# Troubleshooting model download CSP blocks

- Symptom: browser console reports a model lifecycle worker fetch to a committed public model URL is blocked by `Content Security Policy` and `connect-src 'self'`.
- First inspect committed installable model manifests under `apps/web/public/model-packs/**/manifest.json`; collect exact URL origins from `files.*.url`.
- Update `vercel.json` `connect-src` only with exact required origins. Do not add `*`, broad `https:`, wildcard subdomains, telemetry, analytics, or unreviewed CDN hosts.
- Hugging Face `/resolve/...` model file URLs may redirect within `https://huggingface.co`; verify redirects before adding any additional origin.
- Keep `tests/static/test_vercel_spa_fallback.py` green so direct-route fallback, security headers, and model download CSP origins remain locked.
- Production verification should confirm direct routes and headers, then exercise or inspect a fresh model install path; app-shell/offline verification alone does not prove model download CSP correctness.
