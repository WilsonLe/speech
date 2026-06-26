import { describe, expect, it } from 'vitest';
import {
  createBilingualQualityCohortReport,
  createMissingBilingualQualityCohortReport,
  type BilingualQualityCohortSpeakerMetricsInputV1,
} from './cohort-release-gate';

const generatedAt = '2026-06-26T00:00:00.000Z';

describe('bilingual 30-speaker quality cohort release gate', () => {
  it('blocks the release when no user-approved cohort data is available', () => {
    const report = createMissingBilingualQualityCohortReport({ generatedAt });

    expect(report.status).toBe('insufficient-evidence');
    expect(report.summary.speakerCount).toBe(0);
    expect(report.gate.checks.find((check) => check.name === 'speaker-count')).toMatchObject({
      passed: false,
      values: { actual: 0, required: 30 },
    });
    expect(report.warnings.join(' ')).toContain('Release quality gate blocked');
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      containsAudio: false,
      containsTranscriptText: false,
      containsSpeakerIds: false,
      containsFeatureTensors: false,
      containsAdapterWeights: false,
      localOnly: true,
      networkUpload: false,
    });
  });

  it('passes when 30 aggregate speaker summaries satisfy the ADR cohort gates', () => {
    const report = createBilingualQualityCohortReport({
      generatedAt,
      cohortId: 'v0-5-0-synthetic-pass',
      evidenceLabel: 'Synthetic aggregate cohort fixture',
      speakers: Array.from({ length: 30 }, (_value, index) => speaker(index)),
    });

    expect(report.status).toBe('passed');
    expect(report.summary.speakerCount).toBe(30);
    expect(report.summary.medianRelativePersonalWerImprovement).toBeCloseTo(0.15, 6);
    expect(report.summary.improvingSpeakerRatio).toBe(1);
    expect(report.summary.severeDegradationRatio).toBe(0);
    expect(report.summary.medianAnchorWerDegradation).toBeCloseTo(0.003, 6);
    expect(report.gate.checks.every((check) => check.passed)).toBe(true);
    expect(report.summary.languageCounts).toEqual({ vi: 10, en: 10, mixed: 10 });
    expect(report.summary.voiceConditionCounts).toEqual({ whisper: 10, normal: 10, projected: 10 });
  });

  it('fails aggregate and slice gates when enough speakers degrade', () => {
    const speakers = Array.from({ length: 30 }, (_value, index) =>
      index < 4
        ? speaker(index, {
            sliceTags: ['accent:vi-central'],
            genericPersonalWordErrorRate: 0.2,
            candidatePersonalWordErrorRate: 0.225,
            genericAnchorWordErrorRate: 0.1,
            candidateAnchorWordErrorRate: 0.11,
          })
        : speaker(index),
    );

    const report = createBilingualQualityCohortReport({
      generatedAt,
      cohortId: 'v0-5-0-synthetic-fail',
      evidenceLabel: 'Synthetic aggregate regression fixture',
      speakers,
    });

    expect(report.status).toBe('failed');
    expect(report.gate.reasons).toContain(
      'Too many speakers degraded beyond the absolute WER-point budget.',
    );
    expect(report.gate.reasons).toContain(
      'At least one language/accent/voice-condition slice shows systematic regression.',
    );
    expect(
      report.gate.checks.find((check) => check.name === 'severe-degradation-ratio'),
    ).toMatchObject({
      passed: false,
    });
    expect(report.slices.find((slice) => slice.tag === 'accent:vi-central')).toMatchObject({
      speakerCount: 4,
      regressionDetected: true,
    });
  });

  it('keeps serialized reports aggregate-only and redacts private-looking warning text', () => {
    const report = createBilingualQualityCohortReport({
      generatedAt,
      cohortId: 'v0-5-0-privacy-check',
      evidenceLabel: 'Synthetic speaker-secret-alpha aggregate privacy fixture',
      speakers: [speaker(0, { speakerId: 'speaker-secret-alpha' })],
      warnings: ['speaker-secret-alpha and profile-secret-beta were excluded locally'],
    });
    const serialized = JSON.stringify(report);

    expect(report.status).toBe('insufficient-evidence');
    expect(report.evidenceLabel).toContain('speaker-redacted');
    expect(report.warnings.join(' ')).toContain('speaker-redacted');
    expect(report.warnings.join(' ')).toContain('profile-redacted');
    expect(serialized).not.toContain('speaker-secret-alpha');
    expect(serialized).not.toContain('profile-secret-beta');
    expect(serialized).not.toContain('transcript');
    expect(serialized).not.toContain('featureTensor');
  });

  it('redacts local speaker IDs from validation errors', () => {
    let message = '';
    try {
      createBilingualQualityCohortReport({
        generatedAt,
        cohortId: 'v0-5-0-invalid-speaker',
        evidenceLabel: 'Synthetic invalid speaker fixture',
        speakers: [
          speaker(0, {
            speakerId: 'speaker-secret-gamma',
            genericPersonalWordErrorRate: Number.NaN,
          }),
        ],
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/speaker\[0\]\.genericPersonalWordErrorRate/);
    expect(message).not.toContain('speaker-secret-gamma');
  });

  it('rejects duplicate local speaker IDs before aggregation', () => {
    expect(() =>
      createBilingualQualityCohortReport({
        generatedAt,
        cohortId: 'v0-5-0-duplicate-speaker',
        evidenceLabel: 'Synthetic duplicate speaker fixture',
        speakers: [speaker(1), speaker(2, { speakerId: 'speaker-001' })],
      }),
    ).toThrow(/speaker IDs must be unique/);
  });
});

function speaker(
  index: number,
  overrides: Partial<BilingualQualityCohortSpeakerMetricsInputV1> = {},
): BilingualQualityCohortSpeakerMetricsInputV1 {
  const language = (['vi', 'en', 'mixed'] as const)[index % 3]!;
  const voiceCondition = (['whisper', 'normal', 'projected'] as const)[index % 3]!;
  const accentTag =
    language === 'vi'
      ? `accent:${index % 2 === 0 ? 'vi-north' : 'vi-south'}`
      : `accent:${language}`;
  return {
    speakerId: `speaker-${index.toString().padStart(3, '0')}`,
    language,
    voiceCondition,
    sliceTags: [accentTag],
    genericPersonalWordErrorRate: 0.2,
    candidatePersonalWordErrorRate: 0.17,
    genericAnchorWordErrorRate: 0.1,
    candidateAnchorWordErrorRate: 0.103,
    ...overrides,
  };
}
