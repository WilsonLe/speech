import type { PromptIdentitySplitConfigV1 } from '@speech/enrollment';
import type { LogMelFeatureConfig } from '@speech/features';
import type {
  ProfileStorageBackendKind,
  TrainingJobFeaturePreparationSummaryV1,
  TrainingJobFeatureShardVerificationResultV1,
} from '@speech/profile-manager';
import featurePreparationWorkerUrl from './feature-preparation.worker.ts?worker&url';
import type {
  FeaturePreparationWorkerRequest,
  FeaturePreparationWorkerResponse,
} from './feature-preparation.worker';

export interface FeaturePreparationBaseResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
}

export interface TrainingJobFeaturePreparationResult extends FeaturePreparationBaseResult {
  readonly summary: TrainingJobFeaturePreparationSummaryV1;
}

export interface TrainingJobFeatureVerificationResult extends FeaturePreparationBaseResult {
  readonly verification: TrainingJobFeatureShardVerificationResultV1;
}

export interface TrainingJobFeatureDeleteResult extends FeaturePreparationBaseResult {
  readonly jobId: string;
  readonly featureSetId: string;
}

export interface PrepareTrainingJobFeatureShardsOptions {
  readonly jobId: string;
  readonly featureSetId?: string;
  readonly featureConfig?: LogMelFeatureConfig;
  readonly splitConfig?: PromptIdentitySplitConfigV1;
  readonly maxFramesPerShard?: number;
  readonly timeoutMs?: number;
}

export interface VerifyTrainingJobFeatureShardsOptions {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly timeoutMs?: number;
}

export type DeleteTrainingJobFeatureShardsOptions = VerifyTrainingJobFeatureShardsOptions;

let activeFeaturePreparationWorker: Worker | null = null;

export function createFeaturePreparationWorker(): Worker {
  return new Worker(featurePreparationWorkerUrl, {
    type: 'module',
    name: 'speech-feature-preparation-worker',
  });
}

function getFeaturePreparationWorker(): Worker {
  activeFeaturePreparationWorker ??= createFeaturePreparationWorker();
  return activeFeaturePreparationWorker;
}

function disposeFeaturePreparationWorker(worker: Worker): void {
  worker.terminate();
  if (activeFeaturePreparationWorker === worker) {
    activeFeaturePreparationWorker = null;
  }
}

export function prepareTrainingJobFeatureShards(
  options: PrepareTrainingJobFeatureShardsOptions,
): Promise<TrainingJobFeaturePreparationResult> {
  return requestFeaturePreparation(
    {
      type: 'PREPARE_TRAINING_JOB_FEATURE_SHARDS',
      requestId: createRequestId('prepare'),
      jobId: options.jobId,
      ...(options.featureSetId === undefined ? {} : { featureSetId: options.featureSetId }),
      ...(options.featureConfig === undefined ? {} : { featureConfig: options.featureConfig }),
      ...(options.splitConfig === undefined ? {} : { splitConfig: options.splitConfig }),
      ...(options.maxFramesPerShard === undefined
        ? {}
        : { maxFramesPerShard: options.maxFramesPerShard }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FEATURE_PREPARATION_READY') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      summary: response.summary,
    };
  });
}

export function verifyTrainingJobFeatureShards(
  options: VerifyTrainingJobFeatureShardsOptions,
): Promise<TrainingJobFeatureVerificationResult> {
  return requestFeaturePreparation(
    {
      type: 'VERIFY_TRAINING_JOB_FEATURE_SHARDS',
      requestId: createRequestId('verify'),
      jobId: options.jobId,
      featureSetId: options.featureSetId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FEATURE_PREPARATION_VERIFIED') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      verification: response.verification,
    };
  });
}

export function deleteTrainingJobFeatureShards(
  options: DeleteTrainingJobFeatureShardsOptions,
): Promise<TrainingJobFeatureDeleteResult> {
  return requestFeaturePreparation(
    {
      type: 'DELETE_TRAINING_JOB_FEATURE_SHARDS',
      requestId: createRequestId('delete'),
      jobId: options.jobId,
      featureSetId: options.featureSetId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FEATURE_PREPARATION_DELETED') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      jobId: response.jobId,
      featureSetId: response.featureSetId,
    };
  });
}

function requestFeaturePreparation(
  message: FeaturePreparationWorkerRequest,
  timeoutMs = 30_000,
): Promise<FeaturePreparationWorkerResponse> {
  const worker = getFeaturePreparationWorker();
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup(true);
      reject(new Error('Timed out while preparing browser-training feature shards.'));
    }, timeoutMs);

    function cleanup(terminateWorker = false) {
      globalThis.clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (terminateWorker) {
        disposeFeaturePreparationWorker(worker);
      }
    }

    function handleMessage(event: MessageEvent<FeaturePreparationWorkerResponse>) {
      const response = event.data;
      if (response.requestId !== message.requestId) return;
      cleanup();
      if (response.type === 'FEATURE_PREPARATION_ERROR') {
        reject(new Error(response.message));
        return;
      }
      resolve(response);
    }

    function handleError(event: ErrorEvent) {
      cleanup(true);
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage(message);
  });
}

function createRequestId(operation: string): string {
  return `feature-preparation-${operation}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
