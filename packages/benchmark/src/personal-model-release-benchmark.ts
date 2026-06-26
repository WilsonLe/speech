export type PersonalModelReleaseBenchmarkStatusV1 = 'passed' | 'failed' | 'insufficient-evidence';

export type PersonalModelReleaseBenchmarkMetricNameV1 =
  | 'trainingDurationMs'
  | 'peakBrowserMemoryBytes'
  | 'peakAdditionalStorageBytes'
  | 'adapterRtfOverheadRatio'
  | 'profileSwapMs'
  | 'exportImportDurationMs'
  | 'checkpointLossDelta'
  | 'localPhaseNetworkRequestCount'
  | 'offlineReload';

export type PersonalModelReleaseBenchmarkMetricUnitV1 =
  | 'ms'
  | 'bytes'
  | 'ratio'
  | 'count'
  | 'boolean';

export type PersonalModelReleaseBenchmarkEvidenceSourceV1 =
  | 'reference-hardware'
  | 'ci-smoke'
  | 'synthetic'
  | 'manual'
  | 'not-measured';

export interface PersonalModelReleaseBenchmarkGateOptionsV1 {
  /** Optional budget; ADR 0002 requires this metric to be observed but does not set a hard maximum. */
  readonly maxTrainingDurationMs: number | null;
  readonly maxPeakBrowserMemoryBytes: number;
  readonly maxPeakAdditionalStorageBytes: number;
  readonly maxAdapterRtfOverheadRatio: number;
  readonly maxProfileSwapMsExclusive: number;
  readonly maxExportImportDurationMs: number;
  readonly maxCheckpointLossDelta: number;
  readonly maxLocalPhaseNetworkRequestCount: 0;
  readonly requireOfflineReload: true;
}

export interface PersonalModelReleaseBenchmarkReferenceHardwareV1 {
  readonly label: string;
  readonly browserName?: string;
  readonly browserVersion?: string;
  readonly operatingSystem?: string;
  readonly cpuModel?: string;
  readonly memoryGb?: number;
  readonly notes: readonly string[];
}

export interface PersonalModelReleaseBenchmarkMeasurementInputV1 {
  readonly name: PersonalModelReleaseBenchmarkMetricNameV1;
  readonly value: number | boolean | null;
  readonly source: PersonalModelReleaseBenchmarkEvidenceSourceV1;
  readonly notes?: readonly string[];
}

export interface PersonalModelReleaseBenchmarkMeasurementV1 {
  readonly name: PersonalModelReleaseBenchmarkMetricNameV1;
  readonly unit: PersonalModelReleaseBenchmarkMetricUnitV1;
  readonly value: number | boolean | null;
  readonly source: PersonalModelReleaseBenchmarkEvidenceSourceV1;
  readonly referenceHardwareEvidence: boolean;
  readonly notes: readonly string[];
}

export interface PersonalModelReleaseBenchmarkGateCheckV1 {
  readonly name:
    | 'training-time-observed'
    | 'peak-browser-memory'
    | 'peak-additional-storage'
    | 'adapter-rtf-overhead'
    | 'profile-swap-latency'
    | 'export-import-duration'
    | 'checkpoint-loss'
    | 'zero-network-local-phases'
    | 'offline-reload';
  readonly metric: PersonalModelReleaseBenchmarkMetricNameV1;
  readonly status: PersonalModelReleaseBenchmarkStatusV1;
  readonly values: Readonly<Record<string, number | boolean | null>>;
  readonly reason: string;
}

export interface PersonalModelReleaseBenchmarkPrivacyV1 {
  readonly aggregateOnly: true;
  readonly containsAudio: false;
  readonly containsTranscriptText: false;
  readonly containsFeatureTensors: false;
  readonly containsCheckpoints: false;
  readonly containsAdapterWeights: false;
  readonly containsRawProfileData: false;
  readonly containsPrivateVocabulary: false;
  readonly networkUpload: false;
  readonly localOnly: true;
}

export interface PersonalModelReleaseBenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'personal-model-release-benchmark';
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly evidenceLabel: string;
  readonly status: PersonalModelReleaseBenchmarkStatusV1;
  readonly referenceHardware: PersonalModelReleaseBenchmarkReferenceHardwareV1 | null;
  readonly gate: {
    readonly options: PersonalModelReleaseBenchmarkGateOptionsV1;
    readonly checks: readonly PersonalModelReleaseBenchmarkGateCheckV1[];
    readonly reasons: readonly string[];
  };
  readonly measurements: readonly PersonalModelReleaseBenchmarkMeasurementV1[];
  readonly privacy: PersonalModelReleaseBenchmarkPrivacyV1;
  readonly warnings: readonly string[];
  readonly definitions: {
    readonly referenceHardwareEvidence: string;
    readonly zeroNetworkLocalPhases: string;
    readonly checkpointLossDelta: string;
    readonly offlineReload: string;
  };
}

export interface CreatePersonalModelReleaseBenchmarkReportOptionsV1 {
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly evidenceLabel: string;
  readonly referenceHardware?: PersonalModelReleaseBenchmarkReferenceHardwareV1 | null;
  readonly measurements: readonly PersonalModelReleaseBenchmarkMeasurementInputV1[];
  readonly gate?: Partial<PersonalModelReleaseBenchmarkGateOptionsV1>;
  readonly warnings?: readonly string[];
}

export const defaultPersonalModelReleaseBenchmarkGateOptions: PersonalModelReleaseBenchmarkGateOptionsV1 =
  {
    maxTrainingDurationMs: null,
    maxPeakBrowserMemoryBytes: 1.5 * 1024 * 1024 * 1024,
    maxPeakAdditionalStorageBytes: 500 * 1024 * 1024,
    maxAdapterRtfOverheadRatio: 0.15,
    maxProfileSwapMsExclusive: 500,
    maxExportImportDurationMs: 15_000,
    maxCheckpointLossDelta: 0.000_001,
    maxLocalPhaseNetworkRequestCount: 0,
    requireOfflineReload: true,
  };

export function createPersonalModelReleaseBenchmarkReport(
  options: CreatePersonalModelReleaseBenchmarkReportOptionsV1,
): PersonalModelReleaseBenchmarkReportV1 {
  const gate = { ...defaultPersonalModelReleaseBenchmarkGateOptions, ...options.gate };
  validateGate(gate);
  const measurements = normalizeMeasurements(options.measurements);
  const measurementsByName = new Map(
    measurements.map((measurement) => [measurement.name, measurement]),
  );
  const checks = createGateChecks(measurementsByName, gate);
  const reasons = createReasons(checks);
  const status = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'insufficient-evidence')
      ? 'insufficient-evidence'
      : 'passed';

  return {
    schemaVersion: 1,
    reportType: 'personal-model-release-benchmark',
    generatedAt: options.generatedAt,
    benchmarkId: normalizeIdentifier(options.benchmarkId, 'benchmarkId'),
    evidenceLabel: normalizeEvidenceLabel(options.evidenceLabel),
    status,
    referenceHardware: normalizeReferenceHardware(options.referenceHardware ?? null),
    gate: { options: gate, checks, reasons },
    measurements,
    privacy: createPrivacy(),
    warnings: [
      ...(status === 'insufficient-evidence'
        ? ['Release benchmark gate blocked: declared reference-hardware evidence is incomplete.']
        : []),
      ...sanitizeTextArray(options.warnings ?? [], 240, 'Benchmark warning redacted.'),
    ],
    definitions: {
      referenceHardwareEvidence:
        'Release benchmark checks pass only when each required metric is measured on declared reference hardware; CI-smoke, synthetic, manual, and missing values are insufficient release evidence.',
      zeroNetworkLocalPhases:
        'Local preparation, training, evaluation, activation, export, and import phases must perform zero network requests.',
      checkpointLossDelta:
        'Checkpoint loss delta compares a resumed training run against uninterrupted training with the same dataset, seed, and configuration.',
      offlineReload:
        'Offline reload means the installed app shell reloads successfully after service-worker readiness while the browser context is offline.',
    },
  };
}

export function createMissingPersonalModelReleaseBenchmarkReport(options: {
  readonly generatedAt: string;
  readonly benchmarkId?: string;
  readonly evidenceLabel?: string;
  readonly warnings?: readonly string[];
}): PersonalModelReleaseBenchmarkReportV1 {
  return createPersonalModelReleaseBenchmarkReport({
    generatedAt: options.generatedAt,
    benchmarkId: options.benchmarkId ?? 'v0-5-0-reference-benchmarks-missing',
    evidenceLabel:
      options.evidenceLabel ??
      'No declared v0.5.0 reference-hardware benchmark evidence is available',
    referenceHardware: null,
    measurements: requiredMetricNames.map((name) => ({
      name,
      value: null,
      source: 'not-measured',
    })),
    warnings: [
      'Do not substitute synthetic worker smoke data for reference-hardware release benchmarks.',
      ...(options.warnings ?? []),
    ],
  });
}

const requiredMetricNames: readonly PersonalModelReleaseBenchmarkMetricNameV1[] = [
  'trainingDurationMs',
  'peakBrowserMemoryBytes',
  'peakAdditionalStorageBytes',
  'adapterRtfOverheadRatio',
  'profileSwapMs',
  'exportImportDurationMs',
  'checkpointLossDelta',
  'localPhaseNetworkRequestCount',
  'offlineReload',
];

const metricUnits: Readonly<
  Record<PersonalModelReleaseBenchmarkMetricNameV1, PersonalModelReleaseBenchmarkMetricUnitV1>
> = {
  trainingDurationMs: 'ms',
  peakBrowserMemoryBytes: 'bytes',
  peakAdditionalStorageBytes: 'bytes',
  adapterRtfOverheadRatio: 'ratio',
  profileSwapMs: 'ms',
  exportImportDurationMs: 'ms',
  checkpointLossDelta: 'ratio',
  localPhaseNetworkRequestCount: 'count',
  offlineReload: 'boolean',
};

function normalizeMeasurements(
  measurements: readonly PersonalModelReleaseBenchmarkMeasurementInputV1[],
): readonly PersonalModelReleaseBenchmarkMeasurementV1[] {
  const seen = new Set<PersonalModelReleaseBenchmarkMetricNameV1>();
  return measurements.map((measurement) => {
    if (seen.has(measurement.name)) {
      throw new Error(`Duplicate personal-model release benchmark metric ${measurement.name}.`);
    }
    seen.add(measurement.name);
    const unit = metricUnits[measurement.name];
    const value = normalizeMeasurementValue(measurement.name, measurement.value);
    return {
      name: measurement.name,
      unit,
      value,
      source: measurement.source,
      referenceHardwareEvidence: measurement.source === 'reference-hardware' && value !== null,
      notes: sanitizeTextArray(measurement.notes ?? [], 160, 'Measurement note redacted.'),
    };
  });
}

function normalizeMeasurementValue(
  name: PersonalModelReleaseBenchmarkMetricNameV1,
  value: number | boolean | null,
): number | boolean | null {
  if (value === null) return null;
  if (name === 'offlineReload') {
    if (typeof value !== 'boolean') {
      throw new Error('offlineReload benchmark metric must be a boolean.');
    }
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} benchmark metric must be a non-negative finite number.`);
  }
  if (name === 'localPhaseNetworkRequestCount' && !Number.isInteger(value)) {
    throw new Error('localPhaseNetworkRequestCount benchmark metric must be an integer.');
  }
  return roundMetric(value);
}

function createGateChecks(
  measurementsByName: ReadonlyMap<
    PersonalModelReleaseBenchmarkMetricNameV1,
    PersonalModelReleaseBenchmarkMeasurementV1
  >,
  gate: PersonalModelReleaseBenchmarkGateOptionsV1,
): readonly PersonalModelReleaseBenchmarkGateCheckV1[] {
  return [
    createNumericCheck({
      name: 'training-time-observed',
      metric: 'trainingDurationMs',
      maximum: gate.maxTrainingDurationMs,
      measurementsByName,
      pass: (value) => gate.maxTrainingDurationMs === null || value <= gate.maxTrainingDurationMs,
      passReason:
        gate.maxTrainingDurationMs === null
          ? 'Training duration was measured on reference hardware.'
          : 'Training duration is within the configured budget.',
      failReason: 'Training duration exceeds the configured budget.',
      insufficientReason: 'Training duration has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'peak-browser-memory',
      metric: 'peakBrowserMemoryBytes',
      maximum: gate.maxPeakBrowserMemoryBytes,
      measurementsByName,
      pass: (value) => value <= gate.maxPeakBrowserMemoryBytes,
      passReason: 'Peak browser memory is within the release budget.',
      failReason: 'Peak browser memory exceeds the release budget.',
      insufficientReason:
        'Peak browser memory has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'peak-additional-storage',
      metric: 'peakAdditionalStorageBytes',
      maximum: gate.maxPeakAdditionalStorageBytes,
      measurementsByName,
      pass: (value) => value <= gate.maxPeakAdditionalStorageBytes,
      passReason: 'Peak additional training storage is within the release budget.',
      failReason: 'Peak additional training storage exceeds the release budget.',
      insufficientReason:
        'Peak additional training storage has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'adapter-rtf-overhead',
      metric: 'adapterRtfOverheadRatio',
      maximum: gate.maxAdapterRtfOverheadRatio,
      measurementsByName,
      pass: (value) => value <= gate.maxAdapterRtfOverheadRatio,
      passReason: 'Adapter RTF overhead is within the release budget.',
      failReason: 'Adapter RTF overhead exceeds the release budget.',
      insufficientReason:
        'Adapter RTF overhead has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'profile-swap-latency',
      metric: 'profileSwapMs',
      maximum: gate.maxProfileSwapMsExclusive,
      measurementsByName,
      pass: (value) => value < gate.maxProfileSwapMsExclusive,
      passReason: 'Profile swap latency is below the release budget.',
      failReason: 'Profile swap latency is not below the release budget.',
      insufficientReason:
        'Profile swap latency has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'export-import-duration',
      metric: 'exportImportDurationMs',
      maximum: gate.maxExportImportDurationMs,
      measurementsByName,
      pass: (value) => value <= gate.maxExportImportDurationMs,
      passReason: 'Export/import duration is within the release budget.',
      failReason: 'Export/import duration exceeds the release budget.',
      insufficientReason:
        'Export/import duration has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'checkpoint-loss',
      metric: 'checkpointLossDelta',
      maximum: gate.maxCheckpointLossDelta,
      measurementsByName,
      pass: (value) => value <= gate.maxCheckpointLossDelta,
      passReason: 'Checkpoint loss delta is within deterministic-resume tolerance.',
      failReason: 'Checkpoint loss delta exceeds deterministic-resume tolerance.',
      insufficientReason:
        'Checkpoint loss delta has not been measured on declared reference hardware.',
    }),
    createNumericCheck({
      name: 'zero-network-local-phases',
      metric: 'localPhaseNetworkRequestCount',
      maximum: gate.maxLocalPhaseNetworkRequestCount,
      measurementsByName,
      pass: (value) => value === 0,
      passReason:
        'Local preparation/training/evaluation/export/import phases made zero network requests.',
      failReason: 'At least one local personal-model phase made a network request.',
      insufficientReason:
        'Zero-network local-phase evidence has not been captured on declared reference hardware.',
    }),
    createBooleanCheck({
      name: 'offline-reload',
      metric: 'offlineReload',
      measurementsByName,
      required: gate.requireOfflineReload,
    }),
  ];
}

function createNumericCheck(options: {
  readonly name: PersonalModelReleaseBenchmarkGateCheckV1['name'];
  readonly metric: PersonalModelReleaseBenchmarkMetricNameV1;
  readonly maximum: number | null;
  readonly measurementsByName: ReadonlyMap<
    PersonalModelReleaseBenchmarkMetricNameV1,
    PersonalModelReleaseBenchmarkMeasurementV1
  >;
  readonly pass: (value: number) => boolean;
  readonly passReason: string;
  readonly failReason: string;
  readonly insufficientReason: string;
}): PersonalModelReleaseBenchmarkGateCheckV1 {
  const measurement = options.measurementsByName.get(options.metric);
  if (
    measurement === undefined ||
    measurement.value === null ||
    typeof measurement.value !== 'number' ||
    !measurement.referenceHardwareEvidence
  ) {
    return {
      name: options.name,
      metric: options.metric,
      status: 'insufficient-evidence',
      values: {
        actual: typeof measurement?.value === 'number' ? measurement.value : null,
        maximum: options.maximum,
      },
      reason: options.insufficientReason,
    };
  }
  const passed = options.pass(measurement.value);
  return {
    name: options.name,
    metric: options.metric,
    status: passed ? 'passed' : 'failed',
    values: { actual: measurement.value, maximum: options.maximum },
    reason: passed ? options.passReason : options.failReason,
  };
}

function createBooleanCheck(options: {
  readonly name: PersonalModelReleaseBenchmarkGateCheckV1['name'];
  readonly metric: PersonalModelReleaseBenchmarkMetricNameV1;
  readonly measurementsByName: ReadonlyMap<
    PersonalModelReleaseBenchmarkMetricNameV1,
    PersonalModelReleaseBenchmarkMeasurementV1
  >;
  readonly required: boolean;
}): PersonalModelReleaseBenchmarkGateCheckV1 {
  const measurement = options.measurementsByName.get(options.metric);
  if (
    measurement === undefined ||
    measurement.value === null ||
    typeof measurement.value !== 'boolean' ||
    !measurement.referenceHardwareEvidence
  ) {
    return {
      name: options.name,
      metric: options.metric,
      status: 'insufficient-evidence',
      values: {
        actual: typeof measurement?.value === 'boolean' ? measurement.value : null,
        required: options.required,
      },
      reason: 'Offline app-shell reload has not been verified on declared reference hardware.',
    };
  }
  const passed = measurement.value === options.required;
  return {
    name: options.name,
    metric: options.metric,
    status: passed ? 'passed' : 'failed',
    values: { actual: measurement.value, required: options.required },
    reason: passed
      ? 'Offline app-shell reload passed on declared reference hardware.'
      : 'Offline app-shell reload failed on declared reference hardware.',
  };
}

function createReasons(
  checks: readonly PersonalModelReleaseBenchmarkGateCheckV1[],
): readonly string[] {
  return Array.from(
    new Set(checks.filter((check) => check.status !== 'passed').map((check) => check.reason)),
  );
}

function validateGate(gate: PersonalModelReleaseBenchmarkGateOptionsV1): void {
  if (gate.maxTrainingDurationMs !== null) {
    assertPositiveFinite(gate.maxTrainingDurationMs, 'maxTrainingDurationMs');
  }
  assertPositiveFinite(gate.maxPeakBrowserMemoryBytes, 'maxPeakBrowserMemoryBytes');
  assertPositiveFinite(gate.maxPeakAdditionalStorageBytes, 'maxPeakAdditionalStorageBytes');
  assertPositiveRatio(gate.maxAdapterRtfOverheadRatio, 'maxAdapterRtfOverheadRatio');
  assertPositiveFinite(gate.maxProfileSwapMsExclusive, 'maxProfileSwapMsExclusive');
  assertPositiveFinite(gate.maxExportImportDurationMs, 'maxExportImportDurationMs');
  assertPositiveRatio(gate.maxCheckpointLossDelta, 'maxCheckpointLossDelta');
  if (gate.maxLocalPhaseNetworkRequestCount !== 0) {
    throw new Error('maxLocalPhaseNetworkRequestCount must remain zero.');
  }
  if (gate.requireOfflineReload !== true) {
    throw new Error('requireOfflineReload must remain true.');
  }
}

function normalizeReferenceHardware(
  hardware: PersonalModelReleaseBenchmarkReferenceHardwareV1 | null,
): PersonalModelReleaseBenchmarkReferenceHardwareV1 | null {
  if (hardware === null) return null;
  const label = normalizeEvidenceLabel(hardware.label);
  return {
    label,
    ...(hardware.browserName === undefined
      ? {}
      : { browserName: normalizeOptionalText(hardware.browserName, 'browserName') }),
    ...(hardware.browserVersion === undefined
      ? {}
      : { browserVersion: normalizeOptionalText(hardware.browserVersion, 'browserVersion') }),
    ...(hardware.operatingSystem === undefined
      ? {}
      : { operatingSystem: normalizeOptionalText(hardware.operatingSystem, 'operatingSystem') }),
    ...(hardware.cpuModel === undefined
      ? {}
      : { cpuModel: normalizeOptionalText(hardware.cpuModel, 'cpuModel') }),
    ...(hardware.memoryGb === undefined
      ? {}
      : { memoryGb: normalizePositiveNumber(hardware.memoryGb, 'memoryGb') }),
    notes: sanitizeTextArray(hardware.notes, 160, 'Reference hardware note redacted.'),
  };
}

function normalizeEvidenceLabel(value: string): string {
  const label = sanitizeText(value, 160, 'benchmark evidence redacted');
  if (label.length === 0) {
    throw new Error('Benchmark evidence label must not be empty.');
  }
  return label;
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(normalized)) {
    throw new Error(`Personal-model release benchmark ${label} must be a stable identifier.`);
  }
  return normalized;
}

function normalizeOptionalText(value: string, label: string): string {
  const normalized = sanitizeText(value, 120, `${label} redacted`);
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty when provided.`);
  }
  return normalized;
}

function sanitizeTextArray(
  values: readonly string[],
  maxLength: number,
  fallback: string,
): string[] {
  return values.map((value) => sanitizeText(value, maxLength, fallback));
}

function sanitizeText(value: string, maxLength: number, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed
    .replace(/https?:\/\/\S+/gi, 'url-redacted')
    .replace(/[A-Za-z]:\\\S+/g, 'path-redacted')
    .replace(/\/(?:[\w.-]+\/)+[\w.-]+/g, 'path-redacted')
    .replace(/speaker[-_ ]?[a-z0-9-]+/gi, 'speaker-redacted')
    .replace(/profile[-_ ]?[a-z0-9-]+/gi, 'profile-redacted')
    .replace(/prompt[-_ ]?[a-z0-9-]+/gi, 'prompt-redacted')
    .replace(/case[-_ ]?[a-z0-9-]+/gi, 'case-redacted')
    .replace(/checkpoint[-_ ]?[a-z0-9-]+/gi, 'checkpoint-redacted')
    .slice(0, maxLength);
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertPositiveRatio(value: number, label: string): void {
  assertPositiveFinite(value, label);
  if (value > 1) {
    throw new Error(`${label} must be a ratio no greater than 1.`);
  }
}

function normalizePositiveNumber(value: number, label: string): number {
  assertPositiveFinite(value, label);
  return roundMetric(value);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function createPrivacy(): PersonalModelReleaseBenchmarkPrivacyV1 {
  return {
    aggregateOnly: true,
    containsAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsRawProfileData: false,
    containsPrivateVocabulary: false,
    networkUpload: false,
    localOnly: true,
  };
}
