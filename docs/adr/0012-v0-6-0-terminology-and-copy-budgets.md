# ADR: v0.6.0 terminology map and copy budgets

## Status

Accepted

## Context

`v0.6.0` is a minimal, task-first UI/UX release. ADR 0010 fixed the information architecture, and ADR 0011 fixed progressive-disclosure rules and default copy budgets. Issue #215 needs the approved terminology map and a structured copy-budget contract before implementation issues start rewriting UI copy or hiding technical detail.

The v0.5 baseline inventory in `docs/planning/v0.6.0-ui-inventory.json` contains technical implementation terms in ordinary UI surfaces. The v0.6 plan requires default workflows to avoid unexplained terms such as RNN-T, CTC, OPFS, WER, CER, SNR, VAD, WASM, and WebGPU unless they are user-provided values or the user has opened Diagnostics/About/technical details.

## Decision

Commit the approved terminology map and copy-budget contract at:

- `docs/planning/v0.6.0-terminology-copy-budgets.json`

The terminology contract maps the default UI terms used by ordinary workflows:

| Technical concept          | Default UI term        | Technical details may use  |
| -------------------------- | ---------------------- | -------------------------- |
| Personal Voice Model       | Voice model            | Personal Voice Model       |
| P1 speaker/channel profile | Voice profile          | P1 speaker/channel profile |
| P2 adapter                 | Personal model         | P2 adapter                 |
| Base RNN-T model           | Speech model           | Base RNN-T model           |
| Contextual bias vocabulary | Vocabulary             | Contextual bias vocabulary |
| Training companion pack    | Training support files | Training companion pack    |
| Activation gate            | Quality check          | Activation gate            |
| Generic anchor evaluation  | General speech check   | Generic anchor evaluation  |
| Projected voice condition  | Loud                   | Projected voice condition  |
| Execution provider         | Processing mode        | Execution provider         |
| OPFS                       | Device storage         | OPFS                       |

The contract also records these copy budgets:

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

Every visible string must have one of the user needs captured in the JSON contract: identify a destination/control, state the available action, state a required choice, communicate state/progress, explain a consequence/risk/privacy boundary, explain recovery, or satisfy accessibility/legal/licensing/provenance requirements.

A screen or string may exceed a budget only for a documented user, legal, privacy, accessibility, safety, licensing, or provenance need. Exceptions must record the surface, budget, measured count or length, reason, owner, and test or review reference before the release candidate. Undocumented copy growth is not an acceptable way to preserve v0.5 explanatory content.

Technical terms remain allowed in Diagnostics, About, advanced technical details, copyable reports, license/provenance text, and user-provided values. Default workflows must use the mapped UI term unless doing so would hide a blocker, privacy consequence, safety consequence, or legal/provenance requirement.

This ADR does not change any model, profile, vocabulary, training, import/export, privacy, security, or worker contract.

## Consequences

- Future v0.6 implementation issues must use `docs/planning/v0.6.0-terminology-copy-budgets.json` as the source of truth for default UI terminology and copy-budget checks.
- Static validation in `training/tests/test_v0_6_terminology_copy_budgets.py` keeps the terminology map, copy budgets, exception process, and ADR references in sync.
- Copy-budget automation can start with critical surfaces and grow as route implementations land; until then, issue-level reviews must document exceptions manually.
- Default UI copy can be shorter without removing expert diagnostics, because technical terms remain available in explicitly advanced or diagnostic locations.
- The map intentionally uses user-facing terms such as `Voice model`, `Speech model`, `Vocabulary`, and `Device storage`; implementation copy should not reintroduce unexplained implementation acronyms into default workflows.
