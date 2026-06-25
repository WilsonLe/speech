/// <reference lib="webworker" />

import type { PromptIdentitySplitConfigV1 } from '@speech/enrollment';
import type { LogMelFeatureConfig } from '@speech/features';
import {
  EnrollmentProfileStore,
  createDefaultProfileStorageBackend,
  requestPersistentProfileStorage,
  summarizeTrainingJobFeaturePreparationManifest,
  summarizeTrainingJobFrameLabelsManifest,
  type PrepareTrainingJobFrameLabelsInput,
  type ProfileStorageBackend,
  type ProfileStorageBackendKind,
  type TrainingJobFeaturePreparationSummaryV1,
  type TrainingJobFeatureShardVerificationResultV1,
  type TrainingJobFrameLabelsSummaryV1,
  type TrainingJobFrameLabelsVerificationResultV1,
} from '@speech/profile-manager';

export type FeaturePreparationWorkerRequest =
  | {
      readonly type: 'PREPARE_TRAINING_JOB_FEATURE_SHARDS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId?: string;
      readonly featureConfig?: LogMelFeatureConfig;
      readonly splitConfig?: PromptIdentitySplitConfigV1;
      readonly maxFramesPerShard?: number;
    }
  | {
      readonly type: 'VERIFY_TRAINING_JOB_FEATURE_SHARDS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId: string;
    }
  | {
      readonly type: 'DELETE_TRAINING_JOB_FEATURE_SHARDS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId: string;
    }
  | {
      readonly type: 'PREPARE_TRAINING_JOB_FRAME_LABELS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId: string;
      readonly alignmentSetId?: string;
      readonly alignments: PrepareTrainingJobFrameLabelsInput['alignments'];
      readonly options?: PrepareTrainingJobFrameLabelsInput['options'];
    }
  | {
      readonly type: 'VERIFY_TRAINING_JOB_FRAME_LABELS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId: string;
      readonly alignmentSetId: string;
    }
  | {
      readonly type: 'DELETE_TRAINING_JOB_FRAME_LABELS';
      readonly requestId: string;
      readonly jobId: string;
      readonly featureSetId: string;
      readonly alignmentSetId: string;
    };

export type FeaturePreparationWorkerResponse =
  | {
      readonly type: 'FEATURE_PREPARATION_READY';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly summary: TrainingJobFeaturePreparationSummaryV1;
    }
  | {
      readonly type: 'FEATURE_PREPARATION_VERIFIED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly verification: TrainingJobFeatureShardVerificationResultV1;
    }
  | {
      readonly type: 'FEATURE_PREPARATION_DELETED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly jobId: string;
      readonly featureSetId: string;
    }
  | {
      readonly type: 'FRAME_LABELS_READY';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly summary: TrainingJobFrameLabelsSummaryV1;
    }
  | {
      readonly type: 'FRAME_LABELS_VERIFIED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly verification: TrainingJobFrameLabelsVerificationResultV1;
    }
  | {
      readonly type: 'FRAME_LABELS_DELETED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly jobId: string;
      readonly featureSetId: string;
      readonly alignmentSetId: string;
    }
  | {
      readonly type: 'FEATURE_PREPARATION_ERROR';
      readonly requestId: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

let backendPromise: Promise<ProfileStorageBackend> | null = null;
let persistentStoragePromise: Promise<boolean> | null = null;

self.addEventListener('message', (event: MessageEvent<FeaturePreparationWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(message: FeaturePreparationWorkerRequest): Promise<void> {
  try {
    const { store, backendKind, persistentStorageGranted } = await getStoreContext();
    if (message.type === 'PREPARE_TRAINING_JOB_FEATURE_SHARDS') {
      const manifest = await store.prepareTrainingJobFeatureShards({
        jobId: message.jobId,
        ...(message.featureSetId === undefined ? {} : { featureSetId: message.featureSetId }),
        ...(message.featureConfig === undefined ? {} : { featureConfig: message.featureConfig }),
        ...(message.splitConfig === undefined ? {} : { splitConfig: message.splitConfig }),
        ...(message.maxFramesPerShard === undefined
          ? {}
          : { maxFramesPerShard: message.maxFramesPerShard }),
      });
      post({
        type: 'FEATURE_PREPARATION_READY',
        requestId: message.requestId,
        backendKind,
        persistentStorageGranted,
        summary: summarizeTrainingJobFeaturePreparationManifest(manifest),
      });
      return;
    }
    if (message.type === 'VERIFY_TRAINING_JOB_FEATURE_SHARDS') {
      post({
        type: 'FEATURE_PREPARATION_VERIFIED',
        requestId: message.requestId,
        backendKind,
        persistentStorageGranted,
        verification: await store.verifyTrainingJobFeatureShards({
          jobId: message.jobId,
          featureSetId: message.featureSetId,
        }),
      });
      return;
    }
    if (message.type === 'DELETE_TRAINING_JOB_FEATURE_SHARDS') {
      await store.deleteTrainingJobFeatureShards({
        jobId: message.jobId,
        featureSetId: message.featureSetId,
      });
      post({
        type: 'FEATURE_PREPARATION_DELETED',
        requestId: message.requestId,
        backendKind,
        persistentStorageGranted,
        jobId: message.jobId,
        featureSetId: message.featureSetId,
      });
      return;
    }
    if (message.type === 'PREPARE_TRAINING_JOB_FRAME_LABELS') {
      const manifest = await store.prepareTrainingJobFrameLabels({
        jobId: message.jobId,
        featureSetId: message.featureSetId,
        alignments: message.alignments,
        ...(message.alignmentSetId === undefined ? {} : { alignmentSetId: message.alignmentSetId }),
        ...(message.options === undefined ? {} : { options: message.options }),
      });
      post({
        type: 'FRAME_LABELS_READY',
        requestId: message.requestId,
        backendKind,
        persistentStorageGranted,
        summary: summarizeTrainingJobFrameLabelsManifest(manifest),
      });
      return;
    }
    if (message.type === 'VERIFY_TRAINING_JOB_FRAME_LABELS') {
      post({
        type: 'FRAME_LABELS_VERIFIED',
        requestId: message.requestId,
        backendKind,
        persistentStorageGranted,
        verification: await store.verifyTrainingJobFrameLabels({
          jobId: message.jobId,
          featureSetId: message.featureSetId,
          alignmentSetId: message.alignmentSetId,
        }),
      });
      return;
    }
    await store.deleteTrainingJobFrameLabels({
      jobId: message.jobId,
      featureSetId: message.featureSetId,
      alignmentSetId: message.alignmentSetId,
    });
    post({
      type: 'FRAME_LABELS_DELETED',
      requestId: message.requestId,
      backendKind,
      persistentStorageGranted,
      jobId: message.jobId,
      featureSetId: message.featureSetId,
      alignmentSetId: message.alignmentSetId,
    });
  } catch (error) {
    post({
      type: 'FEATURE_PREPARATION_ERROR',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
  }
}

async function getStoreContext(): Promise<{
  readonly store: EnrollmentProfileStore;
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
}> {
  const backend = await getBackend();
  return {
    store: new EnrollmentProfileStore(backend),
    backendKind: backend.kind,
    persistentStorageGranted: await getPersistentStorageGranted(),
  };
}

async function getBackend(): Promise<ProfileStorageBackend> {
  backendPromise ??= createDefaultProfileStorageBackend();
  return backendPromise;
}

function getPersistentStorageGranted(): Promise<boolean> {
  persistentStoragePromise ??= requestPersistentProfileStorage();
  return persistentStoragePromise;
}

function post(message: FeaturePreparationWorkerResponse): void {
  self.postMessage(message);
}

export {};
