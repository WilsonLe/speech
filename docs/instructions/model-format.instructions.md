---
description: 'Model-pack manifest, graph-contract, checksum, and licensing requirements.'
applyTo: 'model-packs/**,packages/protocol/**,packages/model-manager/**,packages/inference/**,MODEL_LICENSES.md'
---

# Model-pack format

- Start model manifests at schema version 2.
- Validate manifests before downloading large assets.
- Enumerate every graph input/output tensor name, data type, shape convention, and state-cache relationship.
- Never rely on undocumented tensor ordering.
- Download into a temporary version, verify size/checksum/license metadata, then atomically activate.
- Keep production weights out of Git unless redistribution rights and participant consent are documented explicitly.
