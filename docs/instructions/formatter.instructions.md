---
description: 'Vietnamese normalization, bilingual-ready formatter, and basic ITN rules.'
applyTo: 'packages/formatter/**,tools/transcript-reference/**,test-data/expected/transcript-reference.json'
---

# Formatter

- Keep formatter APIs UI-independent and deterministic; live ASR may disable formatting separately from recognition.
- Always NFC-normalize Vietnamese text and preserve diacritics; do not run English casing/title rules over Vietnamese spans.
- Keep formatter options bilingual-ready with language mode/span metadata even when the v0.1.0 model emits Vietnamese-only text.
- Treat Vietnamese ITN rules as conservative and fixture-backed. Add percent, decimal, date, time, currency, phone, URL/email, or command rules only with TypeScript and Python parity coverage.
- Spoken commands such as `xuống dòng`/`new line` must stay behind explicit opt-in; verbatim mode must avoid ITN and command rewrites.
- Keep transcript parity fixtures synthetic and free of private transcripts/audio.
