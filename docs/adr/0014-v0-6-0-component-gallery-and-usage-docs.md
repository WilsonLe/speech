# ADR 0014: v0.6.0 component gallery and usage documentation

- Status: Accepted
- Date: 2026-06-27
- Issue: #225
- Related: ADR 0010, ADR 0011, ADR 0012, `docs/planning/v0.6.0-component-gallery-contract.json`

## Context

v0.6.0 adds repository-owned UI primitives and needs a way to inspect their behaviour, accessibility coverage, and usage rules before those primitives are used across task-first screens. The gallery must not become a production destination, an onboarding screen, or a source of domain fixtures.

The production application default path is now the task-first Dictate workspace, with Vocabulary and Models as the other persistent primary destinations. The gallery remains a development-only inspection tool and must not become a production help center or onboarding screen.

## Decision

Add a development-only component gallery at `#ui-gallery`.

The gallery is loaded through a `React.lazy` import gated by `import.meta.env.DEV`. Production builds keep the default application path unchanged and do not emit a gallery chunk. The only accepted production bundle impact is the tiny route-helper branch needed to keep the gate typed and tested.

The committed gallery contract is `docs/planning/v0.6.0-component-gallery-contract.json`. It records:

- the development-only hash route;
- nonproduction/default-navigation exclusion;
- production bundle measurements;
- component-use rules;
- content-style rules;
- accessibility constraints;
- documented primitive coverage; and
- synthetic-fixture/privacy constraints.

## Consequences

- Primitive changes must update the shared `@speech/ui/testing` examples and the gallery contract/tests together.
- Gallery examples stay synthetic and task-focused. They must not import domain workers, storage, audio, archive, encryption, profile, transcript, model, or private vocabulary fixtures.
- Required privacy terms, destructive consequences, recovery actions, blockers, and primary task instructions must not be documented as tooltip/menu/toast/collapsed-panel-only content.
- The gallery may be used for local development and review, but not as a production route, marketing page, user-facing help center, or replacement for the README/component-use guide.
- Any future Storybook-equivalent replacement must preserve the same nonproduction, privacy, accessibility, and bundle-impact guarantees before removing this route.

## Validation

- `apps/web/src/app/component-gallery.test.tsx` verifies the development-only route gate, rendered usage sections, primitive coverage, and synthetic/privacy constraints.
- `training/tests/test_v0_6_component_gallery.py` verifies the contract, ADR, route implementation, and production bundle-impact expectations.
- Production build measurement for this change: JS/CSS selected total `930939` bytes before and `931206` bytes after, `+267` bytes, CSS unchanged, no production gallery chunk emitted.
