---
description: 'Vocabulary steering, enrollment, speaker profile, and adapter implementation rules.'
applyTo: 'packages/context-bias/**,packages/enrollment/**,packages/personalization/**,packages/profile-manager/**,tools/profile-trainer/**,training/personalization/**'
---

# Personalization rules

- Deliver vocabulary steering before speaker profiles, and speaker profiles before adapter training.
- Solve rare terms with contextual biasing before acoustic fine-tuning.
- Keep vocabulary entry/set schemas in `@speech/protocol` and structural validation/revision extraction in `@speech/context-bias`.
- Apply vocabulary revisions and profile swaps only at utterance boundaries.
- Refuse profiles whose base model identity, graph-contract hash, checksum, or regression gate fails.
- Preserve one-click fallback to the generic model.
- Use `projected` internally for loud/clear enrollment and warn users not to strain or scream.
- Browser-only training is experimental and must never block transcription or corrupt the active profile.
