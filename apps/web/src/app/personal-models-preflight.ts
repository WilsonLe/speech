import {
  getTrainingCompanionFileKeys,
  getTrainingCompanionRequiredStorageBytes,
  type InstalledModelRecord,
} from '@speech/model-manager';
import type { TrainingReadinessCoverageReportV1 } from '@speech/enrollment';
import type { CapabilityReport } from '../capabilities';
import type {
  ManifestInspectionResult,
  ModelLifecycleModel,
} from '../workers/model-lifecycle-client';
import type { PersonalModelProfileCardV1 } from './personal-models';

export type PersonalModelPreflightStatus = 'checking' | 'ready' | 'action-needed' | 'fallback';

export interface PersonalModelPreflightCheckV1 {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly status: PersonalModelPreflightStatus;
  readonly detail: string;
  readonly privacy: PersonalModelPreflightPrivacyV1;
}

export interface PersonalModelTrainingCompanionSummaryV1 {
  readonly schemaVersion: 1;
  readonly modelLabel: string;
  readonly status:
    | 'checking'
    | 'installed'
    | 'available-not-installed'
    | 'not-declared'
    | 'base-model-missing';
  readonly installedFileCount: number;
  readonly requiredFileCount: number;
  readonly requiredStorageBytes: number;
  readonly detail: string;
  readonly privacy: PersonalModelPreflightPrivacyV1;
}

export interface PersonalModelReadinessTaskV1 {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly status: 'complete' | 'missing';
  readonly actual: number;
  readonly required: number;
  readonly missing: number;
  readonly detail: string;
  readonly privacy: PersonalModelPreflightPrivacyV1;
}

export interface PersonalModelTrainingReadinessBlockerV1 {
  readonly schemaVersion: 1;
  readonly id: 'recordings' | 'browser-support' | 'training-support' | 'checking';
  readonly label: string;
  readonly detail: string;
  readonly nextAction: string;
  readonly privacy: PersonalModelPreflightPrivacyV1;
}

export interface PersonalModelTrainingReadinessViewV1 {
  readonly schemaVersion: 1;
  readonly status: 'ready' | 'blocked' | 'checking';
  readonly title:
    | 'Ready to train'
    | 'Continue recording'
    | 'Checking readiness'
    | 'Training not ready';
  readonly summary: string;
  readonly primaryAction: {
    readonly kind: 'train' | 'continue-recording';
    readonly label: 'Train model' | 'Continue recording';
    readonly href: string;
    readonly disabled: boolean;
  };
  readonly recording: {
    readonly acceptedCount: number;
    readonly acceptedDurationSeconds: number;
    readonly requiredCount: number;
    readonly requiredDurationSeconds: number;
    readonly label: string;
  };
  readonly storage: {
    readonly requiredFreeBytes: number;
    readonly label: string;
    readonly status: 'ready' | 'checking' | 'blocked';
  };
  readonly browserSupport: {
    readonly label: string;
    readonly status: 'ready' | 'checking' | 'limited' | 'blocked';
    readonly detail: string;
  };
  readonly trainingSupport: {
    readonly label: string;
    readonly status: 'ready' | 'checking' | 'blocked' | 'not-needed';
    readonly detail: string;
  };
  readonly blockers: readonly PersonalModelTrainingReadinessBlockerV1[];
  readonly details: {
    readonly passedCheckCount: number;
    readonly fallbackCheckCount: number;
    readonly actionNeededCheckCount: number;
    readonly recordingTaskCount: number;
  };
  readonly privacy: PersonalModelPreflightPrivacyV1;
}

export interface PersonalModelPreflightPrivacyV1 {
  readonly aggregateOnly: true;
  readonly containsRawAudio: false;
  readonly containsTranscriptText: false;
  readonly containsFeatureTensors: false;
  readonly containsCheckpoints: false;
  readonly containsAdapterWeights: false;
  readonly containsPrivateVocabularyTerms: false;
  readonly exposesRawPromptIds: false;
  readonly exposesRawVocabularyEntryIds: false;
  readonly networkUpload: false;
  readonly telemetry: false;
  readonly localOnly: true;
}

export function buildPersonalModelCapabilityChecks(
  report: CapabilityReport | null,
): readonly PersonalModelPreflightCheckV1[] {
  if (report === null) {
    return [
      createPreflightCheck({
        label: 'Browser capability checks',
        status: 'checking',
        detail: 'Checking passive browser APIs without prompting for microphone or storage access.',
      }),
    ];
  }

  const { capabilities, browserTraining, workerBenchmark } = report;
  return [
    createPreflightCheck({
      label: 'Secure context',
      status: capabilities.secureContext ? 'ready' : 'action-needed',
      detail: capabilities.secureContext
        ? 'HTTPS or localhost security context is available.'
        : 'Use HTTPS or localhost before microphone and worker APIs can run reliably.',
    }),
    createPreflightCheck({
      label: 'Microphone APIs',
      status: capabilities.mediaDevices ? 'ready' : 'action-needed',
      detail: capabilities.mediaDevices
        ? 'Microphone APIs are available; permission is requested only from the enrollment action.'
        : 'Browser mediaDevices.getUserMedia is unavailable.',
    }),
    createPreflightCheck({
      label: 'AudioWorklet capture',
      status: capabilities.audioWorklet ? 'ready' : 'action-needed',
      detail: capabilities.audioWorklet
        ? 'AudioWorklet capture can run off the UI thread.'
        : 'AudioWorklet is unavailable; enrollment capture cannot use the low-latency path.',
    }),
    createPreflightCheck({
      label: 'Background work',
      status: capabilities.webWorkers && workerBenchmark.supported ? 'ready' : 'action-needed',
      detail:
        capabilities.webWorkers && workerBenchmark.supported
          ? `Background response check passed (${formatMilliseconds(workerBenchmark.medianRoundTripMs)} median).`
          : 'Background processing support is unavailable in this browser.',
    }),
    createPreflightCheck({
      label: 'Fast data path',
      status:
        capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer ? 'ready' : 'fallback',
      detail:
        capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer
          ? 'The fastest local data path is available.'
          : 'A compatible local fallback will be used.',
    }),
    createPreflightCheck({
      label: 'Local processing support',
      status: capabilities.webAssemblySimd ? 'ready' : 'fallback',
      detail: capabilities.webAssemblySimd
        ? `Local processing acceleration is available${capabilities.webAssemblyThreads ? ' with parallel support.' : '; single-thread fallback.'}`
        : 'Local processing acceleration was not detected; checks may run slower.',
    }),
    createPreflightCheck({
      label: 'Advanced processing mode',
      status: capabilities.webGpu ? 'ready' : 'fallback',
      detail: capabilities.webGpu
        ? 'The fastest local processing mode is available.'
        : 'The app will use a compatible local fallback for checks.',
    }),
    createPreflightCheck({
      label: 'Persistent storage',
      status: capabilities.persistentStorage ? 'ready' : 'action-needed',
      detail: capabilities.persistentStorage
        ? `Browser reports persisted storage (${formatBytes(report.storage.usageBytes)} used of ${formatBytes(report.storage.quotaBytes)} quota).`
        : `Persistent storage is not granted yet (${formatBytes(report.storage.usageBytes)} used of ${formatBytes(report.storage.quotaBytes)} quota).`,
    }),
    createPreflightCheck({
      label: 'One trainer at a time',
      status: browserTraining.webLocks && browserTraining.broadcastChannel ? 'ready' : 'fallback',
      detail:
        browserTraining.webLocks && browserTraining.broadcastChannel
          ? 'The browser can coordinate one local trainer per voice model.'
          : 'Training can still warn locally, but another tab may not see the status immediately.',
    }),
    createPreflightCheck({
      label: 'Recovery storage',
      status: browserTraining.localStorage ? 'ready' : 'action-needed',
      detail: browserTraining.localStorage
        ? 'Training recovery can be saved on this device.'
        : 'Training recovery cannot be saved in this browser.',
    }),
  ];
}

export function summarizePersonalModelTrainingCompanion({
  models,
  installed,
  inspections,
  preferredModelId,
}: {
  readonly models: readonly ModelLifecycleModel[];
  readonly installed: readonly InstalledModelRecord[];
  readonly inspections: Readonly<Record<string, ManifestInspectionResult>>;
  readonly preferredModelId?: string;
}): PersonalModelTrainingCompanionSummaryV1 {
  const targetModelId =
    preferredModelId ?? installed[0]?.modelId ?? models.find((model) => model.manifestUrl)?.id;
  const modelLabel =
    targetModelId === undefined ? 'No speech model selected' : 'Exact speech model';
  if (targetModelId === undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'base-model-missing',
      detail: 'Install or inspect a speech model before local voice-model training can start.',
    });
  }

  const installedRecord = installed.find((record) => record.modelId === targetModelId);
  if (installedRecord?.trainingCompanion !== undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'installed',
      installedFileCount: installedRecord.trainingCompanion.files.length,
      requiredFileCount: installedRecord.trainingCompanion.files.length,
      requiredStorageBytes: installedRecord.trainingCompanion.requiredStorageBytes,
      detail: 'Training support files are installed for the exact active speech model.',
    });
  }

  const inspection = inspections[targetModelId];
  const requiredFileCount =
    inspection?.trainingCompanionFileCount ??
    (installedRecord === undefined
      ? 0
      : getTrainingCompanionFileKeys(installedRecord.manifest).length);
  const requiredStorageBytes =
    inspection?.trainingCompanionRequiredStorageBytes ??
    (installedRecord === undefined
      ? 0
      : getTrainingCompanionRequiredStorageBytes(installedRecord.manifest));

  if (preferredModelId !== undefined && installedRecord === undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'base-model-missing',
      requiredFileCount,
      requiredStorageBytes,
      detail:
        'Install the exact speech model before its optional training support files can be used.',
    });
  }

  if (inspection === undefined && installedRecord === undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'checking',
      detail: 'Checking the speech model for optional training support files.',
    });
  }

  if (requiredFileCount > 0) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'available-not-installed',
      requiredFileCount,
      requiredStorageBytes,
      detail:
        'This speech model declares optional training support files, but they are not installed yet.',
    });
  }

  return createTrainingCompanionSummary({
    modelLabel,
    status: 'not-declared',
    detail: 'This speech model does not declare optional training support files.',
  });
}

export function buildPersonalModelReadinessTasks(
  report: TrainingReadinessCoverageReportV1 | null,
): readonly PersonalModelReadinessTaskV1[] {
  if (report === null) {
    return [
      createReadinessTask({
        label: 'Record accepted enrollment takes',
        status: 'missing',
        actual: 0,
        required: 1,
        missing: 1,
        detail:
          'Save accepted enrollment takes locally to unlock detailed missing-recording tasks.',
      }),
    ];
  }

  if (report.missingRequirements.length === 0) {
    return [
      createReadinessTask({
        label: 'Training coverage',
        status: 'complete',
        actual: report.totals.acceptedUtterances,
        required: report.policy.minAcceptedUtterances,
        missing: 0,
        detail: 'Accepted takes meet the current browser training-readiness policy.',
      }),
    ];
  }

  return report.missingRequirements.slice(0, 6).map((requirement) =>
    createReadinessTask({
      label: requirement.label,
      status: 'missing',
      actual: requirement.actual,
      required: requirement.required,
      missing: requirement.missing,
      detail: `${requirement.label} needs ${formatNumber(requirement.missing)} more ${requirement.code.includes('duration') ? 'seconds' : 'items'}.`,
    }),
  );
}

export function buildPersonalModelTrainingReadinessView({
  card,
  readinessReport,
  readinessTasks,
  capabilityChecks,
  trainingCompanion,
  recordingHref,
  trainingHref,
}: {
  readonly card: PersonalModelProfileCardV1;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
  readonly recordingHref: string;
  readonly trainingHref: string;
}): PersonalModelTrainingReadinessViewV1 {
  const recordingMissingTasks = readinessTasks.filter((task) => task.status === 'missing');
  const actionNeededChecks = capabilityChecks.filter((check) => check.status === 'action-needed');
  const fallbackChecks = capabilityChecks.filter((check) => check.status === 'fallback');
  const checkingChecks = capabilityChecks.filter((check) => check.status === 'checking');
  const browserSupport = summarizeBrowserSupport({
    actionNeededChecks,
    fallbackChecks,
    checkingChecks,
  });
  const trainingSupport = summarizeTrainingSupport(trainingCompanion);
  const blockers = buildTrainingReadinessBlockers({
    recordingMissingTasks,
    browserSupport,
    trainingSupport,
  });
  const isChecking =
    checkingChecks.length > 0 ||
    trainingCompanion.status === 'checking' ||
    (readinessReport === null && card.storage.acceptedUtterances > 0);
  const status: PersonalModelTrainingReadinessViewV1['status'] =
    blockers.length > 0 ? 'blocked' : isChecking ? 'checking' : 'ready';
  const needsRecording = recordingMissingTasks.length > 0;
  const primaryAction = needsRecording
    ? {
        kind: 'continue-recording' as const,
        label: 'Continue recording' as const,
        href: recordingHref,
        disabled: false,
      }
    : {
        kind: 'train' as const,
        label: 'Train model' as const,
        href: trainingHref,
        disabled: status !== 'ready',
      };

  const requiredFreeBytes =
    trainingCompanion.status === 'available-not-installed'
      ? trainingCompanion.requiredStorageBytes
      : 0;

  return {
    schemaVersion: 1,
    status,
    title: readinessTitle({ status, needsRecording }),
    summary: readinessSummary({ status, needsRecording, browserSupport, trainingSupport }),
    primaryAction,
    recording: {
      acceptedCount: card.storage.acceptedUtterances,
      acceptedDurationSeconds: card.storage.acceptedSeconds,
      requiredCount:
        readinessReport?.policy.minAcceptedUtterances ??
        Math.max(1, card.storage.acceptedUtterances),
      requiredDurationSeconds: readinessReport?.policy.minTotalDurationSeconds ?? 0,
      label: `${card.storage.acceptedUtterances.toLocaleString('en')} recordings · ${formatDurationSeconds(card.storage.acceptedSeconds)} active speech`,
    },
    storage: {
      requiredFreeBytes,
      label: formatTrainingStorageLabel(trainingCompanion),
      status:
        trainingSupport.status === 'blocked'
          ? 'blocked'
          : trainingSupport.status === 'checking'
            ? 'checking'
            : 'ready',
    },
    browserSupport,
    trainingSupport,
    blockers,
    details: {
      passedCheckCount: capabilityChecks.filter((check) => check.status === 'ready').length,
      fallbackCheckCount: fallbackChecks.length,
      actionNeededCheckCount: actionNeededChecks.length,
      recordingTaskCount: readinessTasks.length,
    },
    privacy: createPreflightPrivacy(),
  };
}

function formatTrainingStorageLabel(
  trainingCompanion: PersonalModelTrainingCompanionSummaryV1,
): string {
  if (trainingCompanion.status === 'checking') return 'Checking training support size';
  if (trainingCompanion.status === 'installed') {
    return '0 B needed';
  }
  if (trainingCompanion.status === 'available-not-installed') {
    return `${formatPreflightBytes(trainingCompanion.requiredStorageBytes)} needed for training support`;
  }
  if (trainingCompanion.status === 'base-model-missing') return 'Install the speech model first';
  return '0 B needed';
}

function summarizeBrowserSupport({
  actionNeededChecks,
  fallbackChecks,
  checkingChecks,
}: {
  readonly actionNeededChecks: readonly PersonalModelPreflightCheckV1[];
  readonly fallbackChecks: readonly PersonalModelPreflightCheckV1[];
  readonly checkingChecks: readonly PersonalModelPreflightCheckV1[];
}): PersonalModelTrainingReadinessViewV1['browserSupport'] {
  if (actionNeededChecks.length > 0) {
    return {
      label: 'Needs attention',
      status: 'blocked',
      detail:
        actionNeededChecks[0]?.detail ?? 'This browser needs one more local capability check.',
    };
  }
  if (checkingChecks.length > 0) {
    return {
      label: 'Checking',
      status: 'checking',
      detail: 'Checking local browser support without requesting microphone permission.',
    };
  }
  if (fallbackChecks.length > 0) {
    return {
      label: 'Supported with fallback',
      status: 'limited',
      detail: 'Training can use a compatible local fallback when faster browser support is absent.',
    };
  }
  return {
    label: 'Ready',
    status: 'ready',
    detail: 'Required local browser support is available.',
  };
}

function summarizeTrainingSupport(
  trainingCompanion: PersonalModelTrainingCompanionSummaryV1,
): PersonalModelTrainingReadinessViewV1['trainingSupport'] {
  if (trainingCompanion.status === 'checking') {
    return {
      label: 'Checking',
      status: 'checking',
      detail: trainingCompanion.detail,
    };
  }
  if (trainingCompanion.status === 'base-model-missing') {
    return {
      label: 'Speech model required',
      status: 'blocked',
      detail: trainingCompanion.detail,
    };
  }
  if (trainingCompanion.status === 'available-not-installed') {
    return {
      label: 'Install support files',
      status: 'blocked',
      detail: trainingCompanion.detail,
    };
  }
  if (trainingCompanion.status === 'not-declared') {
    return {
      label: 'Not needed',
      status: 'not-needed',
      detail: 'This speech model does not list separate training support files.',
    };
  }
  return {
    label: 'Ready',
    status: 'ready',
    detail: trainingCompanion.detail,
  };
}

function buildTrainingReadinessBlockers({
  recordingMissingTasks,
  browserSupport,
  trainingSupport,
}: {
  readonly recordingMissingTasks: readonly PersonalModelReadinessTaskV1[];
  readonly browserSupport: PersonalModelTrainingReadinessViewV1['browserSupport'];
  readonly trainingSupport: PersonalModelTrainingReadinessViewV1['trainingSupport'];
}): readonly PersonalModelTrainingReadinessBlockerV1[] {
  const blockers: PersonalModelTrainingReadinessBlockerV1[] = [];
  const firstRecordingTask = recordingMissingTasks[0];
  if (firstRecordingTask !== undefined) {
    blockers.push(
      createTrainingReadinessBlocker({
        id: 'recordings',
        label: 'More recordings needed',
        detail: firstRecordingTask.detail,
        nextAction: 'Continue recording accepted takes for this voice model.',
      }),
    );
  }
  if (trainingSupport.status === 'blocked') {
    blockers.push(
      createTrainingReadinessBlocker({
        id: 'training-support',
        label: trainingSupport.label,
        detail: trainingSupport.detail,
        nextAction:
          'Install the exact speech model and its local training support before training.',
      }),
    );
  }
  if (browserSupport.status === 'blocked') {
    blockers.push(
      createTrainingReadinessBlocker({
        id: 'browser-support',
        label: 'Browser support needed',
        detail: browserSupport.detail,
        nextAction: 'Use a supported secure browser or fix the listed browser setting.',
      }),
    );
  }
  if (
    blockers.length === 0 &&
    (browserSupport.status === 'checking' || trainingSupport.status === 'checking')
  ) {
    blockers.push(
      createTrainingReadinessBlocker({
        id: 'checking',
        label: 'Readiness checks still running',
        detail: 'The app is checking local browser and training-support state.',
        nextAction: 'Wait for the checks to finish before starting training.',
      }),
    );
  }
  return blockers.slice(0, 4);
}

function createTrainingReadinessBlocker({
  id,
  label,
  detail,
  nextAction,
}: {
  readonly id: PersonalModelTrainingReadinessBlockerV1['id'];
  readonly label: string;
  readonly detail: string;
  readonly nextAction: string;
}): PersonalModelTrainingReadinessBlockerV1 {
  return { schemaVersion: 1, id, label, detail, nextAction, privacy: createPreflightPrivacy() };
}

function readinessTitle({
  status,
  needsRecording,
}: {
  readonly status: PersonalModelTrainingReadinessViewV1['status'];
  readonly needsRecording: boolean;
}): PersonalModelTrainingReadinessViewV1['title'] {
  if (status === 'ready') return 'Ready to train';
  if (status === 'checking') return 'Checking readiness';
  return needsRecording ? 'Continue recording' : 'Training not ready';
}

function readinessSummary({
  status,
  needsRecording,
  browserSupport,
  trainingSupport,
}: {
  readonly status: PersonalModelTrainingReadinessViewV1['status'];
  readonly needsRecording: boolean;
  readonly browserSupport: PersonalModelTrainingReadinessViewV1['browserSupport'];
  readonly trainingSupport: PersonalModelTrainingReadinessViewV1['trainingSupport'];
}): string {
  if (status === 'ready') {
    return 'Recording coverage, browser support, and local training files are ready.';
  }
  if (status === 'checking') {
    return 'Checking local browser support and training files.';
  }
  if (needsRecording) {
    return 'Record more accepted takes before training can start.';
  }
  if (trainingSupport.status === 'blocked') {
    return trainingSupport.detail;
  }
  return browserSupport.detail;
}

function formatDurationSeconds(value: number): string {
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)} sec`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return seconds === 0
    ? `${minutes.toString()} min`
    : `${minutes.toString()} min ${seconds.toString()} sec`;
}

function createPreflightCheck({
  label,
  status,
  detail,
}: {
  readonly label: string;
  readonly status: PersonalModelPreflightStatus;
  readonly detail: string;
}): PersonalModelPreflightCheckV1 {
  return { schemaVersion: 1, label, status, detail, privacy: createPreflightPrivacy() };
}

function createTrainingCompanionSummary({
  modelLabel,
  status,
  installedFileCount = 0,
  requiredFileCount = 0,
  requiredStorageBytes = 0,
  detail,
}: {
  readonly modelLabel: string;
  readonly status: PersonalModelTrainingCompanionSummaryV1['status'];
  readonly installedFileCount?: number;
  readonly requiredFileCount?: number;
  readonly requiredStorageBytes?: number;
  readonly detail: string;
}): PersonalModelTrainingCompanionSummaryV1 {
  return {
    schemaVersion: 1,
    modelLabel,
    status,
    installedFileCount,
    requiredFileCount,
    requiredStorageBytes,
    detail,
    privacy: createPreflightPrivacy(),
  };
}

function createReadinessTask({
  label,
  status,
  actual,
  required,
  missing,
  detail,
}: {
  readonly label: string;
  readonly status: PersonalModelReadinessTaskV1['status'];
  readonly actual: number;
  readonly required: number;
  readonly missing: number;
  readonly detail: string;
}): PersonalModelReadinessTaskV1 {
  return {
    schemaVersion: 1,
    label,
    status,
    actual,
    required,
    missing,
    detail,
    privacy: createPreflightPrivacy(),
  };
}

function createPreflightPrivacy(): PersonalModelPreflightPrivacyV1 {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    exposesRawPromptIds: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    telemetry: false,
    localOnly: true,
  };
}

function formatMilliseconds(value: number | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(2)} ms` : 'unknown latency';
}

export function formatPreflightBytes(value: number | undefined): string {
  if (typeof value !== 'number') return 'unknown';
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value.toString()} B`;
}

function formatBytes(value: number | undefined): string {
  return formatPreflightBytes(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
