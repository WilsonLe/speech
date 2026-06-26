import { describe, expect, it } from 'vitest';
import {
  createPersonalAnchorEndToEndEvaluationReport,
  type PersonalAnchorEvaluationCaseInputV1,
} from './personal-anchor-evaluation';
import { createPersonalModelActivationDecision } from './activation-decision';

const baseModel = {
  id: 'vietasr-local',
  version: '2026.01',
  manifestSha256: 'a'.repeat(64),
  graphContractSha256: 'b'.repeat(64),
};

describe('personal model activation decisions', () => {
  it('allows automatic activation when all hard and soft gates pass', () => {
    const report = createReport(passingCases, 'private-profile-id');

    const decision = createPersonalModelActivationDecision({
      report,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(decision.status).toBe('automatic-activation-allowed');
    expect(decision.activationAllowed).toBe(true);
    expect(decision.automaticActivationAllowed).toBe(true);
    expect(decision.hardGatePassed).toBe(true);
    expect(decision.softGatePassed).toBe(true);
    expect(decision.actions).toMatchObject({
      activationSwap: 'utterance-boundary',
      retainPreviousAdapter: true,
      rollbackAvailable: true,
      genericFallbackAvailable: true,
    });
    expect(decision.hardGates.map((gate) => gate.name)).toEqual([
      'anchor-regression-vs-generic',
      'slice-regression-vs-generic',
      'candidate-adapter-size',
    ]);
    expect(decision.comparison.profileFingerprint).toMatch(/^redacted-fnv1a32:[a-f0-9]{8}$/u);
    expect(JSON.stringify(decision)).not.toContain('private-profile-id');
    expect(JSON.stringify(decision)).not.toContain('case-personal-secret');
    expect(JSON.stringify(decision)).not.toContain('term-secret');
  });

  it('requires explicit advanced override when only soft gates fail', () => {
    const report = createReport(softRegressedCases, 'profile-soft-failure');

    const decision = createPersonalModelActivationDecision({
      report,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(decision.status).toBe('advanced-override-required');
    expect(decision.activationAllowed).toBe(false);
    expect(decision.advancedOverrideAvailable).toBe(true);
    expect(decision.advancedOverrideRequired).toBe(true);
    expect(decision.hardGatePassed).toBe(true);
    expect(decision.softGatePassed).toBe(false);
    expect(decision.reasons).toContain(
      'Soft activation gates failed; explicit advanced override is required.',
    );

    const overridden = createPersonalModelActivationDecision({
      report,
      generatedAt: '2026-01-01T00:00:00.000Z',
      advancedOverride: {
        accepted: true,
        reason: 'Human review accepts the soft-gate risk for a local experiment.',
        acceptedAt: '2026-01-01T00:01:00.000Z',
      },
    });
    expect(overridden.status).toBe('advanced-override-accepted');
    expect(overridden.activationAllowed).toBe(true);
    expect(overridden.automaticActivationAllowed).toBe(false);
  });

  it('blocks activation when hard gates fail, even with an advanced override', () => {
    const report = createReport(hardRegressedCases, 'profile-hard-failure');

    const decision = createPersonalModelActivationDecision({
      report,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(decision.status).toBe('blocked-by-hard-gates');
    expect(decision.activationAllowed).toBe(false);
    expect(decision.advancedOverrideAvailable).toBe(false);
    expect(decision.hardGatePassed).toBe(false);
    expect(decision.reasons).toContain(
      'Hard activation gates failed; keep the generic or previous adapter active.',
    );

    expect(() =>
      createPersonalModelActivationDecision({
        report,
        generatedAt: '2026-01-01T00:00:00.000Z',
        advancedOverride: {
          accepted: true,
          reason: 'Trying to override a hard gate should still fail.',
          acceptedAt: '2026-01-01T00:01:00.000Z',
        },
      }),
    ).toThrow(/hard gates pass/);
  });
});

function createReport(cases: readonly PersonalAnchorEvaluationCaseInputV1[], profileId: string) {
  return createPersonalAnchorEndToEndEvaluationReport({
    generatedAt: '2026-01-01T00:00:00.000Z',
    evaluationId: 'eval-activation-review',
    profileId,
    baseModel,
    cases,
    artifact: {
      candidateAdapterSizeBytes: 4096,
      candidateAdapterSha256: 'c'.repeat(64),
    },
  });
}

const passingCases: readonly PersonalAnchorEvaluationCaseInputV1[] = [
  {
    id: 'case-personal-secret',
    split: 'personal-holdout',
    language: 'vi',
    voiceCondition: 'normal',
    selectedVocabularyEntryIds: ['term-secret'],
    generic: metrics({ words: 10, wordErrors: 4, chars: 40, charErrors: 8, termHits: 0, rtf: 0.2 }),
    p1: metrics({ words: 10, wordErrors: 3, chars: 40, charErrors: 6, termHits: 0, rtf: 0.2 }),
    candidate: metrics({
      words: 10,
      wordErrors: 2,
      chars: 40,
      charErrors: 4,
      termHits: 1,
      rtf: 0.21,
    }),
  },
  {
    id: 'case-personal-public',
    split: 'personal-holdout',
    language: 'en',
    voiceCondition: 'whisper',
    generic: metrics({ words: 8, wordErrors: 2, chars: 30, charErrors: 4, termHits: 1, rtf: 0.2 }),
    p1: metrics({ words: 8, wordErrors: 2, chars: 30, charErrors: 3, termHits: 1, rtf: 0.2 }),
    candidate: metrics({
      words: 8,
      wordErrors: 1,
      chars: 30,
      charErrors: 2,
      termHits: 1,
      rtf: 0.21,
    }),
  },
  {
    id: 'case-anchor-clean',
    split: 'anchor',
    language: 'vi',
    voiceCondition: 'normal',
    nonTargetCustomTermUtterance: true,
    generic: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.2 }),
    p1: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.2 }),
    candidate: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.21 }),
  },
  {
    id: 'case-anchor-mixed',
    split: 'anchor',
    language: 'mixed',
    voiceCondition: 'projected',
    nonTargetCustomTermUtterance: true,
    generic: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.2 }),
    p1: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.2 }),
    candidate: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.21 }),
  },
];

const softRegressedCases: readonly PersonalAnchorEvaluationCaseInputV1[] = passingCases.map(
  (testCase) =>
    testCase.split === 'personal-holdout'
      ? {
          ...testCase,
          candidate: {
            ...testCase.generic,
            realTimeFactor: 0.21,
          },
        }
      : testCase,
);

const hardRegressedCases: readonly PersonalAnchorEvaluationCaseInputV1[] = passingCases.map(
  (testCase) =>
    testCase.split === 'anchor'
      ? {
          ...testCase,
          candidate: {
            ...testCase.candidate,
            wordErrorCount: testCase.candidate.wordErrorCount + 3,
            characterErrorCount: testCase.candidate.characterErrorCount + 6,
          },
        }
      : testCase,
);

function metrics(input: {
  readonly words: number;
  readonly wordErrors: number;
  readonly chars: number;
  readonly charErrors: number;
  readonly termHits?: number;
  readonly terms?: number;
  readonly rtf: number;
}): PersonalAnchorEvaluationCaseInputV1['generic'] {
  const expectedCustomTermCount = input.terms ?? 1;
  return {
    referenceWordCount: input.words,
    wordErrorCount: input.wordErrors,
    referenceCharacterCount: input.chars,
    characterErrorCount: input.charErrors,
    switchBoundaryCount: 1,
    switchBoundaryErrorCount: 0,
    expectedCustomTermCount,
    recalledCustomTermCount: input.termHits ?? 0,
    falseCustomTermInsertionCount: 0,
    firstPartialLatencyMs: 240,
    finalizationLatencyMs: 220,
    realTimeFactor: input.rtf,
  };
}
