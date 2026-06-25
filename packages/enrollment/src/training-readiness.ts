import {
  enrollmentSentenceLanguageValues,
  enrollmentVoiceConditionValues,
  type EnrollmentSentenceLanguage,
  type EnrollmentVoiceCondition,
} from './sentence-bank';
import type { EnrollmentTakeQualityStatus } from './quality';

export type TrainingReadinessStatus = 'ready' | 'needs-more-data';
export type TrainingReadinessRequirementStatus = 'pass' | 'missing';

export type TrainingReadinessRequirementCode =
  | 'accepted-utterances'
  | 'total-duration'
  | 'unique-prompt-identities'
  | 'language-utterances'
  | 'language-duration'
  | 'voice-condition-utterances'
  | 'voice-condition-duration'
  | 'vocabulary-covered-entries'
  | 'vocabulary-entry-utterances'
  | 'vocabulary-entry-duration';

export interface TrainingReadinessAcceptedUtteranceV1 {
  readonly schemaVersion?: 1;
  readonly utteranceId?: string;
  readonly promptId: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly durationMs: number;
  readonly qualityStatus?: EnrollmentTakeQualityStatus;
  readonly customVocabularyEntryId?: string;
}

export interface TrainingReadinessBucketTargetV1<TValue extends string> {
  readonly value: TValue;
  readonly minUtterances?: number;
  readonly minDurationSeconds?: number;
}

export interface TrainingReadinessVocabularyPolicyV1 {
  readonly minCoveredEntries: number;
  readonly minUtterancesPerEntry?: number;
  readonly minDurationSecondsPerEntry?: number;
  readonly requiredEntryIds?: readonly string[];
}

export interface TrainingReadinessPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly displayName: string;
  readonly minAcceptedUtterances: number;
  readonly minTotalDurationSeconds: number;
  readonly minUniquePromptIdentities: number;
  readonly languageTargets: readonly TrainingReadinessBucketTargetV1<EnrollmentSentenceLanguage>[];
  readonly voiceConditionTargets: readonly TrainingReadinessBucketTargetV1<EnrollmentVoiceCondition>[];
  readonly vocabulary: TrainingReadinessVocabularyPolicyV1;
}

export interface TrainingReadinessIdentityOptions {
  readonly promptLabelPrefix?: string;
  readonly vocabularyLabelPrefix?: string;
}

export interface TrainingReadinessRequirementResultV1 {
  readonly code: TrainingReadinessRequirementCode;
  readonly status: TrainingReadinessRequirementStatus;
  readonly label: string;
  readonly actual: number;
  readonly required: number;
  readonly missing: number;
}

export interface TrainingReadinessCoverageBucketV1<TValue extends string> {
  readonly value: TValue;
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly minUtterances: number;
  readonly minDurationSeconds: number;
  readonly missingUtterances: number;
  readonly missingDurationSeconds: number;
  readonly status: TrainingReadinessRequirementStatus;
}

export interface TrainingReadinessPromptIdentityCoverageV1 {
  readonly label: string;
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly languages: readonly EnrollmentSentenceLanguage[];
  readonly voiceConditions: readonly EnrollmentVoiceCondition[];
}

export interface TrainingReadinessPromptCoverageV1 {
  readonly uniquePromptIdentities: number;
  readonly minUniquePromptIdentities: number;
  readonly missingPromptIdentities: number;
  readonly promptIdentities: readonly TrainingReadinessPromptIdentityCoverageV1[];
}

export interface TrainingReadinessVocabularyEntryCoverageV1 {
  readonly label: string;
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly minUtterances: number;
  readonly minDurationSeconds: number;
  readonly missingUtterances: number;
  readonly missingDurationSeconds: number;
  readonly status: TrainingReadinessRequirementStatus;
}

export interface TrainingReadinessVocabularyCoverageV1 {
  readonly coveredEntryCount: number;
  readonly targetedEntryCount: number;
  readonly minCoveredEntries: number;
  readonly missingCoveredEntries: number;
  readonly entries: readonly TrainingReadinessVocabularyEntryCoverageV1[];
}

export interface TrainingReadinessPolicyReportSummaryV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly displayName: string;
  readonly minAcceptedUtterances: number;
  readonly minTotalDurationSeconds: number;
  readonly minUniquePromptIdentities: number;
  readonly languageTargets: readonly TrainingReadinessBucketTargetV1<EnrollmentSentenceLanguage>[];
  readonly voiceConditionTargets: readonly TrainingReadinessBucketTargetV1<EnrollmentVoiceCondition>[];
  readonly vocabulary: {
    readonly minCoveredEntries: number;
    readonly minUtterancesPerEntry?: number;
    readonly minDurationSecondsPerEntry?: number;
    readonly requiredEntryCount: number;
  };
}

export interface TrainingReadinessCoverageReportV1 {
  readonly schemaVersion: 1;
  readonly status: TrainingReadinessStatus;
  readonly automaticTrainingAllowed: boolean;
  readonly policy: TrainingReadinessPolicyReportSummaryV1;
  readonly totals: {
    readonly acceptedUtterances: number;
    readonly totalDurationSeconds: number;
    readonly uniquePromptIdentities: number;
    readonly qualityStatusCounts: Readonly<Record<string, number>>;
  };
  readonly languageCoverage: readonly TrainingReadinessCoverageBucketV1<EnrollmentSentenceLanguage>[];
  readonly voiceConditionCoverage: readonly TrainingReadinessCoverageBucketV1<EnrollmentVoiceCondition>[];
  readonly promptCoverage: TrainingReadinessPromptCoverageV1;
  readonly vocabularyCoverage: TrainingReadinessVocabularyCoverageV1;
  readonly requirements: readonly TrainingReadinessRequirementResultV1[];
  readonly missingRequirements: readonly TrainingReadinessRequirementResultV1[];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly exposesRawPromptIds: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly localOnly: true;
  };
}

export const defaultTrainingReadinessPolicyV1: TrainingReadinessPolicyV1 = {
  schemaVersion: 1,
  policyId: 'browser-personal-model-training-readiness-v1',
  displayName: 'Browser personal-model training readiness',
  minAcceptedUtterances: 24,
  minTotalDurationSeconds: 120,
  minUniquePromptIdentities: 12,
  languageTargets: [
    { value: 'vi', minUtterances: 6, minDurationSeconds: 30 },
    { value: 'en', minUtterances: 4, minDurationSeconds: 20 },
    { value: 'mixed', minUtterances: 4, minDurationSeconds: 20 },
  ],
  voiceConditionTargets: [
    { value: 'normal', minUtterances: 12, minDurationSeconds: 60 },
    { value: 'whisper', minUtterances: 4, minDurationSeconds: 16 },
    { value: 'projected', minUtterances: 4, minDurationSeconds: 16 },
  ],
  vocabulary: {
    minCoveredEntries: 0,
    minUtterancesPerEntry: 1,
    minDurationSecondsPerEntry: 2,
  },
};

export function buildTrainingReadinessCoverageReport(
  utterances: readonly TrainingReadinessAcceptedUtteranceV1[],
  policy: TrainingReadinessPolicyV1 = defaultTrainingReadinessPolicyV1,
  identityOptions: TrainingReadinessIdentityOptions = {},
): TrainingReadinessCoverageReportV1 {
  validateTrainingReadinessPolicy(policy);
  const normalizedUtterances = utterances.map(validateTrainingReadinessUtterance);
  const totalDurationSeconds = roundSeconds(
    normalizedUtterances.reduce((total, utterance) => total + utterance.durationMs / 1_000, 0),
  );
  const promptCoverage = buildPromptCoverage(
    normalizedUtterances,
    policy.minUniquePromptIdentities,
    identityOptions.promptLabelPrefix ?? 'prompt',
  );
  const vocabularyCoverage = buildVocabularyCoverage(
    normalizedUtterances,
    policy.vocabulary,
    identityOptions.vocabularyLabelPrefix ?? 'vocab',
  );
  const languageCoverage = policy.languageTargets.map((target) =>
    buildBucketCoverage(target, normalizedUtterances, 'language'),
  );
  const voiceConditionCoverage = policy.voiceConditionTargets.map((target) =>
    buildBucketCoverage(target, normalizedUtterances, 'voiceCondition'),
  );
  const requirements: TrainingReadinessRequirementResultV1[] = [
    makeRequirement(
      'accepted-utterances',
      'Accepted utterances',
      normalizedUtterances.length,
      policy.minAcceptedUtterances,
    ),
    makeRequirement(
      'total-duration',
      'Accepted duration seconds',
      totalDurationSeconds,
      policy.minTotalDurationSeconds,
    ),
    makeRequirement(
      'unique-prompt-identities',
      'Unique prompt identities',
      promptCoverage.uniquePromptIdentities,
      policy.minUniquePromptIdentities,
    ),
    ...languageCoverage.flatMap((bucket) => bucketRequirements(bucket, 'language')),
    ...voiceConditionCoverage.flatMap((bucket) => bucketRequirements(bucket, 'voice-condition')),
    makeRequirement(
      'vocabulary-covered-entries',
      'Covered vocabulary entries',
      vocabularyCoverage.coveredEntryCount,
      policy.vocabulary.minCoveredEntries,
    ),
    ...vocabularyCoverage.entries.flatMap((entry) => vocabularyEntryRequirements(entry)),
  ].filter((requirement) => requirement.required > 0);
  const missingRequirements = requirements.filter(
    (requirement) => requirement.status === 'missing',
  );
  const status: TrainingReadinessStatus =
    missingRequirements.length === 0 ? 'ready' : 'needs-more-data';

  return {
    schemaVersion: 1,
    status,
    automaticTrainingAllowed: status === 'ready',
    policy: summarizePolicyForReport(policy),
    totals: {
      acceptedUtterances: normalizedUtterances.length,
      totalDurationSeconds,
      uniquePromptIdentities: promptCoverage.uniquePromptIdentities,
      qualityStatusCounts: countQualityStatuses(normalizedUtterances),
    },
    languageCoverage,
    voiceConditionCoverage,
    promptCoverage,
    vocabularyCoverage,
    requirements,
    missingRequirements,
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      containsPrivateVocabularyTerms: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}

export function inferCustomVocabularyEntryIdFromPromptId(promptId: string): string | undefined {
  const match = /^custom-vocab:(.+):[^:]+:(?:whisper|normal|projected)$/u.exec(promptId);
  return match?.[1];
}

function summarizePolicyForReport(
  policy: TrainingReadinessPolicyV1,
): TrainingReadinessPolicyReportSummaryV1 {
  return {
    schemaVersion: policy.schemaVersion,
    policyId: policy.policyId,
    displayName: policy.displayName,
    minAcceptedUtterances: policy.minAcceptedUtterances,
    minTotalDurationSeconds: policy.minTotalDurationSeconds,
    minUniquePromptIdentities: policy.minUniquePromptIdentities,
    languageTargets: policy.languageTargets,
    voiceConditionTargets: policy.voiceConditionTargets,
    vocabulary: {
      minCoveredEntries: policy.vocabulary.minCoveredEntries,
      ...(policy.vocabulary.minUtterancesPerEntry === undefined
        ? {}
        : { minUtterancesPerEntry: policy.vocabulary.minUtterancesPerEntry }),
      ...(policy.vocabulary.minDurationSecondsPerEntry === undefined
        ? {}
        : { minDurationSecondsPerEntry: policy.vocabulary.minDurationSecondsPerEntry }),
      requiredEntryCount: new Set(policy.vocabulary.requiredEntryIds ?? []).size,
    },
  };
}

function validateTrainingReadinessPolicy(policy: TrainingReadinessPolicyV1): void {
  if (policy.schemaVersion !== 1)
    throw new Error('TrainingReadinessPolicyV1 schemaVersion must be 1.');
  requireNonEmpty(policy.policyId, 'policyId');
  requireNonEmpty(policy.displayName, 'displayName');
  requireNonNegativeInteger(policy.minAcceptedUtterances, 'minAcceptedUtterances');
  requireNonNegativeNumber(policy.minTotalDurationSeconds, 'minTotalDurationSeconds');
  requireNonNegativeInteger(policy.minUniquePromptIdentities, 'minUniquePromptIdentities');
  for (const target of policy.languageTargets) {
    if (!isEnrollmentLanguage(target.value))
      throw new Error(`Unsupported language target ${target.value}.`);
    validateBucketTarget(target, `languageTargets.${target.value}`);
  }
  for (const target of policy.voiceConditionTargets) {
    if (!isEnrollmentVoiceCondition(target.value)) {
      throw new Error(`Unsupported voice condition target ${target.value}.`);
    }
    validateBucketTarget(target, `voiceConditionTargets.${target.value}`);
  }
  requireNonNegativeInteger(policy.vocabulary.minCoveredEntries, 'vocabulary.minCoveredEntries');
  if (policy.vocabulary.minUtterancesPerEntry !== undefined) {
    requireNonNegativeInteger(
      policy.vocabulary.minUtterancesPerEntry,
      'vocabulary.minUtterancesPerEntry',
    );
  }
  if (policy.vocabulary.minDurationSecondsPerEntry !== undefined) {
    requireNonNegativeNumber(
      policy.vocabulary.minDurationSecondsPerEntry,
      'vocabulary.minDurationSecondsPerEntry',
    );
  }
}

function validateBucketTarget<TValue extends string>(
  target: TrainingReadinessBucketTargetV1<TValue>,
  path: string,
): void {
  if (target.minUtterances !== undefined)
    requireNonNegativeInteger(target.minUtterances, `${path}.minUtterances`);
  if (target.minDurationSeconds !== undefined) {
    requireNonNegativeNumber(target.minDurationSeconds, `${path}.minDurationSeconds`);
  }
}

function validateTrainingReadinessUtterance(
  utterance: TrainingReadinessAcceptedUtteranceV1,
): TrainingReadinessAcceptedUtteranceV1 {
  requireNonEmpty(utterance.promptId, 'utterance.promptId');
  if (!isEnrollmentLanguage(utterance.language))
    throw new Error(`Unsupported utterance language ${utterance.language}.`);
  if (!isEnrollmentVoiceCondition(utterance.voiceCondition)) {
    throw new Error(`Unsupported utterance voice condition ${utterance.voiceCondition}.`);
  }
  requireNonNegativeNumber(utterance.durationMs, 'utterance.durationMs');
  const inferredCustomVocabularyEntryId =
    utterance.customVocabularyEntryId ??
    inferCustomVocabularyEntryIdFromPromptId(utterance.promptId);
  if (inferredCustomVocabularyEntryId === undefined) return utterance;
  return { ...utterance, customVocabularyEntryId: inferredCustomVocabularyEntryId };
}

function buildBucketCoverage<TValue extends EnrollmentSentenceLanguage | EnrollmentVoiceCondition>(
  target: TrainingReadinessBucketTargetV1<TValue>,
  utterances: readonly TrainingReadinessAcceptedUtteranceV1[],
  field: 'language' | 'voiceCondition',
): TrainingReadinessCoverageBucketV1<TValue> {
  const matching = utterances.filter((utterance) => utterance[field] === target.value);
  const utteranceCount = matching.length;
  const durationSeconds = roundSeconds(
    matching.reduce((total, utterance) => total + utterance.durationMs / 1_000, 0),
  );
  const minUtterances = target.minUtterances ?? 0;
  const minDurationSeconds = target.minDurationSeconds ?? 0;
  const missingUtterances = Math.max(0, minUtterances - utteranceCount);
  const missingDurationSeconds = roundSeconds(Math.max(0, minDurationSeconds - durationSeconds));
  return {
    value: target.value,
    utterances: utteranceCount,
    durationSeconds,
    minUtterances,
    minDurationSeconds,
    missingUtterances,
    missingDurationSeconds,
    status: missingUtterances === 0 && missingDurationSeconds === 0 ? 'pass' : 'missing',
  };
}

function buildPromptCoverage(
  utterances: readonly TrainingReadinessAcceptedUtteranceV1[],
  minUniquePromptIdentities: number,
  labelPrefix: string,
): TrainingReadinessPromptCoverageV1 {
  const grouped = new Map<string, MutableIdentityBucket>();
  for (const utterance of utterances) {
    const bucket = getIdentityBucket(grouped, utterance.promptId);
    bucket.utterances += 1;
    bucket.durationSeconds += utterance.durationMs / 1_000;
    bucket.languages.add(utterance.language);
    bucket.voiceConditions.add(utterance.voiceCondition);
  }
  const labelMap = createRedactedLabelMap([...grouped.keys()], labelPrefix);
  const promptIdentities = [...grouped.entries()]
    .map(([promptId, bucket]) => ({
      label: labelMap.get(promptId) ?? `${labelPrefix}-unknown`,
      utterances: bucket.utterances,
      durationSeconds: roundSeconds(bucket.durationSeconds),
      languages: [...bucket.languages].sort(compareLanguage),
      voiceConditions: [...bucket.voiceConditions].sort(compareVoiceCondition),
    }))
    .sort(comparePromptIdentityCoverage);
  return {
    uniquePromptIdentities: grouped.size,
    minUniquePromptIdentities,
    missingPromptIdentities: Math.max(0, minUniquePromptIdentities - grouped.size),
    promptIdentities,
  };
}

function buildVocabularyCoverage(
  utterances: readonly TrainingReadinessAcceptedUtteranceV1[],
  policy: TrainingReadinessVocabularyPolicyV1,
  labelPrefix: string,
): TrainingReadinessVocabularyCoverageV1 {
  const grouped = new Map<string, MutableDurationBucket>();
  const requiredIds = new Set(policy.requiredEntryIds ?? []);
  for (const utterance of utterances) {
    const entryId = utterance.customVocabularyEntryId;
    if (entryId === undefined || entryId.length === 0) continue;
    const bucket = getDurationBucket(grouped, entryId);
    bucket.utterances += 1;
    bucket.durationSeconds += utterance.durationMs / 1_000;
    requiredIds.add(entryId);
  }
  const targetIds = [...new Set([...requiredIds, ...grouped.keys()])].sort((left, right) =>
    left.localeCompare(right, 'vi'),
  );
  const labelMap = createRedactedLabelMap(targetIds, labelPrefix);
  const minUtterances = policy.minUtterancesPerEntry ?? 0;
  const minDurationSeconds = policy.minDurationSecondsPerEntry ?? 0;
  const entries = targetIds.map((entryId) => {
    const bucket = grouped.get(entryId) ?? { utterances: 0, durationSeconds: 0 };
    const durationSeconds = roundSeconds(bucket.durationSeconds);
    const missingUtterances = Math.max(0, minUtterances - bucket.utterances);
    const missingDurationSeconds = roundSeconds(Math.max(0, minDurationSeconds - durationSeconds));
    return {
      label: labelMap.get(entryId) ?? `${labelPrefix}-unknown`,
      utterances: bucket.utterances,
      durationSeconds,
      minUtterances,
      minDurationSeconds,
      missingUtterances,
      missingDurationSeconds,
      status: missingUtterances === 0 && missingDurationSeconds === 0 ? 'pass' : 'missing',
    } satisfies TrainingReadinessVocabularyEntryCoverageV1;
  });
  const coveredEntryCount = entries.filter((entry) => entry.utterances > 0).length;
  return {
    coveredEntryCount,
    targetedEntryCount: entries.length,
    minCoveredEntries: policy.minCoveredEntries,
    missingCoveredEntries: Math.max(0, policy.minCoveredEntries - coveredEntryCount),
    entries,
  };
}

function bucketRequirements<TValue extends string>(
  bucket: TrainingReadinessCoverageBucketV1<TValue>,
  prefix: 'language' | 'voice-condition',
): readonly TrainingReadinessRequirementResultV1[] {
  return [
    makeRequirement(
      prefix === 'language' ? 'language-utterances' : 'voice-condition-utterances',
      `${prefix}:${bucket.value}:utterances`,
      bucket.utterances,
      bucket.minUtterances,
    ),
    makeRequirement(
      prefix === 'language' ? 'language-duration' : 'voice-condition-duration',
      `${prefix}:${bucket.value}:duration-seconds`,
      bucket.durationSeconds,
      bucket.minDurationSeconds,
    ),
  ];
}

function vocabularyEntryRequirements(
  entry: TrainingReadinessVocabularyEntryCoverageV1,
): readonly TrainingReadinessRequirementResultV1[] {
  return [
    makeRequirement(
      'vocabulary-entry-utterances',
      `vocabulary:${entry.label}:utterances`,
      entry.utterances,
      entry.minUtterances,
    ),
    makeRequirement(
      'vocabulary-entry-duration',
      `vocabulary:${entry.label}:duration-seconds`,
      entry.durationSeconds,
      entry.minDurationSeconds,
    ),
  ];
}

function makeRequirement(
  code: TrainingReadinessRequirementCode,
  label: string,
  actual: number,
  required: number,
): TrainingReadinessRequirementResultV1 {
  const missing = roundSeconds(Math.max(0, required - actual));
  return {
    code,
    status: missing === 0 ? 'pass' : 'missing',
    label,
    actual: roundSeconds(actual),
    required,
    missing,
  };
}

function countQualityStatuses(
  utterances: readonly TrainingReadinessAcceptedUtteranceV1[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const utterance of utterances) {
    const key = utterance.qualityStatus ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createRedactedLabelMap(
  keys: readonly string[],
  prefix: string,
): ReadonlyMap<string, string> {
  const normalizedPrefix = prefix.replace(/[^A-Za-z0-9._:-]/gu, '-').slice(0, 24) || 'id';
  return new Map(
    [...new Set(keys)]
      .sort((left, right) => left.localeCompare(right, 'vi'))
      .map((key, index) => [key, `${normalizedPrefix}-${(index + 1).toString().padStart(3, '0')}`]),
  );
}

function getIdentityBucket(
  grouped: Map<string, MutableIdentityBucket>,
  key: string,
): MutableIdentityBucket {
  const existing = grouped.get(key);
  if (existing !== undefined) return existing;
  const bucket: MutableIdentityBucket = {
    utterances: 0,
    durationSeconds: 0,
    languages: new Set(),
    voiceConditions: new Set(),
  };
  grouped.set(key, bucket);
  return bucket;
}

function getDurationBucket(
  grouped: Map<string, MutableDurationBucket>,
  key: string,
): MutableDurationBucket {
  const existing = grouped.get(key);
  if (existing !== undefined) return existing;
  const bucket: MutableDurationBucket = { utterances: 0, durationSeconds: 0 };
  grouped.set(key, bucket);
  return bucket;
}

function comparePromptIdentityCoverage(
  left: TrainingReadinessPromptIdentityCoverageV1,
  right: TrainingReadinessPromptIdentityCoverageV1,
): number {
  const durationDelta = right.durationSeconds - left.durationSeconds;
  if (durationDelta !== 0) return durationDelta;
  const countDelta = right.utterances - left.utterances;
  if (countDelta !== 0) return countDelta;
  return left.label.localeCompare(right.label);
}

function compareLanguage(
  left: EnrollmentSentenceLanguage,
  right: EnrollmentSentenceLanguage,
): number {
  return (
    enrollmentSentenceLanguageValues.indexOf(left) - enrollmentSentenceLanguageValues.indexOf(right)
  );
}

function compareVoiceCondition(
  left: EnrollmentVoiceCondition,
  right: EnrollmentVoiceCondition,
): number {
  return (
    enrollmentVoiceConditionValues.indexOf(left) - enrollmentVoiceConditionValues.indexOf(right)
  );
}

function isEnrollmentLanguage(value: string): value is EnrollmentSentenceLanguage {
  return enrollmentSentenceLanguageValues.includes(value as EnrollmentSentenceLanguage);
}

function isEnrollmentVoiceCondition(value: string): value is EnrollmentVoiceCondition {
  return enrollmentVoiceConditionValues.includes(value as EnrollmentVoiceCondition);
}

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${field} must be non-empty.`);
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${field} must be a non-negative integer.`);
}

function requireNonNegativeNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be a non-negative number.`);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

interface MutableDurationBucket {
  utterances: number;
  durationSeconds: number;
}

interface MutableIdentityBucket extends MutableDurationBucket {
  languages: Set<EnrollmentSentenceLanguage>;
  voiceConditions: Set<EnrollmentVoiceCondition>;
}
