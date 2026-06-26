import { describe, expect, it } from 'vitest';

import {
  createPersonalAnchorEndToEndEvaluationReport,
  type PersonalAnchorEvaluationCaseInputV1,
} from './personal-anchor-evaluation';

const baseModel = {
  id: 'local-dev-rnnt-mock',
  version: '0.0.0-test',
  manifestSha256: 'b'.repeat(64),
  graphContractSha256: 'c'.repeat(64),
};

describe('personal/anchor end-to-end evaluation reports', () => {
  it('evaluates generic, P1, and candidate configurations with aggregate activation gates', () => {
    const report = createPersonalAnchorEndToEndEvaluationReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      evaluationId: 'eval-browser-personal-anchor',
      profileId: 'profile-local',
      baseModel,
      cases: passingCases,
      artifact: {
        candidateAdapterSizeBytes: 128_000,
        candidateAdapterSha256: 'a'.repeat(64),
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      reportType: 'personal-anchor-end-to-end-evaluation',
      configurations: {
        generic: { configurationId: 'generic' },
        p1: { configurationId: 'p1' },
        candidate: { configurationId: 'candidate' },
      },
      summary: {
        caseCounts: { total: 4, personalHoldout: 2, anchor: 2 },
        selectedVocabulary: { selectedEntryCount: 2, selectedCaseCount: 2 },
        candidateAdapterSizeBytes: 128_000,
      },
      privacy: {
        aggregateOnly: true,
        containsAudio: false,
        containsTranscriptText: false,
        containsCaseIds: false,
        containsFeatureTensors: false,
        containsAdapterWeights: false,
        exposesRawVocabularyEntryIds: false,
        networkUpload: false,
        localOnly: true,
      },
    });
    expect(report.personalHoldout.metrics.generic.wordErrorRate).toEqual({
      numerator: 6,
      denominator: 18,
      rate: 0.333333,
    });
    expect(report.personalHoldout.metrics.p1.wordErrorRate.rate).toBe(0.277778);
    expect(report.personalHoldout.metrics.candidate.wordErrorRate.rate).toBe(0.166667);
    expect(report.personalHoldout.comparisons.candidateVsGeneric).toMatchObject({
      wordErrorRateDelta: -0.166666,
      wordErrorRateRelativeImprovement: 0.499998,
      customTermRecallDelta: 0.5,
    });
    expect(report.personalHoldout.comparisons.candidateVsP1.wordErrorRateDelta).toBe(-0.111111);
    expect(report.anchor.comparisons.candidateVsGeneric.wordErrorRateDelta).toBe(0);
    expect(report.overall.comparisons.candidateVsP1.realTimeFactorOverheadRatio).toBe(0.08);
    expect(report.activationGate.passed).toBe(true);
    expect(report.activationGate.automaticActivationAllowed).toBe(true);
    expect(report.activationGate.checks.map((check) => check.name)).toEqual([
      'personal-improvement-vs-generic',
      'candidate-parity-vs-p1',
      'anchor-regression-vs-generic',
      'slice-regression-vs-generic',
      'rtf-overhead-vs-p1',
      'false-insertion-regression-vs-generic',
      'candidate-adapter-size',
    ]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/case-personal|case-anchor|term-secret|term-dashboard/i);
    expect(serialized).not.toMatch(/Project Condor|reference text|raw pcm|feature tensor/i);
  });

  it('fails when candidate regresses anchors, slices, P1 parity, RTF, false insertions, and size', () => {
    const report = createPersonalAnchorEndToEndEvaluationReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      evaluationId: 'eval-regressed',
      profileId: 'profile-local',
      baseModel,
      cases: regressedCases,
      artifact: { candidateAdapterSizeBytes: 20_000_000 },
    });
    const checks = new Map(report.activationGate.checks.map((check) => [check.name, check]));

    expect(report.activationGate.passed).toBe(false);
    expect(checks.get('personal-improvement-vs-generic')?.passed).toBe(false);
    expect(checks.get('candidate-parity-vs-p1')?.passed).toBe(false);
    expect(checks.get('anchor-regression-vs-generic')?.passed).toBe(false);
    expect(checks.get('slice-regression-vs-generic')?.passed).toBe(false);
    expect(checks.get('rtf-overhead-vs-p1')?.passed).toBe(false);
    expect(checks.get('false-insertion-regression-vs-generic')?.passed).toBe(false);
    expect(checks.get('candidate-adapter-size')?.passed).toBe(false);
    expect(report.activationGate.reasons).toEqual([
      'Candidate did not meet the personal held-out improvement threshold.',
      'Candidate regressed against the P1 speaker-profile baseline.',
      'Candidate exceeded the generic-anchor WER regression budget.',
      'Candidate exceeded a language or voice-condition slice regression budget.',
      'Candidate exceeded the RTF overhead budget relative to P1.',
      'Candidate exceeded the false custom-term insertion budget.',
      'Candidate adapter exceeded the configured size budget.',
    ]);
  });

  it('rejects missing required splits and private anchor vocabulary metadata', () => {
    expect(() =>
      createPersonalAnchorEndToEndEvaluationReport({
        generatedAt: '2026-06-26T00:00:00.000Z',
        evaluationId: 'eval-missing-anchor',
        profileId: 'profile-local',
        baseModel,
        cases: passingCases.filter((testCase) => testCase.split === 'personal-holdout'),
        artifact: { candidateAdapterSizeBytes: 128_000 },
      }),
    ).toThrow(/anchor case/);

    expect(() =>
      createPersonalAnchorEndToEndEvaluationReport({
        generatedAt: '2026-06-26T00:00:00.000Z',
        evaluationId: 'eval-private-anchor',
        profileId: 'profile-local',
        baseModel,
        cases: [
          passingCases[0]!,
          { ...passingCases[2]!, selectedVocabularyEntryIds: ['term-secret'] },
        ],
        artifact: { candidateAdapterSizeBytes: 128_000 },
      }),
    ).toThrow(/Anchor evaluation cases must not expose selected vocabulary/);
  });
});

const passingCases: readonly PersonalAnchorEvaluationCaseInputV1[] = [
  {
    id: 'case-personal-vi-secret',
    split: 'personal-holdout',
    language: 'vi',
    voiceCondition: 'normal',
    selectedVocabularyEntryIds: ['term-secret', 'term-secret'],
    generic: metrics({ words: 10, wordErrors: 4, chars: 40, charErrors: 8, termHits: 0, rtf: 0.2 }),
    p1: metrics({ words: 10, wordErrors: 3, chars: 40, charErrors: 6, termHits: 0, rtf: 0.2 }),
    candidate: metrics({
      words: 10,
      wordErrors: 2,
      chars: 40,
      charErrors: 4,
      termHits: 1,
      rtf: 0.216,
    }),
  },
  {
    id: 'case-personal-en-dashboard',
    split: 'personal-holdout',
    language: 'en',
    voiceCondition: 'whisper',
    selectedVocabularyEntryIds: ['term-dashboard'],
    generic: metrics({ words: 8, wordErrors: 2, chars: 30, charErrors: 4, termHits: 1, rtf: 0.2 }),
    p1: metrics({ words: 8, wordErrors: 2, chars: 30, charErrors: 3, termHits: 1, rtf: 0.2 }),
    candidate: metrics({
      words: 8,
      wordErrors: 1,
      chars: 30,
      charErrors: 2,
      termHits: 1,
      rtf: 0.216,
    }),
  },
  {
    id: 'case-anchor-vi',
    split: 'anchor',
    language: 'vi',
    voiceCondition: 'normal',
    nonTargetCustomTermUtterance: true,
    generic: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.2 }),
    p1: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.2 }),
    candidate: metrics({ words: 9, wordErrors: 1, chars: 38, charErrors: 2, terms: 0, rtf: 0.216 }),
  },
  {
    id: 'case-anchor-mixed',
    split: 'anchor',
    language: 'mixed',
    voiceCondition: 'projected',
    nonTargetCustomTermUtterance: true,
    generic: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.2 }),
    p1: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.2 }),
    candidate: metrics({ words: 7, wordErrors: 1, chars: 25, charErrors: 2, terms: 0, rtf: 0.216 }),
  },
];

const regressedCases: readonly PersonalAnchorEvaluationCaseInputV1[] = [
  {
    ...passingCases[0]!,
    candidate: {
      ...passingCases[0]!.candidate,
      wordErrorCount: 6,
      characterErrorCount: 12,
      recalledCustomTermCount: 0,
      realTimeFactor: 0.35,
      falseCustomTermInsertionCount: 1,
    },
  },
  {
    ...passingCases[1]!,
    candidate: {
      ...passingCases[1]!.candidate,
      wordErrorCount: 4,
      characterErrorCount: 8,
      recalledCustomTermCount: 1,
      realTimeFactor: 0.35,
    },
  },
  {
    ...passingCases[2]!,
    candidate: {
      ...passingCases[2]!.candidate,
      wordErrorCount: 4,
      characterErrorCount: 8,
      falseCustomTermInsertionCount: 1,
      realTimeFactor: 0.35,
    },
  },
  {
    ...passingCases[3]!,
    candidate: {
      ...passingCases[3]!.candidate,
      wordErrorCount: 3,
      characterErrorCount: 6,
      falseCustomTermInsertionCount: 1,
      realTimeFactor: 0.35,
    },
  },
];

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
