# ADR: v0.6.0 task-first information architecture

## Status

Accepted

## Context

`v0.6.0` redesigns the web PWA around a minimal, task-first UI while preserving all `v0.5.0` speech recognition, enrollment, browser-training, profile, portability, privacy, security, and compatibility contracts.

ADR 0008 captured the v0.5.0 UI inventory: one stacked route with 10 screen/panel surfaces, 8 current route or anchor destinations, 16 action surfaces, 6 workflow-state surfaces, and 127 user-facing strings. ADR 0009 captured baseline task evidence for 11 required v0.6 tasks. The baseline shows that v0.5 capabilities are present, but ordinary tasks compete with diagnostics, runtime status, roadmap copy, model lifecycle details, and training terminology on the same screen.

The v0.6 plan therefore needs an information-architecture decision before implementation can move controls, define redirects, or delete copy. The decision must reduce default UI complexity without hiding required actions, blockers, destructive consequences, privacy boundaries, recovery actions, or expert diagnostics.

## Decision

Adopt a task-first application shell with exactly three persistent primary destinations:

1. **Dictate** — speak, edit, copy, download, and clear transcript text, with in-place base-model setup when dictation is blocked by a missing required model.
2. **Vocabulary** — list, enable, create, edit, import, export, and manage local vocabulary sets and terms.
3. **Models** — create, enroll, train, evaluate, activate, roll back, import, export, rename, duplicate, and delete local voice models/profiles.

The persistent navigation may change layout by viewport, but not destination count:

- desktop and wide windows show the three text labels in the shell header;
- narrow windows show the same three text labels in a bottom navigation bar; and
- labels remain visible because primary navigation is not icon-only.

The application menu owns low-frequency and app-wide destinations:

- **Settings**;
- **Storage**;
- **Privacy**;
- **Keyboard shortcuts**;
- **Diagnostics**;
- **About**; and
- install/update actions when applicable.

The compact **Local** status indicator may remain in the shell as a state popover, but it is not a primary destination. It must describe local/offline state and required downloads without exposing model hashes, runtime versions, storage paths, or diagnostics by default.

No dashboard, marketing-style home screen, introductory carousel, feature-tour screen, or card grid for every feature will be introduced. The default route `/` is **Dictate**, because the first user task is to speak and obtain text. Discovery of vocabulary and voice-model workflows belongs to persistent navigation, not explanatory home-page copy.

Route ownership for v0.6 is:

| Route family                                                                                                                                                                         | Owner destination       | Notes                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| `/`                                                                                                                                                                                  | Dictate                 | Default task surface for recording/transcript work.                                |
| `/setup/model`                                                                                                                                                                       | Dictate / setup blocker | Used when base-model installation blocks dictation; may be reached directly.       |
| `/vocabulary`, `/vocabulary/new`, `/vocabulary/:setId`                                                                                                                               | Vocabulary              | Vocabulary list/detail/editor workflows.                                           |
| `/models`, `/models/new`, `/models/import`, `/models/:profileId`, `/models/:profileId/enroll`, `/models/:profileId/train`, `/models/:profileId/results`, `/models/:profileId/export` | Models                  | Personal model/profile lifecycle, enrollment, training, results, import/export.    |
| `/settings`, `/settings/audio`, `/settings/storage`, `/settings/privacy`, `/settings/shortcuts`, `/settings/diagnostics`                                                             | Application menu        | Dedicated app-wide settings, storage, privacy, shortcuts, and diagnostics screens. |
| `/about`                                                                                                                                                                             | Application menu        | Version, licenses, source, acknowledgements, and update state.                     |

Legacy v0.5 route and anchor aliases must redirect to the closest v0.6 route while preserving safe object IDs, return targets, and recoverable workflow state. Redirects must reject open redirects and must restore state from domain stores where possible instead of relying on URL step numbers alone.

This ADR does not change any domain schema, worker protocol, model-pack manifest, profile manifest, training-job schema, feature-shard schema, portable model format, vocabulary schema, storage layout, or privacy/security contract. Heavy work remains in existing packages and workers; UI route work must not move inference, feature extraction, browser training, archive parsing, encryption, hashing, or large storage operations onto the main thread.

## Consequences

- Future v0.6 issues must prove every v0.5 action in `docs/planning/v0.6.0-ui-inventory.json` has a reachable v0.6 path under Dictate, Vocabulary, Models, or an application-menu screen before the old stacked surface is removed.
- Primary workflows may use disclosures, menus, dialogs, and dedicated screens, but required choices, blockers, privacy consequences, destructive consequences, and recovery actions must remain visible at the point of need.
- Diagnostics, benchmark details, runtime providers, compatibility hashes, schema versions, storage paths, model IDs, and detailed training metrics move out of default workflows and into Diagnostics, About, or advanced details sections.
- Route migration and `UiPreferencesV1` work must remain additive and independently namespaced so rollback to the v0.5 application shell does not rewrite or delete domain data.
- The IA intentionally makes the initial UI smaller, but it increases the need for route, redirect, parity, keyboard, screen-reader, responsive, and copy-budget tests.
- Later v0.6 ADRs will separately decide progressive-disclosure rules and accessible primitive ownership; this ADR only fixes destination ownership and route intent.
