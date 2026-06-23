import { describe, expect, it } from 'vitest';
import { analyzeEnrollmentTakeQuality, type EnrollmentQualityReportV1 } from '@speech/enrollment';
import {
  aggregateSpeakerEmbeddings,
  encodeSpeakerEmbeddingCandidate,
  parseSpeakerEmbeddingVector,
  serializeSpeakerEmbeddingVector,
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
