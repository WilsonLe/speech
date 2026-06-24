import type { BenchmarkReportV1 } from '@speech/benchmark';
import benchmarkWorkerUrl from './benchmark.worker.ts?worker&url';
import type {
  BenchmarkRunOptions,
  BenchmarkWorkerMessage,
  BenchmarkWorkerResponse,
} from './benchmark.worker';

export interface RunBenchmarkOptions extends BenchmarkRunOptions {
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: BenchmarkProgress) => void;
}

export interface BenchmarkProgress {
  readonly completedChunks: number;
  readonly totalChunks: number;
}

export function createBenchmarkWorker(): Worker {
  return new Worker(benchmarkWorkerUrl, { type: 'module', name: 'speech-benchmark-worker' });
}

export function runSyntheticBenchmarkInWorker(
  options: RunBenchmarkOptions = {},
): Promise<BenchmarkReportV1> {
  const worker = createBenchmarkWorker();
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while running the benchmark worker.'));
    }, timeoutMs);

    function cleanup() {
      globalThis.clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    }

    function handleMessage(event: MessageEvent<BenchmarkWorkerResponse>) {
      const message = event.data;
      if (message.type === 'BENCHMARK_PROGRESS') {
        options.onProgress?.({
          completedChunks: message.completedChunks,
          totalChunks: message.totalChunks,
        });
        return;
      }
      if (message.type === 'BENCHMARK_COMPLETE') {
        cleanup();
        resolve(message.report);
        return;
      }
      if (message.type === 'BENCHMARK_ERROR') {
        cleanup();
        reject(new Error(message.message));
      }
    }

    function handleError(event: ErrorEvent) {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage(buildRunMessage(options));
  });
}

function buildRunMessage(options: RunBenchmarkOptions): BenchmarkWorkerMessage {
  const workerOptions: BenchmarkRunOptions = {
    ...(options.chunkCount === undefined ? {} : { chunkCount: options.chunkCount }),
    ...(options.chunkDurationMs === undefined ? {} : { chunkDurationMs: options.chunkDurationMs }),
    ...(options.repetitions === undefined ? {} : { repetitions: options.repetitions }),
    ...(options.workScale === undefined ? {} : { workScale: options.workScale }),
    ...(options.provider === undefined ? {} : { provider: options.provider }),
    ...(options.wasmThreads === undefined ? {} : { wasmThreads: options.wasmThreads }),
  };
  return { type: 'RUN_BENCHMARK', options: workerOptions };
}
