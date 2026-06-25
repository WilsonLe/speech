import { describe, expect, it } from 'vitest';
import {
  buildTrainingReadinessCoverageReport,
  defaultTrainingReadinessPolicyV1,
  inferCustomVocabularyEntryIdFromPromptId,
  type TrainingReadinessAcceptedUtteranceV1,
  type TrainingReadinessPolicyV1,
} from './training-readiness';

describe('training readiness coverage report', () => {
  it('passes a configured policy with aggregate language, voice, prompt, and vocabulary coverage', () => {
    const policy: TrainingReadinessPolicyV1 = {
      ...defaultTrainingReadinessPolicyV1,
      minAcceptedUtterances: 4,
      minTotalDurationSeconds: 12,
      minUniquePromptIdentities: 3,
      languageTargets: [
        { value: 'vi', minUtterances: 1, minDurationSeconds: 3 },
        { value: 'en', minUtterances: 1, minDurationSeconds: 3 },
        { value: 'mixed', minUtterances: 1, minDurationSeconds: 3 },
      ],
      voiceConditionTargets: [
        { value: 'normal', minUtterances: 1, minDurationSeconds: 3 },
        { value: 'whisper', minUtterances: 1, minDurationSeconds: 3 },
        { value: 'projected', minUtterances: 1, minDurationSeconds: 3 },
      ],
      vocabulary: {
        minCoveredEntries: 1,
        minUtterancesPerEntry: 1,
        minDurationSecondsPerEntry: 3,
        requiredEntryIds: ['term-dashboard'],
      },
    };

    const report = buildTrainingReadinessCoverageReport(
      [
        utterance('utt-1', 'prompt-1', 'vi', 'normal', 3_000),
        utterance('utt-2', 'prompt-2', 'en', 'whisper', 3_500),
        utterance('utt-3', 'prompt-3', 'mixed', 'projected', 3_200, 'term-dashboard'),
        utterance('utt-4', 'prompt-3', 'mixed', 'normal', 3_100, 'term-dashboard'),
      ],
      policy,
    );

    expect(report.status).toBe('ready');
    expect(report.automaticTrainingAllowed).toBe(true);
    expect(report.missingRequirements).toEqual([]);
    expect(report.totals).toMatchObject({
      acceptedUtterances: 4,
      totalDurationSeconds: 12.8,
      uniquePromptIdentities: 3,
      qualityStatusCounts: { pass: 4 },
    });
    expect(report.languageCoverage.map((bucket) => [bucket.value, bucket.utterances])).toEqual([
      ['vi', 1],
      ['en', 1],
      ['mixed', 2],
    ]);
    expect(
      report.voiceConditionCoverage.map((bucket) => [bucket.value, bucket.utterances]),
    ).toEqual([
      ['normal', 2],
      ['whisper', 1],
      ['projected', 1],
    ]);
    expect(report.promptCoverage.promptIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'prompt-003', utterances: 2, durationSeconds: 6.3 }),
      ]),
    );
    expect(report.vocabularyCoverage.entries).toEqual([
      expect.objectContaining({ label: 'vocab-001', utterances: 2, status: 'pass' }),
    ]);
    expect(JSON.stringify(report)).not.toContain('term-dashboard');
    expect(JSON.stringify(report)).not.toContain('prompt-1');
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
      localOnly: true,
    });
  });

  it('reports missing readiness requirements without exposing raw prompt or vocabulary identities', () => {
    const policy: TrainingReadinessPolicyV1 = {
      ...defaultTrainingReadinessPolicyV1,
      minAcceptedUtterances: 3,
      minTotalDurationSeconds: 10,
      minUniquePromptIdentities: 3,
      languageTargets: [{ value: 'vi', minUtterances: 2, minDurationSeconds: 8 }],
      voiceConditionTargets: [{ value: 'projected', minUtterances: 1, minDurationSeconds: 3 }],
      vocabulary: {
        minCoveredEntries: 2,
        minUtterancesPerEntry: 1,
        minDurationSecondsPerEntry: 2,
        requiredEntryIds: ['private-term-a', 'private-term-b'],
      },
    };

    const report = buildTrainingReadinessCoverageReport(
      [utterance('utt-1', 'private-prompt-a', 'vi', 'normal', 2_500, 'private-term-a')],
      policy,
    );

    expect(report.status).toBe('needs-more-data');
    expect(report.automaticTrainingAllowed).toBe(false);
    expect(report.missingRequirements.map((requirement) => requirement.code)).toEqual(
      expect.arrayContaining([
        'accepted-utterances',
        'total-duration',
        'unique-prompt-identities',
        'language-utterances',
        'language-duration',
        'voice-condition-utterances',
        'voice-condition-duration',
        'vocabulary-covered-entries',
        'vocabulary-entry-utterances',
        'vocabulary-entry-duration',
      ]),
    );
    expect(report.vocabularyCoverage.entries).toHaveLength(2);
    expect(report.vocabularyCoverage.entries.map((entry) => entry.label)).toEqual([
      'vocab-001',
      'vocab-002',
    ]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('private-prompt-a');
    expect(serialized).not.toContain('private-term-a');
    expect(serialized).not.toContain('private-term-b');
  });

  it('infers custom-vocabulary entry identity from generated prompt ids when explicit metadata is absent', () => {
    const promptId = 'custom-vocab:term-alpha:vi-beginning-open:normal';
    const report = buildTrainingReadinessCoverageReport(
      [utterance('utt-1', promptId, 'vi', 'normal', 2_000)],
      {
        ...defaultTrainingReadinessPolicyV1,
        minAcceptedUtterances: 1,
        minTotalDurationSeconds: 2,
        minUniquePromptIdentities: 1,
        languageTargets: [],
        voiceConditionTargets: [],
        vocabulary: {
          minCoveredEntries: 1,
          minUtterancesPerEntry: 1,
          minDurationSecondsPerEntry: 2,
        },
      },
    );

    expect(inferCustomVocabularyEntryIdFromPromptId(promptId)).toBe('term-alpha');
    expect(
      inferCustomVocabularyEntryIdFromPromptId('custom-vocab:team:alpha:vi-middle-open:projected'),
    ).toBe('team:alpha');
    expect(report.status).toBe('ready');
    expect(report.vocabularyCoverage.coveredEntryCount).toBe(1);
    expect(report.vocabularyCoverage.entries[0]).toMatchObject({
      label: 'vocab-001',
      utterances: 1,
    });
  });

  it('rejects invalid policy and utterance inputs loudly', () => {
    expect(() =>
      buildTrainingReadinessCoverageReport(
        [utterance('utt-1', '', 'vi', 'normal', 1_000)],
        defaultTrainingReadinessPolicyV1,
      ),
    ).toThrow(/promptId/);
    expect(() =>
      buildTrainingReadinessCoverageReport([], {
        ...defaultTrainingReadinessPolicyV1,
        minTotalDurationSeconds: -1,
      }),
    ).toThrow(/minTotalDurationSeconds/);
  });
});

function utterance(
  utteranceId: string,
  promptId: string,
  language: TrainingReadinessAcceptedUtteranceV1['language'],
  voiceCondition: TrainingReadinessAcceptedUtteranceV1['voiceCondition'],
  durationMs: number,
  customVocabularyEntryId?: string,
): TrainingReadinessAcceptedUtteranceV1 {
  return {
    schemaVersion: 1,
    utteranceId,
    promptId,
    language,
    voiceCondition,
    durationMs,
    qualityStatus: 'pass',
    ...(customVocabularyEntryId === undefined ? {} : { customVocabularyEntryId }),
  };
}
