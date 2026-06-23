import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentTakeQualityStatus,
  EnrollmentVoiceCondition,
} from '@speech/enrollment';

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

export interface PersonalizationPackageInfo {
  readonly name: '@speech/personalization';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: PersonalizationPackageInfo = {
  name: '@speech/personalization',
  status: 'active',
  description: 'Speaker profile and adapter runtime contracts.',
};

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
