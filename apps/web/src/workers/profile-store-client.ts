import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentCaptureMetadataV1,
  EnrollmentProfileExportPackageV1,
  EnrollmentProfileSummaryV1,
  EnrollmentUtteranceV1,
  ProfileStorageBackendKind,
} from '@speech/profile-manager';
import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
} from '@speech/enrollment';
import profileStoreWorkerUrl from './profile-store.worker.ts?worker&url';
import type { ProfileStoreWorkerRequest, ProfileStoreWorkerResponse } from './profile-store.worker';

export interface ProfileStoreLoadResult {
  readonly backendKind: ProfileStorageBackendKind;
  readonly persistentStorageGranted: boolean;
  readonly activeState: ActiveEnrollmentProfileStateV1;
  readonly summary?: EnrollmentProfileSummaryV1;
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
  readonly timeoutMs?: number;
}

export interface DeleteProfileOptions {
  readonly profileId: string;
  readonly timeoutMs?: number;
}

export type LoadProfileOptions = DeleteProfileOptions;
export type EnableProfileOptions = DeleteProfileOptions;
export interface ImportProfileOptions {
  readonly profilePackage: EnrollmentProfileExportPackageV1;
  readonly overwriteExisting?: boolean;
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

export function enableEnrollmentProfile(
  options: EnableProfileOptions,
): Promise<ProfileStoreActiveResult> {
  return requestProfileStore(
    {
      type: 'ENABLE_PROFILE',
      requestId: createRequestId('enable'),
      profileId: options.profileId,
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

export function importEnrollmentProfile(
  options: ImportProfileOptions,
): Promise<ProfileStoreImportResult> {
  return requestProfileStore(
    {
      type: 'IMPORT_PROFILE',
      requestId: createRequestId('import'),
      profilePackage: options.profilePackage,
      overwriteExisting: options.overwriteExisting ?? false,
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
