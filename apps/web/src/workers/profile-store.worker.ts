import {
  EnrollmentProfileStore,
  createDefaultProfileStorageBackend,
  encodePcm16Wav,
  requestPersistentProfileStorage,
  summarizeTrainingJobPromptIdentitySplitPlan,
  summarizeTrainingJobRevision,
  type ActiveEnrollmentProfileStateV1,
  type EnrollmentCaptureMetadataV1,
  type EnrollmentProfileActivationReviewV1,
  type EnrollmentProfileExportPackageV1,
  type EnrollmentProfileSummaryV1,
  type EnrollmentUtteranceV1,
  type ProfileStorageBackend,
  type ProfileStorageBackendKind,
  type TrainingJobPromptIdentitySplitSummaryV1,
  type TrainingJobRevisionSummaryV1,
  type PortableSpeechModelImportSmokeContextV1,
  type PortableSpeechModelImportSmokeResultV1,
  type PortableSpeechModelImportSummaryV1,
  type TrainingJobRevisionVerificationResultV1,
} from '@speech/profile-manager';
import { importPortableSpeechModelArchive } from '@speech/portable-model';
import type { ExactBaseModelIdentityV1, VocabularyStoreSnapshotV1 } from '@speech/protocol';
import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
  PromptIdentitySplitConfigV1,
} from '@speech/enrollment';

export type ProfileStoreWorkerRequest =
  | { readonly type: 'LOAD_PROFILE'; readonly requestId: string; readonly profileId: string }
  | {
      readonly type: 'ENABLE_PROFILE';
      readonly requestId: string;
      readonly profileId: string;
      readonly activationReview?: EnrollmentProfileActivationReviewV1;
    }
  | { readonly type: 'ROLLBACK_PROFILE'; readonly requestId: string }
  | { readonly type: 'EXPORT_PROFILE'; readonly requestId: string; readonly profileId: string }
  | {
      readonly type: 'IMPORT_PROFILE';
      readonly requestId: string;
      readonly profilePackage: EnrollmentProfileExportPackageV1;
      readonly overwriteExisting: boolean;
    }
  | {
      readonly type: 'IMPORT_PORTABLE_SPEECH_MODEL';
      readonly requestId: string;
      readonly envelopeBytes: ArrayBuffer;
      readonly expectedBaseModel: ExactBaseModelIdentityV1;
      readonly passphrase?: string;
      readonly overwriteExisting: boolean;
      readonly importId?: string;
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
      readonly customVocabularyEntryIds?: readonly string[];
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
  | {
      readonly type: 'BUILD_TRAINING_JOB_PROMPT_SPLIT';
      readonly requestId: string;
      readonly jobId: string;
      readonly config?: PromptIdentitySplitConfigV1;
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
      readonly type: 'PROFILE_STORE_PORTABLE_IMPORT_COMPLETE';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly summary: PortableSpeechModelImportSummaryV1;
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
      readonly type: 'PROFILE_STORE_TRAINING_JOB_PROMPT_SPLIT_READY';
      readonly requestId: string;
      readonly backendKind: ProfileStorageBackendKind;
      readonly persistentStorageGranted: boolean;
      readonly activeState: ActiveEnrollmentProfileStateV1;
      readonly split: TrainingJobPromptIdentitySplitSummaryV1;
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
        const activeState = await store.enableProfile({
          profileId: message.profileId,
          ...(message.activationReview === undefined
            ? {}
            : { activationReview: message.activationReview }),
        });
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
      case 'IMPORT_PORTABLE_SPEECH_MODEL': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const archive = await importPortableSpeechModelArchive(
          new Uint8Array(message.envelopeBytes),
          message.passphrase === undefined ? {} : { passphrase: message.passphrase },
        );
        const summary = await store.importPortableSpeechModel({
          archive,
          expectedBaseModel: message.expectedBaseModel,
          overwriteExisting: message.overwriteExisting,
          ...(message.importId === undefined ? {} : { importId: message.importId }),
          smokeTest: runPortableSpeechModelImportSmoke,
        });
        post({
          type: 'PROFILE_STORE_PORTABLE_IMPORT_COMPLETE',
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
          ...(message.customVocabularyEntryIds === undefined
            ? {}
            : { customVocabularyEntryIds: message.customVocabularyEntryIds }),
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
      case 'BUILD_TRAINING_JOB_PROMPT_SPLIT': {
        const { store, backendKind, persistentStorageGranted } = await getStoreContext();
        const split = await store.buildTrainingJobPromptIdentitySplit({
          jobId: message.jobId,
          ...(message.config === undefined ? {} : { config: message.config }),
        });
        post({
          type: 'PROFILE_STORE_TRAINING_JOB_PROMPT_SPLIT_READY',
          requestId: message.requestId,
          backendKind,
          persistentStorageGranted,
          activeState: await store.getActiveProfileState(),
          split: summarizeTrainingJobPromptIdentitySplitPlan(split),
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

async function runPortableSpeechModelImportSmoke(
  context: PortableSpeechModelImportSmokeContextV1,
): Promise<PortableSpeechModelImportSmokeResultV1> {
  for (const vector of context.testVectors) {
    const bytes = await context.readStagedFile(vector.path);
    if (bytes.byteLength !== vector.sizeBytes) {
      throw new Error('Portable speech model runtime smoke vector size does not match metadata.');
    }
    if (vector.mediaType === 'application/json') {
      JSON.parse(new TextDecoder().decode(bytes));
    }
  }
  return {
    schemaVersion: 1,
    smokeType: 'portable-speechmodel-import-runtime-smoke',
    status: 'passed',
    vectorCount: context.testVectors.length,
    checkedAt: new Date().toISOString(),
    warnings: [],
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      containsPrivateVocabularyTerms: false,
      localOnly: true,
    },
  };
}

function post(message: ProfileStoreWorkerResponse): void {
  self.postMessage(message);
}
