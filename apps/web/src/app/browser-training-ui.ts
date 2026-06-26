import type {
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/browser-training';
import type {
  BrowserTrainingCoordinationEventV1,
  BrowserTrainingRecoveryRecordV1,
  BrowserTrainingRuntimeWarningV1,
} from '../workers/browser-training-client';

export type BrowserTrainingUiStatus =
  | { readonly state: 'idle' }
  | {
      readonly state: 'training';
      readonly latestProgress?: FrozenFeatureTinyAdapterProgressV1;
    }
  | { readonly state: 'complete'; readonly result: FrozenFeatureTinyAdapterTrainingResultV1 }
  | { readonly state: 'error'; readonly message: string };

export type BrowserTrainingControlIntent = 'none' | 'pause-requested' | 'cancel-requested';
export type BrowserTrainingPhaseId =
  | 'prepare-worker'
  | 'coordinate-lock'
  | 'train-adapter'
  | 'checkpoint-recovery'
  | 'activation-gate';
export type BrowserTrainingPhaseStatus =
  | 'pending'
  | 'active'
  | 'complete'
  | 'attention'
  | 'blocked';

export interface BrowserTrainingPhaseViewV1 {
  readonly id: BrowserTrainingPhaseId;
  readonly label: string;
  readonly status: BrowserTrainingPhaseStatus;
  readonly detail: string;
}

export interface BrowserTrainingRecoveryViewV1 {
  readonly status: 'none' | 'checkpointed' | 'paused' | 'cancelled';
  readonly label: string;
  readonly checkpointEpoch: number | null;
  readonly checkpointEpochs: number | null;
  readonly updatedAt: string | null;
  readonly resumable: boolean;
}

export interface BrowserTrainingProgressViewV1 {
  readonly currentPhaseLabel: string;
  readonly progressPercent: number;
  readonly progressValueText: string;
  readonly controlIntent: BrowserTrainingControlIntent;
  readonly phases: readonly BrowserTrainingPhaseViewV1[];
  readonly recovery: BrowserTrainingRecoveryViewV1;
  readonly resourceWarnings: readonly string[];
  readonly localOnlyDisclosure: string;
  readonly liveRegionText: string;
  readonly phaseTextEquivalent: string;
  readonly isBusy: boolean;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpointBytes: false;
    readonly containsAdapterWeights: false;
    readonly localOnly: true;
  };
}

export interface BrowserTrainingProgressViewInputV1 {
  readonly status: BrowserTrainingUiStatus;
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly coordination: BrowserTrainingCoordinationEventV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
  readonly controlIntent?: BrowserTrainingControlIntent;
}

export function buildBrowserTrainingProgressView({
  status,
  recovery,
  coordination,
  warnings,
  controlIntent = 'none',
}: BrowserTrainingProgressViewInputV1): BrowserTrainingProgressViewV1 {
  const recoveryView = buildBrowserTrainingRecoveryView(recovery);
  const progress = status.state === 'training' ? status.latestProgress : undefined;
  const result = status.state === 'complete' ? status.result : undefined;
  const progressPercent = calculateProgressPercent(status, recoveryView);
  const currentPhaseLabel = formatCurrentPhaseLabel(status, recoveryView, controlIntent);
  const phases = [
    buildPrepareWorkerPhase(status),
    buildCoordinationPhase(status, coordination),
    buildTrainingPhase(status, progress, result, controlIntent),
    buildCheckpointPhase(status, recoveryView),
    buildActivationGatePhase(status, result),
  ];
  const progressValueText = formatProgressValueText(status, progressPercent);
  return {
    currentPhaseLabel,
    progressPercent,
    progressValueText,
    controlIntent,
    phases,
    recovery: recoveryView,
    resourceWarnings: summarizeBrowserTrainingResourceWarnings(warnings),
    localOnlyDisclosure:
      'Browser training runs in a dedicated local worker. Recovery checkpoints stay in this browser and are not activated personal models until import, checksum, compatibility, and regression gates pass.',
    liveRegionText: buildBrowserTrainingLiveRegionText({
      currentPhaseLabel,
      progressValueText,
      recovery: recoveryView,
      controlIntent,
    }),
    phaseTextEquivalent: buildPhaseTextEquivalent(phases),
    isBusy: status.state === 'training' || controlIntent !== 'none',
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpointBytes: false,
      containsAdapterWeights: false,
      localOnly: true,
    },
  };
}

export function buildBrowserTrainingRecoveryView(
  recovery: BrowserTrainingRecoveryRecordV1 | null,
): BrowserTrainingRecoveryViewV1 {
  if (recovery === null) {
    return {
      status: 'none',
      label: 'No reload recovery checkpoint is stored.',
      checkpointEpoch: null,
      checkpointEpochs: null,
      updatedAt: null,
      resumable: false,
    };
  }
  return {
    status: recovery.status,
    label: `Reload recovery ${recovery.status} at epoch ${recovery.checkpoint.epoch.toString()}.`,
    checkpointEpoch: recovery.checkpoint.epoch,
    checkpointEpochs: recovery.checkpoint.epochs,
    updatedAt: recovery.updatedAt,
    resumable: recovery.checkpoint.epoch < recovery.checkpoint.epochs,
  };
}

export function summarizeBrowserTrainingResourceWarnings(
  warnings: readonly BrowserTrainingRuntimeWarningV1[],
): readonly string[] {
  const summaries = new Set<string>();
  for (const warning of warnings) {
    switch (warning.code) {
      case 'THERMAL_STATUS_UNAVAILABLE':
        summaries.add(
          'Thermal status is unavailable; keep pause/cancel available if the device feels constrained.',
        );
        break;
      case 'BATTERY_STATUS_UNAVAILABLE':
        summaries.add(
          'Battery status is unavailable in the worker; pause or cancel before switching power states.',
        );
        break;
      case 'CHECKPOINT_STORAGE_VOLATILE':
        summaries.add(
          'Prototype recovery uses browser-local storage and is not an activation path.',
        );
        break;
      case 'ORT_TRAINING_BACKEND_FALLBACK':
        summaries.add(
          'ORT Training is not proven in this browser; fixed adapter math is being used.',
        );
        break;
      case 'WEB_LOCKS_UNAVAILABLE':
        summaries.add(
          'Web Locks are unavailable; another tab may not be prevented from starting training.',
        );
        break;
      case 'ASR_PRIORITY_PAUSE':
        summaries.add(
          'ASR runtime activity can pause training at a cooperative checkpoint boundary.',
        );
        break;
    }
  }
  return [...summaries];
}

function buildPrepareWorkerPhase(status: BrowserTrainingUiStatus): BrowserTrainingPhaseViewV1 {
  if (status.state === 'idle') {
    return {
      id: 'prepare-worker',
      label: 'Prepare worker',
      status: 'pending',
      detail: 'Dedicated training worker has not started.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'prepare-worker',
      label: 'Prepare worker',
      status: 'blocked',
      detail: 'Worker returned an error before the run completed.',
    };
  }
  return {
    id: 'prepare-worker',
    label: 'Prepare worker',
    status: status.state === 'training' ? 'active' : 'complete',
    detail: 'Dedicated worker owns browser-training runtime and mutable buffers.',
  };
}

function buildCoordinationPhase(
  status: BrowserTrainingUiStatus,
  coordination: BrowserTrainingCoordinationEventV1 | null,
): BrowserTrainingPhaseViewV1 {
  if (coordination === null) {
    return {
      id: 'coordinate-lock',
      label: 'Coordinate local lock',
      status: status.state === 'idle' ? 'pending' : 'active',
      detail: 'Waiting for local cross-tab lock status.',
    };
  }
  switch (coordination.eventType) {
    case 'lock-requested':
      return {
        id: 'coordinate-lock',
        label: 'Coordinate local lock',
        status: 'active',
        detail: 'Requesting the redacted same-profile training lock.',
      };
    case 'lock-acquired':
      return {
        id: 'coordinate-lock',
        label: 'Coordinate local lock',
        status: status.state === 'training' ? 'active' : 'complete',
        detail: 'Exclusive local training lock is held by this tab.',
      };
    case 'lock-busy':
      return {
        id: 'coordinate-lock',
        label: 'Coordinate local lock',
        status: 'blocked',
        detail: 'Another tab is already training this redacted profile scope.',
      };
    case 'lock-unavailable':
      return {
        id: 'coordinate-lock',
        label: 'Coordinate local lock',
        status: 'attention',
        detail: 'Web Locks are unavailable; training continues without cross-tab exclusivity.',
      };
    case 'lock-released':
      return {
        id: 'coordinate-lock',
        label: 'Coordinate local lock',
        status: 'complete',
        detail: 'Exclusive local training lock has been released.',
      };
  }
}

function buildTrainingPhase(
  status: BrowserTrainingUiStatus,
  progress: FrozenFeatureTinyAdapterProgressV1 | undefined,
  result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined,
  controlIntent: BrowserTrainingControlIntent,
): BrowserTrainingPhaseViewV1 {
  if (status.state === 'idle') {
    return {
      id: 'train-adapter',
      label: 'Train adapter epochs',
      status: 'pending',
      detail: 'Start the prototype to train synthetic frozen-feature adapter epochs.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'train-adapter',
      label: 'Train adapter epochs',
      status: 'blocked',
      detail:
        'Training worker returned an error; review the alert message and retry after resolving it.',
    };
  }
  if (status.state === 'training') {
    return {
      id: 'train-adapter',
      label: 'Train adapter epochs',
      status: controlIntent === 'none' ? 'active' : 'attention',
      detail:
        progress === undefined
          ? 'Training loop is starting.'
          : `${formatEpoch(progress.epoch, progress.epochs)} · loss ${progress.loss.toFixed(6)}${formatOptionalValidationLoss(progress)}`,
    };
  }
  const finalStatus = result?.status ?? 'completed';
  return {
    id: 'train-adapter',
    label: 'Train adapter epochs',
    status: finalStatus === 'completed' ? 'complete' : 'attention',
    detail: `${finalStatus} after ${result?.metrics.epochsCompleted.toString() ?? '0'} epochs · final loss ${result?.metrics.finalLoss.toFixed(6) ?? 'n/a'}`,
  };
}

function buildCheckpointPhase(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
): BrowserTrainingPhaseViewV1 {
  if (recovery.status === 'none') {
    if (status.state === 'complete' && status.result.status === 'completed') {
      return {
        id: 'checkpoint-recovery',
        label: 'Save reload recovery',
        status: 'complete',
        detail: 'Completed run cleared prototype recovery; no resume checkpoint is needed.',
      };
    }
    if (status.state === 'complete') {
      return {
        id: 'checkpoint-recovery',
        label: 'Save reload recovery',
        status: 'attention',
        detail: 'Run ended before completion, but no reload recovery checkpoint is stored.',
      };
    }
    return {
      id: 'checkpoint-recovery',
      label: 'Save reload recovery',
      status: status.state === 'training' ? 'active' : 'pending',
      detail: 'No reload recovery checkpoint is stored yet.',
    };
  }
  return {
    id: 'checkpoint-recovery',
    label: 'Save reload recovery',
    status: recovery.resumable ? 'attention' : 'complete',
    detail: recovery.label,
  };
}

function buildActivationGatePhase(
  status: BrowserTrainingUiStatus,
  result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined,
): BrowserTrainingPhaseViewV1 {
  if (status.state !== 'complete' || result === undefined) {
    return {
      id: 'activation-gate',
      label: 'Await activation gate',
      status: 'pending',
      detail: 'Activation gate remains untouched until a completed adapter is explicitly imported.',
    };
  }
  return {
    id: 'activation-gate',
    label: 'Await activation gate',
    status: result.compatibility.activationGateRequired ? 'attention' : 'complete',
    detail: result.compatibility.activationGateRequired
      ? 'Completed prototype output still requires import, checksum, compatibility, and regression gates.'
      : 'Activation gate is not required for this result.',
  };
}

function calculateProgressPercent(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
): number {
  if (status.state === 'training') {
    const progress = status.latestProgress;
    if (progress === undefined || progress.epochs <= 0) return 0;
    return clampPercent((progress.epoch / progress.epochs) * 100);
  }
  if (status.state === 'complete') {
    return clampPercent(
      (status.result.metrics.epochsCompleted / status.result.checkpoint.epochs) * 100,
    );
  }
  if (
    (status.state === 'idle' || status.state === 'error') &&
    recovery.checkpointEpoch !== null &&
    recovery.checkpointEpochs !== null
  ) {
    return clampPercent((recovery.checkpointEpoch / recovery.checkpointEpochs) * 100);
  }
  return 0;
}

function formatCurrentPhaseLabel(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
  controlIntent: BrowserTrainingControlIntent,
): string {
  if (controlIntent === 'pause-requested') return 'Pause requested at next safe checkpoint';
  if (controlIntent === 'cancel-requested') return 'Cancel requested at next safe checkpoint';
  if (status.state === 'idle')
    return recovery.resumable ? 'Ready to resume from reload recovery' : 'Ready to start';
  if (status.state === 'training') return 'Training adapter epochs';
  if (status.state === 'error') return 'Training worker needs attention';
  switch (status.result.status) {
    case 'completed':
      return 'Training completed; activation gate still required';
    case 'paused':
      return 'Training paused with reload recovery';
    case 'cancelled':
      return 'Training cancelled with reload recovery';
  }
}

function buildBrowserTrainingLiveRegionText({
  currentPhaseLabel,
  progressValueText,
  recovery,
  controlIntent,
}: {
  readonly currentPhaseLabel: string;
  readonly progressValueText: string;
  readonly recovery: BrowserTrainingRecoveryViewV1;
  readonly controlIntent: BrowserTrainingControlIntent;
}): string {
  const controlPrefix =
    controlIntent === 'pause-requested'
      ? 'Pause requested. '
      : controlIntent === 'cancel-requested'
        ? 'Cancel requested. '
        : '';
  const recoverySuffix = recovery.resumable ? ` ${recovery.label}` : '';
  return `${controlPrefix}${currentPhaseLabel}. Progress ${progressValueText}.${recoverySuffix}`;
}

function buildPhaseTextEquivalent(phases: readonly BrowserTrainingPhaseViewV1[]): string {
  return phases
    .map(
      (phase, index) =>
        `Step ${(index + 1).toString()} ${phase.label}: ${phase.status}. ${phase.detail}`,
    )
    .join(' ');
}

function formatProgressValueText(status: BrowserTrainingUiStatus, percent: number): string {
  if (status.state === 'training' && status.latestProgress !== undefined) {
    return `${formatEpoch(status.latestProgress.epoch, status.latestProgress.epochs)} (${percent.toString()}%)`;
  }
  if (status.state === 'complete') {
    return `${formatEpoch(status.result.metrics.epochsCompleted, status.result.checkpoint.epochs)} (${percent.toString()}%)`;
  }
  return `${percent.toString()}%`;
}

function formatOptionalValidationLoss(progress: FrozenFeatureTinyAdapterProgressV1): string {
  return progress.validationLoss === undefined
    ? ''
    : ` · validation ${progress.validationLoss.toFixed(6)}`;
}

function formatEpoch(epoch: number, epochs: number): string {
  return `epoch ${epoch.toString()}/${epochs.toString()}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
