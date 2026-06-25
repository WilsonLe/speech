import { describe, expect, it } from 'vitest';
import {
  buildPromptIdentitySplitPlan,
  defaultPromptIdentitySplitConfigV1,
  summarizePromptIdentitySplitPlan,
  type PromptIdentitySplitUtteranceV1,
} from './prompt-split';

describe('deterministic prompt-identity split', () => {
  it('keeps repeated takes and voice-condition variants in the same seeded split', () => {
    const utterances = splitFixture();
    const first = buildPromptIdentitySplitPlan(utterances, {
      seed: 'browser-personal-model-v1',
      trainRatio: 0.5,
      validationRatio: 0.25,
      testRatio: 0.25,
    });
    const second = buildPromptIdentitySplitPlan([...utterances].reverse(), {
      seed: 'browser-personal-model-v1',
      trainRatio: 0.5,
      validationRatio: 0.25,
      testRatio: 0.25,
    });

    expect(first).toEqual(second);
    expect(first.algorithmId).toBe('seeded-stratified-prompt-identity-v1');
    expect(first.targetPromptIdentities).toEqual({ train: 3, validation: 2, test: 1 });
    expect(first.totals).toEqual({ promptIdentities: 6, utterances: 8, durationSeconds: 25.5 });
    expect(Object.values(first.splits).map((bucket) => bucket.promptIdentities)).toEqual([3, 2, 1]);

    const repeatedPromptSplit = new Set(
      first.assignments
        .filter((assignment) => assignment.promptId === 'prompt-repeat-dashboard')
        .map((assignment) => assignment.split),
    );
    expect(repeatedPromptSplit.size).toBe(1);
    expect(
      first.assignments.find((assignment) => assignment.promptId === 'prompt-repeat-dashboard'),
    ).toMatchObject({
      utterances: 3,
      languages: ['mixed'],
      voiceConditions: ['whisper', 'normal', 'projected'],
    });
    expect(
      first.splits.validation.languageCounts.vi + first.splits.test.languageCounts.vi,
    ).toBeGreaterThan(0);
    expect(first.privacy).toMatchObject({
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      exposesRawPromptIds: true,
    });
  });

  it('changes assignment order with the seed while preserving split sizes and grouping', () => {
    const baseline = buildPromptIdentitySplitPlan(splitFixture(), { seed: 'seed-a' });
    const alternate = buildPromptIdentitySplitPlan(splitFixture(), { seed: 'seed-b' });

    expect(alternate.targetPromptIdentities).toEqual(baseline.targetPromptIdentities);
    expect(alternate.splits.train.promptIdentities).toBe(baseline.splits.train.promptIdentities);
    expect(
      alternate.assignments.map((assignment) => [assignment.promptId, assignment.split]),
    ).not.toEqual(
      baseline.assignments.map((assignment) => [assignment.promptId, assignment.split]),
    );
    for (const plan of [baseline, alternate]) {
      const split = plan.assignments.find(
        (assignment) => assignment.promptId === 'prompt-repeat-dashboard',
      )?.split;
      expect(
        plan.assignments.filter((assignment) => assignment.promptId === 'prompt-repeat-dashboard'),
      ).toHaveLength(1);
      expect(split).toBeDefined();
    }
  });

  it('returns a redacted aggregate report for UI and logs', () => {
    const plan = buildPromptIdentitySplitPlan(splitFixture(), { seed: 'private-seed' });
    const report = summarizePromptIdentitySplitPlan(plan);
    const serialized = JSON.stringify(report);

    expect(report.assignments[0]?.label).toBe('prompt-001');
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      exposesRawPromptIds: false,
      containsTranscriptText: false,
      localOnly: true,
    });
    expect(serialized).not.toContain('prompt-repeat-dashboard');
    expect(serialized).not.toContain('prompt-vi-normal');
    expect(serialized).not.toContain('utt-dashboard-normal');
  });

  it('handles tiny datasets deterministically without inventing empty split assignments', () => {
    expect(
      buildPromptIdentitySplitPlan([], defaultPromptIdentitySplitConfigV1).assignments,
    ).toEqual([]);
    expect(
      buildPromptIdentitySplitPlan([utterance('utt-1', 'prompt-only', 'vi', 'normal')])
        .targetPromptIdentities,
    ).toEqual({ train: 1, validation: 0, test: 0 });
    expect(
      buildPromptIdentitySplitPlan([
        utterance('utt-1', 'prompt-a', 'vi', 'normal'),
        utterance('utt-2', 'prompt-b', 'en', 'whisper'),
      ]).targetPromptIdentities,
    ).toEqual({ train: 1, validation: 1, test: 0 });
  });

  it('rejects invalid utterances and split ratios', () => {
    expect(() => buildPromptIdentitySplitPlan([utterance('utt-1', '', 'vi', 'normal')])).toThrow(
      /promptId/,
    );
    expect(() =>
      buildPromptIdentitySplitPlan([utterance('utt-1', 'prompt-1', 'vi', 'normal')], {
        trainRatio: 0,
        validationRatio: 0,
        testRatio: 0,
      }),
    ).toThrow(/positive sum/);
    expect(() =>
      buildPromptIdentitySplitPlan([
        { ...utterance('utt-1', 'prompt-1', 'vi', 'normal'), durationMs: -1 },
      ]),
    ).toThrow(/durationMs/);
  });
});

function splitFixture(): PromptIdentitySplitUtteranceV1[] {
  return [
    utterance('utt-dashboard-normal', 'prompt-repeat-dashboard', 'mixed', 'normal', 3_000),
    utterance('utt-dashboard-whisper', 'prompt-repeat-dashboard', 'mixed', 'whisper', 3_200),
    utterance('utt-dashboard-projected', 'prompt-repeat-dashboard', 'mixed', 'projected', 3_100),
    utterance('utt-vi-normal', 'prompt-vi-normal', 'vi', 'normal', 4_000),
    utterance('utt-vi-whisper', 'prompt-vi-whisper', 'vi', 'whisper', 3_500),
    utterance('utt-en-normal', 'prompt-en-normal', 'en', 'normal', 3_200),
    utterance('utt-en-projected', 'prompt-en-projected', 'en', 'projected', 2_900),
    utterance('utt-mixed-normal', 'prompt-mixed-normal', 'mixed', 'normal', 2_600),
  ];
}

function utterance(
  utteranceId: string,
  promptId: string,
  language: PromptIdentitySplitUtteranceV1['language'],
  voiceCondition: PromptIdentitySplitUtteranceV1['voiceCondition'],
  durationMs = 1_000,
): PromptIdentitySplitUtteranceV1 {
  return {
    schemaVersion: 1,
    utteranceId,
    promptId,
    language,
    voiceCondition,
    durationMs,
  };
}
