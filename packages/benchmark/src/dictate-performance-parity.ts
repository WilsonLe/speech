export type DictatePerformanceParityStatusV1 = 'passed' | 'failed' | 'insufficient-evidence';

export type DictatePerformanceParityMetricNameV1 =
  | 'initialDictateJsBytes'
  | 'initialDictateCssBytes'
  | 'initialDictateJsGzipIncreaseBytes'
  | 'interactionReadyMs'
  | 'routeTransitionMs'
  | 'mainThreadLongTaskCount'
  | 'mainThreadLongTaskMaxMs'
  | 'cumulativeLayoutShift'
  | 'recordingUiResponseMs'
  | 'firstPartialLatencyMs'
  | 'stableWordLatencyMs'
  | 'finalizationLatencyMs'
  | 'asrLatencyRegressionPercent';

export type DictatePerformanceParityMetricUnitV1 = 'bytes' | 'ms' | 'count' | 'score' | 'percent';

export type DictatePerformanceParityEvidenceSourceV1 =
  | 'reference-hardware'
  | 'browser-smoke'
  | 'synthetic'
  | 'baseline-manifest'
  | 'not-measured';

export interface DictatePerformanceParityGateOptionsV1 {
  readonly maxInitialDictateJsGzipIncreaseBytes: number;
  readonly maxInteractionReadyMs: number;
  readonly maxRouteTransitionMs: number;
  readonly maxMainThreadLongTaskCount: number;
  readonly maxMainThreadLongTaskMs: number;
  readonly maxCumulativeLayoutShift: number;
  readonly maxRecordingUiResponseMs: number;
  readonly maxAsrLatencyRegressionPercent: number;
}

export interface DictatePerformanceParityReferenceHardwareV1 {
  readonly label: string;
  readonly browserName?: string;
  readonly browserVersion?: string;
  readonly operatingSystem?: string;
  readonly cpuModel?: string;
  readonly memoryGb?: number;
  readonly notes: readonly string[];
}

export interface DictatePerformanceParityBaselineV1 {
  readonly release: 'v0.5.0';
  readonly commit?: string;
  readonly hasInitialBundleBaseline: boolean;
  readonly hasAsrLatencyBaseline: boolean;
  readonly notes: readonly string[];
}

export interface DictatePerformanceParityMeasurementInputV1 {
  readonly name: DictatePerformanceParityMetricNameV1;
  readonly value: number | null;
  readonly source: DictatePerformanceParityEvidenceSourceV1;
  readonly notes?: readonly string[];
}

export interface DictatePerformanceParityMeasurementV1 {
  readonly name: DictatePerformanceParityMetricNameV1;
  readonly unit: DictatePerformanceParityMetricUnitV1;
  readonly value: number | null;
  readonly source: DictatePerformanceParityEvidenceSourceV1;
  readonly referenceHardwareEvidence: boolean;
  readonly notes: readonly string[];
}

export interface DictatePerformanceParityGateCheckV1 {
  readonly name:
    | 'initial-js-css-observed'
    | 'initial-js-regression'
    | 'interaction-readiness'
    | 'route-transition'
    | 'main-thread-long-tasks'
    | 'layout-stability'
    | 'recording-ui-response'
    | 'first-partial-observed'
    | 'stable-word-observed'
    | 'finalization-latency'
    | 'asr-latency-regression';
  readonly status: DictatePerformanceParityStatusV1;
  readonly metrics: readonly DictatePerformanceParityMetricNameV1[];
  readonly values: Readonly<Record<string, number | null>>;
  readonly reason: string;
}

export interface DictatePerformanceParityPrivacyV1 {
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

export interface DictatePerformanceParityReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'dictate-performance-parity';
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly evidenceLabel: string;
  readonly status: DictatePerformanceParityStatusV1;
  readonly referenceHardware: DictatePerformanceParityReferenceHardwareV1 | null;
  readonly baseline: DictatePerformanceParityBaselineV1;
  readonly gate: {
    readonly options: DictatePerformanceParityGateOptionsV1;
    readonly checks: readonly DictatePerformanceParityGateCheckV1[];
    readonly reasons: readonly string[];
  };
  readonly measurements: readonly DictatePerformanceParityMeasurementV1[];
  readonly privacy: DictatePerformanceParityPrivacyV1;
  readonly warnings: readonly string[];
  readonly definitions: {
    readonly browserSmokeEvidence: string;
    readonly initialBundleRegression: string;
    readonly asrLatencyRegression: string;
    readonly longTasks: string;
    readonly cumulativeLayoutShift: string;
  };
}

export interface CreateDictatePerformanceParityReportOptionsV1 {
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly evidenceLabel: string;
  readonly baseline: DictatePerformanceParityBaselineV1;
  readonly referenceHardware?: DictatePerformanceParityReferenceHardwareV1 | null;
  readonly measurements: readonly DictatePerformanceParityMeasurementInputV1[];
  readonly gate?: Partial<DictatePerformanceParityGateOptionsV1>;
  readonly warnings?: readonly string[];
}

export const defaultDictatePerformanceParityGateOptions: DictatePerformanceParityGateOptionsV1 = {
  maxInitialDictateJsGzipIncreaseBytes: 40 * 1024,
  maxInteractionReadyMs: 2_500,
  maxRouteTransitionMs: 150,
  maxMainThreadLongTaskCount: 0,
  maxMainThreadLongTaskMs: 50,
  maxCumulativeLayoutShift: 0.05,
  maxRecordingUiResponseMs: 150,
  maxAsrLatencyRegressionPercent: 2,
};

export function createDictatePerformanceParityReport(
  options: CreateDictatePerformanceParityReportOptionsV1,
): DictatePerformanceParityReportV1 {
  const gate = { ...defaultDictatePerformanceParityGateOptions, ...options.gate };
  validateGate(gate);
  const baseline = normalizeBaseline(options.baseline);
  const measurements = normalizeMeasurements(options.measurements);
  const measurementsByName = new Map(
    measurements.map((measurement) => [measurement.name, measurement]),
  );
  const checks = createGateChecks(measurementsByName, baseline, gate);
  const reasons = createReasons(checks);
  const status = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'insufficient-evidence')
      ? 'insufficient-evidence'
      : 'passed';

  return {
    schemaVersion: 1,
    reportType: 'dictate-performance-parity',
    generatedAt: options.generatedAt,
    benchmarkId: normalizeIdentifier(options.benchmarkId, 'benchmarkId'),
    evidenceLabel: normalizeEvidenceLabel(options.evidenceLabel),
    status,
    referenceHardware: normalizeReferenceHardware(options.referenceHardware ?? null),
    baseline,
    gate: { options: gate, checks, reasons },
    measurements,
    privacy: createPrivacy(),
    warnings: [
      ...(status === 'insufficient-evidence'
        ? [
            'Dictate performance parity release gate is incomplete until v0.5 reference-baseline and real-ASR latency evidence are available.',
          ]
        : []),
      ...sanitizeTextArray(options.warnings ?? [], 240, 'Dictate benchmark warning redacted.'),
    ],
    definitions: {
      browserSmokeEvidence:
        'Browser-smoke measurements prove the UI path remains instrumented and locally measurable; they are not a substitute for declared reference-hardware regression evidence.',
      initialBundleRegression:
        'Initial Dictate JavaScript regression is the gzip-byte increase versus the v0.5.0 Dictate baseline and must stay within 40 KiB unless an exception is approved.',
      asrLatencyRegression:
        'ASR latency regression covers first partial, stable word, and finalization latency versus v0.5.0 on declared reference hardware; synthetic or fake-microphone smoke data is insufficient for this release gate.',
      longTasks:
        'Main-thread long tasks are tasks over 50 ms observed during the Dictate smoke path.',
      cumulativeLayoutShift:
        'CLS is cumulative layout shift after shell initialization during the Dictate smoke path.',
    },
  };
}

export function createMissingDictatePerformanceParityReport(options: {
  readonly generatedAt: string;
  readonly benchmarkId?: string;
  readonly evidenceLabel?: string;
  readonly warnings?: readonly string[];
}): DictatePerformanceParityReportV1 {
  return createDictatePerformanceParityReport({
    generatedAt: options.generatedAt,
    benchmarkId: options.benchmarkId ?? 'v0-6-0-dictate-performance-parity-missing',
    evidenceLabel:
      options.evidenceLabel ??
      'No declared v0.5.0 reference-baseline Dictate performance evidence is available',
    baseline: {
      release: 'v0.5.0',
      hasInitialBundleBaseline: false,
      hasAsrLatencyBaseline: false,
      notes: [
        'v0.5.0 task metrics captured usability screenshots, not reference hardware timing baselines.',
      ],
    },
    referenceHardware: null,
    measurements: requiredMetricNames.map((name) => ({
      name,
      value: null,
      source: 'not-measured',
    })),
    warnings: [
      'Do not use CI synthetic Dictate smoke metrics as the v0.6 reference-hardware parity gate.',
      ...(options.warnings ?? []),
    ],
  });
}

const requiredMetricNames: readonly DictatePerformanceParityMetricNameV1[] = [
  'initialDictateJsBytes',
  'initialDictateCssBytes',
  'initialDictateJsGzipIncreaseBytes',
  'interactionReadyMs',
  'routeTransitionMs',
  'mainThreadLongTaskCount',
  'mainThreadLongTaskMaxMs',
  'cumulativeLayoutShift',
  'recordingUiResponseMs',
  'firstPartialLatencyMs',
  'stableWordLatencyMs',
  'finalizationLatencyMs',
  'asrLatencyRegressionPercent',
];

const metricUnits: Readonly<
  Record<DictatePerformanceParityMetricNameV1, DictatePerformanceParityMetricUnitV1>
> = {
  initialDictateJsBytes: 'bytes',
  initialDictateCssBytes: 'bytes',
  initialDictateJsGzipIncreaseBytes: 'bytes',
  interactionReadyMs: 'ms',
  routeTransitionMs: 'ms',
  mainThreadLongTaskCount: 'count',
  mainThreadLongTaskMaxMs: 'ms',
  cumulativeLayoutShift: 'score',
  recordingUiResponseMs: 'ms',
  firstPartialLatencyMs: 'ms',
  stableWordLatencyMs: 'ms',
  finalizationLatencyMs: 'ms',
  asrLatencyRegressionPercent: 'percent',
};

function createGateChecks(
  measurements: ReadonlyMap<
    DictatePerformanceParityMetricNameV1,
    DictatePerformanceParityMeasurementV1
  >,
  baseline: DictatePerformanceParityBaselineV1,
  gate: DictatePerformanceParityGateOptionsV1,
): readonly DictatePerformanceParityGateCheckV1[] {
  const get = (name: DictatePerformanceParityMetricNameV1) => measurements.get(name)?.value ?? null;
  const source = (name: DictatePerformanceParityMetricNameV1) => measurements.get(name)?.source;
  const checks: DictatePerformanceParityGateCheckV1[] = [];

  const jsBytes = get('initialDictateJsBytes');
  const cssBytes = get('initialDictateCssBytes');
  checks.push({
    name: 'initial-js-css-observed',
    metrics: ['initialDictateJsBytes', 'initialDictateCssBytes'],
    values: { initialDictateJsBytes: jsBytes, initialDictateCssBytes: cssBytes },
    status: jsBytes === null || cssBytes === null ? 'insufficient-evidence' : 'passed',
    reason:
      jsBytes === null || cssBytes === null
        ? 'Initial Dictate JavaScript and CSS bytes were not both measured.'
        : 'Initial Dictate JavaScript and CSS bytes were measured as aggregate local resource sizes.',
  });

  const jsIncrease = get('initialDictateJsGzipIncreaseBytes');
  const jsIncreaseSource = source('initialDictateJsGzipIncreaseBytes');
  checks.push({
    name: 'initial-js-regression',
    metrics: ['initialDictateJsGzipIncreaseBytes'],
    values: { initialDictateJsGzipIncreaseBytes: jsIncrease },
    status:
      jsIncrease === null || !baseline.hasInitialBundleBaseline
        ? 'insufficient-evidence'
        : jsIncreaseSource !== 'reference-hardware'
          ? 'insufficient-evidence'
          : jsIncrease > gate.maxInitialDictateJsGzipIncreaseBytes
            ? 'failed'
            : 'passed',
    reason:
      jsIncrease === null || !baseline.hasInitialBundleBaseline
        ? 'No v0.5.0 initial Dictate gzip baseline is available for the 40 KiB regression gate.'
        : jsIncreaseSource !== 'reference-hardware'
          ? 'Initial Dictate JavaScript regression requires declared reference-hardware evidence.'
          : jsIncrease > gate.maxInitialDictateJsGzipIncreaseBytes
            ? 'Initial Dictate JavaScript gzip increase exceeds the v0.6 budget.'
            : 'Initial Dictate JavaScript gzip increase is within the v0.6 budget.',
  });

  checks.push(
    thresholdCheck({
      name: 'interaction-readiness',
      metric: 'interactionReadyMs',
      value: get('interactionReadyMs'),
      source: source('interactionReadyMs'),
      max: gate.maxInteractionReadyMs,
      reasonOk: 'Dictate interaction readiness stayed within the browser-smoke budget.',
      reasonMissing: 'Dictate interaction readiness was not measured.',
      reasonFailed: 'Dictate interaction readiness exceeded the browser-smoke budget.',
    }),
    thresholdCheck({
      name: 'route-transition',
      metric: 'routeTransitionMs',
      value: get('routeTransitionMs'),
      source: source('routeTransitionMs'),
      max: gate.maxRouteTransitionMs,
      reasonOk: 'Cached route transition stayed within the v0.6 UI budget.',
      reasonMissing: 'Cached route transition latency was not measured.',
      reasonFailed: 'Cached route transition latency exceeded the v0.6 UI budget.',
    }),
  );

  const longTaskCount = get('mainThreadLongTaskCount');
  const longTaskMax = get('mainThreadLongTaskMaxMs');
  const longTaskCountSource = source('mainThreadLongTaskCount');
  const longTaskMaxSource = source('mainThreadLongTaskMaxMs');
  checks.push({
    name: 'main-thread-long-tasks',
    metrics: ['mainThreadLongTaskCount', 'mainThreadLongTaskMaxMs'],
    values: { mainThreadLongTaskCount: longTaskCount, mainThreadLongTaskMaxMs: longTaskMax },
    status:
      longTaskCount === null || longTaskMax === null
        ? 'insufficient-evidence'
        : longTaskCountSource !== 'reference-hardware' || longTaskMaxSource !== 'reference-hardware'
          ? 'insufficient-evidence'
          : longTaskCount > gate.maxMainThreadLongTaskCount ||
              longTaskMax > gate.maxMainThreadLongTaskMs
            ? 'failed'
            : 'passed',
    reason:
      longTaskCount === null || longTaskMax === null
        ? 'Main-thread long-task data was not measured.'
        : longTaskCountSource !== 'reference-hardware' || longTaskMaxSource !== 'reference-hardware'
          ? 'Main-thread long-task release gates require declared reference-hardware evidence.'
          : longTaskCount > gate.maxMainThreadLongTaskCount ||
              longTaskMax > gate.maxMainThreadLongTaskMs
            ? 'Dictate smoke path observed main-thread long tasks over the v0.6 budget.'
            : 'Dictate smoke path did not observe main-thread long tasks over the v0.6 budget.',
  });

  checks.push(
    thresholdCheck({
      name: 'layout-stability',
      metric: 'cumulativeLayoutShift',
      value: get('cumulativeLayoutShift'),
      source: source('cumulativeLayoutShift'),
      max: gate.maxCumulativeLayoutShift,
      reasonOk: 'Dictate cumulative layout shift stayed within the v0.6 budget.',
      reasonMissing: 'Dictate cumulative layout shift was not measured.',
      reasonFailed: 'Dictate cumulative layout shift exceeded the v0.6 budget.',
    }),
    thresholdCheck({
      name: 'recording-ui-response',
      metric: 'recordingUiResponseMs',
      value: get('recordingUiResponseMs'),
      source: source('recordingUiResponseMs'),
      max: gate.maxRecordingUiResponseMs,
      reasonOk: 'Recording control response stayed within the v0.6 UI budget.',
      reasonMissing: 'Recording control response was not measured.',
      reasonFailed: 'Recording control response exceeded the v0.6 UI budget.',
    }),
  );

  checks.push(
    observedCheck(
      'first-partial-observed',
      'firstPartialLatencyMs',
      get('firstPartialLatencyMs'),
      source('firstPartialLatencyMs'),
    ),
  );
  checks.push(
    observedCheck(
      'stable-word-observed',
      'stableWordLatencyMs',
      get('stableWordLatencyMs'),
      source('stableWordLatencyMs'),
    ),
  );
  checks.push(
    thresholdCheck({
      name: 'finalization-latency',
      metric: 'finalizationLatencyMs',
      value: get('finalizationLatencyMs'),
      source: source('finalizationLatencyMs'),
      max: gate.maxRecordingUiResponseMs,
      reasonOk: 'Finalization latency was observed within the UI-response smoke budget.',
      reasonMissing: 'Finalization latency was not observed.',
      reasonFailed: 'Finalization latency exceeded the UI-response smoke budget.',
    }),
  );

  const asrRegression = get('asrLatencyRegressionPercent');
  const asrRegressionSource = source('asrLatencyRegressionPercent');
  checks.push({
    name: 'asr-latency-regression',
    metrics: ['asrLatencyRegressionPercent'],
    values: { asrLatencyRegressionPercent: asrRegression },
    status:
      asrRegression === null || !baseline.hasAsrLatencyBaseline
        ? 'insufficient-evidence'
        : asrRegressionSource !== 'reference-hardware'
          ? 'insufficient-evidence'
          : asrRegression > gate.maxAsrLatencyRegressionPercent
            ? 'failed'
            : 'passed',
    reason:
      asrRegression === null || !baseline.hasAsrLatencyBaseline
        ? 'No v0.5.0 first-partial/stable-word/finalization baseline is available for the 2% ASR latency regression gate.'
        : asrRegressionSource !== 'reference-hardware'
          ? 'ASR latency regression must be measured on declared reference hardware.'
          : asrRegression > gate.maxAsrLatencyRegressionPercent
            ? 'ASR latency regression exceeds the v0.6 budget.'
            : 'ASR latency regression is within the v0.6 budget.',
  });

  return checks;
}

function thresholdCheck(options: {
  readonly name: Extract<
    DictatePerformanceParityGateCheckV1['name'],
    | 'interaction-readiness'
    | 'route-transition'
    | 'layout-stability'
    | 'recording-ui-response'
    | 'finalization-latency'
  >;
  readonly metric: DictatePerformanceParityMetricNameV1;
  readonly value: number | null;
  readonly source: DictatePerformanceParityEvidenceSourceV1 | undefined;
  readonly max: number;
  readonly reasonOk: string;
  readonly reasonMissing: string;
  readonly reasonFailed: string;
}): DictatePerformanceParityGateCheckV1 {
  return {
    name: options.name,
    metrics: [options.metric],
    values: { [options.metric]: options.value },
    status:
      options.value === null
        ? 'insufficient-evidence'
        : options.source !== 'reference-hardware'
          ? 'insufficient-evidence'
          : options.value > options.max
            ? 'failed'
            : 'passed',
    reason:
      options.value === null
        ? options.reasonMissing
        : options.source !== 'reference-hardware'
          ? 'Release gate requires declared reference-hardware evidence; browser-smoke timing is informational.'
          : options.value > options.max
            ? options.reasonFailed
            : options.reasonOk,
  };
}

function observedCheck(
  name: Extract<
    DictatePerformanceParityGateCheckV1['name'],
    'first-partial-observed' | 'stable-word-observed'
  >,
  metric: DictatePerformanceParityMetricNameV1,
  value: number | null,
  source: DictatePerformanceParityEvidenceSourceV1 | undefined,
): DictatePerformanceParityGateCheckV1 {
  return {
    name,
    metrics: [metric],
    values: { [metric]: value },
    status:
      value === null
        ? 'insufficient-evidence'
        : source !== 'reference-hardware'
          ? 'insufficient-evidence'
          : 'passed',
    reason:
      value === null
        ? `${metric} was not observed in the Dictate smoke path; fake-microphone capture is not real ASR evidence.`
        : source !== 'reference-hardware'
          ? `${metric} was observed outside declared reference hardware; treat it as instrumentation only.`
          : `${metric} was observed on declared reference hardware.`,
  };
}

function normalizeMeasurements(
  measurements: readonly DictatePerformanceParityMeasurementInputV1[],
): readonly DictatePerformanceParityMeasurementV1[] {
  const seen = new Set<DictatePerformanceParityMetricNameV1>();
  return measurements.map((measurement) => {
    if (seen.has(measurement.name)) {
      throw new Error(`Duplicate Dictate performance metric ${measurement.name}.`);
    }
    seen.add(measurement.name);
    const value = normalizeMeasurementValue(measurement.name, measurement.value);
    return {
      name: measurement.name,
      unit: metricUnits[measurement.name],
      value,
      source: measurement.source,
      referenceHardwareEvidence: measurement.source === 'reference-hardware' && value !== null,
      notes: sanitizeTextArray(measurement.notes ?? [], 160, 'Measurement note redacted.'),
    };
  });
}

function normalizeMeasurementValue(
  name: DictatePerformanceParityMetricNameV1,
  value: number | null,
): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite when provided.`);
  }
  if (value < 0) {
    throw new Error(`${name} cannot be negative.`);
  }
  return roundMetric(value);
}

function normalizeBaseline(
  baseline: DictatePerformanceParityBaselineV1,
): DictatePerformanceParityBaselineV1 {
  return {
    release: 'v0.5.0',
    ...(baseline.commit === undefined
      ? {}
      : { commit: normalizeIdentifier(baseline.commit, 'commit') }),
    hasInitialBundleBaseline: baseline.hasInitialBundleBaseline,
    hasAsrLatencyBaseline: baseline.hasAsrLatencyBaseline,
    notes: sanitizeTextArray(baseline.notes, 200, 'Baseline note redacted.'),
  };
}

function normalizeReferenceHardware(
  hardware: DictatePerformanceParityReferenceHardwareV1 | null,
): DictatePerformanceParityReferenceHardwareV1 | null {
  if (hardware === null) return null;
  return {
    label: sanitizeText(hardware.label, 80, 'Reference hardware'),
    ...(hardware.browserName === undefined
      ? {}
      : { browserName: sanitizeText(hardware.browserName, 40, 'Browser') }),
    ...(hardware.browserVersion === undefined
      ? {}
      : { browserVersion: sanitizeText(hardware.browserVersion, 40, 'Browser version') }),
    ...(hardware.operatingSystem === undefined
      ? {}
      : { operatingSystem: sanitizeText(hardware.operatingSystem, 60, 'Operating system') }),
    ...(hardware.cpuModel === undefined
      ? {}
      : { cpuModel: sanitizeText(hardware.cpuModel, 80, 'CPU') }),
    ...(hardware.memoryGb === undefined
      ? {}
      : { memoryGb: normalizePositiveNumber(hardware.memoryGb) }),
    notes: sanitizeTextArray(hardware.notes, 160, 'Hardware note redacted.'),
  };
}

function createReasons(checks: readonly DictatePerformanceParityGateCheckV1[]): readonly string[] {
  return checks
    .filter((check) => check.status !== 'passed')
    .map((check) => `${check.name}: ${check.reason}`);
}

function createPrivacy(): DictatePerformanceParityPrivacyV1 {
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

function validateGate(gate: DictatePerformanceParityGateOptionsV1): void {
  for (const [name, value] of Object.entries(gate)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number.`);
    }
  }
}

function normalizeIdentifier(value: string, field: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .slice(0, 96);
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  return normalized;
}

function normalizeEvidenceLabel(value: string): string {
  return sanitizeText(value, 120, 'Dictate performance evidence');
}

function normalizePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Reference hardware memory must be positive when provided.');
  }
  return roundMetric(value);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function sanitizeTextArray(
  values: readonly string[],
  maxLength: number,
  fallback: string,
): readonly string[] {
  return values.map((value) => sanitizeText(value, maxLength, fallback));
}

function sanitizeText(value: string, maxLength: number, fallback: string): string {
  let sanitized = value
    .replace(/https?:\/\/\S+/gi, 'url-redacted')
    .replace(
      /\b(?:profile|prompt|case|checkpoint)-[a-z0-9_.:-]+\b/gi,
      (match) => `${match.split('-')[0]?.toLowerCase() ?? 'id'}-redacted`,
    )
    .replace(/(?:\.{0,2}\/|~\/|\/)[^\s]+/g, 'path-redacted')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  if (sanitized.length === 0) sanitized = fallback;
  return sanitized.length <= maxLength ? sanitized : `${sanitized.slice(0, maxLength - 1)}…`;
}
