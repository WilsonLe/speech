import {
  enrollmentSentenceLanguageValues,
  enrollmentVoiceConditionValues,
  type EnrollmentSentenceLanguage,
  type EnrollmentVoiceCondition,
} from './sentence-bank';

export type PromptIdentitySplitName = 'train' | 'validation' | 'test';

export interface PromptIdentitySplitUtteranceV1 {
  readonly schemaVersion?: 1;
  readonly utteranceId?: string;
  readonly promptId: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly durationMs?: number;
  readonly customVocabularyEntryIds?: readonly string[];
}

export interface PromptIdentitySplitConfigV1 {
  readonly schemaVersion?: 1;
  readonly seed?: string | number;
  readonly trainRatio?: number;
  readonly validationRatio?: number;
  readonly testRatio?: number;
}

export interface PromptIdentitySplitRatiosV1 {
  readonly train: number;
  readonly validation: number;
  readonly test: number;
}

export interface PromptIdentitySplitTargetCountsV1 {
  readonly train: number;
  readonly validation: number;
  readonly test: number;
}

export interface PromptIdentitySplitAssignmentV1 {
  readonly promptId: string;
  readonly split: PromptIdentitySplitName;
  readonly utteranceIds: readonly string[];
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly languages: readonly EnrollmentSentenceLanguage[];
  readonly voiceConditions: readonly EnrollmentVoiceCondition[];
  readonly selectedVocabularyEntryIds: readonly string[];
}

export interface RedactedPromptIdentitySplitAssignmentV1 {
  readonly label: string;
  readonly split: PromptIdentitySplitName;
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly languages: readonly EnrollmentSentenceLanguage[];
  readonly voiceConditions: readonly EnrollmentVoiceCondition[];
  readonly selectedVocabularyEntryCount: number;
}

export interface PromptIdentitySplitBucketV1 {
  readonly promptIdentities: number;
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly selectedVocabularyPromptIdentities: number;
}

export interface PromptIdentitySplitPlanV1 {
  readonly schemaVersion: 1;
  readonly algorithmId: 'seeded-stratified-prompt-identity-v1';
  readonly seed: string;
  readonly ratios: PromptIdentitySplitRatiosV1;
  readonly targetPromptIdentities: PromptIdentitySplitTargetCountsV1;
  readonly totals: {
    readonly promptIdentities: number;
    readonly utterances: number;
    readonly durationSeconds: number;
  };
  readonly splits: Readonly<Record<PromptIdentitySplitName, PromptIdentitySplitBucketV1>>;
  readonly assignments: readonly PromptIdentitySplitAssignmentV1[];
  readonly privacy: {
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: true;
    readonly exposesRawVocabularyEntryIds: true;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface PromptIdentitySplitReportV1 {
  readonly schemaVersion: 1;
  readonly algorithmId: 'seeded-stratified-prompt-identity-v1';
  readonly seed: string;
  readonly ratios: PromptIdentitySplitRatiosV1;
  readonly targetPromptIdentities: PromptIdentitySplitTargetCountsV1;
  readonly totals: PromptIdentitySplitPlanV1['totals'];
  readonly splits: PromptIdentitySplitPlanV1['splits'];
  readonly assignments: readonly RedactedPromptIdentitySplitAssignmentV1[];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

interface NormalizedSplitConfig {
  readonly seed: string;
  readonly ratios: PromptIdentitySplitRatiosV1;
  readonly normalizedRatios: PromptIdentitySplitRatiosV1;
}

interface PromptIdentityGroup {
  readonly promptId: string;
  readonly utteranceIds: readonly string[];
  readonly utterances: number;
  readonly durationSeconds: number;
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly languages: readonly EnrollmentSentenceLanguage[];
  readonly voiceConditions: readonly EnrollmentVoiceCondition[];
  readonly selectedVocabularyEntryIds: readonly string[];
}

const splitNames = [
  'train',
  'validation',
  'test',
] as const satisfies readonly PromptIdentitySplitName[];

export const defaultPromptIdentitySplitConfigV1: Required<PromptIdentitySplitConfigV1> = {
  schemaVersion: 1,
  seed: '0',
  trainRatio: 0.8,
  validationRatio: 0.1,
  testRatio: 0.1,
};

export function buildPromptIdentitySplitPlan(
  utterances: readonly PromptIdentitySplitUtteranceV1[],
  config: PromptIdentitySplitConfigV1 = defaultPromptIdentitySplitConfigV1,
): PromptIdentitySplitPlanV1 {
  const normalizedConfig = normalizeSplitConfig(config);
  const groups = groupByPromptIdentity(utterances, normalizedConfig.seed);
  const targetPromptIdentities = allocatePromptTargets(
    groups.length,
    normalizedConfig.normalizedRatios,
  );
  const assignmentsByPrompt = assignGroupsToSplits(
    groups,
    targetPromptIdentities,
    normalizedConfig,
  );
  const assignments = groups
    .map(
      (group): PromptIdentitySplitAssignmentV1 => ({
        promptId: group.promptId,
        split: assignmentsByPrompt.get(group.promptId) ?? 'train',
        utteranceIds: group.utteranceIds,
        utterances: group.utterances,
        durationSeconds: group.durationSeconds,
        languages: group.languages,
        voiceConditions: group.voiceConditions,
        selectedVocabularyEntryIds: group.selectedVocabularyEntryIds,
      }),
    )
    .sort((left, right) => left.promptId.localeCompare(right.promptId));
  const splits = summarizeSplitBuckets(groups, assignmentsByPrompt);
  return {
    schemaVersion: 1,
    algorithmId: 'seeded-stratified-prompt-identity-v1',
    seed: normalizedConfig.seed,
    ratios: normalizedConfig.ratios,
    targetPromptIdentities,
    totals: {
      promptIdentities: groups.length,
      utterances: groups.reduce((total, group) => total + group.utterances, 0),
      durationSeconds: roundSeconds(
        groups.reduce((total, group) => total + group.durationSeconds, 0),
      ),
    },
    splits,
    assignments,
    privacy: {
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawPromptIds: true,
      exposesRawVocabularyEntryIds: true,
      networkUpload: false,
      telemetry: false,
    },
  };
}

export function summarizePromptIdentitySplitPlan(
  plan: PromptIdentitySplitPlanV1,
  labelPrefix = 'prompt',
): PromptIdentitySplitReportV1 {
  const labels = new Map<string, string>();
  plan.assignments.forEach((assignment, index) => {
    labels.set(assignment.promptId, `${labelPrefix}-${(index + 1).toString().padStart(3, '0')}`);
  });
  return {
    schemaVersion: 1,
    algorithmId: plan.algorithmId,
    seed: plan.seed,
    ratios: plan.ratios,
    targetPromptIdentities: plan.targetPromptIdentities,
    totals: plan.totals,
    splits: plan.splits,
    assignments: plan.assignments.map((assignment) => ({
      label: labels.get(assignment.promptId) ?? `${labelPrefix}-unknown`,
      split: assignment.split,
      utterances: assignment.utterances,
      durationSeconds: assignment.durationSeconds,
      languages: assignment.languages,
      voiceConditions: assignment.voiceConditions,
      selectedVocabularyEntryCount: assignment.selectedVocabularyEntryIds.length,
    })),
    privacy: {
      aggregateOnly: true,
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
      networkUpload: false,
      telemetry: false,
    },
  };
}

function normalizeSplitConfig(config: PromptIdentitySplitConfigV1): NormalizedSplitConfig {
  const seed = String(config.seed ?? defaultPromptIdentitySplitConfigV1.seed);
  const ratios: PromptIdentitySplitRatiosV1 = {
    train: assertFiniteRatio(
      config.trainRatio ?? defaultPromptIdentitySplitConfigV1.trainRatio,
      'trainRatio',
    ),
    validation: assertFiniteRatio(
      config.validationRatio ?? defaultPromptIdentitySplitConfigV1.validationRatio,
      'validationRatio',
    ),
    test: assertFiniteRatio(
      config.testRatio ?? defaultPromptIdentitySplitConfigV1.testRatio,
      'testRatio',
    ),
  };
  const total = ratios.train + ratios.validation + ratios.test;
  if (total <= 0) {
    throw new Error('Prompt identity split ratios must have a positive sum.');
  }
  return {
    seed,
    ratios,
    normalizedRatios: {
      train: ratios.train / total,
      validation: ratios.validation / total,
      test: ratios.test / total,
    },
  };
}

function groupByPromptIdentity(
  utterances: readonly PromptIdentitySplitUtteranceV1[],
  seed: string,
): PromptIdentityGroup[] {
  const grouped = new Map<string, PromptIdentitySplitUtteranceV1[]>();
  utterances.forEach((utterance) => {
    validateUtterance(utterance);
    const bucket = grouped.get(utterance.promptId) ?? [];
    bucket.push(utterance);
    grouped.set(utterance.promptId, bucket);
  });
  return [...grouped.entries()]
    .map(([promptId, records]) => createPromptGroup(promptId, records))
    .sort((left, right) => {
      const utteranceDelta = right.utterances - left.utterances;
      if (utteranceDelta !== 0) return utteranceDelta;
      const conditionDelta = right.voiceConditions.length - left.voiceConditions.length;
      if (conditionDelta !== 0) return conditionDelta;
      const languageDelta = right.languages.length - left.languages.length;
      if (languageDelta !== 0) return languageDelta;
      return stableHashKey(seed, left.promptId).localeCompare(stableHashKey(seed, right.promptId));
    });
}

function createPromptGroup(
  promptId: string,
  utterances: readonly PromptIdentitySplitUtteranceV1[],
): PromptIdentityGroup {
  const languageCounts = createLanguageCounts();
  const voiceConditionCounts = createVoiceConditionCounts();
  const utteranceIds: string[] = [];
  const selectedVocabularyEntryIds = new Set<string>();
  let durationSeconds = 0;
  utterances.forEach((utterance, index) => {
    languageCounts[utterance.language] += 1;
    voiceConditionCounts[utterance.voiceCondition] += 1;
    durationSeconds += (utterance.durationMs ?? 0) / 1_000;
    utteranceIds.push(utterance.utteranceId ?? `${promptId}:utterance-${index + 1}`);
    for (const entryId of utterance.customVocabularyEntryIds ?? []) {
      const normalizedEntryId = entryId.trim();
      if (normalizedEntryId.length > 0) selectedVocabularyEntryIds.add(normalizedEntryId);
    }
  });
  return {
    promptId,
    utteranceIds: utteranceIds.sort(),
    utterances: utterances.length,
    durationSeconds: roundSeconds(durationSeconds),
    languageCounts,
    voiceConditionCounts,
    languages: enrollmentSentenceLanguageValues.filter((language) => languageCounts[language] > 0),
    voiceConditions: enrollmentVoiceConditionValues.filter(
      (condition) => voiceConditionCounts[condition] > 0,
    ),
    selectedVocabularyEntryIds: [...selectedVocabularyEntryIds].sort((left, right) =>
      left.localeCompare(right, 'vi'),
    ),
  };
}

function allocatePromptTargets(
  promptIdentityCount: number,
  ratios: PromptIdentitySplitRatiosV1,
): PromptIdentitySplitTargetCountsV1 {
  if (promptIdentityCount <= 0) return { train: 0, validation: 0, test: 0 };
  const raw = splitNames.map((split) => ({
    split,
    raw: promptIdentityCount * ratios[split],
    floor: Math.floor(promptIdentityCount * ratios[split]),
    ratio: ratios[split],
  }));
  const targets: Record<PromptIdentitySplitName, number> = { train: 0, validation: 0, test: 0 };
  let assigned = 0;
  raw.forEach((entry) => {
    targets[entry.split] = entry.floor;
    assigned += entry.floor;
  });
  const remainderOrder = [...raw].sort((left, right) => {
    const fractionDelta = right.raw - right.floor - (left.raw - left.floor);
    if (fractionDelta !== 0) return fractionDelta;
    const ratioDelta = right.ratio - left.ratio;
    if (ratioDelta !== 0) return ratioDelta;
    return splitNames.indexOf(left.split) - splitNames.indexOf(right.split);
  });
  while (assigned < promptIdentityCount) {
    for (const entry of remainderOrder) {
      if (assigned >= promptIdentityCount) break;
      targets[entry.split] += 1;
      assigned += 1;
    }
  }

  const activeSplits = splitNames.filter((split) => ratios[split] > 0);
  if (promptIdentityCount < activeSplits.length) {
    const tinyTargets: Record<PromptIdentitySplitName, number> = {
      train: 0,
      validation: 0,
      test: 0,
    };
    [...activeSplits]
      .sort((left, right) => {
        const ratioDelta = ratios[right] - ratios[left];
        if (ratioDelta !== 0) return ratioDelta;
        return splitNames.indexOf(left) - splitNames.indexOf(right);
      })
      .slice(0, promptIdentityCount)
      .forEach((split) => {
        tinyTargets[split] = 1;
      });
    return { train: tinyTargets.train, validation: tinyTargets.validation, test: tinyTargets.test };
  }

  for (const split of activeSplits) {
    if (targets[split] > 0) continue;
    const donor = [...activeSplits]
      .filter((candidate) => targets[candidate] > 1)
      .sort((left, right) => targets[right] - targets[left])[0];
    if (donor === undefined) continue;
    targets[donor] -= 1;
    targets[split] += 1;
  }

  return { train: targets.train, validation: targets.validation, test: targets.test };
}

function assignGroupsToSplits(
  groups: readonly PromptIdentityGroup[],
  targets: PromptIdentitySplitTargetCountsV1,
  config: NormalizedSplitConfig,
): ReadonlyMap<string, PromptIdentitySplitName> {
  const totals = summarizeTotals(groups);
  const buckets = createMutableSplitBuckets();
  const assignments = new Map<string, PromptIdentitySplitName>();
  groups.forEach((group) => {
    const split = chooseBestSplit(group, buckets, targets, totals, config);
    addGroupToBucket(buckets[split], group);
    assignments.set(group.promptId, split);
  });
  return assignments;
}

function chooseBestSplit(
  group: PromptIdentityGroup,
  buckets: Record<PromptIdentitySplitName, MutablePromptSplitBucket>,
  targets: PromptIdentitySplitTargetCountsV1,
  totals: PromptIdentitySplitBucketV1,
  config: NormalizedSplitConfig,
): PromptIdentitySplitName {
  const candidates = splitNames.filter((split) => buckets[split].promptIdentities < targets[split]);
  const available = candidates.length > 0 ? candidates : splitNames;
  let best = available[0] ?? 'train';
  let bestScore = Number.POSITIVE_INFINITY;
  let bestTie = Number.POSITIVE_INFINITY;
  for (const split of available) {
    const score = scoreCandidate(group, split, buckets, targets, totals, config);
    const tie = stableHashNumber(`${config.seed}:${group.promptId}:${split}`);
    if (score < bestScore || (score === bestScore && tie < bestTie)) {
      best = split;
      bestScore = score;
      bestTie = tie;
    }
  }
  return best;
}

function scoreCandidate(
  group: PromptIdentityGroup,
  split: PromptIdentitySplitName,
  buckets: Record<PromptIdentitySplitName, MutablePromptSplitBucket>,
  targets: PromptIdentitySplitTargetCountsV1,
  totals: PromptIdentitySplitBucketV1,
  config: NormalizedSplitConfig,
): number {
  let score = 0;
  for (const candidate of splitNames) {
    const promptIdentities = buckets[candidate].promptIdentities + (candidate === split ? 1 : 0);
    score += Math.pow(promptIdentities - targets[candidate], 2) * 20;
    const durationSeconds =
      buckets[candidate].durationSeconds + (candidate === split ? group.durationSeconds : 0);
    score += normalizedSquare(
      durationSeconds,
      totals.durationSeconds * config.normalizedRatios[candidate],
    );
    for (const language of enrollmentSentenceLanguageValues) {
      const actual =
        buckets[candidate].languageCounts[language] +
        (candidate === split ? group.languageCounts[language] : 0);
      const expected = totals.languageCounts[language] * config.normalizedRatios[candidate];
      score += normalizedSquare(actual, expected) * 3;
    }
    for (const condition of enrollmentVoiceConditionValues) {
      const actual =
        buckets[candidate].voiceConditionCounts[condition] +
        (candidate === split ? group.voiceConditionCounts[condition] : 0);
      const expected = totals.voiceConditionCounts[condition] * config.normalizedRatios[candidate];
      score += normalizedSquare(actual, expected) * 3;
    }
  }
  return score;
}

function summarizeSplitBuckets(
  groups: readonly PromptIdentityGroup[],
  assignmentsByPrompt: ReadonlyMap<string, PromptIdentitySplitName>,
): Readonly<Record<PromptIdentitySplitName, PromptIdentitySplitBucketV1>> {
  const buckets = createMutableSplitBuckets();
  groups.forEach((group) => {
    const split = assignmentsByPrompt.get(group.promptId) ?? 'train';
    addGroupToBucket(buckets[split], group);
  });
  return {
    train: freezeBucket(buckets.train),
    validation: freezeBucket(buckets.validation),
    test: freezeBucket(buckets.test),
  };
}

interface MutablePromptSplitBucket {
  promptIdentities: number;
  utterances: number;
  durationSeconds: number;
  languageCounts: Record<EnrollmentSentenceLanguage, number>;
  voiceConditionCounts: Record<EnrollmentVoiceCondition, number>;
  selectedVocabularyPromptIdentities: number;
}

function createMutableSplitBuckets(): Record<PromptIdentitySplitName, MutablePromptSplitBucket> {
  return {
    train: createMutableSplitBucket(),
    validation: createMutableSplitBucket(),
    test: createMutableSplitBucket(),
  };
}

function createMutableSplitBucket(): MutablePromptSplitBucket {
  return {
    promptIdentities: 0,
    utterances: 0,
    durationSeconds: 0,
    languageCounts: createLanguageCounts(),
    voiceConditionCounts: createVoiceConditionCounts(),
    selectedVocabularyPromptIdentities: 0,
  };
}

function addGroupToBucket(bucket: MutablePromptSplitBucket, group: PromptIdentityGroup): void {
  bucket.promptIdentities += 1;
  bucket.utterances += group.utterances;
  bucket.durationSeconds = roundSeconds(bucket.durationSeconds + group.durationSeconds);
  for (const language of enrollmentSentenceLanguageValues) {
    bucket.languageCounts[language] += group.languageCounts[language];
  }
  for (const condition of enrollmentVoiceConditionValues) {
    bucket.voiceConditionCounts[condition] += group.voiceConditionCounts[condition];
  }
  if (group.selectedVocabularyEntryIds.length > 0) bucket.selectedVocabularyPromptIdentities += 1;
}

function summarizeTotals(groups: readonly PromptIdentityGroup[]): PromptIdentitySplitBucketV1 {
  const bucket = createMutableSplitBucket();
  groups.forEach((group) => addGroupToBucket(bucket, group));
  return freezeBucket(bucket);
}

function freezeBucket(bucket: MutablePromptSplitBucket): PromptIdentitySplitBucketV1 {
  return {
    promptIdentities: bucket.promptIdentities,
    utterances: bucket.utterances,
    durationSeconds: roundSeconds(bucket.durationSeconds),
    languageCounts: { ...bucket.languageCounts },
    voiceConditionCounts: { ...bucket.voiceConditionCounts },
    selectedVocabularyPromptIdentities: bucket.selectedVocabularyPromptIdentities,
  };
}

function createLanguageCounts(): Record<EnrollmentSentenceLanguage, number> {
  return { vi: 0, en: 0, mixed: 0 };
}

function createVoiceConditionCounts(): Record<EnrollmentVoiceCondition, number> {
  return { whisper: 0, normal: 0, projected: 0 };
}

function validateUtterance(utterance: PromptIdentitySplitUtteranceV1): void {
  requireNonEmpty(utterance.promptId, 'utterance.promptId');
  if (!enrollmentSentenceLanguageValues.includes(utterance.language)) {
    throw new Error(`utterance.language is unsupported: ${utterance.language}`);
  }
  if (!enrollmentVoiceConditionValues.includes(utterance.voiceCondition)) {
    throw new Error(`utterance.voiceCondition is unsupported: ${utterance.voiceCondition}`);
  }
  if (
    utterance.durationMs !== undefined &&
    (!Number.isFinite(utterance.durationMs) || utterance.durationMs < 0)
  ) {
    throw new Error('utterance.durationMs must be a non-negative finite number.');
  }
  for (const entryId of utterance.customVocabularyEntryIds ?? []) {
    requireNonEmpty(entryId, 'utterance.customVocabularyEntryIds[]');
  }
}

function requireNonEmpty(value: string, name: string): string {
  if (!value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assertFiniteRatio(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
  return value;
}

function normalizedSquare(actual: number, expected: number): number {
  return Math.pow(actual - expected, 2) / Math.max(1, expected);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function stableHashKey(seed: string, value: string): string {
  return stableHashNumber(`${seed}:${value}`).toString(16).padStart(8, '0');
}

function stableHashNumber(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
