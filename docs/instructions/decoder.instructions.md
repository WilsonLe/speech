---
description: 'RNN-T decoder, token-state, and stable-prefix implementation rules.'
applyTo: 'packages/decoder/**,packages/inference/**,apps/web/src/workers/**'
---

# Decoder runtime

- Keep RNN-T decoding UI-independent and worker-owned; do not run decoder loops on the main thread.
- Drive decoder safety limits from the model manifest, especially `streaming.maxSymbolsPerFrame`; emit structured limit metadata instead of silently spinning.
- Greedy decoding must be deterministic for fixed logits: use a stable argmax tie-break that selects the lowest token id among equal scores.
- Preserve last non-blank token state across chunks and reset decoder state at utterance boundaries.
- Stable-prefix control must keep recent hypotheses, compute their longest common token prefix, hold back provisional suffix tokens, and never rewrite committed tokens during live decoding.
- Final-pass correction of committed tokens must be explicit; the default finalization path can append/replace only the provisional suffix.
- Utterance finalization must emit at most one final result per utterance, reject mismatched utterance IDs, and reset committed/provisional decoder state before the next utterance starts.
- Decoder unit tests should use synthetic logits/token ids, not production model weights, speech corpora, private transcripts, or generated audio.
