/// <reference lib="webworker" />

import { createPinnedOnnxRuntimeWebTrainingSpikeReport } from '@speech/inference/training-artifact-spike';
import {
  createSyntheticFrozenFeatureTinyAdapterDataset,
  selectBrowserTrainingBackend,
  type BrowserTrainingBackendSelectionV1,
  type BrowserTrainingBackendSession,
  type FrozenFeatureTinyAdapterCheckpointV1,
  type FrozenFeatureTinyAdapterDatasetV1,
  type FrozenFeatureTinyAdapterProgressV1,
  type FrozenFeatureTinyAdapterTrainingOptions,
  type FrozenFeatureTinyAdapterTrainingResultV1,
  type OnnxRuntimeTrainingBackendProofV1,
} from '@speech/browser-training';
import {
  createBrowserTrainingCoordinationScope,
  runWithBrowserTrainingCoordination,
  type BrowserTrainingCoordinationEventV1,
  type BrowserTrainingCoordinationScopeV1,
} from './browser-training-coordination';

export interface StartBrowserTrainingPrototypeMessage {
  readonly type: 'START_BROWSER_TRAINING_PROTOTYPE';
  readonly requestId: string;
  readonly dataset?: FrozenFeatureTinyAdapterDatasetV1;
  readonly options?: BrowserTrainingWorkerOptions;
}

export interface ControlBrowserTrainingPrototypeMessage {
  readonly type: 'CANCEL_BROWSER_TRAINING_PROTOTYPE' | 'PAUSE_BROWSER_TRAINING_PROTOTYPE';
  readonly requestId: string;
}

export interface BrowserTrainingWorkerCoordinationOptions {
  readonly enabled?: boolean;
  readonly scopeId?: string;
}

export type BrowserTrainingWorkerOptions = Partial<
  Omit<
    FrozenFeatureTinyAdapterTrainingOptions,
    'onProgress' | 'onCheckpoint' | 'shouldCancel' | 'shouldPause'
  >
> & {
  readonly epochDelayMs?: number;
  readonly coordination?: BrowserTrainingWorkerCoordinationOptions;
};

export interface BrowserTrainingRuntimeWarningV1 {
  readonly code:
    | 'THERMAL_STATUS_UNAVAILABLE'
    | 'BATTERY_STATUS_UNAVAILABLE'
    | 'CHECKPOINT_STORAGE_VOLATILE'
    | 'ORT_TRAINING_BACKEND_FALLBACK'
    | 'WEB_LOCKS_UNAVAILABLE';
  readonly message: string;
}

export interface BrowserTrainingProgressMessage {
  readonly type: 'BROWSER_TRAINING_PROGRESS';
  readonly requestId: string;
  readonly progress: FrozenFeatureTinyAdapterProgressV1;
}

export interface BrowserTrainingCheckpointMessage {
  readonly type: 'BROWSER_TRAINING_CHECKPOINT';
  readonly requestId: string;
  readonly checkpoint: FrozenFeatureTinyAdapterCheckpointV1;
}

export interface BrowserTrainingWarningMessage {
  readonly type: 'BROWSER_TRAINING_WARNING';
  readonly requestId: string;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
}

export interface BrowserTrainingCoordinationMessage {
  readonly type: 'BROWSER_TRAINING_COORDINATION';
  readonly requestId: string;
  readonly event: BrowserTrainingCoordinationEventV1;
}

export interface BrowserTrainingCompleteMessage {
  readonly type: 'BROWSER_TRAINING_COMPLETE';
  readonly requestId: string;
  readonly result: FrozenFeatureTinyAdapterTrainingResultV1;
}

export interface BrowserTrainingErrorMessage {
  readonly type: 'BROWSER_TRAINING_ERROR';
  readonly requestId: string;
  readonly message: string;
}

export type BrowserTrainingWorkerMessage =
  | StartBrowserTrainingPrototypeMessage
  | ControlBrowserTrainingPrototypeMessage;
export type BrowserTrainingWorkerResponse =
  | BrowserTrainingProgressMessage
  | BrowserTrainingCheckpointMessage
  | BrowserTrainingWarningMessage
  | BrowserTrainingCoordinationMessage
  | BrowserTrainingCompleteMessage
  | BrowserTrainingErrorMessage;

interface ActiveBrowserTrainingRun {
  readonly requestId: string;
  readonly session: BrowserTrainingBackendSession;
  readonly epochDelayMs: number;
  readonly coordinationScope: BrowserTrainingCoordinationScopeV1;
  cancelled: boolean;
  paused: boolean;
}

const ctx = self as DedicatedWorkerGlobalScope;
let activeRun: ActiveBrowserTrainingRun | undefined;
let pendingStartRequestId: string | undefined;

ctx.addEventListener('message', (event: MessageEvent<BrowserTrainingWorkerMessage>) => {
  const message = event.data;
  if (message.type === 'CANCEL_BROWSER_TRAINING_PROTOTYPE') {
    if (activeRun?.requestId === message.requestId) {
      activeRun.cancelled = true;
    }
    return;
  }
  if (message.type === 'PAUSE_BROWSER_TRAINING_PROTOTYPE') {
    if (activeRun?.requestId === message.requestId) {
      activeRun.paused = true;
    }
    return;
  }
  if (message.type !== 'START_BROWSER_TRAINING_PROTOTYPE') {
    return;
  }

  if (activeRun !== undefined || pendingStartRequestId !== undefined) {
    postError(message.requestId, 'Browser training worker already has an active run.');
    return;
  }

  pendingStartRequestId = message.requestId;
  void startCoordinatedTrainingRun(message);
});

async function startCoordinatedTrainingRun(
  message: StartBrowserTrainingPrototypeMessage,
): Promise<void> {
  try {
    const dataset = message.dataset ?? createSyntheticFrozenFeatureTinyAdapterDataset();
    if (dataset.privacy.containsPrivateFrozenFeatureValues || dataset.privacy.containsProfileData) {
      throw new Error(
        'The public browser-training prototype worker only returns synthetic or non-private aggregate results. Private frozen-feature datasets must stay in profile-owned training storage until explicitly packaged.',
      );
    }
    const { epochDelayMs, coordination, ...trainingOptions } = message.options ?? {};
    const coordinationScope = createBrowserTrainingCoordinationScope(
      dataset,
      coordination?.scopeId,
    );
    await runWithBrowserTrainingCoordination(
      {
        requestId: message.requestId,
        scope: coordinationScope,
        ...(coordination?.enabled === undefined ? {} : { enabled: coordination.enabled }),
        onEvent: postCoordinationEvent,
      },
      async () => {
        const backendSelection = selectBrowserTrainingBackend({
          preferredKind: 'onnxruntime-web-training',
          onnxRuntimeTrainingProof: createPinnedOnnxRuntimeTrainingBackendProof(),
        });
        const session = backendSelection.backend.createSession(dataset, trainingOptions);
        const run: ActiveBrowserTrainingRun = {
          requestId: message.requestId,
          session,
          epochDelayMs: normalizeEpochDelay(epochDelayMs),
          coordinationScope,
          cancelled: false,
          paused: false,
        };
        activeRun = run;
        ctx.postMessage({
          type: 'BROWSER_TRAINING_WARNING',
          requestId: message.requestId,
          warnings: createRuntimeWarnings(backendSelection),
        } satisfies BrowserTrainingWarningMessage);
        await runTrainingLoop(run);
      },
    );
  } catch (error) {
    postError(message.requestId, error instanceof Error ? error.message : String(error));
  } finally {
    if (pendingStartRequestId === message.requestId) {
      pendingStartRequestId = undefined;
    }
  }
}

async function runTrainingLoop(run: ActiveBrowserTrainingRun): Promise<void> {
  try {
    while (activeRun === run && run.session.epoch < run.session.options.epochs) {
      if (run.cancelled || run.paused) {
        break;
      }
      const progress = run.session.runEpoch();
      ctx.postMessage({
        type: 'BROWSER_TRAINING_PROGRESS',
        requestId: run.requestId,
        progress,
      } satisfies BrowserTrainingProgressMessage);
      if (run.session.shouldCheckpoint()) {
        postCheckpoint(run.requestId, run.session.createCheckpoint());
      }
      if (run.session.hasReachedTargetLoss()) {
        break;
      }
      await sleep(run.epochDelayMs);
    }

    const status = run.cancelled ? 'cancelled' : run.paused ? 'paused' : 'completed';
    const result = run.session.finish(status);
    postCheckpoint(run.requestId, result.checkpoint);
    ctx.postMessage({
      type: 'BROWSER_TRAINING_COMPLETE',
      requestId: run.requestId,
      result,
    } satisfies BrowserTrainingCompleteMessage);
  } catch (error) {
    postError(run.requestId, error instanceof Error ? error.message : String(error));
  } finally {
    if (activeRun === run) {
      activeRun = undefined;
    }
  }
}

function postCheckpoint(requestId: string, checkpoint: FrozenFeatureTinyAdapterCheckpointV1): void {
  ctx.postMessage({
    type: 'BROWSER_TRAINING_CHECKPOINT',
    requestId,
    checkpoint,
  } satisfies BrowserTrainingCheckpointMessage);
}

function postCoordinationEvent(event: BrowserTrainingCoordinationEventV1): void {
  ctx.postMessage({
    type: 'BROWSER_TRAINING_COORDINATION',
    requestId: event.requestId,
    event,
  } satisfies BrowserTrainingCoordinationMessage);
  if (event.eventType === 'lock-unavailable') {
    ctx.postMessage({
      type: 'BROWSER_TRAINING_WARNING',
      requestId: event.requestId,
      warnings: [
        {
          code: 'WEB_LOCKS_UNAVAILABLE',
          message: event.message,
        },
      ],
    } satisfies BrowserTrainingWarningMessage);
  }
}

function postError(requestId: string, message: string): void {
  ctx.postMessage({
    type: 'BROWSER_TRAINING_ERROR',
    requestId,
    message,
  } satisfies BrowserTrainingErrorMessage);
}

function createRuntimeWarnings(
  backendSelection: BrowserTrainingBackendSelectionV1,
): readonly BrowserTrainingRuntimeWarningV1[] {
  return [
    ...createBackendFallbackWarnings(backendSelection),
    {
      code: 'THERMAL_STATUS_UNAVAILABLE',
      message:
        'Browser workers do not expose a portable thermal-status API; keep pause and cancel controls available during experimental training.',
    },
    {
      code: 'BATTERY_STATUS_UNAVAILABLE',
      message:
        'Battery state is not available in the training worker; users should pause or cancel if the device becomes constrained.',
    },
    {
      code: 'CHECKPOINT_STORAGE_VOLATILE',
      message:
        'Prototype checkpoint recovery uses browser-local storage for synthetic diagnostics and is not an activation path.',
    },
  ];
}

function createBackendFallbackWarnings(
  selection: BrowserTrainingBackendSelectionV1,
): readonly BrowserTrainingRuntimeWarningV1[] {
  if (selection.fallback === undefined) return [];
  return [
    {
      code: 'ORT_TRAINING_BACKEND_FALLBACK',
      message: selection.fallback.message,
    },
  ];
}

function createPinnedOnnxRuntimeTrainingBackendProof(): OnnxRuntimeTrainingBackendProofV1 {
  const report = createPinnedOnnxRuntimeWebTrainingSpikeReport();
  return {
    schemaVersion: 1,
    packageName: report.packageName,
    packageVersion: report.packageVersion,
    trainingApiAvailable: report.trainingApiAvailable,
    packageIncludesTrainingWasm: report.packageIncludesTrainingWasm,
    workerProof: {
      status: report.tinyTrainingProof.status,
      forward: report.tinyTrainingProof.forward,
      backward: report.tinyTrainingProof.backward,
      optimizerStep: report.tinyTrainingProof.optimizerStep,
      checkpointSaveLoad: report.tinyTrainingProof.checkpointSaveLoad,
      weightExport: report.tinyTrainingProof.weightExport,
      ...(report.tinyTrainingProof.reason === undefined
        ? {}
        : { reason: report.tinyTrainingProof.reason }),
    },
    privacy: {
      inspectedPackageMetadataOnly: true,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    },
  };
}

function normalizeEpochDelay(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Browser training epochDelayMs must be a finite non-negative number.');
  }
  return Math.min(1_000, Math.floor(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export {};
