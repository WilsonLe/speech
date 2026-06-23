---
description: 'Vocabulary schema, contextual-bias validation, and worker-ready revision rules.'
applyTo: 'packages/context-bias/**,packages/protocol/src/vocabulary.ts,packages/protocol/src/worker-protocol.ts,apps/web/src/workers/**'
---

# Context-bias vocabulary rules

- Keep vocabulary contracts UI-independent and versioned; shared entry/set/store types live in `@speech/protocol`, while structural validation and revision extraction live in `@speech/context-bias`.
- Treat vocabulary entries and sets as local user data. Do not send phrases, aliases, categories, or pronunciation-recording IDs over the network by default.
- Validate schema separately from tokenizer/automaton compilation. Entry/set validation may enforce IDs, language values, weights, alias counts, duplicate phrases, and active-entry limits, but token-length and unknown-token decisions belong to tokenizer-aware compilation.
- Apply manifest contextual-bias limits only to active sets and enabled entries. Disabled local sets may keep future-model vocabulary terms without blocking storage.
- Produce worker-ready vocabulary revisions from active sets only and swap revisions only at utterance boundaries.
- Compile token automata only after a model tokenizer is available. Token-length, unknown-token, and boundary decisions belong to automaton compilation, not structural schema validation.
- Contextual score bonuses must be bounded by the active model `contextBiasing.maxCumulativeBonus`; aggregate overlapping candidates deterministically and keep diagnostics local to the worker/runtime.
- Browser CRUD may persist vocabulary snapshots in origin-local storage; imports and exports must be explicit user actions and must warn that files may contain sensitive names or project terms.
- Preserve canonical `displayForm` and Vietnamese diacritics; normalize matching phrases/aliases to NFC with collapsed whitespace without rewriting the display form.
