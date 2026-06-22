---
description: 'Model storage backend and lifecycle rules for OPFS/Cache Storage.'
applyTo: 'packages/model-manager/**,apps/web/src/workers/**,apps/web/src/app/**'
---

# Model storage

- Store model files behind a UI-independent backend interface; prefer OPFS when available, Cache Storage as a browser fallback, and in-memory storage only for tests or unsupported contexts.
- Keep service-worker app-shell caching separate from model-version storage; a service-worker update must not delete installed model files.
- Normalize storage locators as `<modelId>/<version>/<fileKey>` path segments and reject unsafe segments before writing.
- Never overwrite active model files in place in later lifecycle work; write temporary versions and activate only after manifest, size, checksum, and license validation pass.
- Delete and list operations must be scoped by model ID and version so rollback/reinstall flows can preserve unrelated model versions.
- Do not store private audio, transcripts, enrollment recordings, or profile artifacts in the model-file backend.
