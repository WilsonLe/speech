---
description: 'Release tagging, GitHub release, checksum, and hosted PWA verification rules.'
applyTo: 'package.json,apps/web/package.json,packages/*/package.json,docs/instructions/release-process.instructions.md,.github/workflows/**,vercel.json'
---

# Release process

- Keep private workspace package versions aligned with the public release tag, for example `v0.1.0` corresponds to package version `0.1.0` across the root, web app, and workspace packages.
- Publish releases from a clean `main` commit whose required CI checks passed. Do not tag a commit with failing, pending, or skipped required checks.
- Use an annotated Git tag for public releases and create a GitHub release with notes that distinguish implemented runtime contracts from roadmap items and unproven model-performance claims.
- Attach checksum evidence for release assets. If attaching source/build archives, generate them from the tagged commit and include a `SHA256SUMS.txt` release asset.
- Do not commit generated build output or production model weights for a release. Release assets may include generated web build archives when produced from the tagged commit.
- Verify hosted Vercel production URLs over HTTPS before claiming the PWA is hosted: app load, app-shell offline reload after first load, installability, and COOP/COEP/CSP/Permissions-Policy headers.
- If Vercel project linking or authentication is unavailable, publish local/GitHub release artifacts only after clearly marking hosted deployment verification as blocked; do not claim production deployment is complete.
- v0.5.0 Personal Voice Model release notes must distinguish synthetic/CI smoke diagnostics from declared reference-hardware benchmark evidence and must not claim production performance gates pass while the `personal-model-release-benchmark` report is insufficient-evidence.
- Before v0.5.0 tagging, check ADR 0006's privacy/security/licensing review and ADR 0007's release-note/planning snapshot; carry forward unresolved ADR 0004 cohort and ADR 0005 reference-benchmark evidence gates in the GitHub release body and deployment notes.
- v0.6.0 documentation updates live in README/CONTRIBUTING plus structured planning JSON: `docs/planning/CURRENT_STATE.json`, `docs/planning/snapshots/v0.5.0-current-state-archive.json`, `docs/planning/snapshots/v0.6.0-documentation-candidate-snapshot.json`, and `docs/planning/v0.6.0-documentation-screenshots.json`. Keep screenshots as local `/tmp` artifacts with committed metadata only, and keep issue #255 release-usability evidence open until participant evidence or an explicit human release decision exists.
