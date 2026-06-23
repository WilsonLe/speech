---
description: 'Vocabulary steering, enrollment, speaker profile, and adapter implementation rules.'
applyTo: 'packages/context-bias/**,packages/enrollment/**,packages/personalization/**,packages/profile-manager/**,tools/sentence-bank/**,tools/profile-trainer/**,training/personalization/**,test-data/expected/enrollment-sentence-bank.json'
---

# Personalization rules

- Deliver vocabulary steering before speaker profiles, and speaker profiles before adapter training.
- Solve rare terms with contextual biasing before acoustic fine-tuning.
- Keep vocabulary entry/set schemas in `@speech/protocol` and structural validation/revision extraction in `@speech/context-bias`.
- Apply vocabulary revisions and profile swaps only at utterance boundaries.
- Refuse profiles whose base model identity, graph-contract hash, checksum, or regression gate fails.
- Preserve one-click fallback to the generic model.
- Use `projected` internally for loud/clear enrollment and warn users not to strain or scream.
- Enrollment calibration should request browser processing off where supported, inspect actual track settings, keep room-noise and normal-baseline guidance relative to the user's own RMS, and store only derived metrics unless the user explicitly starts an enrollment recording flow.
- Enrollment quality reports must be generated from local/in-memory takes or private profile storage, include aggregate duration/VAD/clipping/SNR/pace/alignment fields, omit raw audio and transcript text, and keep manual acceptance available because low base-model confidence alone must not reject valid accents.
- Enrollment sentence-bank releases must be UI-independent, schema-versioned, NFC-normalized, license-linked per sentence, human-reviewed, redistributable, and include deterministic held-out IDs. Draft tooling may bypass release gates explicitly, but committed release fixtures must not contain private transcripts, corpus excerpts, recordings, or user enrollment data.
- Sentence-bank coverage and selector tooling may start with deterministic heuristic G2P, but must label it as coverage accounting rather than proof of phonetic balance until generated reports and human review support that claim. Weighted set-cover selection should maximize uncovered coverage per estimated second, penalize near-duplicate/repeated prompt templates, and keep held-out prompts excluded by default.
- Browser-only training is experimental and must never block transcription or corrupt the active profile.
