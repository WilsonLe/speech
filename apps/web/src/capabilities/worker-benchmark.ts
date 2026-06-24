import type { WorkerBenchmarkResult } from './types';

interface BenchmarkPing {
  readonly type: 'PING';
  readonly id: number;
  readonly sentAtMs: number;
}

interface BenchmarkPong {
  readonly type: 'PONG';
  readonly id: number;
  readonly sentAtMs: number;
  readonly workerReceivedAtMs: number;
}

export async function runCapabilityWorkerBenchmark(iterations = 5): Promise<WorkerBenchmarkResult> {
  if (iterations < 1) {
    return {
      supported: false,
      iterations: 0,
      error: 'Worker benchmark requires at least one iteration.',
    };
  }

  if (typeof Worker === 'undefined') {
    return { supported: false, iterations: 0, error: 'Web Workers are unavailable.' };
  }

  const worker = new Worker(new URL('../workers/capability-benchmark.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    const samples: number[] = [];
    for (let id = 0; id < iterations; id += 1) {
      samples.push(await ping(worker, { type: 'PING', id, sentAtMs: performance.now() }));
    }

    samples.sort((a, b) => a - b);
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (typeof first !== 'number' || typeof last !== 'number') {
      throw new Error('Worker benchmark produced no samples.');
    }

    const middle = Math.floor(samples.length / 2);
    const median = calculateMedian(samples, middle);

    return {
      supported: true,
      iterations,
      medianRoundTripMs: median,
      minRoundTripMs: first,
      maxRoundTripMs: last,
    };
  } catch (error) {
    return {
      supported: false,
      iterations: 0,
      error: error instanceof Error ? error.message : 'Worker benchmark failed.',
    };
  } finally {
    worker.terminate();
  }
}

function ping(worker: Worker, message: BenchmarkPing): Promise<number> {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Worker benchmark timed out.'));
    }, 2_000);

    function cleanup() {
      window.clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    }

    function handleMessage(event: MessageEvent<BenchmarkPong>) {
      if (event.data.type !== 'PONG' || event.data.id !== message.id) {
        return;
      }

      cleanup();
      resolve(performance.now() - startedAt);
    }

    function handleError(event: ErrorEvent) {
      cleanup();
      reject(new Error(event.message));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage(message);
  });
}

function calculateMedian(samples: readonly number[], middle: number): number {
  const current = samples[middle];
  if (typeof current !== 'number') {
    throw new Error('Worker benchmark median is unavailable.');
  }

  if (samples.length % 2 === 1) {
    return current;
  }

  const previous = samples[middle - 1];
  if (typeof previous !== 'number') {
    throw new Error('Worker benchmark median is unavailable.');
  }

  return (previous + current) / 2;
}
