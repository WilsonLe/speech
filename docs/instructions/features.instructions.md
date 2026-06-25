---
description: 'Acoustic feature extraction and reference-parity rules.'
applyTo: 'packages/features/**,tools/feature-reference/**,test-data/expected/**'
---

# Acoustic features

- Feature extraction belongs after resampling in the ASR worker path, never in the UI thread or `AudioWorklet`.
- Feature parameters must come from versioned model/manifest contracts; do not hard-code model-specific assumptions into UI code.
- Keep the TypeScript feature extractor deterministic for browser inference; non-zero random dither is not supported in parity fixtures.
- Precompute windows/filterbanks and reuse per-frame scratch buffers; avoid per-frame heap allocation in the streaming extractor.
- Preserve frame-overlap state across chunks, and flush or pad final incomplete frames only according to the configured training convention.
- Keep Python reference fixtures redistribution-safe and synthetic; do not commit private recordings or unknown-license audio as parity data.
- Browser-training feature preparation may reuse the deterministic log-Mel extractor and FP16 helpers from `@speech/features`, but prepared private feature shards must be written only by profile/feature-preparation workers into profile-owned storage.
