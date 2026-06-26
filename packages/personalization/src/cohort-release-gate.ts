import type { EnrollmentSentenceLanguage, EnrollmentVoiceCondition } from '@speech/enrollment';

export type BilingualQualityCohortReportStatusV1 = 'passed' | 'failed' | 'insufficient-evidence';

export interface BilingualQualityCohortGateOptionsV1 {
  readonly requiredSpeakerCount: number;
  readonly minMedianRelativePersonalWerImprovement: number;
  readonly minImprovingSpeakerRatio: number;
  readonly maxSevereDegradationRatio: number;
  readonly severeDegradationAbsoluteWerPoints: number;
  readonly maxMedianAnchorWerDegradation: number;
  readonly minSliceSpeakerCount: number;
}

export interface BilingualQualityCohortSpeakerMetricsInputV1 {
  /** Local-only speaker key used only to deduplicate inputs. Never appears in reports. */
  readonly speakerId: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  /** Public aggregate category such as vi-north, vi-central, vi-south, english, mixed. */
  readonly sliceTags: readonly string[];
  readonly genericPersonalWordErrorRate: number;
  readonly candidatePersonalWordErrorRate: number;
  readonly genericAnchorWordErrorRate: number;
  readonly candidateAnchorWordErrorRate: number;
}

export interface CreateBilingualQualityCohortReportOptionsV1 {
  readonly generatedAt: string;
  readonly cohortId: string;
  readonly evidenceLabel: string;
  readonly speakers: readonly BilingualQualityCohortSpeakerMetricsInputV1[];
  readonly gate?: Partial<BilingualQualityCohortGateOptionsV1>;
  readonly warnings?: readonly string[];
}

export interface BilingualQualityCohortPrivacyV1 {
  readonly aggregateOnly: true;
  readonly containsAudio: false;
  readonly containsTranscriptText: false;
  readonly containsSpeakerIds: false;
  readonly containsRawProfileData: false;
  readonly containsFeatureTensors: false;
  readonly containsCheckpoints: false;
  readonly containsAdapterWeights: false;
  readonly exposesRawVocabularyEntryIds: false;
  readonly networkUpload: false;
  readonly localOnly: true;
}

export interface BilingualQualityCohortSummaryScoreV1 {
  readonly count: number;
  readonly median: number | null;
  readonly mean: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface BilingualQualityCohortSliceSummaryV1 {
  readonly tag: string;
  readonly speakerCount: number;
  readonly medianRelativePersonalWerImprovement: number | null;
  readonly improvingSpeakerRatio: number | null;
  readonly severeDegradationRatio: number | null;
  readonly medianAnchorWerDegradation: number | null;
  readonly regressionDetected: boolean;
}

export interface BilingualQualityCohortGateCheckV1 {
  readonly name:
    | 'speaker-count'
    | 'median-personal-improvement'
    | 'improving-speaker-ratio'
    | 'severe-degradation-ratio'
    | 'anchor-regression'
    | 'systematic-slice-regression';
  readonly passed: boolean;
  readonly values: Readonly<Record<string, number | null>>;
}

export interface BilingualQualityCohortReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'bilingual-quality-cohort-release-gate';
  readonly generatedAt: string;
  readonly cohortId: string;
  readonly evidenceLabel: string;
  readonly status: BilingualQualityCohortReportStatusV1;
  readonly gate: {
    readonly options: BilingualQualityCohortGateOptionsV1;
    readonly checks: readonly BilingualQualityCohortGateCheckV1[];
    readonly reasons: readonly string[];
  };
  readonly summary: {
    readonly speakerCount: number;
    readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
    readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
    readonly medianRelativePersonalWerImprovement: number | null;
    readonly improvingSpeakerRatio: number | null;
    readonly severeDegradationRatio: number | null;
    readonly medianAnchorWerDegradation: number | null;
    readonly personalRelativeWerImprovement: BilingualQualityCohortSummaryScoreV1;
    readonly anchorWerDegradation: BilingualQualityCohortSummaryScoreV1;
  };
  readonly slices: readonly BilingualQualityCohortSliceSummaryV1[];
  readonly privacy: BilingualQualityCohortPrivacyV1;
  readonly warnings: readonly string[];
  readonly definitions: {
    readonly relativePersonalWerImprovement: string;
    readonly severeDegradation: string;
    readonly anchorRegression: string;
    readonly systematicSliceRegression: string;
  };
}

export const defaultBilingualQualityCohortGateOptions: BilingualQualityCohortGateOptionsV1 = {
  requiredSpeakerCount: 30,
  minMedianRelativePersonalWerImprovement: 0.08,
  minImprovingSpeakerRatio: 0.7,
  maxSevereDegradationRatio: 0.1,
  severeDegradationAbsoluteWerPoints: 0.01,
  maxMedianAnchorWerDegradation: 0.005,
  minSliceSpeakerCount: 3,
};

export function createBilingualQualityCohortReport(
  input: CreateBilingualQualityCohortReportOptionsV1,
): BilingualQualityCohortReportV1 {
  const gate = { ...defaultBilingualQualityCohortGateOptions, ...input.gate };
  validateCohortGateOptions(gate);
  const speakers = normalizeCohortSpeakers(input.speakers);
  const speakerMetrics = speakers.map((speaker) => toSpeakerAggregate(speaker, gate));
  const relativeImprovements = speakerMetrics.map(
    (speaker) => speaker.relativePersonalWerImprovement,
  );
  const anchorDegradations = speakerMetrics.map((speaker) => speaker.anchorWerDegradation);
  const improvingRatio = ratio(
    speakerMetrics.filter((speaker) => speaker.improvedPersonalWer).length,
    speakerMetrics.length,
  );
  const severeDegradationRatio = ratio(
    speakerMetrics.filter((speaker) => speaker.severelyDegradedPersonalWer).length,
    speakerMetrics.length,
  );
  const medianRelativeImprovement = median(relativeImprovements);
  const medianAnchorDegradation = median(anchorDegradations);
  const slices = createSliceSummaries(speakerMetrics, gate);
  const checks = createCohortGateChecks({
    gate,
    speakerCount: speakerMetrics.length,
    medianRelativeImprovement,
    improvingRatio,
    severeDegradationRatio,
    medianAnchorDegradation,
    slices,
  });
  const reasons = createCohortGateReasons(checks, speakerMetrics.length, gate);
  const status =
    speakerMetrics.length < gate.requiredSpeakerCount
      ? 'insufficient-evidence'
      : checks.every((check) => check.passed)
        ? 'passed'
        : 'failed';
  return {
    schemaVersion: 1,
    reportType: 'bilingual-quality-cohort-release-gate',
    generatedAt: input.generatedAt,
    cohortId: normalizeIdentifier(input.cohortId, 'cohortId'),
    evidenceLabel: normalizeEvidenceLabel(input.evidenceLabel),
    status,
    gate: { options: gate, checks, reasons },
    summary: {
      speakerCount: speakerMetrics.length,
      languageCounts: countBy(speakers, ['vi', 'en', 'mixed'], (speaker) => speaker.language),
      voiceConditionCounts: countBy(
        speakers,
        ['whisper', 'normal', 'projected'],
        (speaker) => speaker.voiceCondition,
      ),
      medianRelativePersonalWerImprovement: roundNullable(medianRelativeImprovement),
      improvingSpeakerRatio: roundNullable(improvingRatio),
      severeDegradationRatio: roundNullable(severeDegradationRatio),
      medianAnchorWerDegradation: roundNullable(medianAnchorDegradation),
      personalRelativeWerImprovement: summarizeScores(relativeImprovements),
      anchorWerDegradation: summarizeScores(anchorDegradations),
    },
    slices,
    privacy: createCohortPrivacy(),
    warnings: [
      ...(status === 'insufficient-evidence'
        ? [
            `Release quality gate blocked: ${gate.requiredSpeakerCount.toString()} user-approved evaluation speakers are required.`,
          ]
        : []),
      ...sanitizeWarnings(input.warnings ?? []),
    ],
    definitions: {
      relativePersonalWerImprovement:
        'Relative WER improvement is (generic personal WER - candidate personal WER) divided by generic personal WER, aggregated per speaker.',
      severeDegradation:
        'Severe degradation means candidate personal WER is more than the configured absolute WER-point budget worse than generic for a speaker.',
      anchorRegression:
        'Anchor regression is candidate generic-anchor WER minus generic-anchor WER, aggregated per speaker.',
      systematicSliceRegression:
        'A slice regresses when enough speakers share a public language/accent/voice-condition tag and that slice fails the improvement, degradation, or anchor budget.',
    },
  };
}

export function createMissingBilingualQualityCohortReport(options: {
  readonly generatedAt: string;
  readonly cohortId?: string;
  readonly evidenceLabel?: string;
  readonly gate?: Partial<BilingualQualityCohortGateOptionsV1>;
  readonly warnings?: readonly string[];
}): BilingualQualityCohortReportV1 {
  return createBilingualQualityCohortReport({
    generatedAt: options.generatedAt,
    cohortId: options.cohortId ?? 'v0-5-0-quality-cohort-missing-user-approved-data',
    evidenceLabel:
      options.evidenceLabel ?? 'No user-approved 30-speaker quality cohort data is available',
    speakers: [],
    ...(options.gate === undefined ? {} : { gate: options.gate }),
    warnings: [
      'Do not fabricate cohort evidence; keep the release blocked until user-approved aggregate cohort data is available.',
      ...(options.warnings ?? []),
    ],
  });
}

interface NormalizedCohortSpeaker {
  readonly speakerId: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly sliceTags: readonly string[];
  readonly genericPersonalWordErrorRate: number;
  readonly candidatePersonalWordErrorRate: number;
  readonly genericAnchorWordErrorRate: number;
  readonly candidateAnchorWordErrorRate: number;
}

interface CohortSpeakerAggregate {
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly sliceTags: readonly string[];
  readonly relativePersonalWerImprovement: number;
  readonly personalWerDelta: number;
  readonly anchorWerDegradation: number;
  readonly improvedPersonalWer: boolean;
  readonly severelyDegradedPersonalWer: boolean;
}

function normalizeCohortSpeakers(
  speakers: readonly BilingualQualityCohortSpeakerMetricsInputV1[],
): readonly NormalizedCohortSpeaker[] {
  const seen = new Set<string>();
  return speakers.map((speaker, index) => {
    const speakerLabel = `speaker[${index.toString()}]`;
    const speakerId = normalizeIdentifier(speaker.speakerId, `${speakerLabel}.speakerId`);
    if (seen.has(speakerId)) {
      throw new Error('Bilingual quality cohort speaker IDs must be unique in local input.');
    }
    seen.add(speakerId);
    validateLanguage(speaker.language, speakerLabel);
    validateVoiceCondition(speaker.voiceCondition, speakerLabel);
    return {
      speakerId,
      language: speaker.language,
      voiceCondition: speaker.voiceCondition,
      sliceTags: normalizeSliceTags(speaker.sliceTags, speaker.language, speaker.voiceCondition),
      genericPersonalWordErrorRate: validateRate(
        speaker.genericPersonalWordErrorRate,
        `${speakerLabel}.genericPersonalWordErrorRate`,
      ),
      candidatePersonalWordErrorRate: validateRate(
        speaker.candidatePersonalWordErrorRate,
        `${speakerLabel}.candidatePersonalWordErrorRate`,
      ),
      genericAnchorWordErrorRate: validateRate(
        speaker.genericAnchorWordErrorRate,
        `${speakerLabel}.genericAnchorWordErrorRate`,
      ),
      candidateAnchorWordErrorRate: validateRate(
        speaker.candidateAnchorWordErrorRate,
        `${speakerLabel}.candidateAnchorWordErrorRate`,
      ),
    };
  });
}

function toSpeakerAggregate(
  speaker: NormalizedCohortSpeaker,
  gate: BilingualQualityCohortGateOptionsV1,
): CohortSpeakerAggregate {
  const personalWerDelta =
    speaker.candidatePersonalWordErrorRate - speaker.genericPersonalWordErrorRate;
  const relativePersonalWerImprovement =
    speaker.genericPersonalWordErrorRate === 0
      ? personalWerDelta < 0
        ? 1
        : 0
      : (speaker.genericPersonalWordErrorRate - speaker.candidatePersonalWordErrorRate) /
        speaker.genericPersonalWordErrorRate;
  const anchorWerDegradation =
    speaker.candidateAnchorWordErrorRate - speaker.genericAnchorWordErrorRate;
  return {
    language: speaker.language,
    voiceCondition: speaker.voiceCondition,
    sliceTags: speaker.sliceTags,
    relativePersonalWerImprovement,
    personalWerDelta,
    anchorWerDegradation,
    improvedPersonalWer: personalWerDelta < 0,
    severelyDegradedPersonalWer: personalWerDelta > gate.severeDegradationAbsoluteWerPoints,
  };
}

function createSliceSummaries(
  speakers: readonly CohortSpeakerAggregate[],
  gate: BilingualQualityCohortGateOptionsV1,
): readonly BilingualQualityCohortSliceSummaryV1[] {
  const byTag = new Map<string, CohortSpeakerAggregate[]>();
  for (const speaker of speakers) {
    for (const tag of speaker.sliceTags) {
      const existing = byTag.get(tag) ?? [];
      existing.push(speaker);
      byTag.set(tag, existing);
    }
  }
  return Array.from(byTag.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, entries]) => {
      const medianRelativePersonalWerImprovement = median(
        entries.map((entry) => entry.relativePersonalWerImprovement),
      );
      const improvingSpeakerRatio = ratio(
        entries.filter((entry) => entry.improvedPersonalWer).length,
        entries.length,
      );
      const severeDegradationRatio = ratio(
        entries.filter((entry) => entry.severelyDegradedPersonalWer).length,
        entries.length,
      );
      const medianAnchorWerDegradation = median(entries.map((entry) => entry.anchorWerDegradation));
      const eligible = entries.length >= gate.minSliceSpeakerCount;
      const regressionDetected =
        eligible &&
        ((medianRelativePersonalWerImprovement ?? Number.NEGATIVE_INFINITY) <
          gate.minMedianRelativePersonalWerImprovement ||
          (improvingSpeakerRatio ?? 0) < gate.minImprovingSpeakerRatio ||
          (severeDegradationRatio ?? 1) > gate.maxSevereDegradationRatio ||
          (medianAnchorWerDegradation ?? Number.POSITIVE_INFINITY) >
            gate.maxMedianAnchorWerDegradation);
      return {
        tag,
        speakerCount: entries.length,
        medianRelativePersonalWerImprovement: roundNullable(medianRelativePersonalWerImprovement),
        improvingSpeakerRatio: roundNullable(improvingSpeakerRatio),
        severeDegradationRatio: roundNullable(severeDegradationRatio),
        medianAnchorWerDegradation: roundNullable(medianAnchorWerDegradation),
        regressionDetected,
      };
    });
}

function createCohortGateChecks(input: {
  readonly gate: BilingualQualityCohortGateOptionsV1;
  readonly speakerCount: number;
  readonly medianRelativeImprovement: number | null;
  readonly improvingRatio: number | null;
  readonly severeDegradationRatio: number | null;
  readonly medianAnchorDegradation: number | null;
  readonly slices: readonly BilingualQualityCohortSliceSummaryV1[];
}): readonly BilingualQualityCohortGateCheckV1[] {
  return [
    {
      name: 'speaker-count',
      passed: input.speakerCount >= input.gate.requiredSpeakerCount,
      values: { actual: input.speakerCount, required: input.gate.requiredSpeakerCount },
    },
    {
      name: 'median-personal-improvement',
      passed:
        input.medianRelativeImprovement !== null &&
        input.medianRelativeImprovement >= input.gate.minMedianRelativePersonalWerImprovement,
      values: {
        actual: roundNullable(input.medianRelativeImprovement),
        required: input.gate.minMedianRelativePersonalWerImprovement,
      },
    },
    {
      name: 'improving-speaker-ratio',
      passed:
        input.improvingRatio !== null &&
        input.improvingRatio >= input.gate.minImprovingSpeakerRatio,
      values: {
        actual: roundNullable(input.improvingRatio),
        required: input.gate.minImprovingSpeakerRatio,
      },
    },
    {
      name: 'severe-degradation-ratio',
      passed:
        input.severeDegradationRatio !== null &&
        input.severeDegradationRatio <= input.gate.maxSevereDegradationRatio,
      values: {
        actual: roundNullable(input.severeDegradationRatio),
        maximum: input.gate.maxSevereDegradationRatio,
      },
    },
    {
      name: 'anchor-regression',
      passed:
        input.medianAnchorDegradation !== null &&
        input.medianAnchorDegradation <= input.gate.maxMedianAnchorWerDegradation,
      values: {
        actual: roundNullable(input.medianAnchorDegradation),
        maximum: input.gate.maxMedianAnchorWerDegradation,
      },
    },
    {
      name: 'systematic-slice-regression',
      passed: !input.slices.some((slice) => slice.regressionDetected),
      values: {
        regressingSliceCount: input.slices.filter((slice) => slice.regressionDetected).length,
        minSliceSpeakerCount: input.gate.minSliceSpeakerCount,
      },
    },
  ];
}

function createCohortGateReasons(
  checks: readonly BilingualQualityCohortGateCheckV1[],
  speakerCount: number,
  gate: BilingualQualityCohortGateOptionsV1,
): readonly string[] {
  const reasons: string[] = [];
  if (speakerCount < gate.requiredSpeakerCount) {
    reasons.push(
      `Only ${speakerCount.toString()} of ${gate.requiredSpeakerCount.toString()} required evaluation speakers are available.`,
    );
  }
  for (const check of checks) {
    if (check.passed) continue;
    switch (check.name) {
      case 'median-personal-improvement':
        reasons.push('Median relative personal holdout improvement is below the release gate.');
        break;
      case 'improving-speaker-ratio':
        reasons.push('Fewer than the required share of speakers improved on the primary metric.');
        break;
      case 'severe-degradation-ratio':
        reasons.push('Too many speakers degraded beyond the absolute WER-point budget.');
        break;
      case 'anchor-regression':
        reasons.push('Generic-anchor median WER degradation exceeds the release budget.');
        break;
      case 'systematic-slice-regression':
        reasons.push(
          'At least one language/accent/voice-condition slice shows systematic regression.',
        );
        break;
      case 'speaker-count':
        break;
    }
  }
  return Array.from(new Set(reasons));
}

function summarizeScores(values: readonly number[]): BilingualQualityCohortSummaryScoreV1 {
  if (values.length === 0) {
    return { count: 0, median: null, mean: null, min: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    median: roundNullable(median(sorted)),
    mean: round(values.reduce((total, value) => total + value, 0) / values.length),
    min: round(sorted[0]!),
    max: round(sorted[sorted.length - 1]!),
  };
}

function countBy<T extends string, V>(
  values: readonly V[],
  keys: readonly T[],
  select: (value: V) => T,
): Readonly<Record<T, number>> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) counts[select(value)] += 1;
  return counts;
}

function normalizeSliceTags(
  tags: readonly string[],
  language: EnrollmentSentenceLanguage,
  voiceCondition: EnrollmentVoiceCondition,
): readonly string[] {
  const normalized = new Set<string>([`language:${language}`, `voice:${voiceCondition}`]);
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:-]{0,63}$/.test(value)) {
      throw new Error('Bilingual quality cohort slice tags must be stable public labels.');
    }
    normalized.add(value);
  }
  return [...normalized].sort((left, right) => left.localeCompare(right));
}

function sanitizeWarnings(warnings: readonly string[]): readonly string[] {
  return warnings.map((warning) => {
    const trimmed = warning.trim();
    if (trimmed.length === 0) return 'Cohort warning redacted.';
    return trimmed
      .replace(/speaker[-_ ]?[a-z0-9-]+/gi, 'speaker-redacted')
      .replace(/profile[-_ ]?[a-z0-9-]+/gi, 'profile-redacted')
      .slice(0, 240);
  });
}

function validateCohortGateOptions(gate: BilingualQualityCohortGateOptionsV1): void {
  assertPositiveInteger(gate.requiredSpeakerCount, 'requiredSpeakerCount');
  assertPositiveInteger(gate.minSliceSpeakerCount, 'minSliceSpeakerCount');
  validateRatio(
    gate.minMedianRelativePersonalWerImprovement,
    'minMedianRelativePersonalWerImprovement',
  );
  validateRatio(gate.minImprovingSpeakerRatio, 'minImprovingSpeakerRatio');
  validateRatio(gate.maxSevereDegradationRatio, 'maxSevereDegradationRatio');
  validateRatio(gate.severeDegradationAbsoluteWerPoints, 'severeDegradationAbsoluteWerPoints');
  validateRatio(gate.maxMedianAnchorWerDegradation, 'maxMedianAnchorWerDegradation');
}

function validateLanguage(value: EnrollmentSentenceLanguage, label: string): void {
  if (value !== 'vi' && value !== 'en' && value !== 'mixed') {
    throw new Error(`Bilingual quality cohort speaker ${label} has invalid language.`);
  }
}

function validateVoiceCondition(value: EnrollmentVoiceCondition, label: string): void {
  if (value !== 'whisper' && value !== 'normal' && value !== 'projected') {
    throw new Error(`Bilingual quality cohort speaker ${label} has invalid voice condition.`);
  }
}

function validateRate(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Bilingual quality cohort ${label} must be a finite rate between 0 and 1.`);
  }
  return value;
}

function validateRatio(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Bilingual quality cohort gate ${label} must be a finite ratio.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Bilingual quality cohort gate ${label} must be a positive integer.`);
  }
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(normalized)) {
    throw new Error(`Bilingual quality cohort ${label} must be a stable identifier.`);
  }
  return normalized;
}

function normalizeEvidenceLabel(value: string): string {
  const label = sanitizeWarnings([value])[0] ?? '';
  if (label.length === 0 || label.length > 160) {
    throw new Error('Bilingual quality cohort evidence label must be 1-160 characters.');
  }
  return label;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function createCohortPrivacy(): BilingualQualityCohortPrivacyV1 {
  return {
    aggregateOnly: true,
    containsAudio: false,
    containsTranscriptText: false,
    containsSpeakerIds: false,
    containsRawProfileData: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    localOnly: true,
  };
}
