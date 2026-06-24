import {
  calculateRelativeDb,
  estimateSnrDb,
  getVoiceConditionTarget,
  type EnrollmentCalibrationBaseline,
} from './calibration';
import {
  normalizeEnrollmentSentenceText,
  type EnrollmentSentenceLanguage,
  type EnrollmentVoiceCondition,
} from './sentence-bank';

export type EnrollmentTakeQualityStatus = 'pass' | 'review' | 'retry';

export type EnrollmentTakeQualityReasonCode =
  | 'no-audio'
  | 'duration-too-short'
  | 'duration-too-long'
  | 'clipping'
  | 'low-snr'
  | 'condition-too-quiet'
  | 'condition-too-loud'
  | 'vad-missing-start'
  | 'vad-missing-end'
  | 'pace-too-slow'
  | 'pace-too-fast'
  | 'alignment-low'
  | 'alignment-unavailable'
  | 'low-base-model-confidence';

export interface EnrollmentTakeAlignmentInput {
  readonly recognizedText?: string;
  readonly confidence?: number;
}

export interface EnrollmentTakeQualityInput {
  readonly pcm: Float32Array | readonly number[];
  readonly sampleRateHz: number;
  readonly referenceText: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly calibration?: EnrollmentCalibrationBaseline;
  readonly alignment?: EnrollmentTakeAlignmentInput;
  readonly options?: Partial<EnrollmentTakeQualityOptions>;
}

export interface EnrollmentTakeQualityOptions {
  readonly clipThreshold: number;
  readonly maxClippingRatio: number;
  readonly minActiveDurationMs: number;
  readonly maxActiveDurationMs: number;
  readonly preferredSnrDb: number;
  readonly minimumAlignmentCoverage: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly lowBaseModelConfidence: number;
  readonly minTokensPerSecond: number;
  readonly maxTokensPerSecond: number;
  readonly vadFrameMs: number;
  readonly vadHopMs: number;
  readonly vadPaddingMs: number;
  readonly vadStartEndToleranceMs: number;
}

export interface EnrollmentVadReportV1 {
  readonly activeSpeechDurationMs: number;
  readonly activeSpeechRatio: number;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly confidence: number;
  readonly missingStart: boolean;
  readonly missingEnd: boolean;
  readonly thresholdRms: number;
}

export interface EnrollmentPaceReportV1 {
  readonly referenceTokenCount: number;
  readonly tokensPerSecond: number | null;
  readonly status: 'not-available' | 'in-range' | 'too-slow' | 'too-fast';
}

export interface EnrollmentAlignmentReportV1 {
  readonly available: boolean;
  readonly referenceTokenCount: number;
  readonly observedTokenCount: number;
  readonly coverage: number | null;
  readonly confidence: number | null;
  readonly status: 'not-available' | 'pass' | 'review';
  readonly note: string;
}

export interface EnrollmentTakeLevelReportV1 {
  readonly durationMs: number;
  readonly sampleCount: number;
  readonly peak: number;
  readonly peakDbfs: number | null;
  readonly rms: number;
  readonly activeSpeechRms: number;
  readonly clippingRatio: number;
  readonly clippedSamples: number;
  readonly snrDb: number | null;
  readonly relativeDb: number | null;
}

export interface EnrollmentQualityReportV1 {
  readonly schemaVersion: 1;
  readonly status: EnrollmentTakeQualityStatus;
  readonly reasonCodes: readonly EnrollmentTakeQualityReasonCode[];
  readonly summary: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly level: EnrollmentTakeLevelReportV1;
  readonly vad: EnrollmentVadReportV1;
  readonly pace: EnrollmentPaceReportV1;
  readonly alignment: EnrollmentAlignmentReportV1;
  readonly manualAcceptanceAllowed: boolean;
  readonly privacy: {
    readonly containsAudio: false;
    readonly containsTranscriptText: false;
    readonly localOnly: true;
  };
}

export const defaultEnrollmentTakeQualityOptions: EnrollmentTakeQualityOptions = {
  clipThreshold: 0.98,
  maxClippingRatio: 0.001,
  minActiveDurationMs: 500,
  maxActiveDurationMs: 20_000,
  preferredSnrDb: 12,
  minimumAlignmentCoverage: {
    whisper: 0.8,
    normal: 0.9,
    projected: 0.9,
  },
  lowBaseModelConfidence: 0.45,
  minTokensPerSecond: 1.2,
  maxTokensPerSecond: 6,
  vadFrameMs: 20,
  vadHopMs: 10,
  vadPaddingMs: 120,
  vadStartEndToleranceMs: 120,
};

const minUsableRms = 0.000_001;

export function analyzeEnrollmentTakeQuality(
  input: EnrollmentTakeQualityInput,
): EnrollmentQualityReportV1 {
  const options = { ...defaultEnrollmentTakeQualityOptions, ...(input.options ?? {}) };
  const pcm = input.pcm;
  const sampleRateHz = input.sampleRateHz;
  const durationMs =
    sampleRateHz > 0 && Number.isFinite(sampleRateHz) ? (pcm.length / sampleRateHz) * 1_000 : 0;
  const referenceTokens = tokenizeReference(input.referenceText);

  if (pcm.length === 0 || sampleRateHz <= 0 || !Number.isFinite(sampleRateHz)) {
    const level = createEmptyLevelReport(pcm.length, durationMs);
    const vad = createEmptyVadReport();
    const pace = createPaceReport(referenceTokens.length, null, options);
    const alignment = createAlignmentReport(
      referenceTokens,
      input.alignment,
      input.voiceCondition,
      options,
    );
    return finalizeQualityReport({
      language: input.language,
      voiceCondition: input.voiceCondition,
      level,
      vad,
      pace,
      alignment,
      reasonCodes: ['no-audio'],
    });
  }

  const levelMetrics = calculateLevelMetrics(pcm, options.clipThreshold);
  const vad = analyzeVad(
    pcm,
    sampleRateHz,
    input.calibration?.roomNoiseRms,
    levelMetrics.rms,
    options,
  );
  const activeSpeechRms =
    vad.startMs === null || vad.endMs === null
      ? levelMetrics.rms
      : calculateRmsForRange(pcm, sampleRateHz, vad.startMs, vad.endMs);
  const snrDb = estimateSnrDb(activeSpeechRms, input.calibration?.roomNoiseRms);
  const relativeDb =
    input.calibration?.normalRms === undefined
      ? null
      : calculateRelativeDb(activeSpeechRms, input.calibration.normalRms);
  const level: EnrollmentTakeLevelReportV1 = {
    durationMs,
    sampleCount: pcm.length,
    peak: levelMetrics.peak,
    peakDbfs: toDbfs(levelMetrics.peak),
    rms: levelMetrics.rms,
    activeSpeechRms,
    clippingRatio: levelMetrics.clippingRatio,
    clippedSamples: levelMetrics.clippedSamples,
    snrDb,
    relativeDb,
  };
  const pace = createPaceReport(referenceTokens.length, vad.activeSpeechDurationMs, options);
  const alignment = createAlignmentReport(
    referenceTokens,
    input.alignment,
    input.voiceCondition,
    options,
  );
  const reasonCodes = collectReasonCodes({
    level,
    vad,
    pace,
    alignment,
    voiceCondition: input.voiceCondition,
    options,
  });

  return finalizeQualityReport({
    language: input.language,
    voiceCondition: input.voiceCondition,
    level,
    vad,
    pace,
    alignment,
    reasonCodes,
  });
}

function collectReasonCodes(input: {
  readonly level: EnrollmentTakeLevelReportV1;
  readonly vad: EnrollmentVadReportV1;
  readonly pace: EnrollmentPaceReportV1;
  readonly alignment: EnrollmentAlignmentReportV1;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly options: EnrollmentTakeQualityOptions;
}): EnrollmentTakeQualityReasonCode[] {
  const reasonCodes: EnrollmentTakeQualityReasonCode[] = [];
  if (input.vad.activeSpeechDurationMs < input.options.minActiveDurationMs) {
    reasonCodes.push('duration-too-short');
  }
  if (input.vad.activeSpeechDurationMs > input.options.maxActiveDurationMs) {
    reasonCodes.push('duration-too-long');
  }
  if (
    input.level.clippingRatio > input.options.maxClippingRatio ||
    input.level.peak >= input.options.clipThreshold
  ) {
    reasonCodes.push('clipping');
  }
  if (input.level.snrDb !== null && input.level.snrDb < input.options.preferredSnrDb) {
    reasonCodes.push('low-snr');
  }
  if (input.level.relativeDb !== null) {
    const target = getVoiceConditionTarget(input.voiceCondition);
    if (input.level.relativeDb < target.minRelativeDb) reasonCodes.push('condition-too-quiet');
    if (input.level.relativeDb > target.maxRelativeDb) reasonCodes.push('condition-too-loud');
  }
  if (input.vad.missingStart) reasonCodes.push('vad-missing-start');
  if (input.vad.missingEnd) reasonCodes.push('vad-missing-end');
  if (input.pace.status === 'too-slow') reasonCodes.push('pace-too-slow');
  if (input.pace.status === 'too-fast') reasonCodes.push('pace-too-fast');
  if (input.alignment.status === 'not-available') reasonCodes.push('alignment-unavailable');
  if (input.alignment.available && input.alignment.status === 'review') {
    reasonCodes.push('alignment-low');
  }
  if (
    input.alignment.confidence !== null &&
    input.alignment.confidence < input.options.lowBaseModelConfidence
  ) {
    reasonCodes.push('low-base-model-confidence');
  }
  return unique(reasonCodes);
}

function finalizeQualityReport(input: {
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly level: EnrollmentTakeLevelReportV1;
  readonly vad: EnrollmentVadReportV1;
  readonly pace: EnrollmentPaceReportV1;
  readonly alignment: EnrollmentAlignmentReportV1;
  readonly reasonCodes: readonly EnrollmentTakeQualityReasonCode[];
}): EnrollmentQualityReportV1 {
  const status = classifyQualityStatus(input.reasonCodes);
  return {
    schemaVersion: 1,
    status,
    reasonCodes: input.reasonCodes,
    summary: summarizeQuality(status, input.reasonCodes),
    language: input.language,
    voiceCondition: input.voiceCondition,
    level: input.level,
    vad: input.vad,
    pace: input.pace,
    alignment: input.alignment,
    manualAcceptanceAllowed: true,
    privacy: {
      containsAudio: false,
      containsTranscriptText: false,
      localOnly: true,
    },
  };
}

function classifyQualityStatus(
  reasonCodes: readonly EnrollmentTakeQualityReasonCode[],
): EnrollmentTakeQualityStatus {
  const retryReasons = new Set<EnrollmentTakeQualityReasonCode>([
    'no-audio',
    'duration-too-short',
    'duration-too-long',
    'clipping',
    'vad-missing-start',
    'vad-missing-end',
  ]);
  if (reasonCodes.some((reason) => retryReasons.has(reason))) return 'retry';
  return reasonCodes.length > 0 ? 'review' : 'pass';
}

function summarizeQuality(
  status: EnrollmentTakeQualityStatus,
  reasonCodes: readonly EnrollmentTakeQualityReasonCode[],
): string {
  if (status === 'pass') return 'Take passes initial local quality checks.';
  const reasonText = reasonCodes.length > 0 ? reasonCodes.join(', ') : 'review requested';
  if (status === 'retry') return `Retry recommended: ${reasonText}.`;
  return `Review recommended: ${reasonText}. Manual acceptance remains available for valid accents or atypical voices.`;
}

function analyzeVad(
  pcm: Float32Array | readonly number[],
  sampleRateHz: number,
  roomNoiseRms: number | undefined,
  wholeRms: number,
  options: EnrollmentTakeQualityOptions,
): EnrollmentVadReportV1 {
  const frameSamples = Math.max(1, Math.round((sampleRateHz * options.vadFrameMs) / 1_000));
  const hopSamples = Math.max(1, Math.round((sampleRateHz * options.vadHopMs) / 1_000));
  const paddingMs = options.vadPaddingMs;
  const thresholdRms = Math.max(
    minUsableRms,
    roomNoiseRms === undefined ? wholeRms * 0.35 : roomNoiseRms * 2,
    0.003,
  );
  const activeFrameStarts: number[] = [];
  let totalFrames = 0;

  for (let start = 0; start < pcm.length; start += hopSamples) {
    const end = Math.min(pcm.length, start + frameSamples);
    if (end <= start) break;
    totalFrames += 1;
    if (calculateRmsForSampleRange(pcm, start, end) >= thresholdRms) {
      activeFrameStarts.push(start);
    }
    if (end === pcm.length) break;
  }

  if (activeFrameStarts.length === 0) {
    return createEmptyVadReport(thresholdRms);
  }

  const firstStart = activeFrameStarts[0] ?? 0;
  const lastStart = activeFrameStarts[activeFrameStarts.length - 1] ?? firstStart;
  const rawStartMs = (firstStart / sampleRateHz) * 1_000;
  const rawEndMs = (Math.min(pcm.length, lastStart + frameSamples) / sampleRateHz) * 1_000;
  const durationMs = (pcm.length / sampleRateHz) * 1_000;
  const startMs = Math.max(0, rawStartMs - paddingMs);
  const endMs = Math.min(durationMs, rawEndMs + paddingMs);
  const activeSpeechDurationMs = Math.max(0, endMs - startMs);
  const activeSpeechRatio = durationMs <= 0 ? 0 : activeSpeechDurationMs / durationMs;
  const activeFrameRatio = totalFrames <= 0 ? 0 : activeFrameStarts.length / totalFrames;

  return {
    activeSpeechDurationMs,
    activeSpeechRatio,
    startMs,
    endMs,
    confidence: clamp01(activeFrameRatio * 1.8),
    missingStart: rawStartMs <= options.vadStartEndToleranceMs,
    missingEnd: durationMs - rawEndMs <= options.vadStartEndToleranceMs,
    thresholdRms,
  };
}

function createPaceReport(
  referenceTokenCount: number,
  activeSpeechDurationMs: number | null,
  options: EnrollmentTakeQualityOptions,
): EnrollmentPaceReportV1 {
  if (referenceTokenCount === 0 || activeSpeechDurationMs === null || activeSpeechDurationMs <= 0) {
    return { referenceTokenCount, tokensPerSecond: null, status: 'not-available' };
  }

  const tokensPerSecond = referenceTokenCount / (activeSpeechDurationMs / 1_000);
  if (tokensPerSecond < options.minTokensPerSecond) {
    return { referenceTokenCount, tokensPerSecond, status: 'too-slow' };
  }
  if (tokensPerSecond > options.maxTokensPerSecond) {
    return { referenceTokenCount, tokensPerSecond, status: 'too-fast' };
  }
  return { referenceTokenCount, tokensPerSecond, status: 'in-range' };
}

function createAlignmentReport(
  referenceTokens: readonly string[],
  alignment: EnrollmentTakeAlignmentInput | undefined,
  voiceCondition: EnrollmentVoiceCondition,
  options: EnrollmentTakeQualityOptions,
): EnrollmentAlignmentReportV1 {
  const recognizedText = alignment?.recognizedText;
  const confidence = normalizeConfidence(alignment?.confidence);
  if (recognizedText === undefined || recognizedText.trim().length === 0) {
    return {
      available: false,
      referenceTokenCount: referenceTokens.length,
      observedTokenCount: 0,
      coverage: null,
      confidence,
      status: 'not-available',
      note: 'Reference alignment is not available yet; do not reject a take solely because base-model confidence is absent or low.',
    };
  }

  const observedTokens = tokenizeReference(recognizedText);
  const coverage = calculateTokenCoverage(referenceTokens, observedTokens);
  const minimumCoverage = options.minimumAlignmentCoverage[voiceCondition];
  const status = coverage >= minimumCoverage ? 'pass' : 'review';
  return {
    available: true,
    referenceTokenCount: referenceTokens.length,
    observedTokenCount: observedTokens.length,
    coverage,
    confidence,
    status,
    note:
      status === 'pass'
        ? 'Reference alignment coverage is within the advisory band.'
        : 'Reference alignment coverage is low; review the take, but a low ASR score alone must not reject a valid accent.',
  };
}

function calculateTokenCoverage(
  referenceTokens: readonly string[],
  observedTokens: readonly string[],
): number {
  if (referenceTokens.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const token of observedTokens) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let matched = 0;
  for (const token of referenceTokens) {
    const count = remaining.get(token) ?? 0;
    if (count > 0) {
      matched += 1;
      remaining.set(token, count - 1);
    }
  }
  return matched / referenceTokens.length;
}

function tokenizeReference(text: string): readonly string[] {
  const normalized = normalizeEnrollmentSentenceText(text)
    .toLocaleLowerCase('vi')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .trim();
  return normalized.length === 0 ? [] : normalized.split(/\s+/u);
}

function calculateLevelMetrics(
  pcm: Float32Array | readonly number[],
  clipThreshold: number,
): {
  readonly peak: number;
  readonly rms: number;
  readonly clippedSamples: number;
  readonly clippingRatio: number;
} {
  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  for (const rawSample of pcm) {
    const sample = Number.isFinite(rawSample) ? rawSample : 0;
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sumSquares += sample * sample;
    if (magnitude >= clipThreshold) clippedSamples += 1;
  }
  const rms = pcm.length === 0 ? 0 : Math.sqrt(sumSquares / pcm.length);
  return {
    peak,
    rms,
    clippedSamples,
    clippingRatio: pcm.length === 0 ? 0 : clippedSamples / pcm.length,
  };
}

function calculateRmsForRange(
  pcm: Float32Array | readonly number[],
  sampleRateHz: number,
  startMs: number,
  endMs: number,
): number {
  const startSample = Math.max(0, Math.floor((startMs / 1_000) * sampleRateHz));
  const endSample = Math.min(pcm.length, Math.ceil((endMs / 1_000) * sampleRateHz));
  return calculateRmsForSampleRange(pcm, startSample, endSample);
}

function calculateRmsForSampleRange(
  pcm: Float32Array | readonly number[],
  startSample: number,
  endSample: number,
): number {
  if (endSample <= startSample) return 0;
  let sumSquares = 0;
  let count = 0;
  for (let index = startSample; index < endSample; index += 1) {
    const sample = pcm[index] ?? 0;
    sumSquares += sample * sample;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sumSquares / count);
}

function toDbfs(value: number): number | null {
  if (value <= minUsableRms || !Number.isFinite(value)) return null;
  return 20 * Math.log10(Math.min(1, value));
}

function createEmptyLevelReport(
  sampleCount: number,
  durationMs: number,
): EnrollmentTakeLevelReportV1 {
  return {
    durationMs,
    sampleCount,
    peak: 0,
    peakDbfs: null,
    rms: 0,
    activeSpeechRms: 0,
    clippingRatio: 0,
    clippedSamples: 0,
    snrDb: null,
    relativeDb: null,
  };
}

function createEmptyVadReport(thresholdRms = 0): EnrollmentVadReportV1 {
  return {
    activeSpeechDurationMs: 0,
    activeSpeechRatio: 0,
    startMs: null,
    endMs: null,
    confidence: 0,
    missingStart: false,
    missingEnd: false,
    thresholdRms,
  };
}

function normalizeConfidence(confidence: number | undefined): number | null {
  if (confidence === undefined || !Number.isFinite(confidence)) return null;
  return clamp01(confidence);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
