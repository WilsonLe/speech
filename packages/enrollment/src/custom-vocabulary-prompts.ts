import type { VocabularyEntryLanguage, VocabularyEntryV1 } from '@speech/protocol';
import { analyzeEnrollmentSentenceText } from './coverage';
import {
  normalizeEnrollmentSentenceText,
  type EnrollmentSentenceDifficulty,
  type EnrollmentSentenceLanguage,
  type EnrollmentSentenceV1,
  type EnrollmentVoiceCondition,
} from './sentence-bank';

export type CustomVocabularyPromptPosition = 'beginning' | 'middle' | 'end';
export type CustomVocabularyPromptIntent = 'statement' | 'request' | 'spelling-confirmation';

export interface CustomVocabularyPromptTemplateV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly language: EnrollmentSentenceLanguage;
  readonly text: string;
  readonly position: CustomVocabularyPromptPosition;
  readonly intent: CustomVocabularyPromptIntent;
  readonly estimatedSeconds: number;
  readonly difficulty: EnrollmentSentenceDifficulty;
  readonly tags: readonly string[];
}

export interface CustomVocabularyPromptMetadataV1 {
  readonly vocabularyEntryId: string;
  readonly selectedVocabularyEntryIds: readonly string[];
  readonly vocabularyRevisionSha256?: string;
  readonly displayForm: string;
  readonly phrase: string;
  readonly language: VocabularyEntryLanguage;
  readonly spokenAliases: readonly string[];
  readonly promptPriority?: number;
  readonly templateId: string;
  readonly position: CustomVocabularyPromptPosition;
  readonly intent: CustomVocabularyPromptIntent;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly requiresUserReview: true;
}

export interface CustomVocabularyPromptIdPartsV1 {
  readonly vocabularyEntryId: string;
  readonly templateId: string;
  readonly voiceCondition: EnrollmentVoiceCondition;
}

export interface CustomVocabularyEnrollmentPromptV1 extends EnrollmentSentenceV1 {
  readonly customVocabulary: CustomVocabularyPromptMetadataV1;
}

export interface CustomVocabularyPromptScheduleOptions {
  readonly entries: readonly VocabularyEntryV1[];
  readonly templates?: readonly CustomVocabularyPromptTemplateV1[];
  readonly maxEntries?: number;
  readonly maxPromptsPerEntry?: number;
  readonly highPriorityThreshold?: number;
  readonly voiceConditions?: readonly EnrollmentVoiceCondition[];
  readonly vocabularyRevisionSha256?: string;
  readonly licenseId?: string;
}

export interface CustomVocabularyPromptScheduleResult {
  readonly prompts: readonly CustomVocabularyEnrollmentPromptV1[];
  readonly selectedEntryIds: readonly string[];
  readonly skippedEntryIds: readonly string[];
  readonly warnings: readonly string[];
}

export const userVocabularyPromptLicenseId = 'user-vocabulary-generated-v1';

export const defaultCustomVocabularyPromptTemplates: readonly CustomVocabularyPromptTemplateV1[] = [
  {
    schemaVersion: 1,
    id: 'vi-beginning-open',
    version: 1,
    language: 'vi',
    text: '{term} cần được kiểm tra lại hôm nay.',
    position: 'beginning',
    intent: 'statement',
    estimatedSeconds: 3.4,
    difficulty: 2,
    tags: ['custom-vocabulary', 'vietnamese', 'beginning'],
  },
  {
    schemaVersion: 1,
    id: 'vi-middle-open',
    version: 1,
    language: 'vi',
    text: 'Hãy mở {term} và kiểm tra lại kết quả.',
    position: 'middle',
    intent: 'request',
    estimatedSeconds: 3.8,
    difficulty: 2,
    tags: ['custom-vocabulary', 'vietnamese', 'middle'],
  },
  {
    schemaVersion: 1,
    id: 'vi-end-note',
    version: 1,
    language: 'vi',
    text: 'Tôi muốn ghi chú về {term}.',
    position: 'end',
    intent: 'statement',
    estimatedSeconds: 3.1,
    difficulty: 1,
    tags: ['custom-vocabulary', 'vietnamese', 'end'],
  },
  {
    schemaVersion: 1,
    id: 'en-beginning-review',
    version: 1,
    language: 'en',
    text: '{term} needs a quick review today.',
    position: 'beginning',
    intent: 'statement',
    estimatedSeconds: 3.2,
    difficulty: 1,
    tags: ['custom-vocabulary', 'english', 'beginning'],
  },
  {
    schemaVersion: 1,
    id: 'en-middle-open',
    version: 1,
    language: 'en',
    text: 'Please open {term} and review the latest change.',
    position: 'middle',
    intent: 'request',
    estimatedSeconds: 3.9,
    difficulty: 2,
    tags: ['custom-vocabulary', 'english', 'middle'],
  },
  {
    schemaVersion: 1,
    id: 'en-end-note',
    version: 1,
    language: 'en',
    text: 'Add a short note about {term}.',
    position: 'end',
    intent: 'statement',
    estimatedSeconds: 3,
    difficulty: 1,
    tags: ['custom-vocabulary', 'english', 'end'],
  },
  {
    schemaVersion: 1,
    id: 'mixed-beginning-dashboard',
    version: 1,
    language: 'mixed',
    text: '{term} vừa được update trên dashboard.',
    position: 'beginning',
    intent: 'statement',
    estimatedSeconds: 3.4,
    difficulty: 2,
    tags: ['custom-vocabulary', 'mixed', 'beginning'],
  },
  {
    schemaVersion: 1,
    id: 'mixed-middle-dashboard',
    version: 1,
    language: 'mixed',
    text: 'Tôi vừa update {term} trên dashboard.',
    position: 'middle',
    intent: 'statement',
    estimatedSeconds: 3.2,
    difficulty: 2,
    tags: ['custom-vocabulary', 'mixed', 'middle'],
  },
  {
    schemaVersion: 1,
    id: 'mixed-end-dashboard',
    version: 1,
    language: 'mixed',
    text: 'Hãy kiểm tra dashboard cho {term}.',
    position: 'end',
    intent: 'request',
    estimatedSeconds: 3.3,
    difficulty: 2,
    tags: ['custom-vocabulary', 'mixed', 'end'],
  },
];

const defaultVoiceConditionOrder: readonly EnrollmentVoiceCondition[] = [
  'normal',
  'projected',
  'whisper',
];
const defaultMaxEntries = 8;
const defaultMaxPromptsPerEntry = 3;
const defaultHighPriorityThreshold = 1;
const positionOrder: readonly CustomVocabularyPromptPosition[] = ['beginning', 'middle', 'end'];

export function scheduleCustomVocabularyPrompts(
  options: CustomVocabularyPromptScheduleOptions,
): CustomVocabularyPromptScheduleResult {
  const templates = [...(options.templates ?? defaultCustomVocabularyPromptTemplates)].sort(
    compareTemplates,
  );
  const maxEntries = assertPositiveInteger(options.maxEntries ?? defaultMaxEntries, 'maxEntries');
  const maxPromptsPerEntry = assertPositiveInteger(
    options.maxPromptsPerEntry ?? defaultMaxPromptsPerEntry,
    'maxPromptsPerEntry',
  );
  const highPriorityThreshold = options.highPriorityThreshold ?? defaultHighPriorityThreshold;
  const voiceConditions = normalizeVoiceConditionOrder(
    options.voiceConditions ?? defaultVoiceConditionOrder,
  );
  const licenseId = options.licenseId ?? userVocabularyPromptLicenseId;
  const enabledEntries = options.entries.filter((entry) => entry.enabled).sort(compareEntries);
  const selectedEntries = enabledEntries.slice(0, maxEntries);
  const prompts: CustomVocabularyEnrollmentPromptV1[] = [];
  const warnings = new Set<string>([
    'Generated custom-vocabulary prompts contain local user terms. Show each prompt for user review before recording and do not upload them by default.',
  ]);

  for (const entry of selectedEntries) {
    const matchingTemplates = selectTemplatesForEntry(entry, templates, maxPromptsPerEntry);
    if (matchingTemplates.length < Math.min(maxPromptsPerEntry, positionOrder.length)) {
      warnings.add(`Vocabulary entry ${entry.id} did not have enough matching prompt templates.`);
    }
    const highPriority = (entry.promptPriority ?? 0) >= highPriorityThreshold;
    matchingTemplates.forEach((template, index) => {
      const voiceCondition = highPriority
        ? voiceConditions[index % voiceConditions.length]!
        : voiceConditions[0]!;
      prompts.push(
        createPrompt(entry, template, voiceCondition, licenseId, options.vocabularyRevisionSha256),
      );
    });
  }

  return {
    prompts,
    selectedEntryIds: selectedEntries.map((entry) => entry.id),
    skippedEntryIds: enabledEntries.slice(maxEntries).map((entry) => entry.id),
    warnings: [...warnings].sort((left, right) => left.localeCompare(right)),
  };
}

function createPrompt(
  entry: VocabularyEntryV1,
  template: CustomVocabularyPromptTemplateV1,
  voiceCondition: EnrollmentVoiceCondition,
  licenseId: string,
  vocabularyRevisionSha256: string | undefined,
): CustomVocabularyEnrollmentPromptV1 {
  const displayForm = normalizeEnrollmentSentenceText(entry.displayForm);
  const phrase = normalizeEnrollmentSentenceText(entry.phrase);
  const text = template.text.replaceAll('{term}', displayForm);
  const normalizedText = normalizeEnrollmentSentenceText(text);
  const derived = analyzeEnrollmentSentenceText(normalizedText, template.language);
  const id = makeGeneratedPromptId(entry, template, voiceCondition);
  return {
    id,
    version: 1,
    text,
    language: template.language,
    normalizedText,
    allowedVoiceConditions: [voiceCondition],
    estimatedSeconds: roundSeconds(template.estimatedSeconds + estimateTermSeconds(displayForm)),
    difficulty: template.difficulty,
    tags: uniqueSortedTags([
      'custom-vocabulary',
      `position:${template.position}`,
      `intent:${template.intent}`,
      `voice:${voiceCondition}`,
      `vocab:${truncateTagValue(entry.id)}`,
      ...template.tags,
    ]),
    repeatGroup: `custom-vocab:${truncateTagValue(entry.id)}`,
    coverage: derived.coverage,
    licenseId,
    review: {
      humanReviewed: false,
      notes:
        'Generated from a local vocabulary entry. The UI must show this prompt to the user before recording.',
    },
    customVocabulary: {
      vocabularyEntryId: entry.id,
      selectedVocabularyEntryIds: [entry.id],
      ...(vocabularyRevisionSha256 === undefined ? {} : { vocabularyRevisionSha256 }),
      displayForm,
      phrase,
      language: entry.language,
      spokenAliases: entry.spokenAliases.map(normalizeEnrollmentSentenceText),
      ...(entry.promptPriority === undefined ? {} : { promptPriority: entry.promptPriority }),
      templateId: template.id,
      position: template.position,
      intent: template.intent,
      voiceCondition,
      requiresUserReview: true,
    },
  };
}

function selectTemplatesForEntry(
  entry: VocabularyEntryV1,
  templates: readonly CustomVocabularyPromptTemplateV1[],
  maxPromptsPerEntry: number,
): readonly CustomVocabularyPromptTemplateV1[] {
  const matching = templates.filter((template) => templateMatchesEntry(template, entry));
  const selected: CustomVocabularyPromptTemplateV1[] = [];
  for (const position of positionOrder) {
    const template =
      matching.find(
        (candidate) =>
          candidate.position === position &&
          !selected.includes(candidate) &&
          candidate.language === entry.language,
      ) ??
      matching.find(
        (candidate) => candidate.position === position && !selected.includes(candidate),
      );
    if (template !== undefined) selected.push(template);
    if (selected.length >= maxPromptsPerEntry) return selected;
  }
  for (const template of matching) {
    if (!selected.includes(template)) selected.push(template);
    if (selected.length >= maxPromptsPerEntry) return selected;
  }
  return selected;
}

function templateMatchesEntry(
  template: CustomVocabularyPromptTemplateV1,
  entry: VocabularyEntryV1,
): boolean {
  if (!template.text.includes('{term}')) return false;
  if (entry.language === 'auto') return true;
  if (entry.language === 'mixed') return template.language === 'mixed';
  return template.language === entry.language || template.language === 'mixed';
}

function compareEntries(left: VocabularyEntryV1, right: VocabularyEntryV1): number {
  const priorityDelta = (right.promptPriority ?? 0) - (left.promptPriority ?? 0);
  if (priorityDelta !== 0) return priorityDelta;
  const leftRecordings = left.pronunciationRecordingIds?.length ?? 0;
  const rightRecordings = right.pronunciationRecordingIds?.length ?? 0;
  if (leftRecordings !== rightRecordings) return leftRecordings - rightRecordings;
  const weightDelta = right.weight - left.weight;
  if (weightDelta !== 0) return weightDelta;
  const displayDelta = left.displayForm.localeCompare(right.displayForm, 'vi');
  if (displayDelta !== 0) return displayDelta;
  return left.id.localeCompare(right.id, 'vi');
}

function compareTemplates(
  left: CustomVocabularyPromptTemplateV1,
  right: CustomVocabularyPromptTemplateV1,
): number {
  const leftPosition = positionOrder.indexOf(left.position);
  const rightPosition = positionOrder.indexOf(right.position);
  if (leftPosition !== rightPosition) return leftPosition - rightPosition;
  const languageDelta = left.language.localeCompare(right.language);
  if (languageDelta !== 0) return languageDelta;
  return left.id.localeCompare(right.id);
}

function makeGeneratedPromptId(
  entry: VocabularyEntryV1,
  template: CustomVocabularyPromptTemplateV1,
  voiceCondition: EnrollmentVoiceCondition,
): string {
  return `custom-vocab:${safeIdPart(entry.id)}:${safeIdPart(template.id)}:${voiceCondition}`;
}

export function parseCustomVocabularyPromptId(
  promptId: string,
): CustomVocabularyPromptIdPartsV1 | undefined {
  const match = /^custom-vocab:(.+):([^:]+):(whisper|normal|projected)$/u.exec(promptId);
  if (match === null) return undefined;
  return {
    vocabularyEntryId: match[1]!,
    templateId: match[2]!,
    voiceCondition: match[3] as EnrollmentVoiceCondition,
  };
}

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/gu, '_').slice(0, 96) || 'item';
}

function truncateTagValue(value: string): string {
  return safeIdPart(value).slice(0, 48);
}

function uniqueSortedTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags.map((tag) => tag.slice(0, 64)).filter((tag) => tag.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function estimateTermSeconds(displayForm: string): number {
  const tokenCount = [...displayForm.matchAll(/[\p{L}\p{N}]+/gu)].length;
  return Math.min(2, Math.max(0.3, tokenCount * 0.25));
}

function roundSeconds(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeVoiceConditionOrder(
  values: readonly EnrollmentVoiceCondition[],
): readonly EnrollmentVoiceCondition[] {
  const unique = [...new Set(values)];
  if (unique.length === 0) throw new Error('voiceConditions must contain at least one value.');
  return unique;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
