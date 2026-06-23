import { describe, expect, it } from 'vitest';
import { analyzeEnrollmentTakeQuality, type EnrollmentQualityReportV1 } from '@speech/enrollment';
import {
  aggregateSpeakerEmbeddings,
  createHeldOutProfileEvaluationReport,
  encodeSpeakerEmbeddingCandidate,
  evaluationMetricsFromHeldOutReport,
  parseSpeakerEmbeddingVector,
  serializeSpeakerEmbeddingVector,
  type HeldOutProfileEvaluationCaseInputV1,
  type SpeakerEmbeddingCandidateV1,
} from './index';

const sampleRateHz = 16_000;

describe('speaker embedding personalization', () => {
  it('encodes deterministic local speaker candidates without retaining audio or transcript text', () => {
    const pcm = makeTone(1_200, 220, 0.12);
    const quality = makeQuality(pcm, 'normal');
    const first = encodeSpeakerEmbeddingCandidate({
      utteranceId: 'utt-001',
      pcm,
      sampleRateHz,
      language: 'mixed',
      voiceCondition: 'normal',
      quality,
    });
    const second = encodeSpeakerEmbeddingCandidate({
      utteranceId: 'utt-001',
      pcm,
      sampleRateHz,
      language: 'mixed',
      voiceCondition: 'normal',
      quality,
    });

    expect(first.dimension).toBe(32);
    expect(first.source).toMatchObject({
      kind: 'signal-statistics-baseline',
      noGradientTraining: true,
    });
    expect(first.privacy).toEqual({
      containsAudio: false,
      containsTranscriptText: false,
      localOnly: true,
    });
    expect(first.vector).toEqual(second.vector);
    expect(first.l2Norm).toBeCloseTo(1, 6);
  });

  it('aggregates usable candidates into one normalized no-gradient speaker profile', () => {
    const candidates = [
      candidate('utt-001', 220, 'normal'),
      candidate('utt-002', 224, 'projected'),
      candidate('utt-003', 218, 'whisper'),
    ];

    const profile = aggregateSpeakerEmbeddings(candidates);

    expect(profile.schemaVersion).toBe(1);
    expect(profile.dimension).toBe(32);
    expect(profile.l2Norm).toBeCloseTo(1, 6);
    expect(profile.acceptedCount).toBe(3);
    expect(profile.rejectedCount).toBe(0);
    expect(profile.acceptedUtteranceIds).toEqual(['utt-001', 'utt-002', 'utt-003']);
    expect(profile.channel.voiceConditionCounts).toEqual({ whisper: 1, normal: 1, projected: 1 });
    expect(profile.privacy.containsAudio).toBe(false);
  });

  it('rejects low-quality takes before aggregation', () => {
    const good = candidate('utt-good', 220, 'normal');
    const clipped = candidate('utt-clipped', 220, 'normal', {
      quality: {
        ...good.quality,
        clippingRatio: 0.2,
      },
    });

    const profile = aggregateSpeakerEmbeddings([good, clipped], {
      minAcceptedAfterOutlierRemoval: 1,
    });

    expect(profile.acceptedUtteranceIds).toEqual(['utt-good']);
    expect(profile.rejectedCandidates).toEqual([
      { utteranceId: 'utt-clipped', reasons: ['clipping'] },
    ]);
  });

  it('rejects vector outliers while preserving similar takes', () => {
    const candidates = [
      candidate('utt-001', 220, 'normal'),
      candidate('utt-002', 221, 'normal'),
      candidate('utt-003', 222, 'normal'),
      invertCandidate(candidate('utt-outlier', 220, 'normal')),
    ];

    const profile = aggregateSpeakerEmbeddings(candidates, {
      minCosineSimilarity: 0.2,
      minAcceptedAfterOutlierRemoval: 2,
    });

    expect(profile.acceptedUtteranceIds).toEqual(['utt-001', 'utt-002', 'utt-003']);
    expect(profile.rejectedCandidates).toHaveLength(1);
    expect(profile.rejectedCandidates[0]).toMatchObject({
      utteranceId: 'utt-outlier',
      reasons: ['outlier'],
    });
  });

  it('refuses to aggregate mismatched embedding dimensions', () => {
    const good = candidate('utt-good', 220, 'normal');
    const otherGood = candidate('utt-other-good', 222, 'normal');
    const wrongDimension: SpeakerEmbeddingCandidateV1 = {
      ...good,
      utteranceId: 'utt-wrong-dimension',
      dimension: 16,
      vector: good.vector.slice(0, 16),
    };

    const profile = aggregateSpeakerEmbeddings([wrongDimension, good, otherGood], {
      minAcceptedAfterOutlierRemoval: 1,
    });

    expect(profile.acceptedUtteranceIds).toEqual(['utt-good', 'utt-other-good']);
    expect(profile.rejectedCandidates).toEqual([
      { utteranceId: 'utt-wrong-dimension', reasons: ['dimension-mismatch'] },
    ]);
  });

  it('serializes and parses Float32 speaker vectors', () => {
    const original = new Float32Array([0.25, -0.5, 0.75]);
    const bytes = serializeSpeakerEmbeddingVector(original);
    const parsed = parseSpeakerEmbeddingVector(bytes);

    expect(Array.from(parsed)).toEqual(Array.from(original));
  });
});

describe('held-out base-vs-profile evaluation reports', () => {
  it('creates an aggregate-only comparison report with slices and manifest metric snapshots', () => {
    const report = createHeldOutProfileEvaluationReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      evaluationId: 'eval-local-heldout',
      profileId: 'profile-local',
      baseModel: modelIdentity,
      adaptationType: 'speaker-embedding',
      heldOutSet: {
        id: 'synthetic-heldout-v1',
        sentenceBankVersion: 'synthetic-bank-1',
        notes: ['Synthetic aggregate fixture; no audio or transcript text included.'],
      },
      cases: heldOutCases,
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      reportType: 'held-out-profile-evaluation',
      profileId: 'profile-local',
      heldOutSet: { split: 'held-out', caseCount: 3 },
      privacy: {
        containsAudio: false,
        containsTranscriptText: false,
        containsRawProfileData: false,
        containsModelWeights: false,
        networkUpload: false,
        localOnly: true,
      },
      summary: {
        caseCount: 3,
        languageCounts: { vi: 1, en: 1, mixed: 1 },
        voiceConditionCounts: { whisper: 1, normal: 1, projected: 1 },
      },
    });
    expect(metric(report.overall, 'wordErrorRate')).toMatchObject({
      base: { numerator: 8, denominator: 25, rate: 0.32 },
      profile: { numerator: 5, denominator: 25, rate: 0.2 },
      status: 'improved',
    });
    expect(metric(report.overall, 'customTermRecall')).toMatchObject({
      base: { numerator: 1, denominator: 2, rate: 0.5 },
      profile: { numerator: 2, denominator: 2, rate: 1 },
      status: 'improved',
    });
    expect(
      metric(report.overall, 'falseCustomTermInsertionsPer100NonTargetUtterances'),
    ).toMatchObject({
      base: { numerator: 0, denominator: 1, rate: 0 },
      profile: { numerator: 0, denominator: 1, rate: 0 },
    });
    expect(metric(report.overall, 'realTimeFactor')).toMatchObject({
      base: { count: 3, mean: 0.2, median: 0.2 },
      profile: { count: 3, mean: 0.206667, median: 0.21 },
    });
    expect(report.slices.map((slice) => slice.id)).toEqual([
      'language:vi',
      'language:en',
      'language:mixed',
      'voice-condition:whisper',
      'voice-condition:normal',
      'voice-condition:projected',
    ]);
    expect(report.activationGate).toMatchObject({
      passed: true,
      criteria: {
        wordErrorRelativeImprovement: 0.375,
        characterErrorRelativeImprovement: 0.399998,
        customTermRecallAbsoluteImprovement: 0.5,
        realTimeFactorRelativeRegression: 0.033335,
        falseInsertionPer100Regression: 0,
      },
      reasons: [],
    });
    expect(evaluationMetricsFromHeldOutReport(report, 'base')).toEqual({
      wer: 0.32,
      cer: 0.210526,
      customTermRecall: 0.5,
      falseInsertionsPer100Utterances: 0,
      realTimeFactor: 0.2,
    });
    expect(evaluationMetricsFromHeldOutReport(report, 'profile')).toEqual({
      wer: 0.2,
      cer: 0.126316,
      customTermRecall: 1,
      falseInsertionsPer100Utterances: 0,
      realTimeFactor: 0.206667,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/xin chào|spoken phrase|reference text|raw pcm/i);
  });

  it('fails the activation gate when quality does not improve or false insertions regress', () => {
    const regressed: HeldOutProfileEvaluationCaseInputV1[] = [
      {
        id: 'regression-case',
        language: 'vi',
        voiceCondition: 'normal',
        nonTargetCustomTermUtterance: true,
        base: {
          referenceWordCount: 10,
          wordErrorCount: 1,
          referenceCharacterCount: 40,
          characterErrorCount: 4,
          expectedCustomTermCount: 0,
          recalledCustomTermCount: 0,
          falseCustomTermInsertionCount: 0,
          realTimeFactor: 0.2,
        },
        profile: {
          referenceWordCount: 10,
          wordErrorCount: 2,
          referenceCharacterCount: 40,
          characterErrorCount: 6,
          expectedCustomTermCount: 0,
          recalledCustomTermCount: 0,
          falseCustomTermInsertionCount: 1,
          realTimeFactor: 0.27,
        },
      },
    ];

    const report = createHeldOutProfileEvaluationReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      evaluationId: 'eval-regressed',
      profileId: 'profile-local',
      baseModel: modelIdentity,
      adaptationType: 'speaker-embedding',
      heldOutSet: { id: 'heldout', sentenceBankVersion: 'bank', notes: ['Synthetic.'] },
      cases: regressed,
    });

    expect(report.activationGate.passed).toBe(false);
    expect(report.activationGate.reasons).toEqual([
      'Profile did not meet the held-out quality improvement threshold.',
      'Profile real-time-factor regression exceeded the configured budget.',
      'Profile custom-term false-insertion regression exceeded the configured budget.',
    ]);
  });

  it('rejects empty or internally inconsistent held-out metrics', () => {
    expect(() =>
      createHeldOutProfileEvaluationReport({
        generatedAt: '2026-06-23T00:00:00.000Z',
        evaluationId: 'eval-empty',
        profileId: 'profile-local',
        baseModel: modelIdentity,
        adaptationType: 'speaker-embedding',
        heldOutSet: { id: 'heldout', sentenceBankVersion: 'bank', notes: ['Synthetic.'] },
        cases: [],
      }),
    ).toThrow(/At least one/);

    expect(() =>
      createHeldOutProfileEvaluationReport({
        generatedAt: '2026-06-23T00:00:00.000Z',
        evaluationId: 'eval-invalid',
        profileId: 'profile-local',
        baseModel: modelIdentity,
        adaptationType: 'speaker-embedding',
        heldOutSet: { id: 'heldout', sentenceBankVersion: 'bank', notes: ['Synthetic.'] },
        cases: [
          {
            id: 'invalid-case',
            language: 'mixed',
            voiceCondition: 'projected',
            base: {
              referenceWordCount: 2,
              wordErrorCount: 3,
              referenceCharacterCount: 8,
              characterErrorCount: 1,
            },
            profile: {
              referenceWordCount: 2,
              wordErrorCount: 1,
              referenceCharacterCount: 8,
              characterErrorCount: 1,
            },
          },
        ],
      }),
    ).toThrow(/wordErrorCount/);

    expect(() =>
      createHeldOutProfileEvaluationReport({
        generatedAt: '2026-06-23T00:00:00.000Z',
        evaluationId: 'eval-invalid-non-target',
        profileId: 'profile-local',
        baseModel: modelIdentity,
        adaptationType: 'speaker-embedding',
        heldOutSet: { id: 'heldout', sentenceBankVersion: 'bank', notes: ['Synthetic.'] },
        cases: [
          {
            id: 'invalid-non-target',
            language: 'mixed',
            voiceCondition: 'projected',
            nonTargetCustomTermUtterance: true,
            base: {
              referenceWordCount: 2,
              wordErrorCount: 1,
              referenceCharacterCount: 8,
              characterErrorCount: 1,
              expectedCustomTermCount: 1,
            },
            profile: {
              referenceWordCount: 2,
              wordErrorCount: 1,
              referenceCharacterCount: 8,
              characterErrorCount: 1,
            },
          },
        ],
      }),
    ).toThrow(/non-target/);
  });
});

const modelIdentity = {
  id: 'mock-vi-en-rnnt',
  version: '0.0.0-test',
  manifestSha256: 'manifest-sha256',
  graphContractSha256: 'graph-contract-sha256',
};

const heldOutCases: readonly HeldOutProfileEvaluationCaseInputV1[] = [
  {
    id: 'heldout-vi-normal',
    language: 'vi',
    voiceCondition: 'normal',
    base: {
      referenceWordCount: 10,
      wordErrorCount: 4,
      referenceCharacterCount: 40,
      characterErrorCount: 9,
      switchBoundaryCount: 0,
      switchBoundaryErrorCount: 0,
      expectedCustomTermCount: 1,
      recalledCustomTermCount: 0,
      expectedAliasTriggerCount: 1,
      recalledAliasTriggerCount: 0,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 260,
      finalizationLatencyMs: 240,
      realTimeFactor: 0.22,
    },
    profile: {
      referenceWordCount: 10,
      wordErrorCount: 2,
      referenceCharacterCount: 40,
      characterErrorCount: 5,
      switchBoundaryCount: 0,
      switchBoundaryErrorCount: 0,
      expectedCustomTermCount: 1,
      recalledCustomTermCount: 1,
      expectedAliasTriggerCount: 1,
      recalledAliasTriggerCount: 1,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 270,
      finalizationLatencyMs: 230,
      realTimeFactor: 0.24,
    },
  },
  {
    id: 'heldout-en-whisper',
    language: 'en',
    voiceCondition: 'whisper',
    base: {
      referenceWordCount: 8,
      wordErrorCount: 2,
      referenceCharacterCount: 30,
      characterErrorCount: 4,
      switchBoundaryCount: 0,
      switchBoundaryErrorCount: 0,
      expectedCustomTermCount: 1,
      recalledCustomTermCount: 1,
      expectedAliasTriggerCount: 0,
      recalledAliasTriggerCount: 0,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 240,
      finalizationLatencyMs: 220,
      realTimeFactor: 0.2,
    },
    profile: {
      referenceWordCount: 8,
      wordErrorCount: 1,
      referenceCharacterCount: 30,
      characterErrorCount: 2,
      switchBoundaryCount: 0,
      switchBoundaryErrorCount: 0,
      expectedCustomTermCount: 1,
      recalledCustomTermCount: 1,
      expectedAliasTriggerCount: 0,
      recalledAliasTriggerCount: 0,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 250,
      finalizationLatencyMs: 210,
      realTimeFactor: 0.21,
    },
  },
  {
    id: 'heldout-mixed-projected',
    language: 'mixed',
    voiceCondition: 'projected',
    nonTargetCustomTermUtterance: true,
    base: {
      referenceWordCount: 7,
      wordErrorCount: 2,
      referenceCharacterCount: 25,
      characterErrorCount: 7,
      switchBoundaryCount: 2,
      switchBoundaryErrorCount: 1,
      expectedCustomTermCount: 0,
      recalledCustomTermCount: 0,
      expectedAliasTriggerCount: 0,
      recalledAliasTriggerCount: 0,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 220,
      finalizationLatencyMs: 210,
      realTimeFactor: 0.18,
    },
    profile: {
      referenceWordCount: 7,
      wordErrorCount: 2,
      referenceCharacterCount: 25,
      characterErrorCount: 5,
      switchBoundaryCount: 2,
      switchBoundaryErrorCount: 1,
      expectedCustomTermCount: 0,
      recalledCustomTermCount: 0,
      expectedAliasTriggerCount: 0,
      recalledAliasTriggerCount: 0,
      falseCustomTermInsertionCount: 0,
      firstPartialLatencyMs: 230,
      finalizationLatencyMs: 200,
      realTimeFactor: 0.17,
    },
  },
];

function metric(
  slice: { readonly metrics: readonly { readonly name: string }[] },
  name: string,
): { readonly name: string } {
  const found = slice.metrics.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Missing metric ${name}.`);
  return found;
}

function candidate(
  utteranceId: string,
  frequencyHz: number,
  voiceCondition: 'whisper' | 'normal' | 'projected',
  overrides: Partial<Pick<SpeakerEmbeddingCandidateV1, 'quality'>> = {},
): SpeakerEmbeddingCandidateV1 {
  const amplitude =
    voiceCondition === 'whisper' ? 0.08 : voiceCondition === 'projected' ? 0.18 : 0.12;
  const pcm = makeTone(1_200, frequencyHz, amplitude);
  const quality = makeQuality(pcm, voiceCondition);
  const encoded = encodeSpeakerEmbeddingCandidate({
    utteranceId,
    pcm,
    sampleRateHz,
    language: 'mixed',
    voiceCondition,
    quality,
  });
  return {
    ...encoded,
    ...(overrides.quality === undefined ? {} : { quality: overrides.quality }),
  };
}

function invertCandidate(candidate: SpeakerEmbeddingCandidateV1): SpeakerEmbeddingCandidateV1 {
  return {
    ...candidate,
    vector: candidate.vector.map((value) => -value),
  };
}

function makeQuality(
  pcm: Float32Array,
  voiceCondition: 'whisper' | 'normal' | 'projected',
): EnrollmentQualityReportV1 {
  const report = analyzeEnrollmentTakeQuality({
    pcm,
    sampleRateHz,
    referenceText: 'Tôi vừa update dashboard.',
    language: 'mixed',
    voiceCondition,
    calibration: { normalRms: 0.08, roomNoiseRms: 0.003 },
    alignment: { recognizedText: 'tôi vừa update dashboard', confidence: 0.9 },
  });
  return {
    ...report,
    status: 'pass',
    reasonCodes: [],
    summary: 'Synthetic clean fixture for personalization tests.',
    level: {
      ...report.level,
      clippingRatio: 0,
      snrDb: 24,
    },
    vad: {
      ...report.vad,
      activeSpeechRatio: 0.9,
    },
  };
}

function makeTone(durationMs: number, frequencyHz: number, amplitude: number): Float32Array {
  const sampleCount = Math.round((durationMs / 1_000) * sampleRateHz);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const base = Math.sin((2 * Math.PI * frequencyHz * index) / sampleRateHz);
    const harmonic = Math.sin((2 * Math.PI * frequencyHz * 2 * index) / sampleRateHz) * 0.35;
    pcm[index] = (base + harmonic) * amplitude;
  }
  return pcm;
}
