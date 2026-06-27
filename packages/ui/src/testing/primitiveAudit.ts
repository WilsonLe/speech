import {
  speechPrimitiveAccessibilityExamples,
  speechPrimitiveInteractionRequirements,
  type SpeechPrimitiveAccessibilityExample,
  type SpeechPrimitiveInteractionRequirement,
} from './primitiveExamples';

export interface SpeechPrimitiveAccessibilityAuditResult {
  readonly exampleId: string;
  readonly primitive: string;
  readonly failures: readonly string[];
}

export interface SpeechPrimitiveCoverageAuditResult {
  readonly coveredRequirements: readonly SpeechPrimitiveInteractionRequirement[];
  readonly missingRequirements: readonly SpeechPrimitiveInteractionRequirement[];
  readonly exampleCount: number;
}

export const speechPrimitiveAutomatedAccessibilityChecks = [
  'required-markup-present',
  'forbidden-markup-absent',
  'aria-state-exposed',
  'hidden-content-marked-hidden',
  'keyboard-matrix-present',
  'disabled-loading-state-exposed',
  'css-state-token-coverage',
] as const;

export const speechPrimitiveTestingUsageGuide = [
  'Import primitive examples from @speech/ui/testing when adding app screen fixtures; do not duplicate local accessibility assumptions in feature tests.',
  'Run auditSpeechPrimitiveExampleMarkup against rendered examples to catch missing labels, ARIA state, hidden content, and unsafe markup before adding screenshot-only checks.',
  'Use auditSpeechPrimitiveInteractionCoverage before release hardening to prove keyboard, Escape, focus, pointer/touch, reduced-motion, forced-colours, hidden-focusability, and disabled/loading states stay covered.',
  'Keep domain workers, storage, audio, archive parsing, encryption, and profile data out of primitive accessibility fixtures.',
] as const;

export type SpeechPrimitiveAutomatedAccessibilityCheck =
  (typeof speechPrimitiveAutomatedAccessibilityChecks)[number];

export function auditSpeechPrimitiveExampleMarkup(
  example: SpeechPrimitiveAccessibilityExample,
  html: string,
): SpeechPrimitiveAccessibilityAuditResult {
  const failures: string[] = [];

  for (const requiredMarkup of example.requiredMarkup) {
    if (!html.includes(requiredMarkup)) {
      failures.push(`missing required markup: ${requiredMarkup}`);
    }
  }

  for (const forbiddenMarkup of example.forbiddenMarkup ?? []) {
    if (html.includes(forbiddenMarkup)) {
      failures.push(`contains forbidden markup: ${forbiddenMarkup}`);
    }
  }

  if (example.interactionRequirements.includes('aria-state') && !html.includes('aria-')) {
    failures.push('aria-state requirement without aria-* markup');
  }

  if (
    example.interactionRequirements.includes('hidden-focusability') &&
    !html.includes('hidden=""')
  ) {
    failures.push('hidden-focusability requirement without hidden markup');
  }

  if (example.interactionRequirements.includes('disabled-loading')) {
    const exposesDisabled = html.includes('disabled=""') || html.includes('aria-busy="true"');
    const exposesLoading =
      html.includes('aria-busy="true"') || html.includes('data-loading="true"');

    if (!exposesDisabled || !exposesLoading) {
      failures.push('disabled/loading requirement without disabled or busy state');
    }
  }

  if (example.keyboardKeys !== undefined && example.keyboardKeys.length === 0) {
    failures.push('keyboard example has an empty key matrix');
  }

  return {
    exampleId: example.id,
    primitive: example.primitive,
    failures,
  };
}

export function auditSpeechPrimitiveInteractionCoverage(
  examples: readonly SpeechPrimitiveAccessibilityExample[] = speechPrimitiveAccessibilityExamples,
): SpeechPrimitiveCoverageAuditResult {
  const coveredRequirements = new Set<SpeechPrimitiveInteractionRequirement>();

  for (const example of examples) {
    for (const requirement of example.interactionRequirements) {
      coveredRequirements.add(requirement);
    }
  }

  const missingRequirements = speechPrimitiveInteractionRequirements.filter(
    (requirement) => !coveredRequirements.has(requirement),
  );

  return {
    coveredRequirements: [...coveredRequirements].sort(),
    missingRequirements,
    exampleCount: examples.length,
  };
}

export function summarizeSpeechPrimitiveAccessibilityAudits(
  results: readonly SpeechPrimitiveAccessibilityAuditResult[],
): readonly string[] {
  return results.flatMap((result) =>
    result.failures.map((failure) => `${result.exampleId} (${result.primitive}): ${failure}`),
  );
}
