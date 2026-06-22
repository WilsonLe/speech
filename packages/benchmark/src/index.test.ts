import { describe, expect, it } from 'vitest';
import {
  calculateRealTimeFactor,
  createBenchmarkId,
  createBenchmarkReport,
  createDiagnosticsExport,
  serializeBenchmarkJson,
  summarizeSamples,
  type BenchmarkTraceEvent,
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

  it('creates a combined diagnostics export with optional capability data', () => {
    const report = createBenchmarkReport({
      generatedAt: '2026-06-22T00:00:00.000Z',
      benchmarkId: 'speech-test',
      configuration,
      traces,
    });
    const diagnostics = createDiagnosticsExport({
      generatedAt: '2026-06-22T00:00:01.000Z',
      benchmark: report,
      capabilities: { selectedTier: 'B' },
      notes: ['Local download; no telemetry.'],
    });

    expect(diagnostics.reportType).toBe('speech-diagnostics-export');
    expect(diagnostics.benchmark?.benchmarkId).toBe('speech-test');
    expect(diagnostics.capabilities).toEqual({ selectedTier: 'B' });
    expect(serializeBenchmarkJson(diagnostics)).toMatch(/\n$/);
  });

  it('normalizes generated benchmark identifiers', () => {
    expect(createBenchmarkId('2026-06-22T00:00:00.000Z', 'Local Synthetic Worker')).toBe(
      'speech-local-synthetic-worker-2026-06-22T00-00-00-000Z',
    );
  });
});
