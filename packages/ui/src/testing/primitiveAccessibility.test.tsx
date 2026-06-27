import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  auditSpeechPrimitiveExampleMarkup,
  auditSpeechPrimitiveInteractionCoverage,
  speechPrimitiveAutomatedAccessibilityChecks,
  speechPrimitiveTestingUsageGuide,
  summarizeSpeechPrimitiveAccessibilityAudits,
} from './primitiveAudit';
import {
  speechPrimitiveAccessibilityExamples,
  speechPrimitiveExampleStateCoverage,
  speechPrimitiveInteractionRequirements,
  speechPrimitiveKeyboardTestMatrix,
} from './primitiveExamples';

const currentDir = dirname(fileURLToPath(import.meta.url));
const cssByEntry = new Map(
  Object.entries({
    'button.css': readFileSync(resolve(currentDir, '../primitives/button.css'), 'utf8'),
    'dialog.css': readFileSync(resolve(currentDir, '../primitives/dialog.css'), 'utf8'),
    'disclosure.css': readFileSync(resolve(currentDir, '../primitives/disclosure.css'), 'utf8'),
    'feedback.css': readFileSync(resolve(currentDir, '../feedback/index.css'), 'utf8'),
    'form-controls.css': readFileSync(
      resolve(currentDir, '../primitives/form-controls.css'),
      'utf8',
    ),
    'menu.css': readFileSync(resolve(currentDir, '../primitives/menu.css'), 'utf8'),
  }),
);

const expectedPrimitiveNames = [
  'Accordion',
  'Button',
  'Dialog',
  'Disclosure',
  'EmptyState',
  'IconButton',
  'InlineError',
  'LoadingState',
  'MenuButton',
  'Notice',
  'Progress',
  'RadioGroup',
  'Select',
  'Status',
  'Toast',
  'Tooltip',
] as const;

function renderedExampleById() {
  return new Map(
    speechPrimitiveAccessibilityExamples.map((example) => [
      example.id,
      renderToStaticMarkup(example.element),
    ]),
  );
}

describe('primitive accessibility example harness', () => {
  it('renders one audited example for every primitive family', () => {
    const primitiveNames = new Set(
      speechPrimitiveAccessibilityExamples.map((example) => example.primitive),
    );

    for (const primitiveName of expectedPrimitiveNames) {
      expect(primitiveNames.has(primitiveName), `${primitiveName} example missing`).toBe(true);
    }

    expect(speechPrimitiveAccessibilityExamples.length).toBeGreaterThanOrEqual(
      expectedPrimitiveNames.length,
    );
  });

  it('passes automated static accessibility checks for every primitive example', () => {
    const htmlById = renderedExampleById();
    const results = speechPrimitiveAccessibilityExamples.map((example) =>
      auditSpeechPrimitiveExampleMarkup(example, htmlById.get(example.id) ?? ''),
    );

    expect(summarizeSpeechPrimitiveAccessibilityAudits(results)).toEqual([]);
    expect(speechPrimitiveAutomatedAccessibilityChecks).toEqual([
      'required-markup-present',
      'forbidden-markup-absent',
      'aria-state-exposed',
      'hidden-content-marked-hidden',
      'keyboard-matrix-present',
      'disabled-loading-state-exposed',
      'css-state-token-coverage',
    ]);
  });

  it('covers every required interaction category from the v0.6 primitive test contract', () => {
    const coverage = auditSpeechPrimitiveInteractionCoverage();

    expect(coverage.missingRequirements).toEqual([]);
    expect(coverage.coveredRequirements).toEqual(
      [...speechPrimitiveInteractionRequirements].sort(),
    );
    expect(coverage.exampleCount).toBe(speechPrimitiveAccessibilityExamples.length);
  });

  it('keeps deterministic keyboard matrices for focus, Escape, native activation, and form controls', () => {
    const keyboardRows = speechPrimitiveKeyboardTestMatrix.filter(
      (row) => row.keyboardKeys.length > 0,
    );

    expect(keyboardRows.length).toBeGreaterThan(8);
    expect(keyboardRows.some((row) => row.keyboardKeys.includes('Escape'))).toBe(true);
    expect(keyboardRows.some((row) => row.keyboardKeys.includes('Tab'))).toBe(true);
    expect(keyboardRows.some((row) => row.keyboardKeys.includes('Shift+Tab'))).toBe(true);
    expect(keyboardRows.some((row) => row.keyboardKeys.includes('ArrowDown'))).toBe(true);
    expect(keyboardRows.some((row) => row.keyboardKeys.includes('Space'))).toBe(true);
    expect(keyboardRows.every((row) => row.exampleId.length > 0 && row.primitive.length > 0)).toBe(
      true,
    );
  });

  it('verifies hidden examples include focusable descendants behind hidden containers', () => {
    const htmlById = renderedExampleById();
    const hiddenExamples = speechPrimitiveAccessibilityExamples.filter((example) =>
      example.interactionRequirements.includes('hidden-focusability'),
    );

    expect(hiddenExamples.length).toBeGreaterThanOrEqual(3);

    for (const example of hiddenExamples) {
      const html = htmlById.get(example.id) ?? '';
      expect(html, `${example.id} should mark hidden content`).toContain('hidden=""');
      expect(html, `${example.id} should exercise focusable hidden descendants`).toMatch(
        /<button|role="menuitem"/,
      );
    }
  });

  it('maps every primitive example to CSS state requirements for forced colours and reduced motion', () => {
    for (const example of speechPrimitiveAccessibilityExamples) {
      const css = cssByEntry.get(example.cssEntry);
      expect(css, `${example.cssEntry} missing from test map`).toBeDefined();

      for (const requirement of example.cssRequirements) {
        expect(css, `${example.id} missing CSS requirement ${requirement}`).toContain(requirement);
      }
    }
  });

  it('keeps the state fixture registry finite and worker/domain independent', () => {
    expect(speechPrimitiveExampleStateCoverage.requirements).toEqual(
      speechPrimitiveInteractionRequirements,
    );
    expect(speechPrimitiveExampleStateCoverage.variants).toEqual([
      'primary',
      'secondary',
      'ghost',
      'danger',
    ]);
    expect(speechPrimitiveExampleStateCoverage.sizes).toEqual(['sm', 'md', 'lg']);

    const serializedExamples = speechPrimitiveAccessibilityExamples
      .map((example) => `${example.id} ${example.purpose}`)
      .join('\n');

    expect(serializedExamples).not.toMatch(/audio|worker|archive|encrypt|profile-|prompt-|case-/i);
  });

  it('documents how feature screens should use the reusable primitive test helpers', () => {
    expect(speechPrimitiveTestingUsageGuide).toContain(
      'Import primitive examples from @speech/ui/testing when adding app screen fixtures; do not duplicate local accessibility assumptions in feature tests.',
    );
    expect(speechPrimitiveTestingUsageGuide).toContain(
      'Keep domain workers, storage, audio, archive parsing, encryption, and profile data out of primitive accessibility fixtures.',
    );
  });
});
