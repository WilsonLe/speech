# ADR: v0.6.0 UI inventory baseline

## Status

Accepted

## Context

`v0.6.0` redesigns the web PWA around a minimal, task-first UI while preserving the `v0.5.0` speech, enrollment, training, portability, privacy, and compatibility contracts. The v0.5.0 web app is a single-page shell that stacks Dictate, Vocabulary, Personal Models, model lifecycle, diagnostics, benchmark, microphone/enrollment, runtime/training, and roadmap sections on `/` with anchor links.

Before implementation can safely remove copy or move controls behind routes, menus, or disclosures, the current route, screen, action, state, and string surfaces need a committed baseline. The repository markdown guard allows ADRs under `docs/adr/*.md`; the larger machine-readable inventory is stored as JSON at `docs/planning/v0.6.0-ui-inventory.json` so it does not create a new markdown documentation location.

## Decision

The `v0.5.0` UI baseline for the `v0.6.0` redesign is captured in `docs/planning/v0.6.0-ui-inventory.json`.

The inventory records:

- the current single route `/` and anchor destinations;
- each top-level v0.5 screen/panel and its v0.6 destination;
- current workflow states and worker-originated state surfaces visible in the app;
- current user actions and their v0.6 treatment;
- user-facing strings, accessible labels, status messages, privacy copy, diagnostic text, and their proposed disposition; and
- static validation ownership.

The v0.6 destination mapping is:

- default route `/` becomes **Dictate**;
- vocabulary sections move to **Vocabulary** list/detail routes;
- profile, enrollment, training, result, activation, import, and export surfaces move to **Models** routes;
- offline base-model setup appears in Dictate when blocking and otherwise in setup/storage screens;
- diagnostics, benchmark, runtime details, and support bundles move behind the app menu under **Diagnostics**;
- privacy statements move to **Privacy** and point-of-action disclosures;
- roadmap/release status moves to **About** or release notes; and
- obsolete hero/dashboard explanatory copy is removed rather than migrated.

Static validation in `training/tests/test_v0_6_ui_inventory.py` must keep the inventory parseable, require expected source files and screens, and verify every inventory entry has an allowed v0.6 destination and a disposition.

## Consequences

- Future v0.6 issues should treat the JSON inventory as the baseline parity checklist when moving controls, deleting copy, or creating redirects.
- This ADR is not the task-first information-architecture decision; issue #213 will record that product decision separately.
- The inventory is a baseline snapshot of the v0.5.0 release commit, not a live string extractor. Later UI PRs may update their own route/copy tests without rewriting this snapshot unless they intentionally revise the baseline record.
- No private recordings, transcripts, profile artifacts, vocabulary terms from real users, or screenshots are committed as part of this inventory.
