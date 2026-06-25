import type { PromptIdentitySplitConfigV1 } from '@speech/enrollment';
import type { LogMelFeatureConfig } from '@speech/features';
import type {
  PrepareTrainingJobFrameLabelsInput,
  ProfileStorageBackendKind,
  TrainingJobFeaturePreparationSummaryV1,
  TrainingJobFeatureShardVerificationResultV1,
  TrainingJobFrameLabelsSummaryV1,
  TrainingJobFrameLabelsVerificationResultV1,
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

export interface TrainingJobFrameLabelsPreparationResult extends FeaturePreparationBaseResult {
  readonly summary: TrainingJobFrameLabelsSummaryV1;
}

export interface TrainingJobFrameLabelsVerificationResult extends FeaturePreparationBaseResult {
  readonly verification: TrainingJobFrameLabelsVerificationResultV1;
}

export interface TrainingJobFrameLabelsDeleteResult extends FeaturePreparationBaseResult {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
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

export interface PrepareTrainingJobFrameLabelsOptions {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId?: string;
  readonly alignments: PrepareTrainingJobFrameLabelsInput['alignments'];
  readonly options?: PrepareTrainingJobFrameLabelsInput['options'];
  readonly timeoutMs?: number;
}

export interface VerifyTrainingJobFrameLabelsOptions {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
  readonly timeoutMs?: number;
}

export type DeleteTrainingJobFrameLabelsOptions = VerifyTrainingJobFrameLabelsOptions;

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

export function prepareTrainingJobFrameLabels(
  options: PrepareTrainingJobFrameLabelsOptions,
): Promise<TrainingJobFrameLabelsPreparationResult> {
  return requestFeaturePreparation(
    {
      type: 'PREPARE_TRAINING_JOB_FRAME_LABELS',
      requestId: createRequestId('align'),
      jobId: options.jobId,
      featureSetId: options.featureSetId,
      alignments: options.alignments,
      ...(options.alignmentSetId === undefined ? {} : { alignmentSetId: options.alignmentSetId }),
      ...(options.options === undefined ? {} : { options: options.options }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FRAME_LABELS_READY') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      summary: response.summary,
    };
  });
}

export function verifyTrainingJobFrameLabels(
  options: VerifyTrainingJobFrameLabelsOptions,
): Promise<TrainingJobFrameLabelsVerificationResult> {
  return requestFeaturePreparation(
    {
      type: 'VERIFY_TRAINING_JOB_FRAME_LABELS',
      requestId: createRequestId('verify-labels'),
      jobId: options.jobId,
      featureSetId: options.featureSetId,
      alignmentSetId: options.alignmentSetId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FRAME_LABELS_VERIFIED') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      verification: response.verification,
    };
  });
}

export function deleteTrainingJobFrameLabels(
  options: DeleteTrainingJobFrameLabelsOptions,
): Promise<TrainingJobFrameLabelsDeleteResult> {
  return requestFeaturePreparation(
    {
      type: 'DELETE_TRAINING_JOB_FRAME_LABELS',
      requestId: createRequestId('delete-labels'),
      jobId: options.jobId,
      featureSetId: options.featureSetId,
      alignmentSetId: options.alignmentSetId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'FRAME_LABELS_DELETED') {
      throw new Error(`Unexpected feature-preparation response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      jobId: response.jobId,
      featureSetId: response.featureSetId,
      alignmentSetId: response.alignmentSetId,
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
