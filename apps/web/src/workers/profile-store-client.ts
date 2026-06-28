import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentCaptureMetadataV1,
  EnrollmentProfileActivationReviewV1,
  EnrollmentProfileExportPackageV1,
  EnrollmentProfileImportMode,
  EnrollmentProfileImportResultV1,
  EnrollmentProfileSummaryV1,
  EnrollmentUtteranceV1,
  PortableSpeechModelExportMode,
  PortableSpeechModelExportSummaryV1,
  PortableSpeechModelImportSummaryV1,
  ProfileStorageBackendKind,
  SpeechProfileManifestMigrationResultV1,
  TrainingJobPromptIdentitySplitSummaryV1,
  TrainingJobRevisionSummaryV1,
  TrainingJobRevisionVerificationResultV1,
} from '@speech/profile-manager';
import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
  PromptIdentitySplitConfigV1,
} from '@speech/enrollment';
import type { ExactBaseModelIdentityV1, VocabularyStoreSnapshotV1 } from '@speech/protocol';
import profileStoreWorkerUrl from './profile-store.worker.ts?worker&url';
import type { ProfileStoreWorkerRequest, ProfileStoreWorkerResponse } from './profile-store.worker';

export interface ProfileStoreLoadResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
  readonly activeState: ActiveEnrollmentProfileStateV1;
  readonly summary?: EnrollmentProfileSummaryV1;
}

export interface ProfileStoreListResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
  readonly activeState: ActiveEnrollmentProfileStateV1;
  readonly summaries: readonly EnrollmentProfileSummaryV1[];
}

export interface ProfileStoreSaveResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
  readonly activeState: ActiveEnrollmentProfileStateV1;
  readonly utterance: EnrollmentUtteranceV1;
  readonly summary: EnrollmentProfileSummaryV1;
}

export interface ProfileStoreActiveResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
  readonly activeState: ActiveEnrollmentProfileStateV1;
}

export interface ProfileStoreExportResult extends ProfileStoreActiveResult {
  readonly profilePackage: EnrollmentProfileExportPackageV1;
}

export interface ProfileStoreImportResult extends ProfileStoreActiveResult {
  readonly summary: EnrollmentProfileSummaryV1;
  readonly importResult: EnrollmentProfileImportResultV1;
}

export interface ProfileStoreRenameResult extends ProfileStoreActiveResult {
  readonly summary: EnrollmentProfileSummaryV1;
}

export interface ProfileStorePortableImportResult extends ProfileStoreActiveResult {
  readonly summary: PortableSpeechModelImportSummaryV1;
}

export interface ProfileStorePortableExportResult extends ProfileStoreActiveResult {
  readonly envelopeBytes: ArrayBuffer;
  readonly summary: PortableSpeechModelExportSummaryV1;
}

export interface ProfileStoreSpeechProfileMigrationResult extends ProfileStoreActiveResult {
  readonly migration: SpeechProfileManifestMigrationResultV1;
}

export interface ProfileStoreTrainingJobFreezeResult extends ProfileStoreActiveResult {
  readonly revision: TrainingJobRevisionSummaryV1;
}

export interface ProfileStoreTrainingJobVerificationResult extends ProfileStoreActiveResult {
  readonly verification: TrainingJobRevisionVerificationResultV1;
}

export interface ProfileStoreTrainingJobPromptSplitResult extends ProfileStoreActiveResult {
  readonly split: TrainingJobPromptIdentitySplitSummaryV1;
}

export interface SaveAcceptedEnrollmentTakeOptions {
  readonly profileId: string;
  readonly profileDisplayName: string;
  readonly sentenceBankVersion: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly referenceText: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly pcm: ArrayBuffer;
  readonly sampleRateHz: number;
  readonly durationMs: number;
  readonly capture: EnrollmentCaptureMetadataV1;
  readonly quality: EnrollmentQualityReportV1;
  readonly acceptedBy: 'manual' | 'automatic';
  readonly customVocabularyEntryIds?: readonly string[];
  readonly timeoutMs?: number;
}

export interface DeleteProfileOptions {
  readonly profileId: string;
  readonly timeoutMs?: number;
}

export type LoadProfileOptions = DeleteProfileOptions;
export interface EnableProfileOptions extends DeleteProfileOptions {
  readonly activationReview?: EnrollmentProfileActivationReviewV1;
}
export interface FreezeTrainingJobRevisionOptions {
  readonly profileId: string;
  readonly vocabularyStore?: VocabularyStoreSnapshotV1;
  readonly jobId?: string;
  readonly timeoutMs?: number;
}

export interface VerifyTrainingJobRevisionOptions {
  readonly jobId: string;
  readonly vocabularyStore?: VocabularyStoreSnapshotV1;
  readonly timeoutMs?: number;
}

export interface BuildTrainingJobPromptSplitOptions {
  readonly jobId: string;
  readonly config?: PromptIdentitySplitConfigV1;
  readonly timeoutMs?: number;
}

export interface ImportProfileOptions {
  readonly profilePackage: EnrollmentProfileExportPackageV1;
  readonly overwriteExisting?: boolean;
  readonly mode?: EnrollmentProfileImportMode;
  readonly targetProfileId?: string;
  readonly targetDisplayName?: string;
  readonly timeoutMs?: number;
}

export interface RenameProfileOptions {
  readonly profileId: string;
  readonly displayName: string;
  readonly timeoutMs?: number;
}

export interface ImportPortableSpeechModelOptions {
  readonly envelopeBytes: ArrayBuffer;
  readonly expectedBaseModel: ExactBaseModelIdentityV1;
  readonly passphrase?: string;
  readonly overwriteExisting?: boolean;
  readonly importId?: string;
  readonly timeoutMs?: number;
}

export interface ExportPortableSpeechModelOptions {
  readonly profileId: string;
  readonly exactBaseModel: ExactBaseModelIdentityV1;
  readonly sourceAppVersion: string;
  readonly mode?: PortableSpeechModelExportMode;
  readonly passphrase?: string;
  readonly timeoutMs?: number;
}

export interface MigrateSpeechProfileManifestOptions {
  readonly profileId: string;
  readonly sourcePath?: readonly string[];
  readonly targetPath?: readonly string[];
  readonly timeoutMs?: number;
}

let activeProfileStoreWorker: Worker | null = null;

export function createProfileStoreWorker(): Worker {
  return new Worker(profileStoreWorkerUrl, {
    type: 'module',
    name: 'speech-profile-store-worker',
  });
}

function getProfileStoreWorker(): Worker {
  activeProfileStoreWorker ??= createProfileStoreWorker();
  return activeProfileStoreWorker;
}

function disposeProfileStoreWorker(worker: Worker): void {
  worker.terminate();
  if (activeProfileStoreWorker === worker) {
    activeProfileStoreWorker = null;
  }
}

export function loadEnrollmentProfile(
  options: LoadProfileOptions,
): Promise<ProfileStoreLoadResult> {
  return requestProfileStore(
    {
      type: 'LOAD_PROFILE',
      requestId: createRequestId('load'),
      profileId: options.profileId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_READY') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      ...(response.summary === undefined ? {} : { summary: response.summary }),
    };
  });
}

export function listEnrollmentProfiles(
  options: { readonly timeoutMs?: number } = {},
): Promise<ProfileStoreListResult> {
  return requestProfileStore(
    {
      type: 'LIST_PROFILES',
      requestId: createRequestId('list'),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_LIST_READY') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      summaries: response.summaries,
    };
  });
}

export function renameEnrollmentProfile(
  options: RenameProfileOptions,
): Promise<ProfileStoreRenameResult> {
  return requestProfileStore(
    {
      type: 'RENAME_PROFILE',
      requestId: createRequestId('rename'),
      profileId: options.profileId,
      displayName: options.displayName,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_RENAME_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      summary: response.summary,
    };
  });
}

export function enableEnrollmentProfile(
  options: EnableProfileOptions,
): Promise<ProfileStoreActiveResult> {
  return requestProfileStore(
    {
      type: 'ENABLE_PROFILE',
      requestId: createRequestId('enable'),
      profileId: options.profileId,
      ...(options.activationReview === undefined
        ? {}
        : { activationReview: options.activationReview }),
    },
    options.timeoutMs,
  ).then(activeResultFromResponse);
}

export function rollbackEnrollmentProfile(
  options: { readonly timeoutMs?: number } = {},
): Promise<ProfileStoreActiveResult> {
  return requestProfileStore(
    {
      type: 'ROLLBACK_PROFILE',
      requestId: createRequestId('rollback'),
    },
    options.timeoutMs,
  ).then(activeResultFromResponse);
}

export function deactivateEnrollmentProfile(
  options: EnableProfileOptions,
): Promise<ProfileStoreActiveResult> {
  return requestProfileStore(
    {
      type: 'DEACTIVATE_PROFILE',
      requestId: createRequestId('deactivate'),
      profileId: options.profileId,
    },
    options.timeoutMs,
  ).then(activeResultFromResponse);
}

export function exportEnrollmentProfile(
  options: EnableProfileOptions,
): Promise<ProfileStoreExportResult> {
  return requestProfileStore(
    {
      type: 'EXPORT_PROFILE',
      requestId: createRequestId('export'),
      profileId: options.profileId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_EXPORT_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      profilePackage: response.profilePackage,
    };
  });
}

export function exportPortableSpeechModel(
  options: ExportPortableSpeechModelOptions,
): Promise<ProfileStorePortableExportResult> {
  return requestProfileStore(
    {
      type: 'EXPORT_PORTABLE_SPEECH_MODEL',
      requestId: createRequestId('portable-export'),
      profileId: options.profileId,
      exactBaseModel: options.exactBaseModel,
      sourceAppVersion: options.sourceAppVersion,
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_PORTABLE_EXPORT_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      envelopeBytes: response.envelopeBytes,
      summary: response.summary,
    };
  });
}

export function importEnrollmentProfile(
  options: ImportProfileOptions,
): Promise<ProfileStoreImportResult> {
  return requestProfileStore(
    {
      type: 'IMPORT_PROFILE',
      requestId: createRequestId('import'),
      profilePackage: options.profilePackage,
      overwriteExisting: options.overwriteExisting ?? false,
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.targetProfileId === undefined
        ? {}
        : { targetProfileId: options.targetProfileId }),
      ...(options.targetDisplayName === undefined
        ? {}
        : { targetDisplayName: options.targetDisplayName }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_IMPORT_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      summary: response.summary,
      importResult: response.importResult,
    };
  });
}

export function importPortableSpeechModel(
  options: ImportPortableSpeechModelOptions,
): Promise<ProfileStorePortableImportResult> {
  const message: ProfileStoreWorkerRequest = {
    type: 'IMPORT_PORTABLE_SPEECH_MODEL',
    requestId: createRequestId('portable-import'),
    envelopeBytes: options.envelopeBytes,
    expectedBaseModel: options.expectedBaseModel,
    overwriteExisting: options.overwriteExisting ?? false,
    ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    ...(options.importId === undefined ? {} : { importId: options.importId }),
  };
  return requestProfileStore(message, options.timeoutMs, [message.envelopeBytes]).then(
    (response) => {
      if (response.type !== 'PROFILE_STORE_PORTABLE_IMPORT_COMPLETE') {
        throw new Error(`Unexpected profile-store response: ${response.type}`);
      }
      return {
        backendKind: response.backendKind,
        persistentStorageGranted: response.persistentStorageGranted,
        activeState: response.activeState,
        summary: response.summary,
      };
    },
  );
}

export function migrateSpeechProfileManifestToV2(
  options: MigrateSpeechProfileManifestOptions,
): Promise<ProfileStoreSpeechProfileMigrationResult> {
  return requestProfileStore(
    {
      type: 'MIGRATE_SPEECH_PROFILE_MANIFEST_TO_V2',
      requestId: createRequestId('migrate-profile-manifest'),
      profileId: options.profileId,
      ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
      ...(options.targetPath === undefined ? {} : { targetPath: options.targetPath }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_SPEECH_PROFILE_MIGRATION_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      migration: response.migration,
    };
  });
}

export function saveAcceptedEnrollmentTake(
  options: SaveAcceptedEnrollmentTakeOptions,
): Promise<ProfileStoreSaveResult> {
  const message: ProfileStoreWorkerRequest = {
    type: 'SAVE_ACCEPTED_TAKE',
    requestId: createRequestId('save'),
    profileId: options.profileId,
    profileDisplayName: options.profileDisplayName,
    sentenceBankVersion: options.sentenceBankVersion,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    referenceText: options.referenceText,
    language: options.language,
    voiceCondition: options.voiceCondition,
    pcm: options.pcm,
    sampleRateHz: options.sampleRateHz,
    durationMs: options.durationMs,
    capture: options.capture,
    quality: options.quality,
    acceptedBy: options.acceptedBy,
    ...(options.customVocabularyEntryIds === undefined
      ? {}
      : { customVocabularyEntryIds: options.customVocabularyEntryIds }),
  };
  return requestProfileStore(message, options.timeoutMs, [message.pcm]).then((response) => {
    if (response.type !== 'PROFILE_STORE_SAVE_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      utterance: response.utterance,
      summary: response.summary,
    };
  });
}

export function freezeTrainingJobRevision(
  options: FreezeTrainingJobRevisionOptions,
): Promise<ProfileStoreTrainingJobFreezeResult> {
  return requestProfileStore(
    {
      type: 'FREEZE_TRAINING_JOB_REVISION',
      requestId: createRequestId('freeze-training-job'),
      profileId: options.profileId,
      ...(options.vocabularyStore === undefined
        ? {}
        : { vocabularyStore: options.vocabularyStore }),
      ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_TRAINING_JOB_FROZEN') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      revision: response.revision,
    };
  });
}

export function verifyTrainingJobRevision(
  options: VerifyTrainingJobRevisionOptions,
): Promise<ProfileStoreTrainingJobVerificationResult> {
  return requestProfileStore(
    {
      type: 'VERIFY_TRAINING_JOB_REVISION',
      requestId: createRequestId('verify-training-job'),
      jobId: options.jobId,
      ...(options.vocabularyStore === undefined
        ? {}
        : { vocabularyStore: options.vocabularyStore }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_TRAINING_JOB_VERIFIED') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      verification: response.verification,
    };
  });
}

export function buildTrainingJobPromptSplit(
  options: BuildTrainingJobPromptSplitOptions,
): Promise<ProfileStoreTrainingJobPromptSplitResult> {
  return requestProfileStore(
    {
      type: 'BUILD_TRAINING_JOB_PROMPT_SPLIT',
      requestId: createRequestId('training-job-prompt-split'),
      jobId: options.jobId,
      ...(options.config === undefined ? {} : { config: options.config }),
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_TRAINING_JOB_PROMPT_SPLIT_READY') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
      split: response.split,
    };
  });
}

export function deleteEnrollmentProfile(
  options: DeleteProfileOptions,
): Promise<ProfileStoreActiveResult> {
  return requestProfileStore(
    {
      type: 'DELETE_PROFILE',
      requestId: createRequestId('delete'),
      profileId: options.profileId,
    },
    options.timeoutMs,
  ).then((response) => {
    if (response.type !== 'PROFILE_STORE_DELETE_COMPLETE') {
      throw new Error(`Unexpected profile-store response: ${response.type}`);
    }
    return {
      backendKind: response.backendKind,
      persistentStorageGranted: response.persistentStorageGranted,
      activeState: response.activeState,
    };
  });
}

function activeResultFromResponse(response: ProfileStoreWorkerResponse): ProfileStoreActiveResult {
  if (response.type !== 'PROFILE_STORE_ACTIVE_PROFILE_UPDATED') {
    throw new Error(`Unexpected profile-store response: ${response.type}`);
  }
  return {
    backendKind: response.backendKind,
    persistentStorageGranted: response.persistentStorageGranted,
    activeState: response.activeState,
  };
}

function requestProfileStore(
  message: ProfileStoreWorkerRequest,
  timeoutMs = 5_000,
  transfer: Transferable[] = [],
): Promise<ProfileStoreWorkerResponse> {
  const worker = getProfileStoreWorker();
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup(true);
      reject(new Error('Timed out while accessing the enrollment profile store.'));
    }, timeoutMs);

    function cleanup(terminateWorker = false) {
      globalThis.clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (terminateWorker) {
        disposeProfileStoreWorker(worker);
      }
    }

    function handleMessage(event: MessageEvent<ProfileStoreWorkerResponse>) {
      const response = event.data;
      if (response.requestId !== message.requestId) return;
      cleanup();
      if (response.type === 'PROFILE_STORE_ERROR') {
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
    worker.postMessage(message, transfer);
  });
}

function createRequestId(operation: string): string {
  return `profile-store-${operation}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
