import type {
  FrozenFeatureTinyAdapterDatasetV1,
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/personalization';
import browserTrainingWorkerUrl from './browser-training.worker.ts?worker&url';
import type {
  BrowserTrainingWorkerOptions,
  BrowserTrainingWorkerResponse,
  StartBrowserTrainingPrototypeMessage,
} from './browser-training.worker';

export interface RunBrowserTrainingPrototypeOptions {
  readonly dataset?: FrozenFeatureTinyAdapterDatasetV1;
  readonly training?: BrowserTrainingWorkerOptions;
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: FrozenFeatureTinyAdapterProgressV1) => void;
}

export function createBrowserTrainingWorker(): Worker {
  return new Worker(browserTrainingWorkerUrl, {
    type: 'module',
    name: 'speech-browser-training-worker',
  });
}

export function runBrowserTrainingPrototype(
  options: RunBrowserTrainingPrototypeOptions = {},
): Promise<FrozenFeatureTinyAdapterTrainingResultV1> {
  const worker = createBrowserTrainingWorker();
  const requestId = `browser-training-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      worker.terminate();
      reject(new Error('Timed out while running the browser training worker prototype.'));
    }, timeoutMs);

    worker.addEventListener('message', (event: MessageEvent<BrowserTrainingWorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== requestId) return;
      if (message.type === 'BROWSER_TRAINING_PROGRESS') {
        options.onProgress?.(message.progress);
        return;
      }
      globalThis.clearTimeout(timeout);
      worker.terminate();
      if (message.type === 'BROWSER_TRAINING_COMPLETE') {
        resolve(message.result);
        return;
      }
      reject(new Error(message.message));
    });

    worker.addEventListener('error', (event) => {
      globalThis.clearTimeout(timeout);
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    });

    worker.postMessage({
      type: 'START_BROWSER_TRAINING_PROTOTYPE',
      requestId,
      ...(options.dataset === undefined ? {} : { dataset: options.dataset }),
      ...(options.training === undefined ? {} : { options: options.training }),
    } satisfies StartBrowserTrainingPrototypeMessage);
  });
}
