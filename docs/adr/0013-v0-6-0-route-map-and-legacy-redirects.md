# ADR: v0.6.0 route map and legacy redirects

## Status

Accepted

## Context

`v0.6.0` changes the application from the v0.5 single-page stacked interface into the task-first information architecture accepted in ADR 0010. Issue #216 needs a route map and legacy redirect contract before router, shell, UI preference, and feature-route implementation can depend on path names.

The v0.5 baseline inventory in `docs/planning/v0.6.0-ui-inventory.json` shows the current public navigation surface is `/` plus hash anchors such as `#offline-model-title`, `#diagnostics`, `#benchmark`, `#personal-models-title`, `#vocabulary-title`, `#microphone-title`, and `#runtime-title`. ADR 0011 requires route changes to keep blockers, consequences, and recovery visible at the point of need. ADR 0012 requires route labels and user-facing state to use the approved v0.6 terminology and copy budgets.

## Decision

Commit the route-map and legacy-redirect contract at:

- `docs/planning/v0.6.0-route-map.json`

The target route map has exactly three persistent primary destinations:

| Destination | Route         | Role                                                                                        |
| ----------- | ------------- | ------------------------------------------------------------------------------------------- |
| Dictate     | `/`           | Default dictation workspace                                                                 |
| Vocabulary  | `/vocabulary` | Vocabulary set list and editor entry point                                                  |
| Models      | `/models`     | Personal voice model list, enrollment, training, activation, import, and export entry point |

The application-menu and dedicated low-frequency routes are:

- `/settings`
- `/settings/audio`
- `/settings/storage`
- `/settings/privacy`
- `/settings/shortcuts`
- `/settings/diagnostics`
- `/about`
- `/setup/model`

The route contract also reserves task/detail routes for:

- `/vocabulary/new`
- `/vocabulary/:setId`
- `/models/new`
- `/models/import`
- `/models/:profileId`
- `/models/:profileId/enroll`
- `/models/:profileId/train`
- `/models/:profileId/results`
- `/models/:profileId/export`

The legacy v0.5 hash anchors redirect to the closest v0.6 route:

| Legacy URL                | v0.6 target                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `/`                       | `/`                                                                                      |
| `/#offline-model-title`   | `/setup/model`, or `/settings/storage` when a required setup blocker is absent           |
| `/#diagnostics`           | `/settings/diagnostics`                                                                  |
| `/#benchmark`             | `/settings/diagnostics?section=benchmark`                                                |
| `/#personal-models-title` | `/models`                                                                                |
| `/#vocabulary-title`      | `/vocabulary`                                                                            |
| `/#microphone-title`      | `/models/:profileId/enroll`, or `/settings/audio` when there is no enrollment context    |
| `/#runtime-title`         | `/models/:profileId/train`, or `/settings/diagnostics` when there is no training context |

Redirect implementation must preserve only documented safe query keys. Profile IDs, vocabulary-set IDs, job IDs, prompt IDs, candidate IDs, requested sections, and safe return targets may be preserved only after syntax validation and then domain-store validation. Domain storage remains authoritative; URLs cannot create profile, vocabulary, training, import, export, or model-pack state.

`returnTo` is accepted only as a same-origin relative path that resolves to a route in the target route map. Absolute URLs, protocol-relative URLs, backslashes, encoded slash/backslash traversal, dot-dot segments, JavaScript/data/blob/file schemes, and NUL/control characters are rejected. Unsafe return targets are dropped and the user lands on the destination's safe default route.

Route transitions must move focus to the new screen heading, current wizard prompt, blocker, or primary action. Back/return navigation should restore scroll and logical focus when the target still exists. Active recording, enrollment capture, training, import, export, and model updates continue under existing lifecycle contracts; navigation asks for confirmation only when it would discard unsaved UI edits or disrupt active capture.

This ADR defines route and redirect contracts only. It does not change model, profile, vocabulary, training, import/export, privacy, security, portability, or worker contracts.

## Consequences

- Router implementation must use `docs/planning/v0.6.0-route-map.json` as the source of truth for target paths, legacy redirects, safe query state, return-target validation, focus expectations, and scroll restoration expectations.
- Static validation in `training/tests/test_v0_6_route_map.py` keeps the three-destination route hierarchy, v0.5 redirect table, safe query state, safe return-target rejection, and contract references in sync.
- Route work can proceed before full screen implementation because each route records its owning destination, state source, focus target, and worker/domain boundary.
- v0.5 hash-anchor aliases remain supported until at least `v0.8.0`, and only after documentation plus tests show the aliases are no longer needed.
- Any future route addition for v0.6 must either belong to one of the three primary destinations, the application menu, or a documented task/detail screen; it must not introduce a dashboard/home-screen detour.
