---
description: 'RNN-T decoder, token-state, and stable-prefix implementation rules.'
applyTo: 'packages/decoder/**,packages/inference/**,apps/web/src/workers/**'
---

# Decoder runtime

- Keep RNN-T decoding UI-independent and worker-owned; do not run decoder loops on the main thread.
- Drive decoder safety limits from the model manifest, especially `streaming.maxSymbolsPerFrame`; emit structured limit metadata instead of silently spinning.
- Greedy decoding must be deterministic for fixed logits: use a stable argmax tie-break that selects the lowest token id among equal scores.
- Preserve last non-blank token state across chunks and reset decoder state at utterance boundaries.
- Decoder unit tests should use synthetic logits/token ids, not production model weights, speech corpora, private transcripts, or generated audio.
