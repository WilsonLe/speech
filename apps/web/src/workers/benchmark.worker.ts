/// <reference lib="webworker" />

import {
  calculateRealTimeFactor,
  createBenchmarkId,
  createBenchmarkReport,
  createSyntheticCustomTermBenchmarkEvaluation,
  type BenchmarkEnvironment,
  type BenchmarkMetricSample,
  type BenchmarkReportV1,
  type BenchmarkTraceEvent,
} from '@speech/benchmark';

export interface BenchmarkRunOptions {
  readonly chunkCount?: number;
  readonly chunkDurationMs?: number;
  readonly repetitions?: number;
  readonly workScale?: number;
  readonly provider?: BenchmarkEnvironment['provider'];
  readonly wasmThreads?: number;
}

interface RunBenchmarkMessage {
  readonly type: 'RUN_BENCHMARK';
  readonly options?: BenchmarkRunOptions;
}

interface BenchmarkProgressMessage {
  readonly type: 'BENCHMARK_PROGRESS';
  readonly completedChunks: number;
  readonly totalChunks: number;
}

interface BenchmarkCompleteMessage {
  readonly type: 'BENCHMARK_COMPLETE';
  readonly report: BenchmarkReportV1;
}

interface BenchmarkErrorMessage {
  readonly type: 'BENCHMARK_ERROR';
  readonly message: string;
}

export type BenchmarkWorkerMessage = RunBenchmarkMessage;
export type BenchmarkWorkerResponse =
  | BenchmarkProgressMessage
  | BenchmarkCompleteMessage
  | BenchmarkErrorMessage;

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<BenchmarkWorkerMessage>) => {
  if (event.data.type !== 'RUN_BENCHMARK') {
    return;
  }

  try {
    const report = runSyntheticBenchmark(event.data.options ?? {});
    ctx.postMessage({ type: 'BENCHMARK_COMPLETE', report } satisfies BenchmarkCompleteMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'BENCHMARK_ERROR',
      message: error instanceof Error ? error.message : String(error),
    } satisfies BenchmarkErrorMessage);
  }
});

function runSyntheticBenchmark(options: BenchmarkRunOptions): BenchmarkReportV1 {
  const generatedAt = new Date().toISOString();
  const chunkCount = clampInteger(options.chunkCount ?? 24, 1, 240);
  const chunkDurationMs = clampInteger(options.chunkDurationMs ?? 160, 20, 1_000);
  const repetitions = clampInteger(options.repetitions ?? 1, 1, 20);
  const workScale = clampInteger(options.workScale ?? 1, 1, 20);
  const traces: BenchmarkTraceEvent[] = [];
  const metricSamples: BenchmarkMetricSample[] = [];
  const syntheticAudioMs = chunkCount * chunkDurationMs * repetitions;
  const benchmarkId = createBenchmarkId(generatedAt, 'synthetic-worker');

  let virtualWorkerClockMs = 0;
  let checksum = 0;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const absoluteChunkIndex = repetition * chunkCount + chunkIndex;
      const audioStartMs = absoluteChunkIndex * chunkDurationMs;
      const queueDepthFrames = Math.max(
        0,
        Math.ceil((virtualWorkerClockMs - audioStartMs) / chunkDurationMs),
      );
      const encoder = measureDeterministicWork(420 * workScale, absoluteChunkIndex + 17);
      const decoder = measureDeterministicWork(120 * workScale, absoluteChunkIndex + 53);
      checksum += encoder.checksum + decoder.checksum;
      const workerElapsedMs = encoder.durationMs + decoder.durationMs;
      virtualWorkerClockMs = Math.max(virtualWorkerClockMs, audioStartMs) + workerElapsedMs;

      traces.push({
        chunkIndex: absoluteChunkIndex,
        audioStartMs,
        audioDurationMs: chunkDurationMs,
        queueDepthFrames,
        encoderMs: encoder.durationMs,
        decoderMs: decoder.durationMs,
        workerElapsedMs,
      });

      if (absoluteChunkIndex % Math.max(1, Math.floor((chunkCount * repetitions) / 8)) === 0) {
        ctx.postMessage({
          type: 'BENCHMARK_PROGRESS',
          completedChunks: absoluteChunkIndex + 1,
          totalChunks: chunkCount * repetitions,
        } satisfies BenchmarkProgressMessage);
      }
    }
  }

  const finalization = measureDeterministicWork(100_000 * workScale, Math.floor(checksum) || 1);
  const totalProcessingMs =
    traces.reduce((total, trace) => total + trace.workerElapsedMs, 0) + finalization.durationMs;
  const firstTrace = traces[0];
  const stableTrace = traces[Math.min(2, traces.length - 1)];
  const heapUsedBytes = readJsHeapUsedBytes();

  if (firstTrace !== undefined) {
    metricSamples.push({
      name: 'firstPartialLatencyMs',
      unit: 'ms',
      value: firstTrace.audioStartMs + firstTrace.workerElapsedMs,
    });
  }

  if (stableTrace !== undefined) {
    metricSamples.push({
      name: 'stableTokenLatencyMs',
      unit: 'ms',
      value: stableTrace.audioStartMs + stableTrace.workerElapsedMs,
    });
  }

  metricSamples.push(
    { name: 'finalizationLatencyMs', unit: 'ms', value: finalization.durationMs },
    {
      name: 'realTimeFactor',
      unit: 'ratio',
      value: calculateRealTimeFactor(totalProcessingMs, syntheticAudioMs),
    },
    { name: 'audioOverruns', unit: 'count', value: 0 },
  );

  if (heapUsedBytes !== undefined) {
    metricSamples.push({ name: 'jsHeapUsedBytes', unit: 'bytes', value: heapUsedBytes });
  }

  const customTermEvaluation = createSyntheticCustomTermBenchmarkEvaluation();

  return createBenchmarkReport({
    generatedAt,
    benchmarkId,
    configuration: {
      scenario: 'synthetic-worker',
      repetitions,
      chunkCount,
      chunkDurationMs,
      syntheticAudioMs,
      notes: [
        'Synthetic worker benchmark only; it does not measure production ASR model accuracy or latency.',
        'Includes a synthetic custom-term recall and false-insertion fixture with aggregate counts only.',
        'No microphone audio, transcript text, private vocabulary, model weights, telemetry, or network upload is included.',
      ],
    },
    environment: collectEnvironment(options),
    traces,
    customTermEvaluation,
    metricSamples,
    warnings: [
      'Synthetic benchmark results are informational until measured with real model packs on declared reference hardware.',
    ],
  });
}

function collectEnvironment(options: BenchmarkRunOptions): BenchmarkEnvironment {
  const navigatorLike = ctx.navigator as Navigator & {
    readonly deviceMemory?: number;
  };

  return {
    userAgent: navigatorLike.userAgent,
    platform: navigatorLike.platform,
    browserLanguage: navigatorLike.language,
    hardwareConcurrency: navigatorLike.hardwareConcurrency,
    ...(navigatorLike.deviceMemory === undefined
      ? {}
      : { deviceMemoryGb: navigatorLike.deviceMemory }),
    provider: options.provider ?? 'unknown',
    ...(options.wasmThreads === undefined ? {} : { wasmThreads: options.wasmThreads }),
  };
}

function measureDeterministicWork(
  iterations: number,
  seed: number,
): {
  readonly durationMs: number;
  readonly checksum: number;
} {
  const startedAt = performance.now();
  let state = seed >>> 0;
  let accumulator = 0;

  for (let index = 0; index < iterations; index += 1) {
    state = Math.imul(state ^ (state >>> 15), 2_246_822_519) >>> 0;
    const normalized = (state & 0xffff) / 0xffff;
    accumulator += Math.sqrt(normalized + 0.000_001) * (index + 1);
  }

  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    checksum: accumulator,
  };
}

function readJsHeapUsedBytes(): number | undefined {
  const performanceWithMemory = performance as Performance & {
    readonly memory?: { readonly usedJSHeapSize?: number };
  };
  const used = performanceWithMemory.memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) && used >= 0 ? used : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export {};
