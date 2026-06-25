import type {
  FrozenFeatureTinyAdapterCheckpointV1,
  FrozenFeatureTinyAdapterDatasetV1,
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/browser-training';
import {
  parseBrowserTrainingCoordinationEvent,
  type BrowserTrainingCoordinationEventV1,
} from './browser-training-coordination';
import browserTrainingWorkerUrl from './browser-training.worker.ts?worker&url';
import type {
  BrowserTrainingRuntimeWarningV1,
  BrowserTrainingWorkerOptions,
  BrowserTrainingWorkerResponse,
  ControlBrowserTrainingPrototypeMessage,
  StartBrowserTrainingPrototypeMessage,
} from './browser-training.worker';

export type { BrowserTrainingCoordinationEventV1 } from './browser-training-coordination';
export { subscribeBrowserTrainingCoordination } from './browser-training-coordination';
export type { BrowserTrainingRuntimeWarningV1 } from './browser-training.worker';

const browserTrainingRecoveryStorageKey = 'speech:browser-training-recovery:v1';

export interface BrowserTrainingRecoveryRecordV1 {
  readonly schemaVersion: 1;
  readonly status: 'checkpointed' | 'paused' | 'cancelled';
  readonly checkpoint: FrozenFeatureTinyAdapterCheckpointV1;
  readonly updatedAt: string;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
  readonly coordination?: BrowserTrainingCoordinationEventV1;
}

export interface BrowserTrainingCoordinationOptionsV1 {
  readonly enabled?: boolean;
  readonly scopeId?: string;
}

export interface RunBrowserTrainingPrototypeOptions {
  readonly dataset?: FrozenFeatureTinyAdapterDatasetV1;
  readonly training?: BrowserTrainingWorkerOptions;
  readonly coordination?: BrowserTrainingCoordinationOptionsV1;
  readonly resumeFromCheckpoint?: FrozenFeatureTinyAdapterCheckpointV1;
  readonly timeoutMs?: number;
  readonly persistRecovery?: boolean;
  readonly onProgress?: (progress: FrozenFeatureTinyAdapterProgressV1) => void;
  readonly onCheckpoint?: (checkpoint: FrozenFeatureTinyAdapterCheckpointV1) => void;
  readonly onWarning?: (warnings: readonly BrowserTrainingRuntimeWarningV1[]) => void;
  readonly onCoordination?: (event: BrowserTrainingCoordinationEventV1) => void;
  readonly onRecoveryChange?: (recovery: BrowserTrainingRecoveryRecordV1 | null) => void;
}

export interface BrowserTrainingPrototypeRunController {
  readonly requestId: string;
  readonly result: Promise<FrozenFeatureTinyAdapterTrainingResultV1>;
  pause: () => void;
  cancel: () => void;
  terminate: () => void;
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
  return startBrowserTrainingPrototype(options).result;
}

export function startBrowserTrainingPrototype(
  options: RunBrowserTrainingPrototypeOptions = {},
): BrowserTrainingPrototypeRunController {
  const worker = createBrowserTrainingWorker();
  const requestId = `browser-training-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const persistRecovery = options.persistRecovery ?? true;
  let latestCheckpoint: FrozenFeatureTinyAdapterCheckpointV1 | undefined;
  let latestWarnings: readonly BrowserTrainingRuntimeWarningV1[] = [];
  let latestCoordination: BrowserTrainingCoordinationEventV1 | undefined;
  let settled = false;

  const result = new Promise<FrozenFeatureTinyAdapterTrainingResultV1>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      settled = true;
      worker.terminate();
      if (persistRecovery && latestCheckpoint !== undefined) {
        const recovery = writeBrowserTrainingRecovery(
          'checkpointed',
          latestCheckpoint,
          latestWarnings,
          latestCoordination,
        );
        options.onRecoveryChange?.(recovery);
      }
      reject(new Error('Timed out while running the browser training worker prototype.'));
    }, timeoutMs);

    worker.addEventListener('message', (event: MessageEvent<BrowserTrainingWorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== requestId || settled) return;
      if (message.type === 'BROWSER_TRAINING_WARNING') {
        latestWarnings = mergeBrowserTrainingWarnings(latestWarnings, message.warnings);
        options.onWarning?.(latestWarnings);
        return;
      }
      if (message.type === 'BROWSER_TRAINING_COORDINATION') {
        latestCoordination = message.event;
        options.onCoordination?.(message.event);
        return;
      }
      if (message.type === 'BROWSER_TRAINING_PROGRESS') {
        options.onProgress?.(message.progress);
        return;
      }
      if (message.type === 'BROWSER_TRAINING_CHECKPOINT') {
        latestCheckpoint = message.checkpoint;
        if (persistRecovery) {
          const recovery = writeBrowserTrainingRecovery(
            'checkpointed',
            message.checkpoint,
            latestWarnings,
            latestCoordination,
          );
          options.onRecoveryChange?.(recovery);
        }
        options.onCheckpoint?.(message.checkpoint);
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      if (message.type === 'BROWSER_TRAINING_COMPLETE') {
        latestCoordination = createCompletedCoordinationEvent(latestCoordination);
        if (latestCoordination !== undefined) options.onCoordination?.(latestCoordination);
        if (persistRecovery) {
          if (message.result.status === 'completed') {
            clearBrowserTrainingRecovery();
            options.onRecoveryChange?.(null);
          } else {
            const recovery = writeBrowserTrainingRecovery(
              message.result.status,
              message.result.checkpoint,
              latestWarnings,
              latestCoordination,
            );
            options.onRecoveryChange?.(recovery);
          }
        }
        resolve(message.result);
        return;
      }
      reject(new Error(message.message));
    });

    worker.addEventListener('error', (event) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    });

    const trainingOptions = {
      ...(options.training ?? {}),
      ...(options.coordination === undefined ? {} : { coordination: options.coordination }),
      ...(options.resumeFromCheckpoint === undefined
        ? {}
        : { resumeFromCheckpoint: options.resumeFromCheckpoint }),
    } satisfies BrowserTrainingWorkerOptions;

    worker.postMessage({
      type: 'START_BROWSER_TRAINING_PROTOTYPE',
      requestId,
      ...(options.dataset === undefined ? {} : { dataset: options.dataset }),
      options: trainingOptions,
    } satisfies StartBrowserTrainingPrototypeMessage);
  });

  return {
    requestId,
    result,
    pause: () => postControl(worker, requestId, 'PAUSE_BROWSER_TRAINING_PROTOTYPE'),
    cancel: () => postControl(worker, requestId, 'CANCEL_BROWSER_TRAINING_PROTOTYPE'),
    terminate: () => worker.terminate(),
  };
}

export function readBrowserTrainingRecovery(): BrowserTrainingRecoveryRecordV1 | null {
  try {
    const storage = getLocalStorage();
    if (storage === undefined) return null;
    const raw = storage.getItem(browserTrainingRecoveryStorageKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as BrowserTrainingRecoveryRecordV1;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.checkpoint?.schemaVersion !== 1 ||
      parsed.checkpoint.resumeState?.schemaVersion !== 1 ||
      typeof parsed.checkpoint.resumeStateChecksum !== 'string'
    ) {
      return null;
    }
    if (
      parsed.coordination !== undefined &&
      parseBrowserTrainingCoordinationEvent(parsed.coordination) === null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBrowserTrainingRecovery(): void {
  try {
    getLocalStorage()?.removeItem(browserTrainingRecoveryStorageKey);
  } catch {
    // Ignore unavailable or blocked storage; recovery is best-effort for the prototype UI.
  }
}

function writeBrowserTrainingRecovery(
  status: BrowserTrainingRecoveryRecordV1['status'],
  checkpoint: FrozenFeatureTinyAdapterCheckpointV1,
  warnings: readonly BrowserTrainingRuntimeWarningV1[],
  coordination: BrowserTrainingCoordinationEventV1 | undefined,
): BrowserTrainingRecoveryRecordV1 | null {
  const recovery: BrowserTrainingRecoveryRecordV1 = {
    schemaVersion: 1,
    status,
    checkpoint,
    updatedAt: new Date().toISOString(),
    warnings,
    ...(coordination === undefined ? {} : { coordination }),
  };
  try {
    const storage = getLocalStorage();
    if (storage === undefined) return null;
    storage.setItem(browserTrainingRecoveryStorageKey, JSON.stringify(recovery));
    return recovery;
  } catch {
    return null;
  }
}

function postControl(
  worker: Worker,
  requestId: string,
  type: ControlBrowserTrainingPrototypeMessage['type'],
): void {
  worker.postMessage({ type, requestId } satisfies ControlBrowserTrainingPrototypeMessage);
}

function createCompletedCoordinationEvent(
  coordination: BrowserTrainingCoordinationEventV1 | undefined,
): BrowserTrainingCoordinationEventV1 | undefined {
  if (
    coordination === undefined ||
    coordination.eventType === 'lock-released' ||
    coordination.eventType === 'lock-unavailable' ||
    coordination.eventType === 'lock-busy'
  ) {
    return coordination;
  }
  return {
    ...coordination,
    eventType: 'lock-released',
    createdAt: new Date().toISOString(),
    message: 'Browser training released the local cross-tab training lock.',
  };
}

function mergeBrowserTrainingWarnings(
  current: readonly BrowserTrainingRuntimeWarningV1[],
  next: readonly BrowserTrainingRuntimeWarningV1[],
): readonly BrowserTrainingRuntimeWarningV1[] {
  const merged: BrowserTrainingRuntimeWarningV1[] = [];
  const seen = new Set<string>();
  for (const warning of [...current, ...next]) {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(warning);
  }
  return merged;
}

function getLocalStorage(): Storage | undefined {
  if (typeof globalThis.localStorage === 'undefined') return undefined;
  return globalThis.localStorage;
}
