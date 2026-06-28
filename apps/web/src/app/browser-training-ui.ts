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
export type BrowserTrainingPhaseId = 'preparing' | 'training' | 'checking' | 'ready';
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

export interface BrowserTrainingTechnicalDetailV1 {
  readonly label: string;
  readonly value: string;
}

export interface BrowserTrainingProgressViewV1 {
  readonly title: string;
  readonly summary: string;
  readonly currentStageLabel: 'Preparing' | 'Training' | 'Checking' | 'Ready';
  readonly progressPercent: number;
  readonly progressValueText: string;
  readonly controlIntent: BrowserTrainingControlIntent;
  readonly phases: readonly BrowserTrainingPhaseViewV1[];
  readonly recovery: BrowserTrainingRecoveryViewV1;
  readonly resourceWarnings: readonly string[];
  readonly technicalDetails: readonly BrowserTrainingTechnicalDetailV1[];
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
  const currentStageLabel = formatCurrentStageLabel(status, recoveryView, controlIntent);
  const title = formatTrainingTitle(status, recoveryView, controlIntent);
  const summary = formatTrainingSummary(status, recoveryView, controlIntent);
  const phases = [
    buildPreparingPhase(status, coordination),
    buildTrainingPhase(status, progress, result, controlIntent),
    buildCheckingPhase(status, recoveryView, result),
    buildReadyPhase(status, result),
  ];
  const progressValueText = formatProgressValueText(status, progressPercent);
  return {
    title,
    summary,
    currentStageLabel,
    progressPercent,
    progressValueText,
    controlIntent,
    phases,
    recovery: recoveryView,
    resourceWarnings: summarizeBrowserTrainingResourceWarnings(warnings),
    technicalDetails: buildBrowserTrainingTechnicalDetails({
      status,
      progress,
      result,
      recovery: recoveryView,
      coordination,
      warnings,
    }),
    localOnlyDisclosure: 'Progress is saved on this device.',
    liveRegionText: buildBrowserTrainingLiveRegionText({
      title,
      currentStageLabel,
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

function buildPreparingPhase(
  status: BrowserTrainingUiStatus,
  coordination: BrowserTrainingCoordinationEventV1 | null,
): BrowserTrainingPhaseViewV1 {
  if (status.state === 'idle') {
    return {
      id: 'preparing',
      label: 'Preparing',
      status: 'pending',
      detail: 'Ready to prepare training when you start.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'preparing',
      label: 'Preparing',
      status: 'blocked',
      detail: 'Training needs attention before it can continue.',
    };
  }
  if (coordination?.eventType === 'lock-busy') {
    return {
      id: 'preparing',
      label: 'Preparing',
      status: 'blocked',
      detail: 'Another tab is already training this voice model.',
    };
  }
  if (coordination?.eventType === 'lock-unavailable') {
    return {
      id: 'preparing',
      label: 'Preparing',
      status: 'attention',
      detail: 'Training can continue, but another tab may not be blocked automatically.',
    };
  }
  return {
    id: 'preparing',
    label: 'Preparing',
    status:
      status.state === 'training' && coordination?.eventType !== 'lock-acquired'
        ? 'active'
        : 'complete',
    detail: 'Training is running locally in the background.',
  };
}

function buildTrainingPhase(
  status: BrowserTrainingUiStatus,
  progress: FrozenFeatureTinyAdapterProgressV1 | undefined,
  result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined,
  controlIntent: BrowserTrainingControlIntent,
): BrowserTrainingPhaseViewV1 {
  if (status.state === 'idle') {
    return {
      id: 'training',
      label: 'Training',
      status: 'pending',
      detail: 'Start training when the model is ready.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'training',
      label: 'Training',
      status: 'blocked',
      detail: 'Resolve the training error, then retry or resume from recovery.',
    };
  }
  if (status.state === 'training') {
    return {
      id: 'training',
      label: 'Training',
      status: controlIntent === 'none' ? 'active' : 'attention',
      detail:
        progress === undefined
          ? 'Starting training.'
          : `${formatEpoch(progress.epoch, progress.epochs)} complete.`,
    };
  }
  const finalStatus = result?.status ?? 'completed';
  return {
    id: 'training',
    label: 'Training',
    status: finalStatus === 'completed' ? 'complete' : 'attention',
    detail: `${formatTrainingResultStatus(finalStatus)} after ${result?.metrics.epochsCompleted.toString() ?? '0'} epochs.`,
  };
}

function buildCheckingPhase(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
  result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined,
): BrowserTrainingPhaseViewV1 {
  if (status.state === 'complete' && result?.status === 'completed') {
    return {
      id: 'checking',
      label: 'Checking',
      status: 'active',
      detail: 'Quality checks are needed before this model can be used.',
    };
  }
  if (status.state === 'complete' && result !== undefined) {
    return {
      id: 'checking',
      label: 'Checking',
      status: recovery.resumable ? 'attention' : 'pending',
      detail: 'Resume training before quality checks run.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'checking',
      label: 'Checking',
      status: 'pending',
      detail: 'Checks are waiting for training to finish.',
    };
  }
  return {
    id: 'checking',
    label: 'Checking',
    status: 'pending',
    detail: 'Checks run after training work is complete.',
  };
}

function buildReadyPhase(
  status: BrowserTrainingUiStatus,
  result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined,
): BrowserTrainingPhaseViewV1 {
  if (status.state === 'complete' && result?.status === 'completed') {
    return {
      id: 'ready',
      label: 'Ready',
      status: 'attention',
      detail: 'Review results before using the model.',
    };
  }
  if (status.state === 'error') {
    return {
      id: 'ready',
      label: 'Ready',
      status: 'blocked',
      detail: 'Training is not ready until the error is resolved.',
    };
  }
  return {
    id: 'ready',
    label: 'Ready',
    status: 'pending',
    detail: 'This step becomes available after checks pass.',
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

function formatCurrentStageLabel(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
  controlIntent: BrowserTrainingControlIntent,
): BrowserTrainingProgressViewV1['currentStageLabel'] {
  if (controlIntent !== 'none') return 'Training';
  if (status.state === 'idle') return recovery.resumable ? 'Training' : 'Preparing';
  if (status.state === 'training') return 'Training';
  if (status.state === 'error') return 'Preparing';
  if (status.result.status === 'completed') return 'Checking';
  return 'Training';
}

function formatTrainingTitle(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
  controlIntent: BrowserTrainingControlIntent,
): string {
  if (controlIntent === 'pause-requested') return 'Pausing training';
  if (controlIntent === 'cancel-requested') return 'Cancelling training';
  if (status.state === 'idle')
    return recovery.resumable ? 'Resume training' : 'Training voice model';
  if (status.state === 'training') return 'Training voice model';
  if (status.state === 'error') return 'Training needs attention';
  switch (status.result.status) {
    case 'completed':
      return 'Checking results';
    case 'paused':
      return 'Training paused';
    case 'cancelled':
      return 'Training cancelled';
  }
}

function formatTrainingSummary(
  status: BrowserTrainingUiStatus,
  recovery: BrowserTrainingRecoveryViewV1,
  controlIntent: BrowserTrainingControlIntent,
): string {
  if (controlIntent === 'pause-requested') {
    return 'Training will pause at the next safe checkpoint.';
  }
  if (controlIntent === 'cancel-requested') {
    return 'Training will stop at the next safe checkpoint.';
  }
  if (status.state === 'idle') {
    return recovery.resumable
      ? 'Training can continue from the latest saved checkpoint.'
      : 'Start when recordings and browser support are ready.';
  }
  if (status.state === 'training') {
    return 'Checking pronunciation';
  }
  if (status.state === 'error') {
    return 'Review the error, then retry or resume from recovery.';
  }
  switch (status.result.status) {
    case 'completed':
      return 'Training finished. Review results before using the model.';
    case 'paused':
      return 'Training is saved on this device and can resume later.';
    case 'cancelled':
      return 'Training stopped. Recovery is available if a checkpoint was saved.';
  }
}

function buildBrowserTrainingLiveRegionText({
  title,
  currentStageLabel,
  progressValueText,
  recovery,
  controlIntent,
}: {
  readonly title: string;
  readonly currentStageLabel: BrowserTrainingProgressViewV1['currentStageLabel'];
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
  return `${controlPrefix}${title}. ${currentStageLabel}. Progress ${progressValueText}.${recoverySuffix}`;
}

function buildBrowserTrainingTechnicalDetails({
  status,
  progress,
  result,
  recovery,
  coordination,
  warnings,
}: {
  readonly status: BrowserTrainingUiStatus;
  readonly progress: FrozenFeatureTinyAdapterProgressV1 | undefined;
  readonly result: FrozenFeatureTinyAdapterTrainingResultV1 | undefined;
  readonly recovery: BrowserTrainingRecoveryViewV1;
  readonly coordination: BrowserTrainingCoordinationEventV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
}): readonly BrowserTrainingTechnicalDetailV1[] {
  const details: BrowserTrainingTechnicalDetailV1[] = [
    { label: 'Stage', value: formatCurrentStageLabel(status, recovery, 'none') },
    { label: 'Backend', value: 'local fixed adapter math in a worker' },
    { label: 'Threads', value: 'worker-managed' },
    { label: 'Memory', value: 'worker-owned buffers' },
    { label: 'Batch', value: 'prototype fixture batch' },
    { label: 'Checkpoint', value: recovery.label },
    { label: 'Cross-tab lock', value: formatCoordinationDetail(coordination) },
  ];
  if (progress !== undefined) {
    details.push(
      { label: 'Epoch', value: formatEpoch(progress.epoch, progress.epochs) },
      { label: 'Loss', value: progress.loss.toFixed(6) },
      { label: 'Learning rate', value: formatOptionalNumber(progress.learningRate) },
      { label: 'Validation loss', value: formatOptionalNumber(progress.validationLoss) },
      { label: 'Optimizer', value: progress.optimizer ?? 'not reported' },
    );
  }
  if (result !== undefined) {
    details.push(
      { label: 'Result', value: formatTrainingResultStatus(result.status) },
      { label: 'Epochs completed', value: result.metrics.epochsCompleted.toString() },
      { label: 'Final loss', value: result.metrics.finalLoss.toFixed(6) },
      { label: 'Loss reduction', value: result.metrics.lossReduction.toFixed(6) },
      { label: 'Examples', value: result.metrics.examples.toString() },
      {
        label: 'Quality gate',
        value: result.compatibility.activationGateRequired ? 'required' : 'not required',
      },
    );
  }
  if (warnings.length > 0) {
    details.push({ label: 'Resource warnings', value: warnings.length.toString() });
  }
  return details;
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

function formatCoordinationDetail(coordination: BrowserTrainingCoordinationEventV1 | null): string {
  if (coordination === null) return 'not started';
  switch (coordination.eventType) {
    case 'lock-requested':
      return 'requesting local lock';
    case 'lock-acquired':
      return 'local lock held';
    case 'lock-busy':
      return 'another tab is training';
    case 'lock-released':
      return 'local lock released';
    case 'lock-unavailable':
      return 'local lock unavailable';
  }
}

function formatTrainingResultStatus(
  status: FrozenFeatureTinyAdapterTrainingResultV1['status'],
): string {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'cancelled';
  }
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? 'not reported' : value.toFixed(6);
}

function formatEpoch(epoch: number, epochs: number): string {
  return `epoch ${epoch.toString()}/${epochs.toString()}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
