# ADR: v0.6.0 progressive-disclosure rules

## Status

Accepted

## Context

`v0.6.0` reduces the default web UI while preserving every `v0.5.0` workflow. ADR 0008 captured the stacked v0.5 UI inventory, ADR 0009 captured baseline task friction, and ADR 0010 accepted the task-first information architecture with exactly three persistent primary destinations: Dictate, Vocabulary, and Models.

The next implementation decisions need a durable rule for what remains visible and what may move into disclosures, accordions, menus, tooltips, dialogs, or dedicated screens. Without that rule, minimal UI work could hide required actions, blockers, privacy consequences, destructive consequences, or recovery paths. The project also needs copy budgets before pruning or rewriting user-facing strings.

## Decision

Adopt progressive disclosure for v0.6 UI implementation with one controlling rule:

> Keep the current task, required choice, blocker, consequence, recovery action, and primary next action visible at the point of need; move only optional, low-frequency, diagnostic, or expert detail behind an appropriate disclosure mechanism.

### Visibility rules

Keep visible by default when present:

- screen title, current prompt, or current task;
- one visually dominant primary action;
- required fields and choices;
- active recording, enrollment, training, import, export, or deletion state;
- blocking errors and exact next recovery action;
- destructive consequences and confirmation targets;
- privacy consequences at recording, training, import, export, support-bundle, and deletion boundaries;
- compatibility or activation-gate failures that block the next action;
- reload, checkpoint, or interrupted-work recovery; and
- the minimum state needed to understand what will happen next.

Hide or move by default when it is not required for the immediate task:

- model hashes, tokenizer hashes, graph versions, storage paths, schema versions, and runtime provider details;
- detailed recording-quality measurements such as SNR, clipping percentage, VAD timings, pace, alignment, and language confidence;
- training loss, epoch, batch, learning rate, backend, thread, memory, checkpoint, and optimizer details;
- complete benchmark tables and diagnostics;
- advanced vocabulary weights, tokenization previews, prompt priority, and pronunciation diagnostics;
- low-frequency management actions such as duplicate, export, delete, rollback, remove partial download, and bulk management; and
- explanatory background that does not change the user's next action.

### Mechanism rules

Use a **dedicated screen** when the user must complete a multi-step task, fill more than three related fields, review several consequences, compare results, manage destructive data actions, or return directly by URL. Enrollment, training, model import, model export, storage management, diagnostics, and delete-all-local-data are screens, not large menus or long dialogs.

Use a **single disclosure** for one optional detail section. Use an **accordion** only when a detail screen contains several independent optional sections, such as recording coverage, quality results, compatibility, storage, or technical details.

Use a **menu** for low-frequency actions related to one context, such as row actions or application-menu navigation. Frequently used actions stay visible.

Use a **tooltip** only to supplement compact controls, abbreviated status, or non-obvious icon-only secondary actions. Tooltips never contain required instructions, errors, privacy terms, destructive consequences, links, buttons, or forms.

Use a **dialog** only for short confirmation, concise rename, passphrase entry, or a blocking decision that must pause the current screen. Dialogs do not contain long wizards or dense management flows.

### Prohibitions

The v0.6 UI must not introduce:

- nested accordions;
- required fields or required blockers inside initially collapsed content;
- essential information available only in a tooltip;
- long forms in menus or dialogs;
- submenu nesting;
- icon-only primary navigation;
- icon-only controls without accessible names;
- technical detail hidden in a place that prevents copying diagnostics after failure;
- destructive, privacy, import, compatibility, or training-failure information only in a toast; or
- a dashboard or carousel that delays the Dictate task surface.

### Minimal-copy rule and budgets

Every visible string must serve at least one user need:

1. identify a destination or control;
2. state the action available now;
3. state a required choice;
4. communicate state or progress;
5. explain a consequence, risk, or privacy boundary;
6. explain how to recover; or
7. satisfy accessibility, legal, licensing, or provenance requirements.

Default copy budgets, excluding user-generated transcript/vocabulary content, legal/license text, and expanded diagnostics, are:

| Surface                                        |                                                                            Budget |
| ---------------------------------------------- | --------------------------------------------------------------------------------: |
| Default Dictate screen                         |                                                        35 visible interface words |
| Ordinary list/detail screen before disclosures |                                                        80 visible interface words |
| Wizard step                                    |                                                        45 visible interface words |
| Empty state                                    |                                                        30 visible interface words |
| Helper text                                    |                                     one sentence, normally 100 characters or less |
| Tooltip                                        |                                                   normally 140 characters or less |
| Status label                                   |                                                    normally 40 characters or less |
| Primary button                                 |                                                                 one to four words |
| Recoverable error                              | one sentence plus one recovery action, with technical detail disclosed separately |

A screen may exceed a budget only for a documented user, legal, privacy, accessibility, safety, licensing, or provenance need.

### Accessibility and privacy requirements

Minimal UI must not become cryptic. Visible labels are preferred for primary navigation and primary actions. Hidden content must not remain focusable. Disclosures, accordions, menus, tooltips, and dialogs must use native semantics or documented accessible patterns, support keyboard operation, restore focus predictably, and expose state to assistive technology.

Privacy and security consequences must be visible when the user records audio, trains a model, imports a model, exports a model, downloads diagnostics/support data, deletes local data, or activates/rolls back a personal model. Details may explain hashes, schemas, checksums, encryption parameters, or compatibility metadata, but the existence of the consequence and the safe next action must not be hidden.

This ADR does not change worker ownership or domain contracts. UI changes may reorganize screens and copy, but inference, feature extraction, training, archive parsing, encryption, hashing, and large storage operations remain in existing packages/workers.

## Consequences

- Future v0.6 UI issues must justify moving a control or string behind a disclosure, menu, tooltip, dialog, or dedicated screen by task frequency, consequence, and accessibility impact.
- Copy pruning must classify each remaining string against the minimal-copy rule and keep budgets testable where practical.
- Component work must provide accessible primitives that prevent application code from manually managing required ARIA state for common patterns.
- Route and workflow tests must assert that blockers, destructive consequences, privacy consequences, and recovery actions remain visible at the point of need.
- Diagnostics and expert controls remain reachable, copyable, and testable, but they are no longer part of ordinary task surfaces by default.
- ADR 0010 owns destination and route ownership; this ADR owns the disclosure and copy rules used inside those routes.
