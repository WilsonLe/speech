import type { AsrWorkerToMain, MainToAsrWorker, RuntimeMetrics } from '@speech/protocol';
import asrWorkerUrl from './asr.worker.ts?worker&url';

export interface AsrWorkerRuntimeCheckResult {
  readonly provider: RuntimeMetrics['provider'];
  readonly wasmThreads?: number;
}

export interface AsrWorkerRuntimeCheckOptions {
  readonly modelId?: string;
  readonly preferredProvider?: Extract<
    MainToAsrWorker,
    { readonly type: 'INIT' }
  >['preferredProvider'];
  readonly timeoutMs?: number;
}

export function createAsrWorker(): Worker {
  return new Worker(asrWorkerUrl, { type: 'module', name: 'speech-asr-worker' });
}

export function checkAsrWorkerRuntime(
  options: AsrWorkerRuntimeCheckOptions = {},
): Promise<AsrWorkerRuntimeCheckResult> {
  const worker = createAsrWorker();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const preferredProvider = options.preferredProvider ?? 'wasm';
  const modelId = options.modelId ?? 'runtime-smoke';

  return new Promise((resolve, reject) => {
    let latestMetrics: RuntimeMetrics | undefined;
    const timeout = globalThis.setTimeout(() => {
      worker.terminate();
      reject(new Error('Timed out while loading ONNX Runtime Web in the ASR worker.'));
    }, timeoutMs);

    worker.addEventListener('message', (event: MessageEvent<AsrWorkerToMain>) => {
      const message = event.data;
      if (message.type === 'METRICS') {
        latestMetrics = message.metrics;
        return;
      }
      if (message.type === 'READY') {
        globalThis.clearTimeout(timeout);
        worker.postMessage({ type: 'DISPOSE' } satisfies MainToAsrWorker);
        worker.terminate();
        resolve({
          provider: latestMetrics?.provider,
          ...(latestMetrics?.wasmThreads === undefined
            ? {}
            : { wasmThreads: latestMetrics.wasmThreads }),
        });
        return;
      }
      if (message.type === 'ERROR') {
        globalThis.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(message.message));
      }
    });

    worker.addEventListener('error', (event) => {
      globalThis.clearTimeout(timeout);
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    });

    worker.postMessage({ type: 'INIT', modelId, preferredProvider } satisfies MainToAsrWorker);
  });
}
