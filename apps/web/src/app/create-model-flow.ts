import type { EnrollmentSentenceLanguage } from '@speech/enrollment';
import { defaultPersonalProfileDisplayName } from './personal-models';

export type CreateModelLanguageTargetV1 = 'vietnamese' | 'english' | 'both';
export type CreateModelRecordingPlanV1 = 'quick' | 'recommended' | 'extended';

export interface CreateModelDraftV1 {
  readonly schemaVersion: 1;
  readonly displayName: string;
  readonly languageTarget: CreateModelLanguageTargetV1;
  readonly includeMixedSpeech: boolean;
  readonly recordingPlan: CreateModelRecordingPlanV1;
  readonly updatedAt: string;
  readonly privacy: {
    readonly localOnly: true;
    readonly uiOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsModelWeights: false;
  };
}

export interface CreateModelReviewV1 {
  readonly name: string;
  readonly speech: string;
  readonly mixedSpeech: string;
  readonly plan: string;
  readonly startRoute: `/models/${string}/enroll?returnTo=%2Fmodels%2Fnew`;
  readonly initialEnrollmentLanguage: EnrollmentSentenceLanguage;
  readonly privacy: CreateModelDraftV1['privacy'];
}

const createModelDraftStorageKey = 'speech:create-model-draft:v1';

const allowedLanguageTargets = new Set<CreateModelLanguageTargetV1>([
  'vietnamese',
  'english',
  'both',
]);
const allowedPlans = new Set<CreateModelRecordingPlanV1>(['quick', 'recommended', 'extended']);

export function createDefaultCreateModelDraft(now = new Date()): CreateModelDraftV1 {
  return createCreateModelDraft(
    {
      displayName: defaultPersonalProfileDisplayName,
      languageTarget: 'both',
      includeMixedSpeech: true,
      recordingPlan: 'recommended',
    },
    now,
  );
}

export function createCreateModelDraft(
  input: {
    readonly displayName: string;
    readonly languageTarget: CreateModelLanguageTargetV1;
    readonly includeMixedSpeech: boolean;
    readonly recordingPlan: CreateModelRecordingPlanV1;
  },
  now = new Date(),
): CreateModelDraftV1 {
  const displayName = normalizeDisplayName(input.displayName);
  const includeMixedSpeech = input.languageTarget === 'both' ? input.includeMixedSpeech : false;

  return {
    schemaVersion: 1,
    displayName,
    languageTarget: input.languageTarget,
    includeMixedSpeech,
    recordingPlan: input.recordingPlan,
    updatedAt: now.toISOString(),
    privacy: createCreateModelDraftPrivacy(),
  };
}

export function parseCreateModelDraft(raw: unknown): CreateModelDraftV1 | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) return null;
  const languageTarget = record['languageTarget'];
  const recordingPlan = record['recordingPlan'];
  if (!isLanguageTarget(languageTarget) || !isRecordingPlan(recordingPlan)) return null;
  return createCreateModelDraft(
    {
      displayName:
        typeof record['displayName'] === 'string'
          ? record['displayName']
          : defaultPersonalProfileDisplayName,
      languageTarget,
      includeMixedSpeech: record['includeMixedSpeech'] === true,
      recordingPlan,
    },
    parseUpdatedAt(record['updatedAt']),
  );
}

export function loadCreateModelDraft(storage: Storage | null | undefined): CreateModelDraftV1 {
  if (!storage) return createDefaultCreateModelDraft();
  try {
    const raw = storage.getItem(createModelDraftStorageKey);
    if (raw === null) return createDefaultCreateModelDraft();
    return parseCreateModelDraft(JSON.parse(raw)) ?? createDefaultCreateModelDraft();
  } catch {
    return createDefaultCreateModelDraft();
  }
}

export function saveCreateModelDraft(storage: Storage, draft: CreateModelDraftV1): void {
  storage.setItem(createModelDraftStorageKey, JSON.stringify(draft));
}

export function buildCreateModelReview(draft: CreateModelDraftV1): CreateModelReviewV1 {
  return {
    name: draft.displayName,
    speech: formatLanguageTarget(draft.languageTarget),
    mixedSpeech: formatMixedSpeech(draft),
    plan: formatRecordingPlan(draft.recordingPlan),
    startRoute: '/models/local-enrollment-profile/enroll?returnTo=%2Fmodels%2Fnew',
    initialEnrollmentLanguage: getInitialEnrollmentLanguage(draft),
    privacy: draft.privacy,
  };
}

export function resolveCreateModelProfileDisplayName(storage: Storage | null | undefined): string {
  return loadCreateModelDraft(storage).displayName;
}

export function resolveCreateModelEnrollmentLanguage(
  storage: Storage | null | undefined,
): EnrollmentSentenceLanguage {
  return buildCreateModelReview(loadCreateModelDraft(storage)).initialEnrollmentLanguage;
}

export function getCreateModelDraftStorageKey(): string {
  return createModelDraftStorageKey;
}

function normalizeDisplayName(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized.slice(0, 80) : defaultPersonalProfileDisplayName;
}

function formatLanguageTarget(languageTarget: CreateModelLanguageTargetV1): string {
  if (languageTarget === 'vietnamese') return 'Vietnamese speech';
  if (languageTarget === 'english') return 'English speech';
  return 'Vietnamese and English speech';
}

function formatMixedSpeech(draft: CreateModelDraftV1): string {
  if (draft.languageTarget !== 'both') return 'Not needed for this choice';
  return draft.includeMixedSpeech
    ? 'Include mixed Vietnamese and English'
    : 'Keep languages separate';
}

function formatRecordingPlan(plan: CreateModelRecordingPlanV1): string {
  if (plan === 'quick') return 'Quick recording plan';
  if (plan === 'extended') return 'Extended recording plan';
  return 'Recommended recording plan';
}

function getInitialEnrollmentLanguage(draft: CreateModelDraftV1): EnrollmentSentenceLanguage {
  if (draft.languageTarget === 'vietnamese') return 'vi';
  if (draft.languageTarget === 'english') return 'en';
  return draft.includeMixedSpeech ? 'mixed' : 'vi';
}

function isLanguageTarget(value: unknown): value is CreateModelLanguageTargetV1 {
  return (
    typeof value === 'string' && allowedLanguageTargets.has(value as CreateModelLanguageTargetV1)
  );
}

function isRecordingPlan(value: unknown): value is CreateModelRecordingPlanV1 {
  return typeof value === 'string' && allowedPlans.has(value as CreateModelRecordingPlanV1);
}

function parseUpdatedAt(value: unknown): Date {
  if (typeof value !== 'string') return new Date();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}

function createCreateModelDraftPrivacy(): CreateModelDraftV1['privacy'] {
  return {
    localOnly: true,
    uiOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsModelWeights: false,
  };
}
