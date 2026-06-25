import {
  EnrollmentProfileStore,
  createDefaultProfileStorageBackend,
  encodePcm16Wav,
  requestPersistentProfileStorage,
  summarizeTrainingJobRevision,
  type ActiveEnrollmentProfileStateV1,
  type EnrollmentCaptureMetadataV1,
  type EnrollmentProfileExportPackageV1,
  type EnrollmentProfileSummaryV1,
  type EnrollmentUtteranceV1,
  type ProfileStorageBackend,
  type ProfileStorageBackendKind,
  type TrainingJobRevisionSummaryV1,
  type TrainingJobRevisionVerificationResultV1,
} from '@speech/profile-manager';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';
import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
} from '@speech/enrollment';

export type ProfileStoreWorkerRequest =
  | { readonly type: 'LOAD_PROFILE'; readonly requestId: string; readonly profileId: string }
  | { readonly type: 'ENABLE_PROFILE'; readonly requestId: string; readonly profileId: string }
  | { readonly type: 'ROLLBACK_PROFILE'; readonly requestId: string }
  | { readonly type: 'EXPORT_PROFILE'; readonly requestId: string; readonly profileId: string }
  | {
      readonly type: 'IMPORT_PROFILE';
      readonly requestId: string;
      readonly profilePackage: EnrollmentProfileExportPackageV1;
      readonly overwriteExisting: boolean;
    }
  | {
      readonly type: 'SAVE_ACCEPTED_TAKE';
      readonly requestId: string;
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
    }
  | {
      readonly type: 'FREEZE_TRAINING_JOB_REVISION';
      readonly requestId: string;
      readonly profileId: string;
      readonly vocabularyStore?: VocabularyStoreSnapshotV1;
      readonly jobId?: string;
    }
  | {
      readonly type: 'VERIFY_TRAINING_JOB_REVISION';
      readonly requestId: string;
      readonly jobId: string;
      readonly vocabularyStore?: VocabularyStoreSnapshotV1;
    }
  | { readonly type: 'DELETE_PROFILE'; readonly requestId: string; readonly profileId: string };

export type ProfileStoreWorkerResponse =
  | {
      readonly type: 'PROFILE_STORE_READY';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly summary?: EnrollmentProfileSummaryV1;
    }
  | {
      readonly type: 'PROFILE_STORE_SAVE_COMPLETE';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly utterance: EnrollmentUtteranceV1;
      readonly summary: EnrollmentProfileSummaryV1;
    }
  | {
      readonly type: 'PROFILE_STORE_DELETE_COMPLETE';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly profileId: string;
    }
  | {
      readonly type: 'PROFILE_STORE_ACTIVE_PROFILE_UPDATED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
    }
  | {
      readonly type: 'PROFILE_STORE_EXPORT_COMPLETE';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly profilePackage: EnrollmentProfileExportPackageV1;
    }
  | {
      readonly type: 'PROFILE_STORE_IMPORT_COMPLETE';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly summary: EnrollmentProfileSummaryV1;
    }
  | {
      readonly type: 'PROFILE_STORE_TRAINING_JOB_FROZEN';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly revision: TrainingJobRevisionSummaryV1;
    }
  | {
      readonly type: 'PROFILE_STORE_TRAINING_JOB_VERIFIED';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly verification: TrainingJobRevisionVerificationResultV1;
    }
  | {
      readonly type: 'PROFILE_STORE_ERROR';
      readonly requestId: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

let backendPromise: Promise<ProfileStorageBackend> | null = null;
let persistentStoragePromise: Promise<boolean> | null = null;

self.addEventListener('message', (event: MessageEvent<ProfileStoreWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(message: ProfileStoreWorkerRequest): Promise<void> {
  try {
    switch (message.type) {
      case 'LOAD_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const summary = await store.getProfileSummary(message.profileId);
        post({
          type: 'PROFILE_STORE_READY',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          ...(summary === undefined ? {} : { summary }),
        });
        return;
      }
      case 'ENABLE_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const activeState = await store.enableProfile({ profileId: message.profileId });
        post({
          type: 'PROFILE_STORE_ACTIVE_PROFILE_UPDATED',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState,
        });
        return;
      }
      case 'ROLLBACK_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const activeState = await store.rollbackActiveProfile();
        post({
          type: 'PROFILE_STORE_ACTIVE_PROFILE_UPDATED',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState,
        });
        return;
      }
      case 'EXPORT_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        post({
          type: 'PROFILE_STORE_EXPORT_COMPLETE',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          profilePackage: await store.exportProfile(message.profileId),
        });
        return;
      }
      case 'IMPORT_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const summary = await store.importProfile({
          profilePackage: message.profilePackage,
          overwriteExisting: message.overwriteExisting,
        });
        post({
          type: 'PROFILE_STORE_IMPORT_COMPLETE',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          summary,
        });
        return;
      }
      case 'SAVE_ACCEPTED_TAKE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const existing = await store.getProfileSummary(message.profileId);
        const wavBytes = encodePcm16Wav(new Float32Array(message.pcm), message.sampleRateHz);
        const utterance = await store.saveEnrollmentUtterance({
          profileId: message.profileId,
          profileDisplayName: message.profileDisplayName,
          sentenceBankVersion: message.sentenceBankVersion,
          promptId: message.promptId,
          promptVersion: message.promptVersion,
          referenceText: message.referenceText,
          language: message.language,
          voiceCondition: message.voiceCondition,
          repetitionIndex: (existing?.profile.enrollment.acceptedUtterances ?? 0) + 1,
          wavBytes,
          sampleRateHz: message.sampleRateHz,
          durationMs: message.durationMs,
          capture: message.capture,
          quality: message.quality,
          acceptedBy: message.acceptedBy,
        });
        const summary = await store.getProfileSummary(message.profileId);
        if (summary === undefined) {
          throw new Error('Profile summary was unavailable after saving the accepted take.');
        }
        post({
          type: 'PROFILE_STORE_SAVE_COMPLETE',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          utterance,
          summary,
        });
        return;
      }
      case 'FREEZE_TRAINING_JOB_REVISION': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const revision = await store.freezeTrainingJobRevision({
          profileId: message.profileId,
          ...(message.vocabularyStore === undefined
            ? {}
            : { vocabularyStore: message.vocabularyStore }),
          ...(message.jobId === undefined ? {} : { jobId: message.jobId }),
        });
        post({
          type: 'PROFILE_STORE_TRAINING_JOB_FROZEN',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          revision: summarizeTrainingJobRevision(revision),
        });
        return;
      }
      case 'VERIFY_TRAINING_JOB_REVISION': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const verification = await store.verifyTrainingJobRevisionSources({
          jobId: message.jobId,
          ...(message.vocabularyStore === undefined
            ? {}
            : { vocabularyStore: message.vocabularyStore }),
        });
        post({
          type: 'PROFILE_STORE_TRAINING_JOB_VERIFIED',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          verification,
        });
        return;
      }
      case 'DELETE_PROFILE': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        await store.deleteProfile(message.profileId);
        post({
          type: 'PROFILE_STORE_DELETE_COMPLETE',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          profileId: message.profileId,
        });
        return;
      }
    }
  } catch (error) {
    post({
      type: 'PROFILE_STORE_ERROR',
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

async function getPersistentStorageGranted(): Promise<boolean> {
  persistentStoragePromise ??= requestPersistentProfileStorage();
  return persistentStoragePromise;
}

function post(message: ProfileStoreWorkerResponse): void {
  self.postMessage(message);
}
