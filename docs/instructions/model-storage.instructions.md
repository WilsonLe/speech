---
description: 'Model storage backend and lifecycle rules for OPFS/Cache Storage.'
applyTo: 'packages/model-manager/**,apps/web/src/workers/**,apps/web/src/app/**'
---

# Model storage

- Store model files behind a UI-independent backend interface; prefer OPFS when available, Cache Storage as a browser fallback, and in-memory storage only for tests or unsupported contexts.
- Keep service-worker app-shell caching separate from model-version storage; a service-worker update must not delete installed model files.
- Normalize storage locators as `<modelId>/<version>/<fileKey>` path segments and reject unsafe segments before writing.
- Never overwrite active model files in place; write temporary versions, verify downloaded and stored bytes, copy into the inactive target version, then update the active pointer last.
- Treat the active model registry as the source of truth for the selected version; a failed download, checksum, storage verification, or license gate must leave the previous active pointer intact.
- Delete and list operations must be scoped by model ID and version so rollback/reinstall flows can preserve unrelated model versions.
- Deleting an active model through lifecycle UI must remove both the active registry record and that active version's files; it must not affect unrelated model versions.
- Do not store private audio, transcripts, enrollment recordings, or profile artifacts in the model-file backend.
- Profile storage is separate from model storage: keep accepted-take WAV/metadata, export packages, and active/previous profile pointers under `@speech/profile-manager` paths with safe segments, checksum verification, atomic writes, explicit import/export, and deterministic delete-all behavior.
