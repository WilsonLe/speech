import type { EnrollmentSentenceLanguage, EnrollmentVoiceCondition } from '@speech/enrollment';
import type { ModelIdentity } from '@speech/protocol';

export type PersonalAnchorEvaluationSplitV1 = 'personal-holdout' | 'anchor';
export type PersonalAnchorEvaluationConfigurationIdV1 = 'generic' | 'p1' | 'candidate';

export interface PersonalAnchorEvaluationCaseMetricsInputV1 {
  readonly referenceWordCount: number;
  readonly wordErrorCount: number;
  readonly referenceCharacterCount: number;
  readonly characterErrorCount: number;
  readonly switchBoundaryCount?: number;
  readonly switchBoundaryErrorCount?: number;
  readonly expectedCustomTermCount?: number;
  readonly recalledCustomTermCount?: number;
  readonly falseCustomTermInsertionCount?: number;
  readonly firstPartialLatencyMs?: number;
  readonly finalizationLatencyMs?: number;
  readonly realTimeFactor: number;
}

export interface PersonalAnchorEvaluationCaseInputV1 {
  readonly id: string;
  readonly split: PersonalAnchorEvaluationSplitV1;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly selectedVocabularyEntryIds?: readonly string[];
  readonly nonTargetCustomTermUtterance?: boolean;
  readonly generic: PersonalAnchorEvaluationCaseMetricsInputV1;
  readonly p1: PersonalAnchorEvaluationCaseMetricsInputV1;
  readonly candidate: PersonalAnchorEvaluationCaseMetricsInputV1;
}

export interface PersonalAnchorEvaluationConfigurationInputV1 {
  readonly label: string;
  readonly description: string;
  readonly sizeBytes?: number;
  readonly sha256?: string;
}

export interface PersonalAnchorEvaluationArtifactInputV1 {
  readonly candidateAdapterSizeBytes: number;
  readonly candidateAdapterSha256?: string;
}

export interface PersonalAnchorEvaluationGateOptionsV1 {
  readonly minPersonalRelativeWerImprovement: number;
  readonly minPersonalRelativeCerImprovement: number;
  readonly minCustomTermRecallImprovement: number;
  readonly maxAnchorWerRegression: number;
  readonly maxSliceWerRegression: number;
  readonly maxRtfOverheadRatioVsP1: number;
  readonly maxCandidateAdapterSizeBytes: number;
  readonly maxFalseInsertionPer100Regression: number;
}

export interface CreatePersonalAnchorEvaluationReportOptionsV1 {
  readonly generatedAt: string;
  readonly evaluationId: string;
  readonly profileId: string;
  readonly baseModel: ModelIdentity;
  readonly cases: readonly PersonalAnchorEvaluationCaseInputV1[];
  readonly configurations?: Partial<
    Record<PersonalAnchorEvaluationConfigurationIdV1, PersonalAnchorEvaluationConfigurationInputV1>
  >;
  readonly artifact: PersonalAnchorEvaluationArtifactInputV1;
  readonly gate?: Partial<PersonalAnchorEvaluationGateOptionsV1>;
  readonly warnings?: readonly string[];
}

export interface PersonalAnchorEvaluationPrivacyV1 {
  readonly aggregateOnly: true;
  readonly containsAudio: false;
  readonly containsTranscriptText: false;
  readonly containsCaseIds: false;
  readonly containsRawProfileData: false;
  readonly containsFeatureTensors: false;
  readonly containsCheckpoints: false;
  readonly containsAdapterWeights: false;
  readonly exposesRawVocabularyEntryIds: false;
  readonly networkUpload: false;
  readonly localOnly: true;
}

export interface PersonalAnchorEvaluationRateScoreV1 {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
}

export interface PersonalAnchorEvaluationSummaryScoreV1 {
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly p95: number | null;
}

export interface PersonalAnchorEvaluationConfigurationMetricsV1 {
  readonly wordErrorRate: PersonalAnchorEvaluationRateScoreV1;
  readonly characterErrorRate: PersonalAnchorEvaluationRateScoreV1;
  readonly switchBoundaryErrorRate: PersonalAnchorEvaluationRateScoreV1;
  readonly customTermRecall: PersonalAnchorEvaluationRateScoreV1;
  readonly falseCustomTermInsertionsPer100NonTargetUtterances: PersonalAnchorEvaluationRateScoreV1;
  readonly firstPartialLatencyMs: PersonalAnchorEvaluationSummaryScoreV1;
  readonly finalizationLatencyMs: PersonalAnchorEvaluationSummaryScoreV1;
  readonly realTimeFactor: PersonalAnchorEvaluationSummaryScoreV1;
}

export interface PersonalAnchorEvaluationConfigurationComparisonV1 {
  readonly wordErrorRateDelta: number | null;
  readonly wordErrorRateRelativeImprovement: number | null;
  readonly characterErrorRateDelta: number | null;
  readonly characterErrorRateRelativeImprovement: number | null;
  readonly customTermRecallDelta: number | null;
  readonly falseInsertionPer100Delta: number | null;
  readonly realTimeFactorOverheadRatio: number | null;
}

export interface PersonalAnchorEvaluationSelectedVocabularySummaryV1 {
  readonly selectedEntryCount: number;
  readonly selectedCaseCount: number;
}

export interface PersonalAnchorEvaluationSliceV1 {
  readonly id: string;
  readonly label: string;
  readonly filters: {
    readonly split?: PersonalAnchorEvaluationSplitV1;
    readonly language?: EnrollmentSentenceLanguage;
    readonly voiceCondition?: EnrollmentVoiceCondition;
  };
  readonly caseCount: number;
  readonly selectedVocabulary: PersonalAnchorEvaluationSelectedVocabularySummaryV1;
  readonly metrics: Readonly<
    Record<
      PersonalAnchorEvaluationConfigurationIdV1,
      PersonalAnchorEvaluationConfigurationMetricsV1
    >
  >;
  readonly comparisons: {
    readonly candidateVsGeneric: PersonalAnchorEvaluationConfigurationComparisonV1;
    readonly candidateVsP1: PersonalAnchorEvaluationConfigurationComparisonV1;
  };
}

export interface PersonalAnchorEvaluationSummaryV1 {
  readonly caseCounts: {
    readonly total: number;
    readonly personalHoldout: number;
    readonly anchor: number;
  };
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly selectedVocabulary: PersonalAnchorEvaluationSelectedVocabularySummaryV1;
  readonly candidateAdapterSizeBytes: number;
}

export interface PersonalAnchorEvaluationGateCheckV1 {
  readonly name:
    | 'personal-improvement-vs-generic'
    | 'candidate-parity-vs-p1'
    | 'anchor-regression-vs-generic'
    | 'slice-regression-vs-generic'
    | 'rtf-overhead-vs-p1'
    | 'false-insertion-regression-vs-generic'
    | 'candidate-adapter-size';
  readonly passed: boolean;
  readonly values: Readonly<Record<string, number | null>>;
}

export interface PersonalAnchorEvaluationGateV1 {
  readonly passed: boolean;
  readonly automaticActivationAllowed: boolean;
  readonly options: PersonalAnchorEvaluationGateOptionsV1;
  readonly checks: readonly PersonalAnchorEvaluationGateCheckV1[];
  readonly summary: 'passed' | 'failed';
  readonly reasons: readonly string[];
}

export interface PersonalAnchorEvaluationReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'personal-anchor-end-to-end-evaluation';
  readonly generatedAt: string;
  readonly evaluationId: string;
  readonly profileId: string;
  readonly baseModel: ModelIdentity;
  readonly configurations: Readonly<
    Record<
      PersonalAnchorEvaluationConfigurationIdV1,
      PersonalAnchorEvaluationConfigurationInputV1 & {
        readonly configurationId: PersonalAnchorEvaluationConfigurationIdV1;
      }
    >
  >;
  readonly artifact: {
    readonly candidateAdapterSizeBytes: number;
    readonly candidateAdapterSha256?: string;
  };
  readonly privacy: PersonalAnchorEvaluationPrivacyV1;
  readonly summary: PersonalAnchorEvaluationSummaryV1;
  readonly overall: PersonalAnchorEvaluationSliceV1;
  readonly personalHoldout: PersonalAnchorEvaluationSliceV1;
  readonly anchor: PersonalAnchorEvaluationSliceV1;
  readonly slices: readonly PersonalAnchorEvaluationSliceV1[];
  readonly activationGate: PersonalAnchorEvaluationGateV1;
  readonly definitions: {
    readonly generic: string;
    readonly p1: string;
    readonly candidate: string;
    readonly anchorRegression: string;
    readonly selectedVocabulary: string;
    readonly latencyAndRtf: string;
  };
  readonly warnings: readonly string[];
}

const configurationIds = ['generic', 'p1', 'candidate'] as const;

export const defaultPersonalAnchorEvaluationGateOptions: PersonalAnchorEvaluationGateOptionsV1 = {
  minPersonalRelativeWerImprovement: 0.05,
  minPersonalRelativeCerImprovement: 0.05,
  minCustomTermRecallImprovement: 0.1,
  maxAnchorWerRegression: 0.02,
  maxSliceWerRegression: 0.03,
  maxRtfOverheadRatioVsP1: 0.15,
  maxCandidateAdapterSizeBytes: 10_000_000,
  maxFalseInsertionPer100Regression: 0,
};

export function createPersonalAnchorEndToEndEvaluationReport(
  options: CreatePersonalAnchorEvaluationReportOptionsV1,
): PersonalAnchorEvaluationReportV1 {
  if (options.cases.length === 0) {
    throw new Error('At least one personal/anchor evaluation case is required.');
  }
  validateGateOptions({ ...defaultPersonalAnchorEvaluationGateOptions, ...(options.gate ?? {}) });
  const gateOptions = { ...defaultPersonalAnchorEvaluationGateOptions, ...(options.gate ?? {}) };
  const cases = options.cases.map(copyAndValidateEvaluationCase);
  const personalCases = cases.filter((testCase) => testCase.split === 'personal-holdout');
  const anchorCases = cases.filter((testCase) => testCase.split === 'anchor');
  if (personalCases.length === 0) {
    throw new Error('Personal/anchor evaluation requires at least one personal-holdout case.');
  }
  if (anchorCases.length === 0) {
    throw new Error('Personal/anchor evaluation requires at least one anchor case.');
  }
  validatePositiveInteger(options.artifact.candidateAdapterSizeBytes, 'candidateAdapterSizeBytes');
  if (
    options.artifact.candidateAdapterSha256 !== undefined &&
    !/^[a-f0-9]{64}$/u.test(options.artifact.candidateAdapterSha256)
  ) {
    throw new Error('candidateAdapterSha256 must be a lowercase SHA-256 hex digest.');
  }

  const overall = createSlice('overall', 'Overall personal and anchor cases', {}, cases);
  const personalHoldout = createSlice(
    'split:personal-holdout',
    'Personal held-out cases',
    { split: 'personal-holdout' },
    personalCases,
  );
  const anchor = createSlice(
    'split:anchor',
    'Generic anchor cases',
    { split: 'anchor' },
    anchorCases,
  );
  const slices = createSlices(cases);
  const reportWithoutGate = {
    schemaVersion: 1,
    reportType: 'personal-anchor-end-to-end-evaluation',
    generatedAt: options.generatedAt,
    evaluationId: options.evaluationId,
    profileId: options.profileId,
    baseModel: { ...options.baseModel },
    configurations: normalizeConfigurations(options.configurations ?? {}),
    artifact: {
      candidateAdapterSizeBytes: options.artifact.candidateAdapterSizeBytes,
      ...(options.artifact.candidateAdapterSha256 === undefined
        ? {}
        : { candidateAdapterSha256: options.artifact.candidateAdapterSha256 }),
    },
    privacy: createPrivacy(),
    summary: summarizeCases(cases, options.artifact.candidateAdapterSizeBytes),
    overall,
    personalHoldout,
    anchor,
    slices,
    definitions: {
      generic: 'The exact shared base ASR model without speaker-profile or adapter changes.',
      p1: 'The existing speaker-profile path used as the v0.5.0 latency/quality baseline.',
      candidate:
        'The browser-created personal adapter candidate being evaluated before activation.',
      anchorRegression:
        'Anchor checks compare candidate aggregate WER against the generic model on licensed generic prompts.',
      selectedVocabulary:
        'Selected vocabulary is represented by aggregate counts only; raw entry IDs and terms are excluded.',
      latencyAndRtf:
        'Latency and real-time factor are local aggregate measurements; raw audio and transcript text are excluded.',
    },
    warnings: [...(options.warnings ?? [])],
  } satisfies Omit<PersonalAnchorEvaluationReportV1, 'activationGate'>;

  return {
    ...reportWithoutGate,
    activationGate: evaluateActivationGate(reportWithoutGate, gateOptions),
  };
}

function normalizeConfigurations(
  input: Partial<
    Record<PersonalAnchorEvaluationConfigurationIdV1, PersonalAnchorEvaluationConfigurationInputV1>
  >,
): PersonalAnchorEvaluationReportV1['configurations'] {
  return {
    generic: {
      configurationId: 'generic',
      label: input.generic?.label ?? 'Generic base model',
      description: input.generic?.description ?? 'Shared base ASR model without personalization.',
      ...(input.generic?.sizeBytes === undefined ? {} : { sizeBytes: input.generic.sizeBytes }),
      ...(input.generic?.sha256 === undefined ? {} : { sha256: input.generic.sha256 }),
    },
    p1: {
      configurationId: 'p1',
      label: input.p1?.label ?? 'P1 speaker profile',
      description:
        input.p1?.description ??
        'Existing local speaker-profile path used as the comparison baseline.',
      ...(input.p1?.sizeBytes === undefined ? {} : { sizeBytes: input.p1.sizeBytes }),
      ...(input.p1?.sha256 === undefined ? {} : { sha256: input.p1.sha256 }),
    },
    candidate: {
      configurationId: 'candidate',
      label: input.candidate?.label ?? 'Candidate browser adapter',
      description:
        input.candidate?.description ??
        'Browser-trained residual/LHUC adapter candidate before activation.',
      ...(input.candidate?.sizeBytes === undefined ? {} : { sizeBytes: input.candidate.sizeBytes }),
      ...(input.candidate?.sha256 === undefined ? {} : { sha256: input.candidate.sha256 }),
    },
  };
}

function createPrivacy(): PersonalAnchorEvaluationPrivacyV1 {
  return {
    aggregateOnly: true,
    containsAudio: false,
    containsTranscriptText: false,
    containsCaseIds: false,
    containsRawProfileData: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    localOnly: true,
  };
}

function copyAndValidateEvaluationCase(
  input: PersonalAnchorEvaluationCaseInputV1,
): PersonalAnchorEvaluationCaseInputV1 {
  if (input.id.trim().length === 0) {
    throw new Error('Personal/anchor evaluation case id must be non-empty.');
  }
  if (input.split === 'anchor' && (input.selectedVocabularyEntryIds?.length ?? 0) > 0) {
    throw new Error('Anchor evaluation cases must not expose selected vocabulary entry IDs.');
  }
  for (const id of configurationIds) {
    validateMetrics(input[id], `${input.id}.${id}`);
  }
  if (input.nonTargetCustomTermUtterance === true) {
    for (const id of configurationIds) {
      validateNoExpectedCustomTargets(input[id], `${input.id}.${id}`);
    }
  }
  const selectedVocabularyEntryIds = normalizeSelectedVocabularyEntryIds(
    input.selectedVocabularyEntryIds ?? [],
  );
  return {
    id: input.id,
    split: input.split,
    language: input.language,
    voiceCondition: input.voiceCondition,
    ...(selectedVocabularyEntryIds.length === 0 ? {} : { selectedVocabularyEntryIds }),
    ...(input.nonTargetCustomTermUtterance === undefined
      ? {}
      : { nonTargetCustomTermUtterance: input.nonTargetCustomTermUtterance }),
    generic: { ...input.generic },
    p1: { ...input.p1 },
    candidate: { ...input.candidate },
  };
}

function validateMetrics(metrics: PersonalAnchorEvaluationCaseMetricsInputV1, label: string): void {
  validateNonNegativeInteger(metrics.referenceWordCount, `${label}.referenceWordCount`);
  validateNonNegativeInteger(metrics.wordErrorCount, `${label}.wordErrorCount`);
  if (metrics.wordErrorCount > metrics.referenceWordCount) {
    throw new Error(`${label}.wordErrorCount cannot exceed referenceWordCount.`);
  }
  validateNonNegativeInteger(metrics.referenceCharacterCount, `${label}.referenceCharacterCount`);
  validateNonNegativeInteger(metrics.characterErrorCount, `${label}.characterErrorCount`);
  if (metrics.characterErrorCount > metrics.referenceCharacterCount) {
    throw new Error(`${label}.characterErrorCount cannot exceed referenceCharacterCount.`);
  }
  validateOptionalNonNegativeInteger(metrics.switchBoundaryCount, `${label}.switchBoundaryCount`);
  validateOptionalNonNegativeInteger(
    metrics.switchBoundaryErrorCount,
    `${label}.switchBoundaryErrorCount`,
  );
  if (
    metrics.switchBoundaryCount !== undefined &&
    metrics.switchBoundaryErrorCount !== undefined &&
    metrics.switchBoundaryErrorCount > metrics.switchBoundaryCount
  ) {
    throw new Error(`${label}.switchBoundaryErrorCount cannot exceed switchBoundaryCount.`);
  }
  validateOptionalNonNegativeInteger(
    metrics.expectedCustomTermCount,
    `${label}.expectedCustomTermCount`,
  );
  validateOptionalNonNegativeInteger(
    metrics.recalledCustomTermCount,
    `${label}.recalledCustomTermCount`,
  );
  if (
    metrics.expectedCustomTermCount !== undefined &&
    metrics.recalledCustomTermCount !== undefined &&
    metrics.recalledCustomTermCount > metrics.expectedCustomTermCount
  ) {
    throw new Error(`${label}.recalledCustomTermCount cannot exceed expectedCustomTermCount.`);
  }
  validateOptionalNonNegativeInteger(
    metrics.falseCustomTermInsertionCount,
    `${label}.falseCustomTermInsertionCount`,
  );
  validateOptionalNonNegativeFinite(
    metrics.firstPartialLatencyMs,
    `${label}.firstPartialLatencyMs`,
  );
  validateOptionalNonNegativeFinite(
    metrics.finalizationLatencyMs,
    `${label}.finalizationLatencyMs`,
  );
  validateNonNegativeFinite(metrics.realTimeFactor, `${label}.realTimeFactor`);
}

function validateNoExpectedCustomTargets(
  metrics: PersonalAnchorEvaluationCaseMetricsInputV1,
  label: string,
): void {
  if ((metrics.expectedCustomTermCount ?? 0) > 0) {
    throw new Error(`${label} cannot declare expected custom-term targets on a non-target case.`);
  }
}

function createSlices(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
): PersonalAnchorEvaluationSliceV1[] {
  const slices: PersonalAnchorEvaluationSliceV1[] = [];
  for (const split of [
    'personal-holdout',
    'anchor',
  ] satisfies readonly PersonalAnchorEvaluationSplitV1[]) {
    const filtered = cases.filter((testCase) => testCase.split === split);
    if (filtered.length > 0) {
      slices.push(createSlice(`split:${split}`, splitLabel(split), { split }, filtered));
    }
  }
  for (const language of ['vi', 'en', 'mixed'] satisfies readonly EnrollmentSentenceLanguage[]) {
    const filtered = cases.filter((testCase) => testCase.language === language);
    if (filtered.length > 0) {
      slices.push(
        createSlice(`language:${language}`, `Language ${language}`, { language }, filtered),
      );
    }
  }
  for (const voiceCondition of [
    'whisper',
    'normal',
    'projected',
  ] satisfies readonly EnrollmentVoiceCondition[]) {
    const filtered = cases.filter((testCase) => testCase.voiceCondition === voiceCondition);
    if (filtered.length > 0) {
      slices.push(
        createSlice(
          `voice-condition:${voiceCondition}`,
          `Voice condition ${voiceCondition}`,
          { voiceCondition },
          filtered,
        ),
      );
    }
  }
  return slices;
}

function createSlice(
  id: string,
  label: string,
  filters: PersonalAnchorEvaluationSliceV1['filters'],
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
): PersonalAnchorEvaluationSliceV1 {
  const metrics = {
    generic: summarizeConfiguration(cases, 'generic'),
    p1: summarizeConfiguration(cases, 'p1'),
    candidate: summarizeConfiguration(cases, 'candidate'),
  };
  return {
    id,
    label,
    filters: { ...filters },
    caseCount: cases.length,
    selectedVocabulary: summarizeSelectedVocabulary(cases),
    metrics,
    comparisons: {
      candidateVsGeneric: compareConfigurations(metrics.generic, metrics.candidate),
      candidateVsP1: compareConfigurations(metrics.p1, metrics.candidate),
    },
  };
}

function summarizeConfiguration(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
  configurationId: PersonalAnchorEvaluationConfigurationIdV1,
): PersonalAnchorEvaluationConfigurationMetricsV1 {
  return {
    wordErrorRate: aggregateRate(cases, configurationId, (metrics) => ({
      numerator: metrics.wordErrorCount,
      denominator: metrics.referenceWordCount,
    })),
    characterErrorRate: aggregateRate(cases, configurationId, (metrics) => ({
      numerator: metrics.characterErrorCount,
      denominator: metrics.referenceCharacterCount,
    })),
    switchBoundaryErrorRate: aggregateRate(cases, configurationId, (metrics) => ({
      numerator: metrics.switchBoundaryErrorCount ?? 0,
      denominator: metrics.switchBoundaryCount ?? 0,
    })),
    customTermRecall: aggregateRate(cases, configurationId, (metrics) => ({
      numerator: metrics.recalledCustomTermCount ?? 0,
      denominator: metrics.expectedCustomTermCount ?? 0,
    })),
    falseCustomTermInsertionsPer100NonTargetUtterances: aggregateFalseInsertionPer100(
      cases,
      configurationId,
    ),
    firstPartialLatencyMs: aggregateSummary(
      cases,
      configurationId,
      (metrics) => metrics.firstPartialLatencyMs,
    ),
    finalizationLatencyMs: aggregateSummary(
      cases,
      configurationId,
      (metrics) => metrics.finalizationLatencyMs,
    ),
    realTimeFactor: aggregateSummary(cases, configurationId, (metrics) => metrics.realTimeFactor),
  };
}

function aggregateRate(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
  configurationId: PersonalAnchorEvaluationConfigurationIdV1,
  select: (metrics: PersonalAnchorEvaluationCaseMetricsInputV1) => {
    readonly numerator: number;
    readonly denominator: number;
  },
): PersonalAnchorEvaluationRateScoreV1 {
  let numerator = 0;
  let denominator = 0;
  for (const testCase of cases) {
    const selected = select(testCase[configurationId]);
    numerator += selected.numerator;
    denominator += selected.denominator;
  }
  return createRateScore(numerator, denominator);
}

function aggregateFalseInsertionPer100(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
  configurationId: PersonalAnchorEvaluationConfigurationIdV1,
): PersonalAnchorEvaluationRateScoreV1 {
  let numerator = 0;
  let denominator = 0;
  for (const testCase of cases) {
    if (!isNonTargetCustomTermUtterance(testCase)) continue;
    numerator += testCase[configurationId].falseCustomTermInsertionCount ?? 0;
    denominator += 1;
  }
  return createRateScore(numerator, denominator, 100);
}

function createRateScore(
  numerator: number,
  denominator: number,
  scale = 1,
): PersonalAnchorEvaluationRateScoreV1 {
  validateNonNegativeFinite(numerator, 'metric numerator');
  validateNonNegativeFinite(denominator, 'metric denominator');
  validateNonNegativeFinite(scale, 'metric scale');
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : roundMetric((numerator / denominator) * scale),
  };
}

function aggregateSummary(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
  configurationId: PersonalAnchorEvaluationConfigurationIdV1,
  select: (metrics: PersonalAnchorEvaluationCaseMetricsInputV1) => number | undefined,
): PersonalAnchorEvaluationSummaryScoreV1 {
  const values = cases
    .map((testCase) => select(testCase[configurationId]))
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (values.length === 0) {
    return { count: 0, mean: null, median: null, p95: null };
  }
  return {
    count: values.length,
    mean: roundMetric(mean(values)),
    median: roundMetric(percentile(values, 0.5)),
    p95: roundMetric(percentile(values, 0.95)),
  };
}

function compareConfigurations(
  baseline: PersonalAnchorEvaluationConfigurationMetricsV1,
  candidate: PersonalAnchorEvaluationConfigurationMetricsV1,
): PersonalAnchorEvaluationConfigurationComparisonV1 {
  const baselineWer = baseline.wordErrorRate.rate;
  const candidateWer = candidate.wordErrorRate.rate;
  const baselineCer = baseline.characterErrorRate.rate;
  const candidateCer = candidate.characterErrorRate.rate;
  const baselineRecall = baseline.customTermRecall.rate;
  const candidateRecall = candidate.customTermRecall.rate;
  const baselineFalseInsertion = baseline.falseCustomTermInsertionsPer100NonTargetUtterances.rate;
  const candidateFalseInsertion = candidate.falseCustomTermInsertionsPer100NonTargetUtterances.rate;
  return {
    wordErrorRateDelta: delta(candidateWer, baselineWer),
    wordErrorRateRelativeImprovement: relativeImprovement(baselineWer, candidateWer),
    characterErrorRateDelta: delta(candidateCer, baselineCer),
    characterErrorRateRelativeImprovement: relativeImprovement(baselineCer, candidateCer),
    customTermRecallDelta: delta(candidateRecall, baselineRecall),
    falseInsertionPer100Delta: delta(candidateFalseInsertion, baselineFalseInsertion),
    realTimeFactorOverheadRatio: relativeRegression(
      baseline.realTimeFactor.mean,
      candidate.realTimeFactor.mean,
    ),
  };
}

function summarizeCases(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
  candidateAdapterSizeBytes: number,
): PersonalAnchorEvaluationSummaryV1 {
  const languageCounts = createLanguageCounts();
  const voiceConditionCounts = createVoiceConditionCounts();
  let personalHoldout = 0;
  let anchor = 0;
  for (const testCase of cases) {
    languageCounts[testCase.language] += 1;
    voiceConditionCounts[testCase.voiceCondition] += 1;
    if (testCase.split === 'personal-holdout') personalHoldout += 1;
    if (testCase.split === 'anchor') anchor += 1;
  }
  return {
    caseCounts: { total: cases.length, personalHoldout, anchor },
    languageCounts,
    voiceConditionCounts,
    selectedVocabulary: summarizeSelectedVocabulary(cases),
    candidateAdapterSizeBytes,
  };
}

function summarizeSelectedVocabulary(
  cases: readonly PersonalAnchorEvaluationCaseInputV1[],
): PersonalAnchorEvaluationSelectedVocabularySummaryV1 {
  const selectedEntryIds = new Set<string>();
  let selectedCaseCount = 0;
  for (const testCase of cases) {
    if (testCase.split === 'anchor') continue;
    const entryIds = normalizeSelectedVocabularyEntryIds(testCase.selectedVocabularyEntryIds ?? []);
    if (entryIds.length === 0) continue;
    selectedCaseCount += 1;
    entryIds.forEach((entryId) => selectedEntryIds.add(entryId));
  }
  return {
    selectedEntryCount: selectedEntryIds.size,
    selectedCaseCount,
  };
}

function evaluateActivationGate(
  report: Omit<PersonalAnchorEvaluationReportV1, 'activationGate'>,
  options: PersonalAnchorEvaluationGateOptionsV1,
): PersonalAnchorEvaluationGateV1 {
  const checks: PersonalAnchorEvaluationGateCheckV1[] = [];
  const personalVsGeneric = report.personalHoldout.comparisons.candidateVsGeneric;
  const personalVsP1 = report.personalHoldout.comparisons.candidateVsP1;
  const anchorVsGeneric = report.anchor.comparisons.candidateVsGeneric;
  const overallVsP1 = report.overall.comparisons.candidateVsP1;
  const overallVsGeneric = report.overall.comparisons.candidateVsGeneric;

  const personalImproved =
    (personalVsGeneric.wordErrorRateRelativeImprovement ?? Number.NEGATIVE_INFINITY) >=
      options.minPersonalRelativeWerImprovement ||
    (personalVsGeneric.characterErrorRateRelativeImprovement ?? Number.NEGATIVE_INFINITY) >=
      options.minPersonalRelativeCerImprovement ||
    (personalVsGeneric.customTermRecallDelta ?? Number.NEGATIVE_INFINITY) >=
      options.minCustomTermRecallImprovement;
  checks.push({
    name: 'personal-improvement-vs-generic',
    passed: personalImproved,
    values: {
      relativeWerImprovement: personalVsGeneric.wordErrorRateRelativeImprovement,
      relativeCerImprovement: personalVsGeneric.characterErrorRateRelativeImprovement,
      customTermRecallDelta: personalVsGeneric.customTermRecallDelta,
    },
  });

  const p1Regression = Math.max(
    0,
    personalVsP1.wordErrorRateDelta ?? 0,
    personalVsP1.characterErrorRateDelta ?? 0,
  );
  checks.push({
    name: 'candidate-parity-vs-p1',
    passed: p1Regression <= options.maxSliceWerRegression,
    values: { maxPersonalErrorRateRegression: roundMetric(p1Regression) },
  });

  checks.push({
    name: 'anchor-regression-vs-generic',
    passed:
      anchorVsGeneric.wordErrorRateDelta !== null &&
      anchorVsGeneric.wordErrorRateDelta <= options.maxAnchorWerRegression,
    values: { anchorWerDelta: anchorVsGeneric.wordErrorRateDelta },
  });

  const maxSliceWerRegression = maxCandidateWerRegression(report.slices);
  checks.push({
    name: 'slice-regression-vs-generic',
    passed: maxSliceWerRegression <= options.maxSliceWerRegression,
    values: { maxSliceWerRegression },
  });

  checks.push({
    name: 'rtf-overhead-vs-p1',
    passed:
      overallVsP1.realTimeFactorOverheadRatio !== null &&
      overallVsP1.realTimeFactorOverheadRatio <= options.maxRtfOverheadRatioVsP1,
    values: { rtfOverheadRatioVsP1: overallVsP1.realTimeFactorOverheadRatio },
  });

  checks.push({
    name: 'false-insertion-regression-vs-generic',
    passed:
      overallVsGeneric.falseInsertionPer100Delta === null ||
      overallVsGeneric.falseInsertionPer100Delta <= options.maxFalseInsertionPer100Regression,
    values: { falseInsertionPer100Delta: overallVsGeneric.falseInsertionPer100Delta },
  });

  checks.push({
    name: 'candidate-adapter-size',
    passed: report.artifact.candidateAdapterSizeBytes <= options.maxCandidateAdapterSizeBytes,
    values: { sizeBytes: report.artifact.candidateAdapterSizeBytes },
  });

  const reasons = gateReasons(checks);
  const passed = reasons.length === 0;
  return {
    passed,
    automaticActivationAllowed: passed,
    options,
    checks,
    summary: passed ? 'passed' : 'failed',
    reasons,
  };
}

function maxCandidateWerRegression(slices: readonly PersonalAnchorEvaluationSliceV1[]): number {
  const values = slices
    .filter((slice) => slice.id.startsWith('language:') || slice.id.startsWith('voice-condition:'))
    .map((slice) => slice.comparisons.candidateVsGeneric.wordErrorRateDelta)
    .filter((value): value is number => value !== null)
    .map((value) => Math.max(0, value));
  return values.length === 0 ? 0 : roundMetric(Math.max(...values));
}

function gateReasons(checks: readonly PersonalAnchorEvaluationGateCheckV1[]): readonly string[] {
  const reasons: string[] = [];
  for (const check of checks) {
    if (check.passed) continue;
    if (check.name === 'personal-improvement-vs-generic') {
      reasons.push('Candidate did not meet the personal held-out improvement threshold.');
    } else if (check.name === 'candidate-parity-vs-p1') {
      reasons.push('Candidate regressed against the P1 speaker-profile baseline.');
    } else if (check.name === 'anchor-regression-vs-generic') {
      reasons.push('Candidate exceeded the generic-anchor WER regression budget.');
    } else if (check.name === 'slice-regression-vs-generic') {
      reasons.push('Candidate exceeded a language or voice-condition slice regression budget.');
    } else if (check.name === 'rtf-overhead-vs-p1') {
      reasons.push('Candidate exceeded the RTF overhead budget relative to P1.');
    } else if (check.name === 'false-insertion-regression-vs-generic') {
      reasons.push('Candidate exceeded the false custom-term insertion budget.');
    } else if (check.name === 'candidate-adapter-size') {
      reasons.push('Candidate adapter exceeded the configured size budget.');
    }
  }
  return reasons;
}

function isNonTargetCustomTermUtterance(testCase: PersonalAnchorEvaluationCaseInputV1): boolean {
  return (
    testCase.nonTargetCustomTermUtterance ??
    ((testCase.generic.expectedCustomTermCount ?? 0) === 0 &&
      (testCase.p1.expectedCustomTermCount ?? 0) === 0 &&
      (testCase.candidate.expectedCustomTermCount ?? 0) === 0)
  );
}

function normalizeSelectedVocabularyEntryIds(entryIds: readonly string[]): readonly string[] {
  return [...new Set(entryIds.map((entryId) => entryId.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'vi'),
  );
}

function splitLabel(split: PersonalAnchorEvaluationSplitV1): string {
  return split === 'personal-holdout' ? 'Personal held-out cases' : 'Generic anchor cases';
}

function delta(candidate: number | null, baseline: number | null): number | null {
  return candidate === null || baseline === null ? null : roundMetric(candidate - baseline);
}

function relativeImprovement(baseline: number | null, candidate: number | null): number | null {
  if (baseline === null || candidate === null || baseline === 0) return null;
  return roundMetric((baseline - candidate) / baseline);
}

function relativeRegression(baseline: number | null, candidate: number | null): number | null {
  if (baseline === null || candidate === null || baseline === 0) return null;
  return roundMetric(Math.max(0, (candidate - baseline) / baseline));
}

function validateGateOptions(options: PersonalAnchorEvaluationGateOptionsV1): void {
  validateNonNegativeFinite(
    options.minPersonalRelativeWerImprovement,
    'minPersonalRelativeWerImprovement',
  );
  validateNonNegativeFinite(
    options.minPersonalRelativeCerImprovement,
    'minPersonalRelativeCerImprovement',
  );
  validateNonNegativeFinite(
    options.minCustomTermRecallImprovement,
    'minCustomTermRecallImprovement',
  );
  validateNonNegativeFinite(options.maxAnchorWerRegression, 'maxAnchorWerRegression');
  validateNonNegativeFinite(options.maxSliceWerRegression, 'maxSliceWerRegression');
  validateNonNegativeFinite(options.maxRtfOverheadRatioVsP1, 'maxRtfOverheadRatioVsP1');
  validatePositiveInteger(options.maxCandidateAdapterSizeBytes, 'maxCandidateAdapterSizeBytes');
  validateNonNegativeFinite(
    options.maxFalseInsertionPer100Regression,
    'maxFalseInsertionPer100Regression',
  );
}

function validateNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function validateOptionalNonNegativeInteger(value: number | undefined, label: string): void {
  if (value === undefined) return;
  validateNonNegativeInteger(value, label);
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function validateOptionalNonNegativeFinite(value: number | undefined, label: string): void {
  if (value === undefined) return;
  validateNonNegativeFinite(value, label);
}

function createLanguageCounts(): Record<EnrollmentSentenceLanguage, number> {
  return { vi: 0, en: 0, mixed: 0 };
}

function createVoiceConditionCounts(): Record<EnrollmentVoiceCondition, number> {
  return { whisper: 0, normal: 0, projected: 0 };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
