import { describe, expect, it } from 'vitest';
import {
  calculateRealTimeFactor,
  createBenchmarkId,
  createBenchmarkReport,
  createDiagnosticsExport,
  createDictatePerformanceParityReport,
  createMissingDictatePerformanceParityReport,
  createMissingPersonalModelReleaseBenchmarkReport,
  createPersonalModelReleaseBenchmarkReport,
  createSyntheticCustomTermBenchmarkEvaluation,
  serializeBenchmarkJson,
  summarizeSamples,
  type BenchmarkTraceEvent,
  type DictatePerformanceParityMeasurementInputV1,
  type PersonalModelReleaseBenchmarkMeasurementInputV1,
} from './index';

const traces: readonly BenchmarkTraceEvent[] = [
  {
    chunkIndex: 0,
    audioStartMs: 0,
    audioDurationMs: 160,
    queueDepthFrames: 0,
    encoderMs: 1.5,
    decoderMs: 0.5,
    workerElapsedMs: 2,
  },
  {
    chunkIndex: 1,
    audioStartMs: 160,
    audioDurationMs: 160,
    queueDepthFrames: 1,
    encoderMs: 2.5,
    decoderMs: 0.75,
    workerElapsedMs: 3.25,
  },
];

const configuration = {
  scenario: 'synthetic-worker' as const,
  repetitions: 1,
  chunkCount: 2,
  chunkDurationMs: 160,
  syntheticAudioMs: 320,
  notes: ['Synthetic fixture only; no audio or transcripts included.'],
};

describe('benchmark report helpers', () => {
  it('summarizes finite samples with median and p95', () => {
    expect(summarizeSamples([10, 2, 4, 8])).toEqual({
      count: 4,
      min: 2,
      max: 10,
      mean: 6,
      median: 6,
      p95: 9.7,
    });
  });

  it('rejects empty or invalid samples', () => {
    expect(() => summarizeSamples([])).toThrow(/empty/i);
    expect(() => summarizeSamples([Number.NaN])).toThrow(/empty/i);
    expect(() => calculateRealTimeFactor(1, 0)).toThrow(/positive/);
  });

  it('creates a privacy-preserving benchmark report', () => {
    const report = createBenchmarkReport({
      generatedAt: '2026-06-22T00:00:00.000Z',
      benchmarkId: 'speech-test',
      configuration,
      environment: { provider: 'wasm', wasmThreads: 1 },
      traces,
      metricSamples: [
        { name: 'firstPartialLatencyMs', unit: 'ms', value: 120 },
        { name: 'stableTokenLatencyMs', unit: 'ms', value: 180 },
        { name: 'finalizationLatencyMs', unit: 'ms', value: 90 },
        { name: 'realTimeFactor', unit: 'ratio', value: 0.2 },
        { name: 'audioOverruns', unit: 'count', value: 0 },
      ],
      warnings: ['Synthetic worker benchmark; not a production model measurement.'],
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.reportType).toBe('speech-benchmark');
    expect(report.privacy).toEqual({
      containsAudio: false,
      containsTranscript: false,
      networkUpload: false,
    });
    expect(report.traces).toHaveLength(2);
    expect(report.summaries.map((summary) => summary.name)).toEqual([
      'encoderChunkMs',
      'decoderChunkMs',
      'queueDepthFrames',
      'firstPartialLatencyMs',
      'stableTokenLatencyMs',
      'finalizationLatencyMs',
      'realTimeFactor',
      'audioOverruns',
    ]);
  });

  it('evaluates synthetic custom-term recall and false insertions without exported transcript text', () => {
    const customTermEvaluation = createSyntheticCustomTermBenchmarkEvaluation();

    expect(customTermEvaluation).toMatchObject({
      schemaVersion: 1,
      reportType: 'custom-term-benchmark',
      synthetic: true,
      caseCount: 4,
      activeCustomTermCount: 3,
      recall: { numerator: 2, denominator: 3, rate: 0.666667 },
      falseInsertion: { numerator: 1, denominator: 3, rate: 0.333333 },
      displayReplacementCount: 3,
    });
    expect(customTermEvaluation.cases).toEqual([
      {
        id: 'synthetic-hit-phrase',
        expectedCustomTermCount: 1,
        recalledCustomTermCount: 1,
        emittedCustomTermCount: 1,
        falseInsertionCount: 0,
        displayReplacementCount: 1,
      },
      {
        id: 'synthetic-hit-alias',
        expectedCustomTermCount: 1,
        recalledCustomTermCount: 1,
        emittedCustomTermCount: 1,
        falseInsertionCount: 0,
        displayReplacementCount: 1,
      },
      {
        id: 'synthetic-miss',
        expectedCustomTermCount: 1,
        recalledCustomTermCount: 0,
        emittedCustomTermCount: 0,
        falseInsertionCount: 0,
        displayReplacementCount: 0,
      },
      {
        id: 'synthetic-false-insertion',
        expectedCustomTermCount: 0,
        recalledCustomTermCount: 0,
        emittedCustomTermCount: 1,
        falseInsertionCount: 1,
        displayReplacementCount: 1,
      },
    ]);

    const report = createBenchmarkReport({
      generatedAt: '2026-06-22T00:00:00.000Z',
      benchmarkId: 'speech-custom-terms',
      configuration,
      traces,
      customTermEvaluation,
    });
    expect(report.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'customTermRecall', unit: 'ratio', median: 0.666667 }),
        expect.objectContaining({
          name: 'customTermFalseInsertionRate',
          unit: 'ratio',
          median: 0.333333,
        }),
      ]),
    );
    const serialized = serializeBenchmarkJson(report);
    expect(serialized).not.toMatch(/Pangea|Wilson|Sổ Cái|dashboard chat|mở/);
  });

  it('creates a combined diagnostics export with optional capability and release-benchmark data', () => {
    const report = createBenchmarkReport({
      generatedAt: '2026-06-22T00:00:00.000Z',
      benchmarkId: 'speech-test',
      configuration,
      traces,
    });
    const releaseBenchmark = createMissingPersonalModelReleaseBenchmarkReport({
      generatedAt: '2026-06-22T00:00:01.000Z',
    });
    const diagnostics = createDiagnosticsExport({
      generatedAt: '2026-06-22T00:00:01.000Z',
      benchmark: report,
      personalModelReleaseBenchmark: releaseBenchmark,
      dictatePerformanceParity: createMissingDictatePerformanceParityReport({
        generatedAt: '2026-06-22T00:00:01.000Z',
      }),
      capabilities: { selectedTier: 'B' },
      notes: ['Local download; no telemetry.'],
    });

    expect(diagnostics.reportType).toBe('speech-diagnostics-export');
    expect(diagnostics.benchmark?.benchmarkId).toBe('speech-test');
    expect(diagnostics.personalModelReleaseBenchmark?.status).toBe('insufficient-evidence');
    expect(diagnostics.dictatePerformanceParity?.reportType).toBe('dictate-performance-parity');
    expect(diagnostics.dictatePerformanceParity?.status).toBe('insufficient-evidence');
    expect(diagnostics.capabilities).toEqual({ selectedTier: 'B' });
    expect(serializeBenchmarkJson(diagnostics)).toMatch(/\n$/);
  });

  it('normalizes generated benchmark identifiers', () => {
    expect(createBenchmarkId('2026-06-22T00:00:00.000Z', 'Local Synthetic Worker')).toBe(
      'speech-local-synthetic-worker-2026-06-22T00-00-00-000Z',
    );
  });

  it('blocks personal-model release benchmarks when reference-hardware evidence is missing', () => {
    const report = createMissingPersonalModelReleaseBenchmarkReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      warnings: [
        'profile-secret-alpha prompt-secret-beta case-secret-gamma checkpoint-secret-delta /home/minh/private/profile.json https://example.invalid/private were excluded from local notes',
      ],
    });

    expect(report.status).toBe('insufficient-evidence');
    expect(report.gate.checks.every((check) => check.status === 'insufficient-evidence')).toBe(
      true,
    );
    expect(report.measurements).toHaveLength(9);
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      containsAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      networkUpload: false,
      localOnly: true,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('profile-secret-alpha');
    expect(serialized).not.toContain('prompt-secret-beta');
    expect(serialized).not.toContain('case-secret-gamma');
    expect(serialized).not.toContain('checkpoint-secret-delta');
    expect(serialized).not.toContain('/home/minh/private/profile.json');
    expect(serialized).not.toContain('https://example.invalid/private');
    expect(report.warnings.join(' ')).toContain('profile-redacted');
    expect(report.warnings.join(' ')).toContain('prompt-redacted');
    expect(report.warnings.join(' ')).toContain('case-redacted');
    expect(report.warnings.join(' ')).toContain('checkpoint-redacted');
    expect(report.warnings.join(' ')).toContain('path-redacted');
    expect(report.warnings.join(' ')).toContain('url-redacted');
  });

  it('blocks Dictate performance parity when v0.5 reference evidence is missing', () => {
    const report = createMissingDictatePerformanceParityReport({
      generatedAt: '2026-06-27T00:00:00.000Z',
      warnings: [
        'profile-secret-alpha prompt-secret-beta case-secret-gamma checkpoint-secret-delta /home/minh/private/profile.json https://example.invalid/private were excluded from local notes',
      ],
    });

    expect(report.status).toBe('insufficient-evidence');
    expect(report.gate.checks.some((check) => check.name === 'initial-js-regression')).toBe(true);
    expect(report.gate.checks.some((check) => check.name === 'asr-latency-regression')).toBe(true);
    expect(report.measurements).toHaveLength(13);
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      containsAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      networkUpload: false,
      localOnly: true,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('profile-secret-alpha');
    expect(serialized).not.toContain('prompt-secret-beta');
    expect(serialized).not.toContain('case-secret-gamma');
    expect(serialized).not.toContain('checkpoint-secret-delta');
    expect(serialized).not.toContain('/home/minh/private/profile.json');
    expect(serialized).not.toContain('https://example.invalid/private');
    expect(report.warnings.join(' ')).toContain('profile-redacted');
    expect(report.warnings.join(' ')).toContain('prompt-redacted');
    expect(report.warnings.join(' ')).toContain('case-redacted');
    expect(report.warnings.join(' ')).toContain('checkpoint-redacted');
    expect(report.warnings.join(' ')).toContain('path-redacted');
    expect(report.warnings.join(' ')).toContain('url-redacted');
  });

  it('passes Dictate parity gates with complete reference hardware and baseline evidence', () => {
    const report = createDictatePerformanceParityReport({
      generatedAt: '2026-06-27T00:00:00.000Z',
      benchmarkId: 'v0-6-0-dictate-reference-pass',
      evidenceLabel: 'Reference hardware Dictate aggregate run',
      baseline: {
        release: 'v0.5.0',
        commit: '8e72dd120e41e69cc52458804fa8b8804e74b9bc',
        hasInitialBundleBaseline: true,
        hasAsrLatencyBaseline: true,
        notes: ['Aggregate v0.5.0 baseline; no raw audio or transcript text included.'],
      },
      referenceHardware: {
        label: 'Reference desktop Chrome',
        browserName: 'Chrome',
        operatingSystem: 'Linux',
        memoryGb: 16,
        notes: ['Aggregate run only.'],
      },
      measurements: dictateParityMeasurements(),
    });

    expect(report.status).toBe('passed');
    expect(report.gate.checks.every((check) => check.status === 'passed')).toBe(true);
    expect(
      report.measurements.find((metric) => metric.name === 'initialDictateJsBytes'),
    ).toMatchObject({
      unit: 'bytes',
      value: 120_000,
      referenceHardwareEvidence: true,
    });
    expect(
      report.measurements.find((metric) => metric.name === 'cumulativeLayoutShift'),
    ).toMatchObject({
      unit: 'score',
      value: 0.01,
    });
  });

  it('fails Dictate parity gates when UI smoke budgets are exceeded', () => {
    const report = createDictatePerformanceParityReport({
      generatedAt: '2026-06-27T00:00:00.000Z',
      benchmarkId: 'v0-6-0-dictate-reference-fail',
      evidenceLabel: 'Reference hardware Dictate aggregate run',
      baseline: {
        release: 'v0.5.0',
        hasInitialBundleBaseline: true,
        hasAsrLatencyBaseline: true,
        notes: [],
      },
      measurements: dictateParityMeasurements([
        { name: 'routeTransitionMs', value: 500, source: 'reference-hardware' },
        { name: 'mainThreadLongTaskCount', value: 2, source: 'reference-hardware' },
        { name: 'mainThreadLongTaskMaxMs', value: 80, source: 'reference-hardware' },
      ]),
    });

    expect(report.status).toBe('failed');
    expect(report.gate.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'route-transition', status: 'failed' }),
        expect.objectContaining({ name: 'main-thread-long-tasks', status: 'failed' }),
      ]),
    );
  });

  it('keeps CI Dictate smoke evidence informational when ASR/baseline evidence is unavailable', () => {
    const report = createDictatePerformanceParityReport({
      generatedAt: '2026-06-27T00:00:00.000Z',
      benchmarkId: 'ci-dictate-smoke',
      evidenceLabel: 'CI Dictate browser smoke',
      baseline: {
        release: 'v0.5.0',
        hasInitialBundleBaseline: false,
        hasAsrLatencyBaseline: false,
        notes: ['CI smoke proves instrumentation only.'],
      },
      measurements: dictateParityMeasurements([
        { name: 'initialDictateJsGzipIncreaseBytes', value: null, source: 'not-measured' },
        { name: 'firstPartialLatencyMs', value: 180, source: 'browser-smoke' },
        { name: 'stableWordLatencyMs', value: null, source: 'not-measured' },
        { name: 'asrLatencyRegressionPercent', value: null, source: 'not-measured' },
      ]).map((measurement) => ({ ...measurement, source: 'browser-smoke' as const })),
      warnings: ['Synthetic/fake microphone smoke path only; not a release benchmark.'],
    });

    expect(report.status).toBe('insufficient-evidence');
    expect(report.gate.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'interaction-readiness', status: 'insufficient-evidence' }),
        expect.objectContaining({
          name: 'first-partial-observed',
          status: 'insufficient-evidence',
        }),
        expect.objectContaining({
          name: 'asr-latency-regression',
          status: 'insufficient-evidence',
        }),
      ]),
    );
  });

  it('passes personal-model release benchmark gates with complete reference-hardware measurements', () => {
    const report = createPersonalModelReleaseBenchmarkReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      benchmarkId: 'v0-5-0-reference-pass',
      evidenceLabel: 'Reference hardware aggregate run',
      referenceHardware: {
        label: 'Reference desktop Chrome',
        browserName: 'Chrome',
        operatingSystem: 'Linux',
        cpuModel: 'Synthetic CPU label',
        memoryGb: 16,
        notes: ['Aggregate local benchmark run; no raw artifacts included.'],
      },
      measurements: referenceMeasurements(),
    });

    expect(report.status).toBe('passed');
    expect(report.gate.checks.every((check) => check.status === 'passed')).toBe(true);
    expect(report.measurements.find((metric) => metric.name === 'offlineReload')).toMatchObject({
      value: true,
      referenceHardwareEvidence: true,
    });
  });

  it('fails personal-model release benchmark gates when hard budgets regress', () => {
    const report = createPersonalModelReleaseBenchmarkReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      benchmarkId: 'v0-5-0-reference-fail',
      evidenceLabel: 'Reference hardware aggregate regression',
      referenceHardware: { label: 'Reference desktop', notes: [] },
      measurements: referenceMeasurements([
        { name: 'peakBrowserMemoryBytes', value: 2 * 1024 * 1024 * 1024 },
        { name: 'localPhaseNetworkRequestCount', value: 1 },
      ]),
    });

    expect(report.status).toBe('failed');
    expect(report.gate.reasons).toContain('Peak browser memory exceeds the release budget.');
    expect(report.gate.reasons).toContain(
      'At least one local personal-model phase made a network request.',
    );
  });

  it('treats synthetic or CI smoke benchmark values as insufficient release evidence', () => {
    const report = createPersonalModelReleaseBenchmarkReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      benchmarkId: 'v0-5-0-synthetic-only',
      evidenceLabel: 'Synthetic benchmark smoke',
      referenceHardware: { label: 'CI browser', notes: [] },
      measurements: referenceMeasurements(undefined, 'ci-smoke'),
    });

    expect(report.status).toBe('insufficient-evidence');
    expect(report.gate.checks.every((check) => check.status === 'insufficient-evidence')).toBe(
      true,
    );
  });
});

function dictateParityMeasurements(
  overrides: readonly Partial<DictatePerformanceParityMeasurementInputV1>[] = [],
  source: DictatePerformanceParityMeasurementInputV1['source'] = 'reference-hardware',
): readonly DictatePerformanceParityMeasurementInputV1[] {
  const base: DictatePerformanceParityMeasurementInputV1[] = [
    { name: 'initialDictateJsBytes', value: 120_000, source },
    { name: 'initialDictateCssBytes', value: 14_000, source },
    { name: 'initialDictateJsGzipIncreaseBytes', value: 12_000, source },
    { name: 'interactionReadyMs', value: 800, source },
    { name: 'routeTransitionMs', value: 60, source },
    { name: 'mainThreadLongTaskCount', value: 0, source },
    { name: 'mainThreadLongTaskMaxMs', value: 0, source },
    { name: 'cumulativeLayoutShift', value: 0.01, source },
    { name: 'recordingUiResponseMs', value: 45, source },
    { name: 'firstPartialLatencyMs', value: 180, source },
    { name: 'stableWordLatencyMs', value: 260, source },
    { name: 'finalizationLatencyMs', value: 50, source },
    { name: 'asrLatencyRegressionPercent', value: 1.2, source },
  ];
  for (const override of overrides) {
    const index = base.findIndex((measurement) => measurement.name === override.name);
    if (index === -1) throw new Error(`Unknown test measurement ${String(override.name)}`);
    base[index] = { ...base[index]!, ...override };
  }
  return base;
}

function referenceMeasurements(
  overrides: readonly Partial<PersonalModelReleaseBenchmarkMeasurementInputV1>[] = [],
  source: PersonalModelReleaseBenchmarkMeasurementInputV1['source'] = 'reference-hardware',
): readonly PersonalModelReleaseBenchmarkMeasurementInputV1[] {
  const base: PersonalModelReleaseBenchmarkMeasurementInputV1[] = [
    { name: 'trainingDurationMs', value: 120_000, source },
    { name: 'peakBrowserMemoryBytes', value: 900 * 1024 * 1024, source },
    { name: 'peakAdditionalStorageBytes', value: 240 * 1024 * 1024, source },
    { name: 'adapterRtfOverheadRatio', value: 0.08, source },
    { name: 'profileSwapMs', value: 120, source },
    { name: 'exportImportDurationMs', value: 6_000, source },
    { name: 'checkpointLossDelta', value: 0.000_000_2, source },
    { name: 'localPhaseNetworkRequestCount', value: 0, source },
    { name: 'offlineReload', value: true, source },
  ];
  for (const override of overrides) {
    const index = base.findIndex((measurement) => measurement.name === override.name);
    if (index === -1) throw new Error(`Unknown test measurement ${String(override.name)}`);
    base[index] = { ...base[index]!, ...override };
  }
  return base;
}
