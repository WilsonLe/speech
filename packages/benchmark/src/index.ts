export type BenchmarkMetricName =
  | 'firstPartialLatencyMs'
  | 'stableTokenLatencyMs'
  | 'finalizationLatencyMs'
  | 'encoderChunkMs'
  | 'decoderChunkMs'
  | 'realTimeFactor'
  | 'queueDepthFrames'
  | 'audioOverruns'
  | 'jsHeapUsedBytes'
  | 'modelSessionMemoryBytes';

export type BenchmarkMetricUnit = 'ms' | 'ratio' | 'frames' | 'count' | 'bytes';

export interface BenchmarkMetricSample {
  readonly name: BenchmarkMetricName;
  readonly unit: BenchmarkMetricUnit;
  readonly value: number;
}

export interface BenchmarkSummaryStats {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
}

export interface BenchmarkMetricSummary extends BenchmarkSummaryStats {
  readonly name: BenchmarkMetricName;
  readonly unit: BenchmarkMetricUnit;
}

export interface BenchmarkTraceEvent {
  readonly chunkIndex: number;
  readonly audioStartMs: number;
  readonly audioDurationMs: number;
  readonly queueDepthFrames: number;
  readonly encoderMs: number;
  readonly decoderMs: number;
  readonly workerElapsedMs: number;
}

export interface BenchmarkEnvironment {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly browserLanguage?: string;
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
  readonly provider?: 'webgpu' | 'wasm' | 'none' | 'unknown';
  readonly wasmThreads?: number;
  readonly modelId?: string;
  readonly modelVersion?: string;
}

export interface BenchmarkConfiguration {
  readonly scenario: 'synthetic-worker' | 'audio-fixture' | 'model-runtime';
  readonly repetitions: number;
  readonly chunkCount: number;
  readonly chunkDurationMs: number;
  readonly syntheticAudioMs: number;
  readonly notes: readonly string[];
}

export interface BenchmarkPrivacyStatement {
  readonly containsAudio: false;
  readonly containsTranscript: false;
  readonly networkUpload: false;
}

export interface BenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'speech-benchmark';
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly configuration: BenchmarkConfiguration;
  readonly environment: BenchmarkEnvironment;
  readonly privacy: BenchmarkPrivacyStatement;
  readonly summaries: readonly BenchmarkMetricSummary[];
  readonly traces: readonly BenchmarkTraceEvent[];
  readonly warnings: readonly string[];
}

export interface CreateBenchmarkReportOptions {
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly configuration: BenchmarkConfiguration;
  readonly environment?: BenchmarkEnvironment;
  readonly traces: readonly BenchmarkTraceEvent[];
  readonly metricSamples?: readonly BenchmarkMetricSample[];
  readonly warnings?: readonly string[];
}

export interface DiagnosticsExportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'speech-diagnostics-export';
  readonly generatedAt: string;
  readonly privacy: BenchmarkPrivacyStatement;
  readonly benchmark?: BenchmarkReportV1;
  readonly capabilities?: unknown;
  readonly notes: readonly string[];
}

export interface CreateDiagnosticsExportOptions {
  readonly generatedAt: string;
  readonly benchmark?: BenchmarkReportV1;
  readonly capabilities?: unknown;
  readonly notes?: readonly string[];
}

export interface BenchmarkPackageInfo {
  readonly name: '@speech/benchmark';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: BenchmarkPackageInfo = {
  name: '@speech/benchmark',
  status: 'active',
  description: 'Latency, RTF, queue, memory, and benchmark export contracts.',
};

export const benchmarkPrivacyStatement: BenchmarkPrivacyStatement = {
  containsAudio: false,
  containsTranscript: false,
  networkUpload: false,
};

export function summarizeSamples(values: readonly number[]): BenchmarkSummaryStats {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    throw new Error('Cannot summarize an empty benchmark sample set.');
  }

  const sorted = [...finiteValues].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === undefined || last === undefined) {
    throw new Error('Cannot summarize an empty benchmark sample set.');
  }

  return {
    count: sorted.length,
    min: first,
    max: last,
    mean: total / sorted.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

export function createBenchmarkReport(options: CreateBenchmarkReportOptions): BenchmarkReportV1 {
  const metricSamples = [
    ...metricSamplesFromTraces(options.traces),
    ...(options.metricSamples ?? []),
  ];
  const summaries = summarizeMetricSamples(metricSamples);

  return {
    schemaVersion: 1,
    reportType: 'speech-benchmark',
    generatedAt: options.generatedAt,
    benchmarkId: options.benchmarkId,
    configuration: options.configuration,
    environment: options.environment ?? {},
    privacy: benchmarkPrivacyStatement,
    summaries,
    traces: options.traces.map(copyTraceEvent),
    warnings: [...(options.warnings ?? [])],
  };
}

export function createDiagnosticsExport(
  options: CreateDiagnosticsExportOptions,
): DiagnosticsExportV1 {
  return {
    schemaVersion: 1,
    reportType: 'speech-diagnostics-export',
    generatedAt: options.generatedAt,
    privacy: benchmarkPrivacyStatement,
    ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    notes: [...(options.notes ?? [])],
  };
}

export function serializeBenchmarkJson(report: BenchmarkReportV1 | DiagnosticsExportV1): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function createBenchmarkId(generatedAt: string, label = 'local'): string {
  const normalizedLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  return `speech-${normalizedLabel || 'benchmark'}-${timestamp}`;
}

export function calculateRealTimeFactor(processingMs: number, audioDurationMs: number): number {
  assertNonNegativeFinite(processingMs, 'processingMs');
  assertPositiveFinite(audioDurationMs, 'audioDurationMs');
  return processingMs / audioDurationMs;
}

function summarizeMetricSamples(
  samples: readonly BenchmarkMetricSample[],
): readonly BenchmarkMetricSummary[] {
  const grouped = new Map<BenchmarkMetricName, { unit: BenchmarkMetricUnit; values: number[] }>();

  for (const sample of samples) {
    assertNonNegativeFinite(sample.value, sample.name);
    const group = grouped.get(sample.name);
    if (group !== undefined) {
      if (group.unit !== sample.unit) {
        throw new Error(`Metric ${sample.name} used inconsistent units.`);
      }
      group.values.push(sample.value);
      continue;
    }
    grouped.set(sample.name, { unit: sample.unit, values: [sample.value] });
  }

  return [...grouped.entries()].map(([name, group]) => ({
    name,
    unit: group.unit,
    ...summarizeSamples(group.values),
  }));
}

function metricSamplesFromTraces(
  traces: readonly BenchmarkTraceEvent[],
): readonly BenchmarkMetricSample[] {
  const samples: BenchmarkMetricSample[] = [];
  for (const trace of traces) {
    samples.push(
      { name: 'encoderChunkMs', unit: 'ms', value: trace.encoderMs },
      { name: 'decoderChunkMs', unit: 'ms', value: trace.decoderMs },
      { name: 'queueDepthFrames', unit: 'frames', value: trace.queueDepthFrames },
    );
  }
  return samples;
}

function copyTraceEvent(trace: BenchmarkTraceEvent): BenchmarkTraceEvent {
  assertNonNegativeFinite(trace.chunkIndex, 'chunkIndex');
  assertNonNegativeFinite(trace.audioStartMs, 'audioStartMs');
  assertPositiveFinite(trace.audioDurationMs, 'audioDurationMs');
  assertNonNegativeFinite(trace.queueDepthFrames, 'queueDepthFrames');
  assertNonNegativeFinite(trace.encoderMs, 'encoderMs');
  assertNonNegativeFinite(trace.decoderMs, 'decoderMs');
  assertNonNegativeFinite(trace.workerElapsedMs, 'workerElapsedMs');
  return { ...trace };
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) {
    throw new Error('Cannot calculate percentile without samples.');
  }
  if (sortedValues.length === 1) {
    const only = sortedValues[0];
    if (only === undefined) {
      throw new Error('Cannot calculate percentile without samples.');
    }
    return only;
  }

  const index = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new Error('Cannot calculate percentile outside sample range.');
  }

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = index - lowerIndex;
  return lower + (upper - lower) * weight;
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}
