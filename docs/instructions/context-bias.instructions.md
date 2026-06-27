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
- Spoken aliases should compile as match candidates for the same entry and emit token-span display matches that preserve the entry's canonical `displayForm`.
- Browser CRUD may persist vocabulary snapshots in origin-local storage; imports and exports must be explicit user actions and must warn that files may contain sensitive names or project terms.
- The v0.6 Vocabulary set list stays compact by default: show set name, on/off state, term count, row-open action, search, visible New set action, and overflow actions; move import/export/bulk management into a screen menu or dedicated disclosure/screen, not the default list.
- The v0.6 Vocabulary set editor shows basic fields by default: set name/state, search/list context, Term, Language, Spoken variants, optional Display as only when different, Add/Update word, and the word list. Keep steering strength, category, exact casing, prompt priority, enrollment prompt preview/inclusion, and tokenizer/schema diagnostics behind one Advanced disclosure while preserving exact schema round trips. Any default validation/import/export copy must go through typed `apps/web/src/content/reasonCodes.ts` mappings so raw schema, parser, tokenizer, trie, automaton, token-path, entry-ID, or storage wording does not appear in ordinary UI.
- Show “Applies next recording” only when a local vocabulary revision has changed and is waiting for the next utterance/recording boundary; do not present it as static explanatory copy.
- Prompt scheduling may read enabled entries and `promptPriority` from the local vocabulary store, but it must not mutate vocabulary revisions, tokenizer compilation state, or decoder automata; terms not scheduled for recording remain active through normal contextual biasing.
- Browser-training job freezes may persist the active `VocabularyRevisionV1` locally with a SHA-256 revision hash so later vocabulary edits cannot silently change training inputs; keep that full revision inside profile-store-owned local storage and expose only redacted/aggregate verification status to UI/reports.
- Selected vocabulary entry IDs may travel through local prompt, split, feature, and frame-label metadata to bind training context to the frozen vocabulary revision. Public summaries/reports must expose only counts, hashes, or redacted labels, never raw entry IDs, phrases, aliases, or display forms.
- Preserve canonical `displayForm` and Vietnamese diacritics; normalize matching phrases/aliases to NFC with collapsed whitespace without rewriting the display form.
