import type { FrozenFeatureTinyAdapterTrainingResultV1 } from './browser-training';

export type AdapterComparisonMetricName =
  | 'wordErrorRate'
  | 'characterErrorRate'
  | 'customTermRecall'
  | 'customTermFalseInsertionRate'
  | 'realTimeFactor'
  | 'trainingDurationMs'
  | 'adapterSizeBytes';

export type AdapterComparisonMetricDirection = 'lower-is-better' | 'higher-is-better';
export type AdapterComparisonMetricUnit = 'ratio' | 'ms' | 'bytes';
export type AdapterComparisonMetricStatus =
  | 'within-tolerance'
  | 'browser-better'
  | 'python-better'
  | 'missing';
export type AdapterComparisonVerdict =
  | 'browser-comparable-experimental'
  | 'prefer-python-trainer'
  | 'insufficient-browser-evidence';

export interface AdapterComparisonQualityInputV1 {
  readonly wordErrorRate?: number | null;
  readonly characterErrorRate?: number | null;
  readonly customTermRecall?: number | null;
  readonly customTermFalseInsertionRate?: number | null;
  readonly realTimeFactor?: number | null;
  readonly activationGatePassed: boolean;
}

export interface BrowserAdapterComparisonInputV1 {
  readonly trainingResult: FrozenFeatureTinyAdapterTrainingResultV1;
  readonly trainingDurationMs: number;
  readonly evaluation?: AdapterComparisonQualityInputV1;
}

export interface PythonAdapterComparisonInputV1 {
  readonly trainingMetadata: unknown;
  readonly evaluationReport: unknown;
  readonly trainingDurationMs: number;
}

export interface AdapterComparisonThresholdsV1 {
  readonly maxRelativeQualityRegression: number;
  readonly maxCustomTermRecallAbsoluteRegression: number;
  readonly maxCustomTermFalseInsertionAbsoluteRegression: number;
  readonly maxRelativeRtfRegression: number;
  readonly maxTrainingDurationRatio: number;
  readonly maxAdapterSizeRatio: number;
  readonly requireBrowserActivationGate: boolean;
  readonly requirePythonActivationGate: boolean;
}

export interface AdapterComparisonMetricV1 {
  readonly name: AdapterComparisonMetricName;
  readonly unit: AdapterComparisonMetricUnit;
  readonly direction: AdapterComparisonMetricDirection;
  readonly browser: number | null;
  readonly python: number | null;
  readonly delta: number | null;
  readonly relativeDelta: number | null;
  readonly tolerance: number;
  readonly status: AdapterComparisonMetricStatus;
}

export interface BrowserAdapterComparisonSummaryV1 {
  readonly source: 'browser-frozen-feature-tiny-adapter';
  readonly status: FrozenFeatureTinyAdapterTrainingResultV1['status'];
  readonly workerOwner: FrozenFeatureTinyAdapterTrainingResultV1['workerOwner'];
  readonly datasetId: string;
  readonly examples: number;
  readonly epochsCompleted: number;
  readonly lossReduction: number;
  readonly trainingDurationMs: number;
  readonly activationGatePassed: boolean;
  readonly adapter: {
    readonly parameterCount: number;
    readonly sizeBytes: number;
    readonly checksum: string;
  };
  readonly baseModel: {
    readonly id: string;
    readonly version: string;
    readonly graphContractSha256: string;
  };
}

export interface PythonAdapterComparisonSummaryV1 {
  readonly source: 'python-profile-trainer';
  readonly trainerVersion: string;
  readonly objective: string;
  readonly trainingDurationMs: number;
  readonly activationGatePassed: boolean;
  readonly adapter: {
    readonly parameterCount: number | null;
    readonly sizeBytes: number;
    readonly sha256: string;
  };
  readonly baseModel: {
    readonly id: string;
    readonly version: string;
    readonly graphContractSha256: string;
  };
}

export interface BrowserPythonAdapterComparisonPrivacyV1 {
  readonly containsRawAudio: false;
  readonly containsTranscriptText: false;
  readonly containsCaseIds: false;
  readonly containsFrozenFeatureValues: false;
  readonly containsAdapterWeights: false;
  readonly aggregateOnly: true;
  readonly localOnly: true;
  readonly networkUpload: false;
}

export interface BrowserPythonAdapterComparisonReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'browser-python-adapter-comparison';
  readonly generatedAt: string;
  readonly comparisonId: string;
  readonly baseModelCompatible: boolean;
  readonly browser: BrowserAdapterComparisonSummaryV1;
  readonly python: PythonAdapterComparisonSummaryV1;
  readonly qualityMetrics: readonly AdapterComparisonMetricV1[];
  readonly performanceMetrics: readonly AdapterComparisonMetricV1[];
  readonly verdict: {
    readonly status: AdapterComparisonVerdict;
    readonly reasons: readonly string[];
  };
  readonly thresholds: AdapterComparisonThresholdsV1;
  readonly privacy: BrowserPythonAdapterComparisonPrivacyV1;
  readonly warnings: readonly string[];
}

export interface CreateBrowserPythonAdapterComparisonReportOptions {
  readonly generatedAt: string;
  readonly comparisonId: string;
  readonly browser: BrowserAdapterComparisonInputV1;
  readonly python: PythonAdapterComparisonInputV1;
  readonly thresholds?: Partial<AdapterComparisonThresholdsV1>;
  readonly warnings?: readonly string[];
}

export const defaultAdapterComparisonThresholds: AdapterComparisonThresholdsV1 = {
  maxRelativeQualityRegression: 0.05,
  maxCustomTermRecallAbsoluteRegression: 0.05,
  maxCustomTermFalseInsertionAbsoluteRegression: 0,
  maxRelativeRtfRegression: 0.15,
  maxTrainingDurationRatio: 2,
  maxAdapterSizeRatio: 1.25,
  requireBrowserActivationGate: true,
  requirePythonActivationGate: true,
};

export const browserPythonAdapterComparisonPrivacy: BrowserPythonAdapterComparisonPrivacyV1 = {
  containsRawAudio: false,
  containsTranscriptText: false,
  containsCaseIds: false,
  containsFrozenFeatureValues: false,
  containsAdapterWeights: false,
  aggregateOnly: true,
  localOnly: true,
  networkUpload: false,
};

export function createBrowserPythonAdapterComparisonReport(
  options: CreateBrowserPythonAdapterComparisonReportOptions,
): BrowserPythonAdapterComparisonReportV1 {
  const thresholds = normalizeThresholds(options.thresholds ?? {});
  const browser = summarizeBrowserAdapter(options.browser);
  const python = summarizePythonAdapter(options.python);
  const browserQuality = options.browser.evaluation;
  const pythonQuality = qualityFromPythonEvaluationReport(options.python.evaluationReport);
  const qualityMetrics = createQualityMetrics(browserQuality, pythonQuality, thresholds);
  const performanceMetrics = createPerformanceMetrics(browser, python, thresholds);
  const baseModelCompatible =
    browser.baseModel.id === python.baseModel.id &&
    browser.baseModel.version === python.baseModel.version &&
    browser.baseModel.graphContractSha256 === python.baseModel.graphContractSha256;
  const verdict = createVerdict({
    baseModelCompatible,
    browserActivationGatePassed: browser.activationGatePassed,
    pythonActivationGatePassed: python.activationGatePassed,
    qualityMetrics,
    performanceMetrics,
    thresholds,
  });

  return {
    schemaVersion: 1,
    reportType: 'browser-python-adapter-comparison',
    generatedAt: requireNonEmptyString(options.generatedAt, 'generatedAt'),
    comparisonId: requireNonEmptyString(options.comparisonId, 'comparisonId'),
    baseModelCompatible,
    browser,
    python,
    qualityMetrics,
    performanceMetrics,
    verdict,
    thresholds,
    privacy: browserPythonAdapterComparisonPrivacy,
    warnings: [...(options.warnings ?? [])],
  };
}

function summarizeBrowserAdapter(
  input: BrowserAdapterComparisonInputV1,
): BrowserAdapterComparisonSummaryV1 {
  const result = input.trainingResult;
  if (result.privacy.containsRawAudio || result.privacy.containsTranscriptText) {
    throw new Error(
      'Browser adapter comparison input must not contain raw audio or transcript text.',
    );
  }
  assertNonNegativeNumber(input.trainingDurationMs, 'browser.trainingDurationMs');
  return {
    source: 'browser-frozen-feature-tiny-adapter',
    status: result.status,
    workerOwner: result.workerOwner,
    datasetId: requireNonEmptyString(result.datasetId, 'browser.datasetId'),
    examples: assertPositiveInteger(result.metrics.examples, 'browser.metrics.examples'),
    epochsCompleted: assertNonNegativeInteger(
      result.metrics.epochsCompleted,
      'browser.metrics.epochsCompleted',
    ),
    lossReduction: assertFiniteNumber(
      result.metrics.lossReduction,
      'browser.metrics.lossReduction',
    ),
    trainingDurationMs: input.trainingDurationMs,
    activationGatePassed:
      input.evaluation?.activationGatePassed === true && result.status === 'completed',
    adapter: {
      parameterCount: assertPositiveInteger(
        result.artifact.parameterCount,
        'browser.artifact.parameterCount',
      ),
      sizeBytes: result.artifact.parameterCount * Float32Array.BYTES_PER_ELEMENT,
      checksum: requireNonEmptyString(result.artifact.checksum, 'browser.artifact.checksum'),
    },
    baseModel: {
      id: requireNonEmptyString(result.compatibility.baseModelId, 'browser.baseModel.id'),
      version: requireNonEmptyString(
        result.compatibility.baseModelVersion,
        'browser.baseModel.version',
      ),
      graphContractSha256: requireSha256(
        result.compatibility.graphContractSha256,
        'browser.baseModel.graphContractSha256',
      ),
    },
  };
}

function summarizePythonAdapter(
  input: PythonAdapterComparisonInputV1,
): PythonAdapterComparisonSummaryV1 {
  const metadata = requireObject(input.trainingMetadata, 'python.trainingMetadata');
  const evaluation = requireObject(input.evaluationReport, 'python.evaluationReport');
  const privacy = requireObject(evaluation['privacy'], 'python.evaluationReport.privacy');
  if (
    privacy['containsRawAudio'] !== false ||
    privacy['containsTranscriptText'] !== false ||
    privacy['containsCaseIds'] !== false ||
    privacy['containsBaseModelWeights'] !== false ||
    privacy['containsAdapterWeights'] !== false ||
    privacy['exposesRawVocabularyEntryIds'] !== false
  ) {
    throw new Error(
      'Python evaluation report must be aggregate-only and exclude private artifacts.',
    );
  }
  assertNonNegativeNumber(input.trainingDurationMs, 'python.trainingDurationMs');
  const adapter = requireObject(metadata['adapter'], 'python.trainingMetadata.adapter');
  const baseModel = requireObject(metadata['baseModel'], 'python.trainingMetadata.baseModel');
  const optimization = requireObject(
    metadata['optimization'],
    'python.trainingMetadata.optimization',
  );
  const softwareVersions = requireObject(
    metadata['softwareVersions'],
    'python.trainingMetadata.softwareVersions',
  );
  const activationGate = requireObject(
    evaluation['activationGate'],
    'python.evaluationReport.activationGate',
  );
  return {
    source: 'python-profile-trainer',
    trainerVersion: requireNonEmptyString(
      softwareVersions['speechProfileTrainer'],
      'python.softwareVersions.speechProfileTrainer',
    ),
    objective: requireNonEmptyString(optimization['objective'], 'python.optimization.objective'),
    trainingDurationMs: input.trainingDurationMs,
    activationGatePassed: requireBoolean(activationGate['passed'], 'python.activationGate.passed'),
    adapter: {
      parameterCount: optionalPositiveInteger(
        adapter['parameterCount'],
        'python.adapter.parameterCount',
      ),
      sizeBytes: assertPositiveInteger(adapter['sizeBytes'], 'python.adapter.sizeBytes'),
      sha256: requireSha256(adapter['sha256'], 'python.adapter.sha256'),
    },
    baseModel: {
      id: requireNonEmptyString(baseModel['id'], 'python.baseModel.id'),
      version: requireNonEmptyString(baseModel['version'], 'python.baseModel.version'),
      graphContractSha256: requireSha256(
        baseModel['graphContractSha256'],
        'python.baseModel.graphContractSha256',
      ),
    },
  };
}

function qualityFromPythonEvaluationReport(report: unknown): AdapterComparisonQualityInputV1 {
  const evaluationReport = requireObject(report, 'python.evaluationReport');
  const evaluation = requireObject(
    evaluationReport['evaluation'],
    'python.evaluationReport.evaluation',
  );
  const overall = requireObject(
    evaluation['overall'],
    'python.evaluationReport.evaluation.overall',
  );
  const activationGate = requireObject(
    evaluationReport['activationGate'],
    'python.evaluationReport.activationGate',
  );
  return {
    wordErrorRate: optionalNumber(scoreAt(overall, 'wer'), 'python.overall.wer.adapted'),
    characterErrorRate: optionalNumber(scoreAt(overall, 'cer'), 'python.overall.cer.adapted'),
    customTermRecall: optionalNumber(
      scoreAt(overall, 'customTermRecall'),
      'python.overall.customTermRecall.adapted',
    ),
    customTermFalseInsertionRate: optionalNumber(
      scoreAt(overall, 'falseInsertionRate'),
      'python.overall.falseInsertionRate.adapted',
    ),
    realTimeFactor: optionalNumber(scoreAt(overall, 'rtf'), 'python.overall.rtf.adapted'),
    activationGatePassed: requireBoolean(activationGate['passed'], 'python.activationGate.passed'),
  };
}

function createQualityMetrics(
  browser: AdapterComparisonQualityInputV1 | undefined,
  python: AdapterComparisonQualityInputV1,
  thresholds: AdapterComparisonThresholdsV1,
): AdapterComparisonMetricV1[] {
  if (browser === undefined) {
    return [
      missingMetric(
        'wordErrorRate',
        'ratio',
        'lower-is-better',
        thresholds.maxRelativeQualityRegression,
      ),
      missingMetric(
        'characterErrorRate',
        'ratio',
        'lower-is-better',
        thresholds.maxRelativeQualityRegression,
      ),
      missingMetric(
        'customTermRecall',
        'ratio',
        'higher-is-better',
        thresholds.maxCustomTermRecallAbsoluteRegression,
      ),
      missingMetric(
        'customTermFalseInsertionRate',
        'ratio',
        'lower-is-better',
        thresholds.maxCustomTermFalseInsertionAbsoluteRegression,
      ),
      missingMetric(
        'realTimeFactor',
        'ratio',
        'lower-is-better',
        thresholds.maxRelativeRtfRegression,
      ),
    ];
  }
  return [
    compareMetric({
      name: 'wordErrorRate',
      unit: 'ratio',
      direction: 'lower-is-better',
      browser: optionalFinite(browser.wordErrorRate, 'browser.wordErrorRate'),
      python: optionalFinite(python.wordErrorRate, 'python.wordErrorRate'),
      tolerance: thresholds.maxRelativeQualityRegression,
      toleranceMode: 'relative',
    }),
    compareMetric({
      name: 'characterErrorRate',
      unit: 'ratio',
      direction: 'lower-is-better',
      browser: optionalFinite(browser.characterErrorRate, 'browser.characterErrorRate'),
      python: optionalFinite(python.characterErrorRate, 'python.characterErrorRate'),
      tolerance: thresholds.maxRelativeQualityRegression,
      toleranceMode: 'relative',
    }),
    compareMetric({
      name: 'customTermRecall',
      unit: 'ratio',
      direction: 'higher-is-better',
      browser: optionalFinite(browser.customTermRecall, 'browser.customTermRecall'),
      python: optionalFinite(python.customTermRecall, 'python.customTermRecall'),
      tolerance: thresholds.maxCustomTermRecallAbsoluteRegression,
      toleranceMode: 'absolute',
    }),
    compareMetric({
      name: 'customTermFalseInsertionRate',
      unit: 'ratio',
      direction: 'lower-is-better',
      browser: optionalFinite(
        browser.customTermFalseInsertionRate,
        'browser.customTermFalseInsertionRate',
      ),
      python: optionalFinite(
        python.customTermFalseInsertionRate,
        'python.customTermFalseInsertionRate',
      ),
      tolerance: thresholds.maxCustomTermFalseInsertionAbsoluteRegression,
      toleranceMode: 'absolute',
    }),
    compareMetric({
      name: 'realTimeFactor',
      unit: 'ratio',
      direction: 'lower-is-better',
      browser: optionalFinite(browser.realTimeFactor, 'browser.realTimeFactor'),
      python: optionalFinite(python.realTimeFactor, 'python.realTimeFactor'),
      tolerance: thresholds.maxRelativeRtfRegression,
      toleranceMode: 'relative',
    }),
  ];
}

function createPerformanceMetrics(
  browser: BrowserAdapterComparisonSummaryV1,
  python: PythonAdapterComparisonSummaryV1,
  thresholds: AdapterComparisonThresholdsV1,
): AdapterComparisonMetricV1[] {
  return [
    compareMetric({
      name: 'trainingDurationMs',
      unit: 'ms',
      direction: 'lower-is-better',
      browser: browser.trainingDurationMs,
      python: python.trainingDurationMs,
      tolerance: thresholds.maxTrainingDurationRatio - 1,
      toleranceMode: 'relative',
    }),
    compareMetric({
      name: 'adapterSizeBytes',
      unit: 'bytes',
      direction: 'lower-is-better',
      browser: browser.adapter.sizeBytes,
      python: python.adapter.sizeBytes,
      tolerance: thresholds.maxAdapterSizeRatio - 1,
      toleranceMode: 'relative',
    }),
  ];
}

function createVerdict(input: {
  readonly baseModelCompatible: boolean;
  readonly browserActivationGatePassed: boolean;
  readonly pythonActivationGatePassed: boolean;
  readonly qualityMetrics: readonly AdapterComparisonMetricV1[];
  readonly performanceMetrics: readonly AdapterComparisonMetricV1[];
  readonly thresholds: AdapterComparisonThresholdsV1;
}): BrowserPythonAdapterComparisonReportV1['verdict'] {
  const reasons: string[] = [];
  if (!input.baseModelCompatible)
    reasons.push('Browser and Python adapters target different base-model identities.');
  if (input.thresholds.requireBrowserActivationGate && !input.browserActivationGatePassed) {
    reasons.push('Browser adapter has not passed an activation gate.');
  }
  if (input.thresholds.requirePythonActivationGate && !input.pythonActivationGatePassed) {
    reasons.push('Python adapter has not passed an activation gate.');
  }
  const missingQuality = input.qualityMetrics.some((metric) => metric.status === 'missing');
  if (missingQuality) reasons.push('Browser quality evidence is incomplete for parity comparison.');
  const qualityRegressed = input.qualityMetrics.some((metric) => metric.status === 'python-better');
  if (qualityRegressed)
    reasons.push('Browser adapter quality is worse than the Python trainer beyond tolerance.');
  const performanceRegressed = input.performanceMetrics.some(
    (metric) => metric.status === 'python-better',
  );
  if (performanceRegressed) {
    reasons.push(
      'Browser adapter training or artifact size is worse than the Python trainer beyond tolerance.',
    );
  }

  if (reasons.length > 0) {
    return {
      status: missingQuality ? 'insufficient-browser-evidence' : 'prefer-python-trainer',
      reasons,
    };
  }
  return {
    status: 'browser-comparable-experimental',
    reasons: ['Browser adapter evidence is within configured parity tolerances.'],
  };
}

function compareMetric(input: {
  readonly name: AdapterComparisonMetricName;
  readonly unit: AdapterComparisonMetricUnit;
  readonly direction: AdapterComparisonMetricDirection;
  readonly browser: number | null;
  readonly python: number | null;
  readonly tolerance: number;
  readonly toleranceMode: 'absolute' | 'relative';
}): AdapterComparisonMetricV1 {
  if (input.browser === null || input.python === null) {
    return missingMetric(input.name, input.unit, input.direction, input.tolerance);
  }
  const delta = roundFloat(input.browser - input.python);
  const relativeDelta = roundFloat(relativeDifference(input.browser, input.python));
  const worseBy =
    input.direction === 'lower-is-better'
      ? input.browser - input.python
      : input.python - input.browser;
  const improvementBy =
    input.direction === 'lower-is-better'
      ? input.python - input.browser
      : input.browser - input.python;
  const toleranceValue =
    input.toleranceMode === 'absolute' ? input.tolerance : Math.abs(input.python) * input.tolerance;
  let status: AdapterComparisonMetricStatus = 'within-tolerance';
  if (worseBy > toleranceValue) status = 'python-better';
  if (improvementBy > toleranceValue) status = 'browser-better';
  return {
    name: input.name,
    unit: input.unit,
    direction: input.direction,
    browser: roundFloat(input.browser),
    python: roundFloat(input.python),
    delta,
    relativeDelta,
    tolerance: input.tolerance,
    status,
  };
}

function missingMetric(
  name: AdapterComparisonMetricName,
  unit: AdapterComparisonMetricUnit,
  direction: AdapterComparisonMetricDirection,
  tolerance: number,
): AdapterComparisonMetricV1 {
  return {
    name,
    unit,
    direction,
    browser: null,
    python: null,
    delta: null,
    relativeDelta: null,
    tolerance,
    status: 'missing',
  };
}

function normalizeThresholds(
  input: Partial<AdapterComparisonThresholdsV1>,
): AdapterComparisonThresholdsV1 {
  const thresholds = { ...defaultAdapterComparisonThresholds, ...input };
  assertNonNegativeNumber(thresholds.maxRelativeQualityRegression, 'maxRelativeQualityRegression');
  assertNonNegativeNumber(
    thresholds.maxCustomTermRecallAbsoluteRegression,
    'maxCustomTermRecallAbsoluteRegression',
  );
  assertNonNegativeNumber(
    thresholds.maxCustomTermFalseInsertionAbsoluteRegression,
    'maxCustomTermFalseInsertionAbsoluteRegression',
  );
  assertNonNegativeNumber(thresholds.maxRelativeRtfRegression, 'maxRelativeRtfRegression');
  assertAtLeastOne(thresholds.maxTrainingDurationRatio, 'maxTrainingDurationRatio');
  assertAtLeastOne(thresholds.maxAdapterSizeRatio, 'maxAdapterSizeRatio');
  return thresholds;
}

function scoreAt(container: Record<string, unknown>, key: string): unknown {
  const score = requireObject(container[key], `python.overall.${key}`);
  return score['adapted'];
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireSha256(value: unknown, path: string): string {
  const stringValue = requireNonEmptyString(value, path);
  if (!/^[a-f0-9]{64}$/u.test(stringValue)) {
    throw new Error(`${path} must be a lowercase SHA-256 hex string.`);
  }
  return stringValue;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  return assertPositiveInteger(value, path);
}

function assertPositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new Error(`${path} must be a positive integer.`);
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertNonNegativeNumber(value: unknown, path: string): number {
  const numberValue = assertFiniteNumber(value, path);
  if (numberValue < 0) throw new Error(`${path} must be non-negative.`);
  return numberValue;
}

function assertPositiveNumber(value: unknown, path: string): number {
  const numberValue = assertFiniteNumber(value, path);
  if (numberValue <= 0) throw new Error(`${path} must be positive.`);
  return numberValue;
}

function assertAtLeastOne(value: unknown, path: string): number {
  const numberValue = assertPositiveNumber(value, path);
  if (numberValue < 1) throw new Error(`${path} must be at least 1.`);
  return numberValue;
}

function optionalNumber(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  return optionalFinite(value, path);
}

function optionalFinite(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  return assertFiniteNumber(value, path);
}

function relativeDifference(left: number, right: number): number | null {
  if (right === 0) return left === 0 ? 0 : null;
  return (left - right) / Math.abs(right);
}

function roundFloat(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}
