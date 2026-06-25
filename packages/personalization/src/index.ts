export * from './adapter-comparison';
export * from './browser-training';
export * from './residual-bottleneck-lhuc';

import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentTakeQualityStatus,
  EnrollmentVoiceCondition,
} from '@speech/enrollment';
import type { EvaluationMetrics, ModelIdentity } from '@speech/protocol';

export type SpeakerEmbeddingSourceKind = 'signal-statistics-baseline' | 'model-speaker-encoder';
export type SpeakerEmbeddingRejectedReason =
  | 'dimension-mismatch'
  | 'duration-too-short'
  | 'clipping'
  | 'low-snr'
  | 'quality-retry'
  | 'outlier';

export interface SpeakerEncoderInputV1 {
  readonly utteranceId: string;
  readonly pcm: Float32Array | readonly number[];
  readonly sampleRateHz: number;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly quality?: EnrollmentQualityReportV1;
  readonly options?: Partial<SignalStatisticsSpeakerEncoderOptions>;
}

export interface SignalStatisticsSpeakerEncoderOptions {
  readonly dimension: number;
  readonly frameMs: number;
  readonly frequencyProbesHz: readonly number[];
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface SpeakerEmbeddingCandidateV1 {
  readonly schemaVersion: 1;
  readonly utteranceId: string;
  readonly dimension: number;
  readonly vector: readonly number[];
  readonly l2Norm: number;
  readonly source: {
    readonly kind: SpeakerEmbeddingSourceKind;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly noGradientTraining: true;
  };
  readonly metadata: {
    readonly language: EnrollmentSentenceLanguage;
    readonly voiceCondition: EnrollmentVoiceCondition;
  };
  readonly quality: SpeakerEmbeddingCandidateQualityV1;
  readonly privacy: SpeakerEmbeddingPrivacyV1;
}

export interface SpeakerEmbeddingCandidateQualityV1 {
  readonly durationMs: number;
  readonly activeSpeechRatio: number;
  readonly snrDb: number | null;
  readonly clippingRatio: number;
  readonly qualityStatus: EnrollmentTakeQualityStatus | 'unknown';
}

export interface SpeakerEmbeddingPrivacyV1 {
  readonly containsAudio: false;
  readonly containsTranscriptText: false;
  readonly localOnly: true;
}

export interface AggregateSpeakerEmbeddingsOptions {
  readonly minDurationMs: number;
  readonly maxClippingRatio: number;
  readonly minSnrDb: number;
  readonly minCosineSimilarity: number;
  readonly outlierMadMultiplier: number;
  readonly minOutlierCandidateCount: number;
  readonly minAcceptedAfterOutlierRemoval: number;
}

export interface SpeakerProfileEmbeddingV1 {
  readonly schemaVersion: 1;
  readonly dimension: number;
  readonly vector: readonly number[];
  readonly l2Norm: number;
  readonly candidateCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly acceptedUtteranceIds: readonly string[];
  readonly rejectedCandidates: readonly SpeakerEmbeddingRejectionV1[];
  readonly aggregation: {
    readonly algorithm: 'weighted-l2-mean-mad-outlier-v1';
    readonly minCosineSimilarity: number;
    readonly outlierMadMultiplier: number;
  };
  readonly channel: SpeakerProfileChannelStatisticsV1;
  readonly privacy: SpeakerEmbeddingPrivacyV1;
}

export interface SpeakerEmbeddingRejectionV1 {
  readonly utteranceId: string;
  readonly reasons: readonly SpeakerEmbeddingRejectedReason[];
  readonly cosineSimilarity?: number;
}

export interface SpeakerProfileChannelStatisticsV1 {
  readonly acceptedDurationMs: number;
  readonly meanSnrDb: number | null;
  readonly maxClippingRatio: number;
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
}

export const defaultSignalStatisticsSpeakerEncoderOptions: SignalStatisticsSpeakerEncoderOptions = {
  dimension: 32,
  frameMs: 25,
  frequencyProbesHz: [110, 180, 260, 400, 650, 1_000, 1_600, 2_500, 3_800],
  modelId: 'deterministic-signal-statistics-speaker-encoder',
  modelVersion: '1.0.0',
};

export const defaultAggregateSpeakerEmbeddingsOptions: AggregateSpeakerEmbeddingsOptions = {
  minDurationMs: 500,
  maxClippingRatio: 0.01,
  minSnrDb: 6,
  minCosineSimilarity: 0.55,
  outlierMadMultiplier: 2.5,
  minOutlierCandidateCount: 3,
  minAcceptedAfterOutlierRemoval: 2,
};

export function encodeSpeakerEmbeddingCandidate(
  input: SpeakerEncoderInputV1,
): SpeakerEmbeddingCandidateV1 {
  const options = { ...defaultSignalStatisticsSpeakerEncoderOptions, ...(input.options ?? {}) };
  const dimension = assertPositiveInteger(options.dimension, 'dimension');
  if (dimension < 8) {
    throw new Error('Speaker embedding dimension must be at least 8.');
  }
  const sampleRateHz = assertPositiveInteger(input.sampleRateHz, 'sampleRateHz');
  if (input.pcm.length === 0) {
    throw new Error('Speaker encoder input must contain PCM samples.');
  }

  const level = calculatePcmLevel(input.pcm, sampleRateHz);
  const frames = calculateFrameStatistics(input.pcm, sampleRateHz, options.frameMs);
  const probes = options.frequencyProbesHz.map((frequencyHz) =>
    calculateGoertzelPower(input.pcm, sampleRateHz, frequencyHz),
  );
  const baseFeatures = [
    input.pcm.length / sampleRateHz,
    level.mean,
    level.rms,
    level.absoluteMean,
    level.peak,
    level.standardDeviation,
    level.zeroCrossingRate,
    level.crestFactor,
    frames.meanRms,
    frames.stdRms,
    frames.p10Rms,
    frames.p90Rms,
    frames.meanZeroCrossingRate,
    frames.stdZeroCrossingRate,
    ...probes,
  ];
  const vector = normalizeVector(projectFeatures(baseFeatures, dimension));
  const quality = candidateQualityFromInput(input, level.durationMs);

  return {
    schemaVersion: 1,
    utteranceId: input.utteranceId,
    dimension,
    vector,
    l2Norm: calculateL2Norm(vector),
    source: {
      kind: 'signal-statistics-baseline',
      modelId: options.modelId,
      modelVersion: options.modelVersion,
      noGradientTraining: true,
    },
    metadata: {
      language: input.language,
      voiceCondition: input.voiceCondition,
    },
    quality,
    privacy: createSpeakerEmbeddingPrivacy(),
  };
}

export function aggregateSpeakerEmbeddings(
  candidates: readonly SpeakerEmbeddingCandidateV1[],
  optionsInput: Partial<AggregateSpeakerEmbeddingsOptions> = {},
): SpeakerProfileEmbeddingV1 {
  if (candidates.length === 0) {
    throw new Error('At least one speaker embedding candidate is required.');
  }
  const options = { ...defaultAggregateSpeakerEmbeddingsOptions, ...optionsInput };
  const dimension = selectExpectedDimension(candidates);

  const initiallyAccepted: WeightedCandidate[] = [];
  const rejected: SpeakerEmbeddingRejectionV1[] = [];
  for (const candidate of candidates) {
    const reasons = getCandidateRejectionReasons(candidate, dimension, options);
    if (reasons.length > 0) {
      rejected.push({ utteranceId: candidate.utteranceId, reasons });
      continue;
    }
    initiallyAccepted.push({
      candidate,
      normalized: normalizeVector(candidate.vector),
      weight: calculateCandidateWeight(candidate),
    });
  }

  if (initiallyAccepted.length === 0) {
    throw new Error('No usable speaker embedding candidates remained after quality filtering.');
  }

  const accepted = rejectOutliers(initiallyAccepted, rejected, options);
  if (accepted.length === 0) {
    throw new Error('No usable speaker embedding candidates remained after outlier filtering.');
  }

  const vector = normalizeVector(weightedMean(accepted));
  return {
    schemaVersion: 1,
    dimension,
    vector,
    l2Norm: calculateL2Norm(vector),
    candidateCount: candidates.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    acceptedUtteranceIds: accepted.map(({ candidate }) => candidate.utteranceId),
    rejectedCandidates: rejected,
    aggregation: {
      algorithm: 'weighted-l2-mean-mad-outlier-v1',
      minCosineSimilarity: options.minCosineSimilarity,
      outlierMadMultiplier: options.outlierMadMultiplier,
    },
    channel: calculateChannelStatistics(accepted.map(({ candidate }) => candidate)),
    privacy: createSpeakerEmbeddingPrivacy(),
  };
}

export function serializeSpeakerEmbeddingVector(
  vector: Float32Array | readonly number[],
): ArrayBuffer {
  const output = new ArrayBuffer(vector.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new Float32Array(output);
  for (let index = 0; index < vector.length; index += 1) {
    view[index] = vector[index] ?? 0;
  }
  return output;
}

export function parseSpeakerEmbeddingVector(bytes: ArrayBuffer): Float32Array<ArrayBuffer> {
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Speaker embedding vector bytes must be a Float32Array payload.');
  }
  const output = new Float32Array(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
  output.set(new Float32Array(bytes.slice(0)));
  return output;
}

export type HeldOutProfileEvaluationAdaptationType =
  | 'speaker-embedding'
  | 'residual-adapter'
  | 'merged-model';

export type HeldOutProfileEvaluationMetricName =
  | 'wordErrorRate'
  | 'characterErrorRate'
  | 'switchBoundaryErrorRate'
  | 'customTermRecall'
  | 'aliasTriggerRecall'
  | 'falseCustomTermInsertionsPer100NonTargetUtterances'
  | 'firstPartialLatencyMs'
  | 'finalizationLatencyMs'
  | 'realTimeFactor';

export type HeldOutProfileEvaluationMetricUnit =
  | 'ratio'
  | 'ms'
  | 'x-real-time'
  | 'count-per-100-utterances';

export type HeldOutProfileEvaluationMetricDirection = 'lower-is-better' | 'higher-is-better';
export type HeldOutProfileEvaluationComparisonStatus =
  | 'improved'
  | 'regressed'
  | 'unchanged'
  | 'not-applicable';

export interface HeldOutProfileEvaluationPrivacyV1 {
  readonly containsAudio: false;
  readonly containsTranscriptText: false;
  readonly containsRawProfileData: false;
  readonly containsModelWeights: false;
  readonly exposesRawVocabularyEntryIds: false;
  readonly networkUpload: false;
  readonly localOnly: true;
}

export interface HeldOutProfileEvaluationSetV1 {
  readonly id: string;
  readonly sentenceBankVersion: string;
  readonly split: 'held-out';
  readonly caseCount: number;
  readonly notes: readonly string[];
}

export interface HeldOutProfileEvaluationCaseMetricsInputV1 {
  readonly referenceWordCount: number;
  readonly wordErrorCount: number;
  readonly referenceCharacterCount: number;
  readonly characterErrorCount: number;
  readonly switchBoundaryCount?: number;
  readonly switchBoundaryErrorCount?: number;
  readonly expectedCustomTermCount?: number;
  readonly recalledCustomTermCount?: number;
  readonly expectedAliasTriggerCount?: number;
  readonly recalledAliasTriggerCount?: number;
  readonly falseCustomTermInsertionCount?: number;
  readonly firstPartialLatencyMs?: number;
  readonly finalizationLatencyMs?: number;
  readonly realTimeFactor?: number;
}

export interface HeldOutProfileEvaluationCaseInputV1 {
  readonly id: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly selectedVocabularyEntryIds?: readonly string[];
  readonly nonTargetCustomTermUtterance?: boolean;
  readonly base: HeldOutProfileEvaluationCaseMetricsInputV1;
  readonly profile: HeldOutProfileEvaluationCaseMetricsInputV1;
}

export interface HeldOutProfileEvaluationRateScoreV1 {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
}

export interface HeldOutProfileEvaluationSummaryScoreV1 {
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly p95: number | null;
}

export interface HeldOutProfileEvaluationMetricComparisonV1 {
  readonly name: HeldOutProfileEvaluationMetricName;
  readonly unit: HeldOutProfileEvaluationMetricUnit;
  readonly direction: HeldOutProfileEvaluationMetricDirection;
  readonly base: HeldOutProfileEvaluationRateScoreV1 | HeldOutProfileEvaluationSummaryScoreV1;
  readonly profile: HeldOutProfileEvaluationRateScoreV1 | HeldOutProfileEvaluationSummaryScoreV1;
  readonly delta: number | null;
  readonly relativeChange: number | null;
  readonly status: HeldOutProfileEvaluationComparisonStatus;
}

export interface HeldOutProfileEvaluationSelectedVocabularySummaryV1 {
  readonly selectedEntryCount: number;
  readonly selectedCaseCount: number;
}

export interface HeldOutProfileEvaluationSliceV1 {
  readonly id: string;
  readonly label: string;
  readonly filters: {
    readonly language?: EnrollmentSentenceLanguage;
    readonly voiceCondition?: EnrollmentVoiceCondition;
  };
  readonly caseCount: number;
  readonly selectedVocabulary: HeldOutProfileEvaluationSelectedVocabularySummaryV1;
  readonly metrics: readonly HeldOutProfileEvaluationMetricComparisonV1[];
}

export interface HeldOutProfileEvaluationDefinitionsV1 {
  readonly wordErrorRate: string;
  readonly characterErrorRate: string;
  readonly switchBoundaryErrorRate: string;
  readonly customTermRecall: string;
  readonly aliasTriggerRecall: string;
  readonly falseCustomTermInsertionsPer100NonTargetUtterances: string;
  readonly latencyAndRtf: string;
}

export interface HeldOutProfileEvaluationActivationGateOptions {
  readonly minRelativeErrorImprovement: number;
  readonly minCustomTermRecallAbsoluteImprovement: number;
  readonly maxRelativeRealTimeFactorRegression: number;
  readonly maxFalseInsertionPer100Regression: number;
}

export interface HeldOutProfileEvaluationActivationGateV1 {
  readonly passed: boolean;
  readonly options: HeldOutProfileEvaluationActivationGateOptions;
  readonly criteria: {
    readonly wordErrorRelativeImprovement: number | null;
    readonly characterErrorRelativeImprovement: number | null;
    readonly customTermRecallAbsoluteImprovement: number | null;
    readonly realTimeFactorRelativeRegression: number | null;
    readonly falseInsertionPer100Regression: number | null;
  };
  readonly reasons: readonly string[];
}

export interface HeldOutProfileEvaluationSummaryV1 {
  readonly caseCount: number;
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly selectedVocabulary: HeldOutProfileEvaluationSelectedVocabularySummaryV1;
}

export interface HeldOutProfileEvaluationReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'held-out-profile-evaluation';
  readonly generatedAt: string;
  readonly evaluationId: string;
  readonly profileId: string;
  readonly baseModel: ModelIdentity;
  readonly adaptationType: HeldOutProfileEvaluationAdaptationType;
  readonly heldOutSet: HeldOutProfileEvaluationSetV1;
  readonly privacy: HeldOutProfileEvaluationPrivacyV1;
  readonly summary: HeldOutProfileEvaluationSummaryV1;
  readonly overall: HeldOutProfileEvaluationSliceV1;
  readonly slices: readonly HeldOutProfileEvaluationSliceV1[];
  readonly activationGate: HeldOutProfileEvaluationActivationGateV1;
  readonly definitions: HeldOutProfileEvaluationDefinitionsV1;
  readonly warnings: readonly string[];
}

export interface CreateHeldOutProfileEvaluationReportOptions {
  readonly generatedAt: string;
  readonly evaluationId: string;
  readonly profileId: string;
  readonly baseModel: ModelIdentity;
  readonly adaptationType: HeldOutProfileEvaluationAdaptationType;
  readonly heldOutSet: Omit<HeldOutProfileEvaluationSetV1, 'split' | 'caseCount'>;
  readonly cases: readonly HeldOutProfileEvaluationCaseInputV1[];
  readonly activationGate?: Partial<HeldOutProfileEvaluationActivationGateOptions>;
  readonly warnings?: readonly string[];
}

export const defaultHeldOutProfileActivationGateOptions: HeldOutProfileEvaluationActivationGateOptions =
  {
    minRelativeErrorImprovement: 0.05,
    minCustomTermRecallAbsoluteImprovement: 0.1,
    maxRelativeRealTimeFactorRegression: 0.1,
    maxFalseInsertionPer100Regression: 0,
  };

export const heldOutProfileEvaluationDefinitions: HeldOutProfileEvaluationDefinitionsV1 = {
  wordErrorRate: 'Word errors divided by reference words on held-out prompts.',
  characterErrorRate: 'Character errors divided by reference characters on held-out prompts.',
  switchBoundaryErrorRate:
    'Code-switch boundary errors divided by annotated switch boundaries when available.',
  customTermRecall:
    'Recalled exact canonical custom-term matches divided by expected custom-term matches.',
  aliasTriggerRecall: 'Recalled alias-trigger matches divided by expected alias-trigger matches.',
  falseCustomTermInsertionsPer100NonTargetUtterances:
    'Unexpected emitted custom-term matches per 100 held-out utterances that do not target custom terms.',
  latencyAndRtf:
    'Latency and real-time-factor values are aggregate local measurements; raw audio and transcript text are excluded.',
};

export function createHeldOutProfileEvaluationReport(
  options: CreateHeldOutProfileEvaluationReportOptions,
): HeldOutProfileEvaluationReportV1 {
  if (options.cases.length === 0) {
    throw new Error('At least one held-out evaluation case is required.');
  }
  const gateOptions = {
    ...defaultHeldOutProfileActivationGateOptions,
    ...(options.activationGate ?? {}),
  };
  validateActivationGateOptions(gateOptions);
  const cases = options.cases.map(copyAndValidateHeldOutCase);
  const overall = createHeldOutSlice('overall', 'Overall held-out prompts', {}, cases);
  const slices = createHeldOutSlices(cases);
  const warnings = [...(options.warnings ?? [])];
  if (options.heldOutSet.notes.length === 0) {
    warnings.push('Held-out evaluation set has no methodology notes.');
  }

  return {
    schemaVersion: 1,
    reportType: 'held-out-profile-evaluation',
    generatedAt: options.generatedAt,
    evaluationId: options.evaluationId,
    profileId: options.profileId,
    baseModel: { ...options.baseModel },
    adaptationType: options.adaptationType,
    heldOutSet: {
      id: options.heldOutSet.id,
      sentenceBankVersion: options.heldOutSet.sentenceBankVersion,
      split: 'held-out',
      caseCount: cases.length,
      notes: [...options.heldOutSet.notes],
    },
    privacy: createHeldOutEvaluationPrivacy(),
    summary: summarizeHeldOutCases(cases),
    overall,
    slices,
    activationGate: evaluateHeldOutActivationGate(overall, gateOptions),
    definitions: heldOutProfileEvaluationDefinitions,
    warnings,
  };
}

export function evaluationMetricsFromHeldOutReport(
  report: HeldOutProfileEvaluationReportV1,
  variant: 'base' | 'profile',
): EvaluationMetrics {
  const metricMap = new Map(report.overall.metrics.map((metric) => [metric.name, metric]));
  return removeUnsetEvaluationMetrics({
    wer: scoreValue(metricMap.get('wordErrorRate')?.[variant]),
    cer: scoreValue(metricMap.get('characterErrorRate')?.[variant]),
    customTermRecall: scoreValue(metricMap.get('customTermRecall')?.[variant]),
    falseInsertionsPer100Utterances: scoreValue(
      metricMap.get('falseCustomTermInsertionsPer100NonTargetUtterances')?.[variant],
    ),
    realTimeFactor: scoreValue(metricMap.get('realTimeFactor')?.[variant]),
  });
}

export interface PersonalizationPackageInfo {
  readonly name: '@speech/personalization';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: PersonalizationPackageInfo = {
  name: '@speech/personalization',
  status: 'active',
  description:
    'Speaker profile, held-out evaluation, residual/LHUC adapter reference math, adapter runtime, and browser-vs-Python comparison contracts.',
};

type HeldOutCaseVariant = 'base' | 'profile';

type HeldOutCaseFilter = HeldOutProfileEvaluationSliceV1['filters'];

interface HeldOutAggregate {
  readonly cases: readonly HeldOutProfileEvaluationCaseInputV1[];
  readonly variant: HeldOutCaseVariant;
}

function createHeldOutEvaluationPrivacy(): HeldOutProfileEvaluationPrivacyV1 {
  return {
    containsAudio: false,
    containsTranscriptText: false,
    containsRawProfileData: false,
    containsModelWeights: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    localOnly: true,
  };
}

function copyAndValidateHeldOutCase(
  input: HeldOutProfileEvaluationCaseInputV1,
): HeldOutProfileEvaluationCaseInputV1 {
  if (input.id.trim().length === 0) {
    throw new Error('Held-out evaluation case id must be non-empty.');
  }
  validateHeldOutCaseMetrics(input.base, `${input.id}.base`);
  validateHeldOutCaseMetrics(input.profile, `${input.id}.profile`);
  if (input.nonTargetCustomTermUtterance === true) {
    validateNoExpectedCustomTargets(input.base, `${input.id}.base`);
    validateNoExpectedCustomTargets(input.profile, `${input.id}.profile`);
  }
  const selectedVocabularyEntryIds = normalizeSelectedVocabularyEntryIds(
    input.selectedVocabularyEntryIds ?? [],
  );
  return {
    id: input.id,
    language: input.language,
    voiceCondition: input.voiceCondition,
    ...(selectedVocabularyEntryIds.length === 0 ? {} : { selectedVocabularyEntryIds }),
    ...(input.nonTargetCustomTermUtterance === undefined
      ? {}
      : { nonTargetCustomTermUtterance: input.nonTargetCustomTermUtterance }),
    base: { ...input.base },
    profile: { ...input.profile },
  };
}

function validateHeldOutCaseMetrics(
  metrics: HeldOutProfileEvaluationCaseMetricsInputV1,
  label: string,
): void {
  validateNonNegativeInteger(metrics.referenceWordCount, `${label}.referenceWordCount`);
  validateNonNegativeInteger(metrics.wordErrorCount, `${label}.wordErrorCount`);
  validateNonNegativeInteger(metrics.referenceCharacterCount, `${label}.referenceCharacterCount`);
  validateNonNegativeInteger(metrics.characterErrorCount, `${label}.characterErrorCount`);
  if (metrics.wordErrorCount > metrics.referenceWordCount) {
    throw new Error(`${label}.wordErrorCount cannot exceed referenceWordCount.`);
  }
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
    metrics.expectedAliasTriggerCount,
    `${label}.expectedAliasTriggerCount`,
  );
  validateOptionalNonNegativeInteger(
    metrics.recalledAliasTriggerCount,
    `${label}.recalledAliasTriggerCount`,
  );
  if (
    metrics.expectedAliasTriggerCount !== undefined &&
    metrics.recalledAliasTriggerCount !== undefined &&
    metrics.recalledAliasTriggerCount > metrics.expectedAliasTriggerCount
  ) {
    throw new Error(`${label}.recalledAliasTriggerCount cannot exceed expectedAliasTriggerCount.`);
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
  validateOptionalNonNegativeFinite(metrics.realTimeFactor, `${label}.realTimeFactor`);
}

function validateNoExpectedCustomTargets(
  metrics: HeldOutProfileEvaluationCaseMetricsInputV1,
  label: string,
): void {
  if ((metrics.expectedCustomTermCount ?? 0) > 0 || (metrics.expectedAliasTriggerCount ?? 0) > 0) {
    throw new Error(`${label} cannot declare expected custom-term targets on a non-target case.`);
  }
}

function validateActivationGateOptions(
  options: HeldOutProfileEvaluationActivationGateOptions,
): void {
  validateNonNegativeFinite(options.minRelativeErrorImprovement, 'minRelativeErrorImprovement');
  validateNonNegativeFinite(
    options.minCustomTermRecallAbsoluteImprovement,
    'minCustomTermRecallAbsoluteImprovement',
  );
  validateNonNegativeFinite(
    options.maxRelativeRealTimeFactorRegression,
    'maxRelativeRealTimeFactorRegression',
  );
  validateNonNegativeFinite(
    options.maxFalseInsertionPer100Regression,
    'maxFalseInsertionPer100Regression',
  );
}

function createHeldOutSlices(
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
): HeldOutProfileEvaluationSliceV1[] {
  const slices: HeldOutProfileEvaluationSliceV1[] = [];
  for (const language of ['vi', 'en', 'mixed'] satisfies readonly EnrollmentSentenceLanguage[]) {
    const filtered = cases.filter((testCase) => testCase.language === language);
    if (filtered.length > 0) {
      slices.push(
        createHeldOutSlice(`language:${language}`, `Language ${language}`, { language }, filtered),
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
        createHeldOutSlice(
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

function createHeldOutSlice(
  id: string,
  label: string,
  filters: HeldOutCaseFilter,
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
): HeldOutProfileEvaluationSliceV1 {
  return {
    id,
    label,
    filters: { ...filters },
    caseCount: cases.length,
    selectedVocabulary: summarizeHeldOutSelectedVocabulary(cases),
    metrics: [
      createRateComparison('wordErrorRate', 'ratio', 'lower-is-better', cases, (metrics) => ({
        numerator: metrics.wordErrorCount,
        denominator: metrics.referenceWordCount,
      })),
      createRateComparison('characterErrorRate', 'ratio', 'lower-is-better', cases, (metrics) => ({
        numerator: metrics.characterErrorCount,
        denominator: metrics.referenceCharacterCount,
      })),
      createRateComparison(
        'switchBoundaryErrorRate',
        'ratio',
        'lower-is-better',
        cases,
        (metrics) => ({
          numerator: metrics.switchBoundaryErrorCount ?? 0,
          denominator: metrics.switchBoundaryCount ?? 0,
        }),
      ),
      createRateComparison('customTermRecall', 'ratio', 'higher-is-better', cases, (metrics) => ({
        numerator: metrics.recalledCustomTermCount ?? 0,
        denominator: metrics.expectedCustomTermCount ?? 0,
      })),
      createRateComparison('aliasTriggerRecall', 'ratio', 'higher-is-better', cases, (metrics) => ({
        numerator: metrics.recalledAliasTriggerCount ?? 0,
        denominator: metrics.expectedAliasTriggerCount ?? 0,
      })),
      createFalseInsertionComparison(cases),
      createSummaryComparison(
        'firstPartialLatencyMs',
        'ms',
        'lower-is-better',
        cases,
        (metrics) => metrics.firstPartialLatencyMs,
      ),
      createSummaryComparison(
        'finalizationLatencyMs',
        'ms',
        'lower-is-better',
        cases,
        (metrics) => metrics.finalizationLatencyMs,
      ),
      createSummaryComparison(
        'realTimeFactor',
        'x-real-time',
        'lower-is-better',
        cases,
        (metrics) => metrics.realTimeFactor,
      ),
    ],
  };
}

function createRateComparison(
  name: HeldOutProfileEvaluationMetricName,
  unit: HeldOutProfileEvaluationMetricUnit,
  direction: HeldOutProfileEvaluationMetricDirection,
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
  select: (
    metrics: HeldOutProfileEvaluationCaseMetricsInputV1,
    testCase: HeldOutProfileEvaluationCaseInputV1,
  ) => { readonly numerator: number; readonly denominator: number },
): HeldOutProfileEvaluationMetricComparisonV1 {
  const base = aggregateRate({ cases, variant: 'base' }, select);
  const profile = aggregateRate({ cases, variant: 'profile' }, select);
  return createMetricComparison(name, unit, direction, base, profile);
}

function createFalseInsertionComparison(
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
): HeldOutProfileEvaluationMetricComparisonV1 {
  const base = aggregateFalseInsertionPer100({ cases, variant: 'base' });
  const profile = aggregateFalseInsertionPer100({ cases, variant: 'profile' });
  return createMetricComparison(
    'falseCustomTermInsertionsPer100NonTargetUtterances',
    'count-per-100-utterances',
    'lower-is-better',
    base,
    profile,
  );
}

function createSummaryComparison(
  name: HeldOutProfileEvaluationMetricName,
  unit: HeldOutProfileEvaluationMetricUnit,
  direction: HeldOutProfileEvaluationMetricDirection,
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
  select: (metrics: HeldOutProfileEvaluationCaseMetricsInputV1) => number | undefined,
): HeldOutProfileEvaluationMetricComparisonV1 {
  const base = aggregateSummary({ cases, variant: 'base' }, select);
  const profile = aggregateSummary({ cases, variant: 'profile' }, select);
  return createMetricComparison(name, unit, direction, base, profile);
}

function createMetricComparison(
  name: HeldOutProfileEvaluationMetricName,
  unit: HeldOutProfileEvaluationMetricUnit,
  direction: HeldOutProfileEvaluationMetricDirection,
  base: HeldOutProfileEvaluationRateScoreV1 | HeldOutProfileEvaluationSummaryScoreV1,
  profile: HeldOutProfileEvaluationRateScoreV1 | HeldOutProfileEvaluationSummaryScoreV1,
): HeldOutProfileEvaluationMetricComparisonV1 {
  const baseValue = scoreValue(base);
  const profileValue = scoreValue(profile);
  const delta =
    baseValue === null || profileValue === null ? null : roundMetric(profileValue - baseValue);
  const relativeChange =
    baseValue === null || profileValue === null || baseValue === 0
      ? null
      : roundMetric((profileValue - baseValue) / baseValue);
  return {
    name,
    unit,
    direction,
    base,
    profile,
    delta,
    relativeChange,
    status: compareMetricStatus(baseValue, profileValue, direction),
  };
}

function aggregateRate(
  aggregate: HeldOutAggregate,
  select: (
    metrics: HeldOutProfileEvaluationCaseMetricsInputV1,
    testCase: HeldOutProfileEvaluationCaseInputV1,
  ) => { readonly numerator: number; readonly denominator: number },
): HeldOutProfileEvaluationRateScoreV1 {
  let numerator = 0;
  let denominator = 0;
  for (const testCase of aggregate.cases) {
    const selected = select(testCase[aggregate.variant], testCase);
    numerator += selected.numerator;
    denominator += selected.denominator;
  }
  return createRateScore(numerator, denominator);
}

function createRateScore(
  numerator: number,
  denominator: number,
  scale = 1,
): HeldOutProfileEvaluationRateScoreV1 {
  validateNonNegativeFinite(numerator, 'metric numerator');
  validateNonNegativeFinite(denominator, 'metric denominator');
  validateNonNegativeFinite(scale, 'metric scale');
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : roundMetric((numerator / denominator) * scale),
  };
}

function aggregateFalseInsertionPer100(
  aggregate: HeldOutAggregate,
): HeldOutProfileEvaluationRateScoreV1 {
  let numerator = 0;
  let denominator = 0;
  for (const testCase of aggregate.cases) {
    if (!isNonTargetCustomTermUtterance(testCase)) continue;
    numerator += testCase[aggregate.variant].falseCustomTermInsertionCount ?? 0;
    denominator += 1;
  }
  return createRateScore(numerator, denominator, 100);
}

function aggregateSummary(
  aggregate: HeldOutAggregate,
  select: (metrics: HeldOutProfileEvaluationCaseMetricsInputV1) => number | undefined,
): HeldOutProfileEvaluationSummaryScoreV1 {
  const values = aggregate.cases
    .map((testCase) => select(testCase[aggregate.variant]))
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

function scoreValue(
  score: HeldOutProfileEvaluationRateScoreV1 | HeldOutProfileEvaluationSummaryScoreV1 | undefined,
): number | null {
  if (score === undefined) return null;
  if ('rate' in score) return score.rate;
  return score.mean;
}

function compareMetricStatus(
  base: number | null,
  profile: number | null,
  direction: HeldOutProfileEvaluationMetricDirection,
): HeldOutProfileEvaluationComparisonStatus {
  if (base === null || profile === null) return 'not-applicable';
  if (Math.abs(profile - base) < 0.000001) return 'unchanged';
  const improved = direction === 'lower-is-better' ? profile < base : profile > base;
  return improved ? 'improved' : 'regressed';
}

function summarizeHeldOutCases(
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
): HeldOutProfileEvaluationSummaryV1 {
  const languageCounts = createLanguageCounts();
  const voiceConditionCounts = createVoiceConditionCounts();
  for (const testCase of cases) {
    languageCounts[testCase.language] += 1;
    voiceConditionCounts[testCase.voiceCondition] += 1;
  }
  return {
    caseCount: cases.length,
    languageCounts,
    voiceConditionCounts,
    selectedVocabulary: summarizeHeldOutSelectedVocabulary(cases),
  };
}

function summarizeHeldOutSelectedVocabulary(
  cases: readonly HeldOutProfileEvaluationCaseInputV1[],
): HeldOutProfileEvaluationSelectedVocabularySummaryV1 {
  const selectedEntryIds = new Set<string>();
  let selectedCaseCount = 0;
  for (const testCase of cases) {
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

function normalizeSelectedVocabularyEntryIds(entryIds: readonly string[]): readonly string[] {
  return [...new Set(entryIds.map((entryId) => entryId.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'vi'),
  );
}

function evaluateHeldOutActivationGate(
  overall: HeldOutProfileEvaluationSliceV1,
  options: HeldOutProfileEvaluationActivationGateOptions,
): HeldOutProfileEvaluationActivationGateV1 {
  const metrics = new Map(overall.metrics.map((metric) => [metric.name, metric]));
  const wordErrorRelativeImprovement = relativeImprovement(
    scoreValue(metrics.get('wordErrorRate')?.base),
    scoreValue(metrics.get('wordErrorRate')?.profile),
    'lower-is-better',
  );
  const characterErrorRelativeImprovement = relativeImprovement(
    scoreValue(metrics.get('characterErrorRate')?.base),
    scoreValue(metrics.get('characterErrorRate')?.profile),
    'lower-is-better',
  );
  const customTermRecallAbsoluteImprovement = absoluteImprovement(
    scoreValue(metrics.get('customTermRecall')?.base),
    scoreValue(metrics.get('customTermRecall')?.profile),
    'higher-is-better',
  );
  const realTimeFactorRelativeRegression = relativeRegression(
    scoreValue(metrics.get('realTimeFactor')?.base),
    scoreValue(metrics.get('realTimeFactor')?.profile),
    'lower-is-better',
  );
  const falseInsertionPer100Regression = absoluteRegression(
    scoreValue(metrics.get('falseCustomTermInsertionsPer100NonTargetUtterances')?.base),
    scoreValue(metrics.get('falseCustomTermInsertionsPer100NonTargetUtterances')?.profile),
    'lower-is-better',
  );
  const qualityImproved =
    (wordErrorRelativeImprovement ?? Number.NEGATIVE_INFINITY) >=
      options.minRelativeErrorImprovement ||
    (characterErrorRelativeImprovement ?? Number.NEGATIVE_INFINITY) >=
      options.minRelativeErrorImprovement ||
    (customTermRecallAbsoluteImprovement ?? Number.NEGATIVE_INFINITY) >=
      options.minCustomTermRecallAbsoluteImprovement;
  const rtfWithinBudget =
    realTimeFactorRelativeRegression === null ||
    realTimeFactorRelativeRegression <= options.maxRelativeRealTimeFactorRegression;
  const falseInsertionWithinBudget =
    falseInsertionPer100Regression === null ||
    falseInsertionPer100Regression <= options.maxFalseInsertionPer100Regression;
  const reasons: string[] = [];
  if (!qualityImproved) {
    reasons.push('Profile did not meet the held-out quality improvement threshold.');
  }
  if (!rtfWithinBudget) {
    reasons.push('Profile real-time-factor regression exceeded the configured budget.');
  }
  if (!falseInsertionWithinBudget) {
    reasons.push('Profile custom-term false-insertion regression exceeded the configured budget.');
  }
  return {
    passed: qualityImproved && rtfWithinBudget && falseInsertionWithinBudget,
    options,
    criteria: {
      wordErrorRelativeImprovement,
      characterErrorRelativeImprovement,
      customTermRecallAbsoluteImprovement,
      realTimeFactorRelativeRegression,
      falseInsertionPer100Regression,
    },
    reasons,
  };
}

function relativeImprovement(
  base: number | null,
  profile: number | null,
  direction: HeldOutProfileEvaluationMetricDirection,
): number | null {
  if (base === null || profile === null || base === 0) return null;
  const raw = direction === 'lower-is-better' ? (base - profile) / base : (profile - base) / base;
  return roundMetric(raw);
}

function absoluteImprovement(
  base: number | null,
  profile: number | null,
  direction: HeldOutProfileEvaluationMetricDirection,
): number | null {
  if (base === null || profile === null) return null;
  const raw = direction === 'lower-is-better' ? base - profile : profile - base;
  return roundMetric(raw);
}

function relativeRegression(
  base: number | null,
  profile: number | null,
  direction: HeldOutProfileEvaluationMetricDirection,
): number | null {
  const improvement = relativeImprovement(base, profile, direction);
  return improvement === null ? null : roundMetric(Math.max(0, -improvement));
}

function absoluteRegression(
  base: number | null,
  profile: number | null,
  direction: HeldOutProfileEvaluationMetricDirection,
): number | null {
  const improvement = absoluteImprovement(base, profile, direction);
  return improvement === null ? null : roundMetric(Math.max(0, -improvement));
}

function isNonTargetCustomTermUtterance(testCase: HeldOutProfileEvaluationCaseInputV1): boolean {
  return (
    testCase.nonTargetCustomTermUtterance ??
    ((testCase.base.expectedCustomTermCount ?? 0) === 0 &&
      (testCase.profile.expectedCustomTermCount ?? 0) === 0)
  );
}

function removeUnsetEvaluationMetrics(
  metrics: Readonly<Record<keyof EvaluationMetrics, number | null | undefined>>,
): EvaluationMetrics {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined && value !== null),
  ) as EvaluationMetrics;
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

function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function validateOptionalNonNegativeFinite(value: number | undefined, label: string): void {
  if (value === undefined) return;
  validateNonNegativeFinite(value, label);
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

interface PcmLevelStatistics {
  readonly durationMs: number;
  readonly mean: number;
  readonly rms: number;
  readonly absoluteMean: number;
  readonly peak: number;
  readonly standardDeviation: number;
  readonly zeroCrossingRate: number;
  readonly crestFactor: number;
}

interface FrameStatistics {
  readonly meanRms: number;
  readonly stdRms: number;
  readonly p10Rms: number;
  readonly p90Rms: number;
  readonly meanZeroCrossingRate: number;
  readonly stdZeroCrossingRate: number;
}

interface WeightedCandidate {
  readonly candidate: SpeakerEmbeddingCandidateV1;
  readonly normalized: readonly number[];
  readonly weight: number;
}

function candidateQualityFromInput(
  input: SpeakerEncoderInputV1,
  fallbackDurationMs: number,
): SpeakerEmbeddingCandidateQualityV1 {
  return {
    durationMs: input.quality?.level.durationMs ?? fallbackDurationMs,
    activeSpeechRatio: input.quality?.vad.activeSpeechRatio ?? 1,
    snrDb: input.quality?.level.snrDb ?? null,
    clippingRatio: input.quality?.level.clippingRatio ?? 0,
    qualityStatus: input.quality?.status ?? 'unknown',
  };
}

function selectExpectedDimension(candidates: readonly SpeakerEmbeddingCandidateV1[]): number {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    counts.set(candidate.dimension, (counts.get(candidate.dimension) ?? 0) + 1);
  }
  let bestDimension = candidates[0]?.dimension;
  let bestCount = 0;
  for (const [dimension, count] of counts.entries()) {
    if (count > bestCount) {
      bestDimension = dimension;
      bestCount = count;
    }
  }
  if (bestDimension === undefined) {
    throw new Error('At least one speaker embedding candidate is required.');
  }
  return bestDimension;
}

function getCandidateRejectionReasons(
  candidate: SpeakerEmbeddingCandidateV1,
  expectedDimension: number,
  options: AggregateSpeakerEmbeddingsOptions,
): SpeakerEmbeddingRejectedReason[] {
  const reasons: SpeakerEmbeddingRejectedReason[] = [];
  if (candidate.dimension !== expectedDimension || candidate.vector.length !== expectedDimension) {
    reasons.push('dimension-mismatch');
  }
  if (candidate.quality.durationMs < options.minDurationMs) {
    reasons.push('duration-too-short');
  }
  if (candidate.quality.clippingRatio > options.maxClippingRatio) {
    reasons.push('clipping');
  }
  if (candidate.quality.snrDb !== null && candidate.quality.snrDb < options.minSnrDb) {
    reasons.push('low-snr');
  }
  if (candidate.quality.qualityStatus === 'retry') {
    reasons.push('quality-retry');
  }
  return reasons;
}

function rejectOutliers(
  candidates: readonly WeightedCandidate[],
  rejected: SpeakerEmbeddingRejectionV1[],
  options: AggregateSpeakerEmbeddingsOptions,
): WeightedCandidate[] {
  if (
    candidates.length < options.minOutlierCandidateCount ||
    candidates.length <= options.minAcceptedAfterOutlierRemoval
  ) {
    return [...candidates];
  }

  const centroid = normalizeVector(weightedMean(candidates));
  const similarities = candidates.map((candidate) =>
    cosineSimilarity(candidate.normalized, centroid),
  );
  const medianSimilarity = median(similarities);
  const medianAbsoluteDeviation = median(
    similarities.map((similarity) => Math.abs(similarity - medianSimilarity)),
  );
  const threshold = Math.max(
    options.minCosineSimilarity,
    medianSimilarity - Math.max(0.05, medianAbsoluteDeviation * options.outlierMadMultiplier),
  );
  const accepted: WeightedCandidate[] = [];
  const rejectedByOutlier: Array<{
    readonly candidate: WeightedCandidate;
    readonly similarity: number;
  }> = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const similarity = similarities[index] ?? -1;
    if (candidate !== undefined && similarity < threshold) {
      rejectedByOutlier.push({ candidate, similarity });
    } else if (candidate !== undefined) {
      accepted.push(candidate);
    }
  }

  if (accepted.length < options.minAcceptedAfterOutlierRemoval) {
    return [...candidates];
  }

  for (const outlier of rejectedByOutlier) {
    rejected.push({
      utteranceId: outlier.candidate.candidate.utteranceId,
      reasons: ['outlier'],
      cosineSimilarity: outlier.similarity,
    });
  }
  return accepted;
}

function calculateCandidateWeight(candidate: SpeakerEmbeddingCandidateV1): number {
  const durationSeconds = Math.min(20, Math.max(0.5, candidate.quality.durationMs / 1_000));
  const qualityMultiplier =
    candidate.quality.qualityStatus === 'pass'
      ? 1
      : candidate.quality.qualityStatus === 'review'
        ? 0.75
        : 0.85;
  const snrMultiplier =
    candidate.quality.snrDb === null
      ? 0.8
      : Math.min(1.25, Math.max(0.5, candidate.quality.snrDb / 20));
  const clippingMultiplier = Math.min(1, Math.max(0.25, 1 - candidate.quality.clippingRatio * 100));
  return durationSeconds * qualityMultiplier * snrMultiplier * clippingMultiplier;
}

function weightedMean(candidates: readonly WeightedCandidate[]): number[] {
  const dimension = candidates[0]?.normalized.length ?? 0;
  const output = new Array<number>(dimension).fill(0);
  let totalWeight = 0;
  for (const candidate of candidates) {
    totalWeight += candidate.weight;
    for (let index = 0; index < dimension; index += 1) {
      output[index] = (output[index] ?? 0) + (candidate.normalized[index] ?? 0) * candidate.weight;
    }
  }
  if (totalWeight <= 0) return output;
  return output.map((value) => value / totalWeight);
}

function calculateChannelStatistics(
  candidates: readonly SpeakerEmbeddingCandidateV1[],
): SpeakerProfileChannelStatisticsV1 {
  const languageCounts = createLanguageCounts();
  const voiceConditionCounts = createVoiceConditionCounts();
  let acceptedDurationMs = 0;
  let snrSum = 0;
  let snrCount = 0;
  let maxClippingRatio = 0;
  for (const candidate of candidates) {
    languageCounts[candidate.metadata.language] += 1;
    voiceConditionCounts[candidate.metadata.voiceCondition] += 1;
    acceptedDurationMs += candidate.quality.durationMs;
    maxClippingRatio = Math.max(maxClippingRatio, candidate.quality.clippingRatio);
    if (candidate.quality.snrDb !== null) {
      snrSum += candidate.quality.snrDb;
      snrCount += 1;
    }
  }
  return {
    acceptedDurationMs,
    meanSnrDb: snrCount === 0 ? null : snrSum / snrCount,
    maxClippingRatio,
    languageCounts,
    voiceConditionCounts,
  };
}

function calculatePcmLevel(
  samples: Float32Array | readonly number[],
  sampleRateHz: number,
): PcmLevelStatistics {
  let sum = 0;
  let sumSquares = 0;
  let absoluteSum = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let previousSign = Math.sign(samples[0] ?? 0);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = sanitizeSample(samples[index] ?? 0);
    sum += sample;
    sumSquares += sample * sample;
    absoluteSum += Math.abs(sample);
    peak = Math.max(peak, Math.abs(sample));
    const sign = Math.sign(sample);
    if (index > 0 && sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      zeroCrossings += 1;
    }
    if (sign !== 0) previousSign = sign;
  }
  const mean = sum / samples.length;
  const rms = Math.sqrt(sumSquares / samples.length);
  let varianceSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = sanitizeSample(samples[index] ?? 0) - mean;
    varianceSum += centered * centered;
  }
  return {
    durationMs: (samples.length / sampleRateHz) * 1_000,
    mean,
    rms,
    absoluteMean: absoluteSum / samples.length,
    peak,
    standardDeviation: Math.sqrt(varianceSum / samples.length),
    zeroCrossingRate: zeroCrossings / Math.max(1, samples.length - 1),
    crestFactor: rms > 0 ? peak / rms : 0,
  };
}

function calculateFrameStatistics(
  samples: Float32Array | readonly number[],
  sampleRateHz: number,
  frameMs: number,
): FrameStatistics {
  const frameSamples = Math.max(1, Math.round((sampleRateHz * frameMs) / 1_000));
  const rmsValues: number[] = [];
  const zeroCrossingRates: number[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSamples) {
    const end = Math.min(samples.length, offset + frameSamples);
    let sumSquares = 0;
    let zeroCrossings = 0;
    let previousSign = Math.sign(samples[offset] ?? 0);
    for (let index = offset; index < end; index += 1) {
      const sample = sanitizeSample(samples[index] ?? 0);
      sumSquares += sample * sample;
      const sign = Math.sign(sample);
      if (index > offset && sign !== 0 && previousSign !== 0 && sign !== previousSign) {
        zeroCrossings += 1;
      }
      if (sign !== 0) previousSign = sign;
    }
    const count = Math.max(1, end - offset);
    rmsValues.push(Math.sqrt(sumSquares / count));
    zeroCrossingRates.push(zeroCrossings / Math.max(1, count - 1));
  }
  return {
    meanRms: mean(rmsValues),
    stdRms: standardDeviation(rmsValues),
    p10Rms: percentile(rmsValues, 0.1),
    p90Rms: percentile(rmsValues, 0.9),
    meanZeroCrossingRate: mean(zeroCrossingRates),
    stdZeroCrossingRate: standardDeviation(zeroCrossingRates),
  };
}

function calculateGoertzelPower(
  samples: Float32Array | readonly number[],
  sampleRateHz: number,
  frequencyHz: number,
): number {
  if (frequencyHz <= 0 || frequencyHz >= sampleRateHz / 2) return 0;
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRateHz);
  let previous = 0;
  let previous2 = 0;
  for (const sampleInput of samples) {
    const sample = sanitizeSample(sampleInput);
    const current = sample + coefficient * previous - previous2;
    previous2 = previous;
    previous = current;
  }
  const power = previous2 * previous2 + previous * previous - coefficient * previous * previous2;
  return Math.log1p(Math.max(0, power) / Math.max(1, samples.length));
}

function projectFeatures(features: readonly number[], dimension: number): number[] {
  const normalizedFeatures = features.map((feature) =>
    Math.tanh(Number.isFinite(feature) ? feature : 0),
  );
  const output: number[] = [];
  for (let index = 0; index < dimension; index += 1) {
    const a = normalizedFeatures[index % normalizedFeatures.length] ?? 0;
    const b = normalizedFeatures[(index * 7 + 3) % normalizedFeatures.length] ?? 0;
    const c = normalizedFeatures[(index * 13 + 5) % normalizedFeatures.length] ?? 0;
    output.push(Math.tanh(a + 0.5 * b - 0.25 * c + Math.sin(index + 1) * 0.001));
  }
  return output;
}

function normalizeVector(vector: readonly number[]): number[] {
  const norm = calculateL2Norm(vector);
  if (norm <= 0) {
    const fallback = new Array<number>(vector.length).fill(0);
    if (fallback.length > 0) fallback[0] = 1;
    return fallback;
  }
  return vector.map((value) => value / norm);
}

function calculateL2Norm(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return dot;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.max(0, quantile * (sorted.length - 1)));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function createLanguageCounts(): Record<EnrollmentSentenceLanguage, number> {
  return { vi: 0, en: 0, mixed: 0 };
}

function createVoiceConditionCounts(): Record<EnrollmentVoiceCondition, number> {
  return { whisper: 0, normal: 0, projected: 0 };
}

function sanitizeSample(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function createSpeakerEmbeddingPrivacy(): SpeakerEmbeddingPrivacyV1 {
  return { containsAudio: false, containsTranscriptText: false, localOnly: true };
}
