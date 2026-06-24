---
description: 'Transcript rendering parity fixture and reference implementation rules.'
applyTo: 'packages/formatter/**,tools/transcript-reference/**,test-data/expected/transcript-reference.json,test-data/LICENSES.md'
---

# Transcript parity

- Keep transcript parity fixtures synthetic and redistribution-safe; do not use private transcripts, speech corpora, or recordings.
- The Python reference in `tools/transcript-reference` owns checked-in expected transcript fixtures; after regenerating JSON, run Prettier before committing.
- TypeScript formatter behavior must match the Python reference for token-piece detokenization, ignored special tokens, punctuation attachment, and Unicode NFC normalization.
- Treat transcript parity fixtures as deterministic browser/runtime contract tests, not claims about production ASR accuracy.
