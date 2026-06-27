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
      label: 'Dedicated workers',
      status: capabilities.webWorkers && workerBenchmark.supported ? 'ready' : 'action-needed',
      detail:
        capabilities.webWorkers && workerBenchmark.supported
          ? `Worker round-trip benchmark passed (${formatMilliseconds(workerBenchmark.medianRoundTripMs)} median).`
          : 'Dedicated worker support or the round-trip benchmark is unavailable.',
    }),
    createPreflightCheck({
      label: 'Shared memory path',
      status:
        capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer ? 'ready' : 'fallback',
      detail:
        capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer
          ? 'Cross-origin isolation and SharedArrayBuffer are available.'
          : 'Transferable-buffer fallback will be used because shared memory is unavailable.',
    }),
    createPreflightCheck({
      label: 'WASM acceleration',
      status: capabilities.webAssemblySimd ? 'ready' : 'fallback',
      detail: capabilities.webAssemblySimd
        ? `WASM SIMD available${capabilities.webAssemblyThreads ? ' with thread support.' : '; single-thread fallback.'}`
        : 'WASM SIMD was not detected; local inference/training may be slower.',
    }),
    createPreflightCheck({
      label: 'WebGPU provider',
      status: capabilities.webGpu ? 'ready' : 'fallback',
      detail: capabilities.webGpu
        ? 'WebGPU device creation succeeded for runtime provider selection.'
        : `Using ${report.recommendedProvider} provider fallback for runtime checks.`,
    }),
    createPreflightCheck({
      label: 'Persistent storage',
      status: capabilities.persistentStorage ? 'ready' : 'action-needed',
      detail: capabilities.persistentStorage
        ? `Browser reports persisted storage (${formatBytes(report.storage.usageBytes)} used of ${formatBytes(report.storage.quotaBytes)} quota).`
        : `Persistent storage is not granted yet (${formatBytes(report.storage.usageBytes)} used of ${formatBytes(report.storage.quotaBytes)} quota).`,
    }),
    createPreflightCheck({
      label: 'Cross-tab training lock',
      status: browserTraining.webLocks && browserTraining.broadcastChannel ? 'ready' : 'fallback',
      detail:
        browserTraining.webLocks && browserTraining.broadcastChannel
          ? 'Web Locks and BroadcastChannel can coordinate one local trainer per profile.'
          : 'Training can still warn locally, but cross-tab lock/status coordination is limited.',
    }),
    createPreflightCheck({
      label: 'Recovery storage',
      status: browserTraining.localStorage ? 'ready' : 'action-needed',
      detail: browserTraining.localStorage
        ? 'Browser-training recovery checkpoints can persist in localStorage.'
        : 'Browser-training recovery checkpoints cannot persist because localStorage is unavailable.',
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
  const modelLabel = targetModelId === undefined ? 'No base model selected' : 'Exact base model';
  if (targetModelId === undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'base-model-missing',
      detail: 'Install or inspect a base model before browser personal-model training can start.',
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
      detail: 'Training companion files are installed for the exact active base-model version.',
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
      detail: 'Install the exact base model before its optional training companion can be used.',
    });
  }

  if (inspection === undefined && installedRecord === undefined) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'checking',
      detail: 'Inspecting model manifest for optional browser-training companion files.',
    });
  }

  if (requiredFileCount > 0) {
    return createTrainingCompanionSummary({
      modelLabel,
      status: 'available-not-installed',
      requiredFileCount,
      requiredStorageBytes,
      detail:
        'This base model declares optional browser-training companion files, but they are not installed yet.',
    });
  }

  return createTrainingCompanionSummary({
    modelLabel,
    status: 'not-declared',
    detail: 'This base model does not declare optional browser-training companion files.',
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
