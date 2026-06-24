import { describe, expect, it } from 'vitest';
import type { VocabularyEntryV1 } from '@speech/protocol';
import {
  scheduleCustomVocabularyPrompts,
  userVocabularyPromptLicenseId,
  type CustomVocabularyPromptTemplateV1,
} from './custom-vocabulary-prompts';

const baseEntry: VocabularyEntryV1 = {
  id: 'term-dashboard',
  phrase: 'project dashboard',
  displayForm: 'Project Dashboard',
  language: 'en',
  spokenAliases: ['dashboard dự án'],
  weight: 6,
  enabled: true,
  exactCase: true,
  promptPriority: 25,
};

describe('custom vocabulary prompt scheduling', () => {
  it('generates three user-reviewed prompt contexts for a high-priority enabled term', () => {
    const result = scheduleCustomVocabularyPrompts({ entries: [baseEntry] });

    expect(result.selectedEntryIds).toEqual(['term-dashboard']);
    expect(result.skippedEntryIds).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/local user terms/i);
    expect(result.prompts).toHaveLength(3);
    expect(new Set(result.prompts.map((prompt) => prompt.customVocabulary.position))).toEqual(
      new Set(['beginning', 'middle', 'end']),
    );
    expect(
      new Set(result.prompts.map((prompt) => prompt.customVocabulary.voiceCondition)).size,
    ).toBe(3);
    expect(result.prompts.every((prompt) => prompt.text.includes('Project Dashboard'))).toBe(true);
    expect(result.prompts.every((prompt) => prompt.review.humanReviewed === false)).toBe(true);
    expect(
      result.prompts.every(
        (prompt) =>
          prompt.customVocabulary.requiresUserReview &&
          prompt.licenseId === userVocabularyPromptLicenseId,
      ),
    ).toBe(true);
    expect(result.prompts[0]?.customVocabulary.spokenAliases).toEqual(['dashboard dự án']);
  });

  it('selects highest-priority enabled entries before lower-priority entries', () => {
    const entries: VocabularyEntryV1[] = [
      { ...baseEntry, id: 'term-low', displayForm: 'Low', promptPriority: 1 },
      {
        ...baseEntry,
        id: 'term-recorded',
        displayForm: 'Recorded',
        promptPriority: 100,
        pronunciationRecordingIds: ['utt-recorded'],
      },
      { ...baseEntry, id: 'term-high', displayForm: 'High', promptPriority: 50 },
      { ...baseEntry, id: 'term-disabled', displayForm: 'Disabled', enabled: false },
    ];

    const result = scheduleCustomVocabularyPrompts({
      entries,
      maxEntries: 2,
      maxPromptsPerEntry: 1,
    });

    expect(result.selectedEntryIds).toEqual(['term-recorded', 'term-high']);
    expect(result.skippedEntryIds).toEqual(['term-low']);
    expect(result.prompts.map((prompt) => prompt.customVocabulary.vocabularyEntryId)).toEqual([
      'term-recorded',
      'term-high',
    ]);
  });

  it('matches templates by vocabulary language without using unrelated language contexts', () => {
    const entries: VocabularyEntryV1[] = [
      { ...baseEntry, id: 'term-vi', displayForm: 'Hà Nội', language: 'vi' },
      { ...baseEntry, id: 'term-mixed', displayForm: 'deploy mới', language: 'mixed' },
      { ...baseEntry, id: 'term-auto', displayForm: 'AutoTerm', language: 'auto' },
    ];

    const result = scheduleCustomVocabularyPrompts({
      entries,
      maxEntries: 3,
      maxPromptsPerEntry: 2,
    });
    const byEntry = new Map(
      result.prompts.map((prompt) => [prompt.customVocabulary.vocabularyEntryId, prompt.language]),
    );

    expect(
      [
        ...result.prompts.filter(
          (prompt) => prompt.customVocabulary.vocabularyEntryId === 'term-vi',
        ),
      ].map((prompt) => prompt.language),
    ).toEqual(['vi', 'vi']);
    expect(
      [
        ...result.prompts.filter(
          (prompt) => prompt.customVocabulary.vocabularyEntryId === 'term-mixed',
        ),
      ].map((prompt) => prompt.language),
    ).toEqual(['mixed', 'mixed']);
    expect(byEntry.get('term-auto')).toBeDefined();
  });

  it('warns when custom templates cannot provide enough distinct contexts', () => {
    const templates: CustomVocabularyPromptTemplateV1[] = [
      {
        schemaVersion: 1,
        id: 'single-en-template',
        version: 1,
        language: 'en',
        text: 'Please review {term}.',
        position: 'middle',
        intent: 'request',
        estimatedSeconds: 2,
        difficulty: 1,
        tags: ['custom-vocabulary'],
      },
    ];

    const result = scheduleCustomVocabularyPrompts({
      entries: [baseEntry],
      templates,
      maxPromptsPerEntry: 3,
    });

    expect(result.prompts).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/not have enough matching prompt templates/);
  });
});
