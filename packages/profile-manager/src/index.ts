import { validateVocabularyStoreSnapshot } from '@speech/context-bias';
import {
  buildCtcForcedAlignment,
  buildPromptIdentitySplitPlan,
  buildTrainingReadinessCoverageReport,
  parseCustomVocabularyPromptId,
  summarizePromptIdentitySplitPlan,
  type CtcForcedAlignmentOptionsV1,
  type CtcForcedAlignmentResultV1,
  type EnrollmentQualityReportV1,
  type EnrollmentSentenceLanguage,
  type EnrollmentVoiceCondition,
  type PromptIdentitySplitConfigV1,
  type PromptIdentitySplitPlanV1,
  type PromptIdentitySplitReportV1,
  type TrainingReadinessAcceptedUtteranceV1,
  type TrainingReadinessCoverageReportV1,
  type TrainingReadinessIdentityOptions,
  type TrainingReadinessPolicyV1,
} from '@speech/enrollment';
import {
  encodeFloat16Array,
  extractLogMelFeatures,
  resolveLogMelFeatureConfig,
  type LogMelFeatureConfig,
  type ResolvedLogMelFeatureConfig,
} from '@speech/features';
import {
  migrateSpeechProfileManifestV1ToV2,
  parseSpeechProfileManifest,
  parseSpeechProfileManifestV2,
  type ExactBaseModelIdentityV1,
  type ProfileFileRef,
  type SpeechProfileManifestV2,
  type VocabularyRevisionV1,
  type VocabularyStoreSnapshotV1,
} from '@speech/protocol';
import {
  validatePortableSpeechModelManifestV1,
  type ImportedPortableSpeechModelArchiveV1,
  type ImportedPortableSpeechModelFileV1,
  type PortableSpeechModelManifestV1,
} from '@speech/portable-model';

export type ProfileStorageBackendKind = 'opfs' | 'memory';
export type ProfileBinaryFile = ArrayBuffer | ArrayBufferView;
export type EnrollmentAudioFormat = 'pcm_s16le_wav';
export type EnrollmentAcceptedBy = 'automatic' | 'manual';

export interface ProfileBaseModelIdentity {
  readonly id: string;
  readonly version: string;
  readonly manifestSha256: string;
  readonly graphContractSha256: string;
}

export interface EnrollmentProfileManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly baseModel?: ProfileBaseModelIdentity;
  readonly enrollment: {
    readonly acceptedUtterances: number;
    readonly acceptedSeconds: number;
    readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
    readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
    readonly sentenceBankVersion: string;
  };
  readonly privacy: {
    readonly containsRawAudio: boolean;
    readonly exportEncrypted: boolean;
    readonly localOnly: true;
  };
}

export interface EnrollmentUtteranceAudioV1 {
  readonly path: string;
  readonly format: EnrollmentAudioFormat;
  readonly sampleRateHz: number;
  readonly channels: 1;
  readonly sha256: string;
  readonly durationMs: number;
  readonly sizeBytes: number;
}

export interface EnrollmentCaptureMetadataV1 {
  readonly requestedConstraints: Readonly<Record<string, unknown>>;
  readonly actualSettings: Readonly<Record<string, unknown>>;
  readonly userMicrophoneLabel?: string;
}

export interface EnrollmentUtteranceV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly profileId: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly referenceText: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly repetitionIndex: number;
  readonly customVocabularyEntryIds?: readonly string[];
  readonly audio: EnrollmentUtteranceAudioV1;
  readonly capture: EnrollmentCaptureMetadataV1;
  readonly quality: EnrollmentQualityReportV1;
  readonly acceptedBy: EnrollmentAcceptedBy;
  readonly createdAt: string;
}

export interface EnrollmentProfileChecksumsV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly updatedAt: string;
  readonly files: Readonly<Record<string, { readonly sha256: string; readonly sizeBytes: number }>>;
}

export interface EnrollmentProfileSummaryV1 {
  readonly profile: EnrollmentProfileManifestV1;
  readonly utterances: readonly EnrollmentUtteranceV1[];
  readonly checksums: EnrollmentProfileChecksumsV1;
}

export interface ActiveEnrollmentProfileStateV1 {
  readonly schemaVersion: 1;
  readonly activeProfileId?: string;
  readonly previousProfileId?: string;
  readonly updatedAt: string;
}

export interface ProfileExportFileV1 {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly base64: string;
}

export interface EnrollmentProfileExportPackageV1 {
  readonly schemaVersion: 1;
  readonly packageType: 'speech-enrollment-profile-export';
  readonly exportedAt: string;
  readonly profileId: string;
  readonly profile: EnrollmentProfileManifestV1;
  readonly utterances: readonly EnrollmentUtteranceV1[];
  readonly checksums: EnrollmentProfileChecksumsV1;
  readonly files: Readonly<Record<string, ProfileExportFileV1>>;
  readonly privacy: {
    readonly containsRawAudio: boolean;
    readonly containsTranscriptText: boolean;
    readonly containsRawProfileData: true;
    readonly exportEncrypted: false;
    readonly localOnly: true;
  };
  readonly warnings: readonly string[];
}

export interface EnrollmentProfileActivationReviewV1 {
  readonly schemaVersion: 1;
  readonly decisionType: 'personal-model-activation-decision';
  readonly status: string;
  readonly activationAllowed: boolean;
  readonly automaticActivationAllowed: boolean;
  readonly advancedOverrideAccepted: boolean;
  readonly hardGatePassed: boolean;
  readonly softGatePassed: boolean;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsCaseIds: false;
    readonly containsRawProfileId: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly localOnly: true;
  };
}

export interface EnableEnrollmentProfileInput {
  readonly profileId: string;
  readonly expectedBaseModel?: ProfileBaseModelIdentity;
  readonly activationReview?: EnrollmentProfileActivationReviewV1;
}

export type EnrollmentProfileImportMode = 'dedupe' | 'replace' | 'import-as-new';

export interface ImportEnrollmentProfileInput {
  readonly profilePackage: EnrollmentProfileExportPackageV1;
  readonly overwriteExisting?: boolean;
  readonly mode?: EnrollmentProfileImportMode;
  readonly targetProfileId?: string;
  readonly targetDisplayName?: string;
}

export interface EnrollmentProfileImportResultV1 {
  readonly schemaVersion: 1;
  readonly operation: 'imported-new' | 'replaced-existing' | 'deduped-existing';
  readonly displayName: string;
  readonly nameCollisionResolved: boolean;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsRawProfileId: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export interface EnrollmentProfileImportCompletionV1 {
  readonly schemaVersion: 1;
  readonly operation: 'imported-new' | 'replaced-existing' | 'deduped-existing';
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
  readonly displayName: string;
  readonly nameCollisionResolved: boolean;
  readonly summary: EnrollmentProfileSummaryV1;
}

export interface RenameEnrollmentProfileInput {
  readonly profileId: string;
  readonly displayName: string;
}

export function redactEnrollmentProfileImportResult(
  result: EnrollmentProfileImportCompletionV1,
): EnrollmentProfileImportResultV1 {
  return {
    schemaVersion: result.schemaVersion,
    operation: result.operation,
    displayName: result.displayName,
    nameCollisionResolved: result.nameCollisionResolved,
    privacy: createProfileImportResultPrivacy(),
  };
}

export interface PortableSpeechModelImportSmokeResultV1 {
  readonly schemaVersion: 1;
  readonly smokeType: 'portable-speechmodel-import-runtime-smoke';
  readonly status: 'passed';
  readonly vectorCount: number;
  readonly checkedAt: string;
  readonly warnings: readonly string[];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export interface PortableSpeechModelImportSmokeContextV1 {
  readonly bundleId: string;
  readonly manifest: PortableSpeechModelManifestV1;
  readonly expectedBaseModel: ExactBaseModelIdentityV1;
  readonly testVectors: readonly ProfileFileRef[];
  readonly files: readonly ImportedPortableSpeechModelFileV1[];
  readonly readStagedFile: (path: string) => Promise<Uint8Array>;
}

export interface ImportPortableSpeechModelInput {
  readonly archive: ImportedPortableSpeechModelArchiveV1;
  readonly expectedBaseModel: ExactBaseModelIdentityV1;
  readonly smokeTest: (
    context: PortableSpeechModelImportSmokeContextV1,
  ) => Promise<PortableSpeechModelImportSmokeResultV1>;
  readonly smokeTimeoutMs?: number;
  readonly overwriteExisting?: boolean;
  readonly importId?: string;
}

export interface PortableSpeechModelStoredFileV1 extends ProfileFileRef {
  readonly storagePath: string;
}

export interface PortableSpeechModelImportRecordV1 {
  readonly schemaVersion: 1;
  readonly recordType: 'portable-speechmodel-import';
  readonly bundleId: string;
  readonly importId: string;
  readonly importedAt: string;
  readonly manifest: PortableSpeechModelManifestV1;
  readonly baseModel: ExactBaseModelIdentityV1;
  readonly files: readonly PortableSpeechModelStoredFileV1[];
  readonly summary: {
    readonly encrypted: boolean;
    readonly fileCount: number;
    readonly expandedBytes: number;
    readonly adaptationType: PortableSpeechModelManifestV1['adaptation']['type'];
    readonly testVectorCount: number;
  };
  readonly smokeTest: PortableSpeechModelImportSmokeResultV1;
  readonly privacy: {
    readonly localOnly: true;
    readonly defaultExportIncludesImportedPortableModel: false;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: true;
    readonly containsPrivateVocabularyTerms: boolean;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface PortableSpeechModelImportSummaryV1 {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly importId: string;
  readonly displayName: string;
  readonly importedAt: string;
  readonly baseModel: {
    readonly id: string;
    readonly version: string;
    readonly exactCompatibility: true;
  };
  readonly adaptationType: PortableSpeechModelManifestV1['adaptation']['type'];
  readonly vocabulary: {
    readonly included: boolean;
    readonly containsPrivateTerms: false;
  };
  readonly fileCount: number;
  readonly expandedBytes: number;
  readonly smokeTest: {
    readonly status: 'passed';
    readonly vectorCount: number;
    readonly warningCount: number;
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export type SpeechProfileManifestMigrationStatusV1 =
  | 'migrated'
  | 'recovered-existing-v2'
  | 'already-v2'
  | 'replaced-invalid-v2';

export interface MigrateSpeechProfileManifestToV2Input {
  readonly profileId: string;
  readonly sourcePath?: readonly string[];
  readonly targetPath?: readonly string[];
}

export interface SpeechProfileManifestMigrationResultV1 {
  readonly schemaVersion: 1;
  readonly migrationType: 'speech-profile-manifest-v1-to-v2';
  readonly status: SpeechProfileManifestMigrationStatusV1;
  readonly migratedAt: string;
  readonly sourceSchemaVersion: 1 | 2;
  readonly targetSchemaVersion: 2;
  readonly manifest: {
    readonly adaptationType: SpeechProfileManifestV2['adaptation']['type'];
    readonly baseModel: {
      readonly id: string;
      readonly version: string;
    };
    readonly languageCount: number;
    readonly activationGatePassed: boolean;
    readonly warningCount: number;
    readonly cliResidualAdapterPreserved: boolean;
  };
  readonly recovery: {
    readonly deletedTemporaryFiles: number;
    readonly reusedExistingV2: boolean;
    readonly replacedInvalidV2: boolean;
  };
  readonly downgrade: {
    readonly v1ManifestRetained: boolean;
    readonly v2ManifestFileName: 'profile.v2.json';
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsRawProfileId: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly exposesStoragePaths: false;
    readonly localOnly: true;
  };
}

export interface FreezeTrainingJobRevisionInput {
  readonly profileId: string;
  readonly vocabularyStore?: VocabularyStoreSnapshotV1;
  readonly jobId?: string;
}

export interface VerifyTrainingJobRevisionInput {
  readonly jobId: string;
  readonly vocabularyStore?: VocabularyStoreSnapshotV1;
}

export interface TrainingJobEnrollmentUtteranceRefV1 {
  readonly id: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly repetitionIndex: number;
  readonly durationMs: number;
  readonly qualityStatus: EnrollmentQualityReportV1['status'];
  readonly selectedVocabularyEntryIds: readonly string[];
  readonly audio: {
    readonly path: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly metadataPath: string;
  readonly metadataSha256: string;
}

export interface TrainingJobEnrollmentRevisionV1 {
  readonly schemaVersion: 1;
  readonly profileUpdatedAt: string;
  readonly sentenceBankVersion: string;
  readonly acceptedUtterances: number;
  readonly acceptedSeconds: number;
  readonly utterances: readonly TrainingJobEnrollmentUtteranceRefV1[];
  readonly selectedVocabulary?: {
    readonly vocabularyRevisionSha256: string;
    readonly selectedEntryIds: readonly string[];
    readonly selectedEntryCount: number;
    readonly utteranceCount: number;
  };
  readonly revisionSha256: string;
}

export interface TrainingJobVocabularyRevisionV1 {
  readonly schemaVersion: 1;
  readonly storeRevision: number;
  readonly activeSetIds: readonly string[];
  readonly activeEntryCount: number;
  readonly revision: VocabularyRevisionV1;
  readonly revisionSha256: string;
}

export interface TrainingJobRevisionV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly enrollment: TrainingJobEnrollmentRevisionV1;
  readonly vocabulary?: TrainingJobVocabularyRevisionV1;
  readonly privacy: {
    readonly localOnly: true;
    readonly defaultExportIncludesRevision: false;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: boolean;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface TrainingJobRevisionSummaryV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly enrollment: {
    readonly acceptedUtterances: number;
    readonly acceptedSeconds: number;
    readonly revisionSha256: string;
  };
  readonly vocabulary?: {
    readonly storeRevision: number;
    readonly activeEntryCount: number;
    readonly revisionSha256: string;
    readonly selectedEntryCount: number;
    readonly selectedUtteranceCount: number;
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly localOnly: true;
  };
}

export type TrainingJobRevisionSourceStatus = 'match' | 'changed' | 'missing';

export interface TrainingJobRevisionVerificationResultV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly profileId: string;
  readonly checkedAt: string;
  readonly ok: boolean;
  readonly enrollment: {
    readonly status: TrainingJobRevisionSourceStatus;
    readonly expectedRevisionSha256: string;
    readonly actualRevisionSha256?: string;
  };
  readonly vocabulary?: {
    readonly status: TrainingJobRevisionSourceStatus;
    readonly expectedRevisionSha256: string;
    readonly actualRevisionSha256?: string;
  };
  readonly errors: readonly string[];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly localOnly: true;
  };
}

export interface TrainingJobPromptIdentitySplitInput {
  readonly jobId: string;
  readonly config?: PromptIdentitySplitConfigV1;
}

export interface TrainingJobPromptIdentitySplitPlanV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly profileId: string;
  readonly enrollmentRevisionSha256: string;
  readonly split: PromptIdentitySplitPlanV1;
  readonly privacy: {
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: true;
    readonly exposesRawVocabularyEntryIds: true;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface TrainingJobPromptIdentitySplitSummaryV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly profileId: string;
  readonly enrollmentRevisionSha256: string;
  readonly split: PromptIdentitySplitReportV1;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface PrepareTrainingJobFeatureShardsInput {
  readonly jobId: string;
  readonly featureSetId?: string;
  readonly featureConfig?: LogMelFeatureConfig;
  readonly splitConfig?: PromptIdentitySplitConfigV1;
  readonly maxFramesPerShard?: number;
}

export interface TrainingJobFeatureShardUtteranceV1 {
  readonly utteranceId: string;
  readonly promptId: string;
  readonly split: 'train' | 'validation' | 'test';
  readonly frameOffset: number;
  readonly frameCount: number;
  readonly durationMs: number;
  readonly audioSha256: string;
  readonly selectedVocabularyEntryIds: readonly string[];
}

export interface TrainingJobFeatureShardV1 {
  readonly schemaVersion: 1;
  readonly shardId: string;
  readonly split: 'train' | 'validation' | 'test';
  readonly path: string;
  readonly dtype: 'float16-le';
  readonly frameCount: number;
  readonly melBinCount: number;
  readonly utteranceCount: number;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly utterances: readonly TrainingJobFeatureShardUtteranceV1[];
}

export interface TrainingJobFeatureSplitTotalsV1 {
  readonly utterances: number;
  readonly frames: number;
  readonly shards: number;
  readonly durationSeconds: number;
  readonly sizeBytes: number;
}

export interface TrainingJobFeatureSelectedVocabularySplitTotalsV1 {
  readonly utterances: number;
  readonly frames: number;
}

export interface TrainingJobFeatureSelectedVocabularyTotalsV1 {
  readonly vocabularyRevisionSha256?: string;
  readonly selectedEntryCount: number;
  readonly utterances: number;
  readonly frames: number;
  readonly splits: Readonly<
    Record<'train' | 'validation' | 'test', TrainingJobFeatureSelectedVocabularySplitTotalsV1>
  >;
}

export interface TrainingJobFeaturePreparationManifestV1 {
  readonly schemaVersion: 1;
  readonly manifestType: 'training-job-feature-shards';
  readonly jobId: string;
  readonly profileId: string;
  readonly featureSetId: string;
  readonly createdAt: string;
  readonly enrollmentRevisionSha256: string;
  readonly promptSplit: {
    readonly seed: string;
    readonly assignmentSha256: string;
    readonly totals: PromptIdentitySplitPlanV1['totals'];
  };
  readonly feature: ResolvedLogMelFeatureConfig;
  readonly dtype: 'float16-le';
  readonly maxFramesPerShard: number;
  readonly totals: {
    readonly utterances: number;
    readonly frames: number;
    readonly shards: number;
    readonly durationSeconds: number;
    readonly sizeBytes: number;
    readonly splits: Readonly<
      Record<'train' | 'validation' | 'test', TrainingJobFeatureSplitTotalsV1>
    >;
  };
  readonly selectedVocabulary: TrainingJobFeatureSelectedVocabularyTotalsV1;
  readonly shards: readonly TrainingJobFeatureShardV1[];
  readonly manifestSha256: string;
  readonly privacy: {
    readonly localOnly: true;
    readonly defaultExportIncludesFeatures: false;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly referencesFeatureTensorFiles: true;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: true;
    readonly exposesRawVocabularyEntryIds: true;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface TrainingJobFeaturePreparationSummaryV1 {
  readonly schemaVersion: 1;
  readonly manifestType: 'training-job-feature-shards';
  readonly jobId: string;
  readonly profileId: string;
  readonly featureSetId: string;
  readonly createdAt: string;
  readonly enrollmentRevisionSha256: string;
  readonly manifestSha256: string;
  readonly dtype: 'float16-le';
  readonly feature: Pick<
    ResolvedLogMelFeatureConfig,
    'sampleRateHz' | 'melBinCount' | 'frameLengthMs' | 'frameShiftMs' | 'fftSize' | 'snipEdges'
  >;
  readonly totals: TrainingJobFeaturePreparationManifestV1['totals'];
  readonly selectedVocabulary: TrainingJobFeaturePreparationManifestV1['selectedVocabulary'];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface VerifyTrainingJobFeatureShardsInput {
  readonly jobId: string;
  readonly featureSetId: string;
}

export interface DeleteTrainingJobFeatureShardsInput {
  readonly jobId: string;
  readonly featureSetId: string;
}

export interface TrainingJobFeatureShardVerificationResultV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly featureSetId: string;
  readonly checkedAt: string;
  readonly ok: boolean;
  readonly manifestStatus: 'match' | 'changed';
  readonly expectedManifestSha256: string;
  readonly actualManifestSha256: string;
  readonly shards: readonly {
    readonly shardId: string;
    readonly status: 'match' | 'changed' | 'missing';
    readonly expectedSha256: string;
    readonly actualSha256?: string;
  }[];
  readonly errors: readonly string[];
  readonly privacy: TrainingJobFeaturePreparationSummaryV1['privacy'];
}

export interface TrainingJobCtcAlignmentInputV1 {
  readonly utteranceId: string;
  readonly targetTokenIds: readonly number[];
  readonly frameLogits: Float32Array | readonly number[];
  readonly frameCount: number;
  readonly vocabularySize: number;
  readonly blankId: number;
}

export interface PrepareTrainingJobFrameLabelsInput {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId?: string;
  readonly alignments: readonly TrainingJobCtcAlignmentInputV1[];
  readonly options?: CtcForcedAlignmentOptionsV1;
}

export interface TrainingJobFrameLabelsUtteranceV1 {
  readonly utteranceId: string;
  readonly promptId: string;
  readonly split: 'train' | 'validation' | 'test';
  readonly featureShardId: string;
  readonly frameOffset: number;
  readonly frameCount: number;
  readonly status: CtcForcedAlignmentResultV1['summary']['status'];
  readonly usableFrameCount: number;
  readonly excludedFrameCount: number;
  readonly blankFrameCount: number;
  readonly lowConfidenceFrameCount: number;
  readonly meanFrameConfidence: number;
  readonly meanTokenConfidence: number | null;
  readonly selectedVocabularyEntryIds: readonly string[];
}

export interface TrainingJobFrameLabelsSplitTotalsV1 {
  readonly utterances: number;
  readonly alignedUtterances: number;
  readonly lowConfidenceExcludedUtterances: number;
  readonly frames: number;
  readonly usableFrames: number;
  readonly excludedFrames: number;
}

export interface TrainingJobFrameLabelsSelectedVocabularySplitTotalsV1 {
  readonly utterances: number;
  readonly frames: number;
  readonly usableFrames: number;
  readonly excludedFrames: number;
}

export interface TrainingJobFrameLabelsSelectedVocabularyTotalsV1 {
  readonly vocabularyRevisionSha256?: string;
  readonly selectedEntryCount: number;
  readonly utterances: number;
  readonly frames: number;
  readonly usableFrames: number;
  readonly excludedFrames: number;
  readonly splits: Readonly<
    Record<'train' | 'validation' | 'test', TrainingJobFrameLabelsSelectedVocabularySplitTotalsV1>
  >;
}

export interface TrainingJobFrameLabelsManifestV1 {
  readonly schemaVersion: 1;
  readonly manifestType: 'training-job-frame-labels';
  readonly jobId: string;
  readonly profileId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
  readonly createdAt: string;
  readonly enrollmentRevisionSha256: string;
  readonly featureManifestSha256: string;
  readonly alignment: {
    readonly algorithmId: 'ctc-viterbi-forced-alignment-v1';
    readonly blankId: number;
    readonly vocabularySize: number;
    readonly options: Required<CtcForcedAlignmentOptionsV1>;
  };
  readonly labelFile: {
    readonly path: string;
    readonly mediaType: 'application/json';
    readonly sizeBytes: number;
    readonly sha256: string;
  };
  readonly totals: {
    readonly utterances: number;
    readonly alignedUtterances: number;
    readonly lowConfidenceExcludedUtterances: number;
    readonly frames: number;
    readonly usableFrames: number;
    readonly excludedFrames: number;
    readonly splits: Readonly<
      Record<'train' | 'validation' | 'test', TrainingJobFrameLabelsSplitTotalsV1>
    >;
  };
  readonly selectedVocabulary: TrainingJobFrameLabelsSelectedVocabularyTotalsV1;
  readonly utterances: readonly TrainingJobFrameLabelsUtteranceV1[];
  readonly manifestSha256: string;
  readonly privacy: {
    readonly localOnly: true;
    readonly defaultExportIncludesFrameLabels: false;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsFrameLabels: true;
    readonly containsTokenIds: true;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: true;
    readonly exposesRawVocabularyEntryIds: true;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface TrainingJobFrameLabelsSummaryV1 {
  readonly schemaVersion: 1;
  readonly manifestType: 'training-job-frame-labels';
  readonly jobId: string;
  readonly profileId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
  readonly createdAt: string;
  readonly enrollmentRevisionSha256: string;
  readonly featureManifestSha256: string;
  readonly manifestSha256: string;
  readonly totals: TrainingJobFrameLabelsManifestV1['totals'];
  readonly selectedVocabulary: TrainingJobFrameLabelsManifestV1['selectedVocabulary'];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsFrameLabels: false;
    readonly containsTokenIds: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export interface VerifyTrainingJobFrameLabelsInput {
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
}

export type DeleteTrainingJobFrameLabelsInput = VerifyTrainingJobFrameLabelsInput;

export interface TrainingJobFrameLabelsVerificationResultV1 {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
  readonly checkedAt: string;
  readonly ok: boolean;
  readonly manifestStatus: 'match' | 'changed';
  readonly expectedManifestSha256: string;
  readonly actualManifestSha256: string;
  readonly labelFile: {
    readonly status: 'match' | 'changed' | 'missing';
    readonly expectedSha256: string;
    readonly actualSha256?: string;
  };
  readonly errors: readonly string[];
  readonly privacy: TrainingJobFrameLabelsSummaryV1['privacy'];
}

export interface SaveEnrollmentUtteranceInput {
  readonly profileId: string;
  readonly profileDisplayName: string;
  readonly sentenceBankVersion: string;
  readonly baseModel?: ProfileBaseModelIdentity;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly referenceText: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly repetitionIndex: number;
  readonly wavBytes: ProfileBinaryFile;
  readonly sampleRateHz: number;
  readonly durationMs: number;
  readonly capture: EnrollmentCaptureMetadataV1;
  readonly quality: EnrollmentQualityReportV1;
  readonly acceptedBy: EnrollmentAcceptedBy;
  readonly customVocabularyEntryIds?: readonly string[];
  readonly utteranceId?: string;
}

export interface ProfileStorageFileRecord {
  readonly path: readonly string[];
  readonly sizeBytes: number;
}

export interface ProfileStorageBackend {
  readonly kind: ProfileStorageBackendKind;
  putFile(path: readonly string[], bytes: ProfileBinaryFile): Promise<ProfileStorageFileRecord>;
  getFile(path: readonly string[]): Promise<ArrayBuffer | undefined>;
  deleteFile(path: readonly string[]): Promise<boolean>;
  listFiles(prefix?: readonly string[]): Promise<ProfileStorageFileRecord[]>;
  deleteDirectory(path: readonly string[]): Promise<void>;
}

export interface StorageManagerWithOpfs {
  readonly getDirectory?: () => Promise<OpfsDirectoryHandleLike>;
  readonly persist?: () => Promise<boolean>;
}

export interface OpfsDirectoryHandleLike {
  readonly getDirectoryHandle: (
    name: string,
    options?: { readonly create?: boolean },
  ) => Promise<OpfsDirectoryHandleLike>;
  readonly getFileHandle: (
    name: string,
    options?: { readonly create?: boolean },
  ) => Promise<OpfsFileHandleLike>;
  readonly removeEntry: (name: string, options?: { readonly recursive?: boolean }) => Promise<void>;
  readonly entries?: () => AsyncIterableIterator<[string, OpfsHandleLike]>;
  readonly [Symbol.asyncIterator]?: () => AsyncIterableIterator<[string, OpfsHandleLike]>;
}

export interface OpfsFileHandleLike {
  readonly getFile: () => Promise<Blob>;
  readonly createWritable: () => Promise<OpfsWritableFileStreamLike>;
}

export interface OpfsWritableFileStreamLike {
  readonly write: (data: BlobPart) => Promise<void>;
  readonly close: () => Promise<void>;
}

type OpfsHandleLike = OpfsDirectoryHandleLike | OpfsFileHandleLike;

const profileStoragePrefix = '__speech-profile-storage';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class InMemoryProfileStorageBackend implements ProfileStorageBackend {
  readonly kind = 'memory' as const;

  private readonly files = new Map<string, ArrayBuffer>();

  async putFile(
    path: readonly string[],
    bytes: ProfileBinaryFile,
  ): Promise<ProfileStorageFileRecord> {
    const normalizedPath = normalizePath(path);
    const body = toOwnedArrayBuffer(bytes);
    this.files.set(storageKey(normalizedPath), body);
    return { path: normalizedPath, sizeBytes: body.byteLength };
  }

  async getFile(path: readonly string[]): Promise<ArrayBuffer | undefined> {
    return this.files.get(storageKey(normalizePath(path)))?.slice(0);
  }

  async deleteFile(path: readonly string[]): Promise<boolean> {
    return this.files.delete(storageKey(normalizePath(path)));
  }

  async listFiles(prefix: readonly string[] = []): Promise<ProfileStorageFileRecord[]> {
    const normalizedPrefix = normalizePath(prefix, { allowEmpty: true });
    const prefixKey = storageKey(normalizedPrefix);
    const records: ProfileStorageFileRecord[] = [];
    for (const [key, bytes] of this.files.entries()) {
      if (prefixKey.length > 0 && key !== prefixKey && !key.startsWith(`${prefixKey}/`)) {
        continue;
      }
      records.push({ path: parseStorageKey(key), sizeBytes: bytes.byteLength });
    }
    return sortFileRecords(records);
  }

  async deleteDirectory(path: readonly string[]): Promise<void> {
    const normalizedPath = normalizePath(path);
    const prefix = storageKey(normalizedPath);
    for (const key of [...this.files.keys()]) {
      if (key === prefix || key.startsWith(`${prefix}/`)) {
        this.files.delete(key);
      }
    }
  }
}

export class OpfsProfileStorageBackend implements ProfileStorageBackend {
  readonly kind = 'opfs' as const;

  constructor(private readonly root: OpfsDirectoryHandleLike) {}

  static async create(storageManager: StorageManagerWithOpfs): Promise<OpfsProfileStorageBackend> {
    if (typeof storageManager.getDirectory !== 'function') {
      throw new Error('OPFS is not available in this browser context.');
    }
    return new OpfsProfileStorageBackend(await storageManager.getDirectory());
  }

  async putFile(
    path: readonly string[],
    bytes: ProfileBinaryFile,
  ): Promise<ProfileStorageFileRecord> {
    const normalizedPath = normalizePath(path);
    const body = toOwnedArrayBuffer(bytes);
    const { directory, fileName } = await this.parentDirectory(normalizedPath, true);
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(body.slice(0));
    } finally {
      await writable.close();
    }
    return { path: normalizedPath, sizeBytes: body.byteLength };
  }

  async getFile(path: readonly string[]): Promise<ArrayBuffer | undefined> {
    try {
      const normalizedPath = normalizePath(path);
      const { directory, fileName } = await this.parentDirectory(normalizedPath, false);
      const fileHandle = await directory.getFileHandle(fileName);
      return fileHandle.getFile().then((file) => file.arrayBuffer());
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  async deleteFile(path: readonly string[]): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      const { directory, fileName } = await this.parentDirectory(normalizedPath, false);
      await directory.removeEntry(fileName);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  async listFiles(prefix: readonly string[] = []): Promise<ProfileStorageFileRecord[]> {
    const records: ProfileStorageFileRecord[] = [];
    const storageRoot = await this.storageRoot(false);
    if (storageRoot === undefined) return records;
    const normalizedPrefix = normalizePath(prefix, { allowEmpty: true });
    await collectOpfsFiles(storageRoot, [], normalizedPrefix, records);
    return sortFileRecords(records);
  }

  async deleteDirectory(path: readonly string[]): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (normalizedPath.length === 0) return;
    try {
      const parentPath = normalizedPath.slice(0, -1);
      const directoryName = encodeSegment(normalizedPath[normalizedPath.length - 1] ?? '');
      const parent = await this.directoryFor(parentPath, false);
      await parent.removeEntry(directoryName, { recursive: true });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async parentDirectory(
    path: readonly string[],
    create: boolean,
  ): Promise<{ readonly directory: OpfsDirectoryHandleLike; readonly fileName: string }> {
    if (path.length === 0) throw new Error('Profile storage path must include a file name.');
    const directory = await this.directoryFor(path.slice(0, -1), create);
    const lastSegment = path[path.length - 1];
    if (lastSegment === undefined)
      throw new Error('Profile storage path must include a file name.');
    return { directory, fileName: encodeSegment(lastSegment) };
  }

  private async directoryFor(
    path: readonly string[],
    create: boolean,
  ): Promise<OpfsDirectoryHandleLike> {
    let directory = await this.storageRoot(create);
    if (directory === undefined) throw notFoundError();
    for (const segment of normalizePath(path, { allowEmpty: true })) {
      directory = await directory.getDirectoryHandle(encodeSegment(segment), { create });
    }
    return directory;
  }

  private async storageRoot(create: boolean): Promise<OpfsDirectoryHandleLike | undefined> {
    try {
      return await this.root.getDirectoryHandle(profileStoragePrefix, { create });
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }
}

export async function createDefaultProfileStorageBackend(
  options: { readonly storageManager?: StorageManagerWithOpfs | null } = {},
): Promise<ProfileStorageBackend> {
  const storageManager =
    options.storageManager === null
      ? undefined
      : (options.storageManager ?? globalThis.navigator?.storage);
  if (storageManager !== undefined && typeof storageManager.getDirectory === 'function') {
    return OpfsProfileStorageBackend.create(storageManager);
  }
  return new InMemoryProfileStorageBackend();
}

export async function requestPersistentProfileStorage(
  storageManager: StorageManagerWithOpfs | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (typeof storageManager?.persist !== 'function') return false;
  return storageManager.persist();
}

export class EnrollmentProfileStore {
  constructor(
    private readonly backend: ProfileStorageBackend,
    private readonly options: {
      readonly digest?: (bytes: ArrayBuffer) => Promise<string>;
      readonly now?: () => string;
      readonly randomId?: () => string;
    } = {},
  ) {}

  async saveEnrollmentUtterance(
    input: SaveEnrollmentUtteranceInput,
  ): Promise<EnrollmentUtteranceV1> {
    const profileId = normalizeSegment(input.profileId, 'profileId');
    const utteranceId = normalizeSegment(
      input.utteranceId ?? this.createUtteranceId(),
      'utteranceId',
    );
    const wavBytes = toOwnedArrayBuffer(input.wavBytes);
    const audioPath = profilePath(profileId, 'recordings', `${utteranceId}.wav`);
    const metadataPath = profilePath(profileId, 'utterances', `${utteranceId}.json`);
    const createdAt = this.options.now?.() ?? new Date().toISOString();
    const audioSha256 = await this.digest(wavBytes);
    const customVocabularyEntryIds = normalizeSelectedVocabularyEntryIds(
      input.customVocabularyEntryIds ?? [],
    );
    const utterance: EnrollmentUtteranceV1 = {
      schemaVersion: 1,
      id: utteranceId,
      profileId,
      promptId: normalizeSegment(input.promptId, 'promptId'),
      promptVersion: assertPositiveInteger(input.promptVersion, 'promptVersion'),
      referenceText: input.referenceText,
      language: input.language,
      voiceCondition: input.voiceCondition,
      repetitionIndex: assertPositiveInteger(input.repetitionIndex, 'repetitionIndex'),
      ...(customVocabularyEntryIds.length === 0 ? {} : { customVocabularyEntryIds }),
      audio: {
        path: pathToPortableString(audioPath),
        format: 'pcm_s16le_wav',
        sampleRateHz: assertPositiveInteger(input.sampleRateHz, 'sampleRateHz'),
        channels: 1,
        sha256: audioSha256,
        durationMs: assertNonNegativeNumber(input.durationMs, 'durationMs'),
        sizeBytes: wavBytes.byteLength,
      },
      capture: sanitizeCapture(input.capture),
      quality: input.quality,
      acceptedBy: input.acceptedBy,
      createdAt,
    };

    await writeFileAtomically(this.backend, audioPath, wavBytes);
    await writeJsonAtomically(this.backend, metadataPath, utterance);
    await this.rebuildProfileFiles(profileId, {
      displayName: input.profileDisplayName,
      sentenceBankVersion: input.sentenceBankVersion,
      ...(input.baseModel === undefined ? {} : { baseModel: input.baseModel }),
    });
    return utterance;
  }

  async getProfileSummary(profileId: string): Promise<EnrollmentProfileSummaryV1 | undefined> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    const profile = await this.readProfile(normalizedProfileId);
    if (profile === undefined) return undefined;
    return {
      profile,
      utterances: await this.listEnrollmentUtterances(normalizedProfileId),
      checksums:
        (await this.readChecksums(normalizedProfileId)) ??
        createEmptyChecksumIndex(normalizedProfileId, profile.updatedAt),
    };
  }

  async listProfileSummaries(): Promise<EnrollmentProfileSummaryV1[]> {
    const profileIds = new Set<string>();
    for (const file of await this.backend.listFiles(['profiles'])) {
      const profileId = file.path[1];
      if (profileId !== undefined) profileIds.add(profileId);
    }
    const summaries: EnrollmentProfileSummaryV1[] = [];
    for (const profileId of Array.from(profileIds).sort()) {
      const summary = await this.getProfileSummary(profileId);
      if (summary !== undefined) summaries.push(summary);
    }
    return summaries.sort((left, right) => {
      const updated = right.profile.updatedAt.localeCompare(left.profile.updatedAt);
      return updated === 0
        ? left.profile.displayName.localeCompare(right.profile.displayName)
        : updated;
    });
  }

  async renameProfile(input: RenameEnrollmentProfileInput): Promise<EnrollmentProfileSummaryV1> {
    const profileId = normalizeSegment(input.profileId, 'profileId');
    const summary = await this.getProfileSummary(profileId);
    if (summary === undefined) {
      throw new Error(`Cannot rename missing enrollment profile ${profileId}.`);
    }
    const displayName = resolveUniqueProfileDisplayName(
      normalizeProfileDisplayName(input.displayName),
      await this.listProfileSummaries(),
      profileId,
    );
    await this.rebuildProfileFiles(profileId, {
      displayName,
      sentenceBankVersion: summary.profile.enrollment.sentenceBankVersion,
      ...(summary.profile.baseModel === undefined ? {} : { baseModel: summary.profile.baseModel }),
    });
    const renamed = await this.getProfileSummary(profileId);
    if (renamed === undefined) {
      throw new Error(`Renamed profile ${profileId} is missing profile metadata.`);
    }
    return renamed;
  }

  async listEnrollmentUtterances(profileId: string): Promise<EnrollmentUtteranceV1[]> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    const files = await this.backend.listFiles(profilePath(normalizedProfileId, 'utterances'));
    const utterances: EnrollmentUtteranceV1[] = [];
    for (const file of files) {
      if (!file.path[file.path.length - 1]?.endsWith('.json')) continue;
      const bytes = await this.backend.getFile(file.path);
      if (bytes !== undefined) utterances.push(parseJson<EnrollmentUtteranceV1>(bytes));
    }
    return utterances.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getEnrollmentAudio(utterance: EnrollmentUtteranceV1): Promise<ArrayBuffer | undefined> {
    return this.backend.getFile(portablePathToSegments(utterance.audio.path));
  }

  async getActiveProfileState(): Promise<ActiveEnrollmentProfileStateV1> {
    const bytes = await this.backend.getFile(profileLifecyclePath('active-profile.json'));
    if (bytes === undefined) {
      return { schemaVersion: 1, updatedAt: this.options.now?.() ?? new Date().toISOString() };
    }
    return parseJson<ActiveEnrollmentProfileStateV1>(bytes);
  }

  async enableProfile(
    input: EnableEnrollmentProfileInput,
  ): Promise<ActiveEnrollmentProfileStateV1> {
    const profileId = normalizeSegment(input.profileId, 'profileId');
    const summary = await this.getProfileSummary(profileId);
    if (summary === undefined) {
      throw new Error(`Cannot enable missing enrollment profile ${profileId}.`);
    }
    if (input.expectedBaseModel !== undefined) {
      assertBaseModelCompatible(summary.profile.baseModel, input.expectedBaseModel, profileId);
    }
    if (input.activationReview !== undefined) {
      assertActivationReviewAllowsProfileEnable(input.activationReview);
    }
    const existing = await this.getActiveProfileState();
    const previousProfileId =
      existing.activeProfileId === undefined || existing.activeProfileId === profileId
        ? existing.previousProfileId
        : existing.activeProfileId;
    const nextState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: profileId,
      ...(previousProfileId === undefined ? {} : { previousProfileId }),
      updatedAt: this.options.now?.() ?? new Date().toISOString(),
    };
    await writeJsonAtomically(this.backend, profileLifecyclePath('active-profile.json'), nextState);
    return nextState;
  }

  async rollbackActiveProfile(): Promise<ActiveEnrollmentProfileStateV1> {
    const existing = await this.getActiveProfileState();
    if (existing.previousProfileId === undefined) {
      return existing;
    }
    const previousSummary = await this.getProfileSummary(existing.previousProfileId);
    if (previousSummary === undefined) {
      throw new Error(
        `Cannot roll back to missing enrollment profile ${existing.previousProfileId}.`,
      );
    }
    const nextState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: existing.previousProfileId,
      ...(existing.activeProfileId === undefined
        ? {}
        : { previousProfileId: existing.activeProfileId }),
      updatedAt: this.options.now?.() ?? new Date().toISOString(),
    };
    await writeJsonAtomically(this.backend, profileLifecyclePath('active-profile.json'), nextState);
    return nextState;
  }

  async deactivateProfile(profileId: string): Promise<ActiveEnrollmentProfileStateV1> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    const existing = await this.getActiveProfileState();
    if (existing.activeProfileId !== normalizedProfileId) {
      return existing;
    }
    const nextState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      previousProfileId: normalizedProfileId,
      updatedAt: this.options.now?.() ?? new Date().toISOString(),
    };
    await writeJsonAtomically(this.backend, profileLifecyclePath('active-profile.json'), nextState);
    return nextState;
  }

  async exportProfile(profileId: string): Promise<EnrollmentProfileExportPackageV1> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    const summary = await this.getProfileSummary(normalizedProfileId);
    if (summary === undefined) {
      throw new Error(`Cannot export missing enrollment profile ${normalizedProfileId}.`);
    }
    const files: Record<string, ProfileExportFileV1> = {};
    for (const file of await this.backend.listFiles(profilePath(normalizedProfileId))) {
      const bytes = await this.backend.getFile(file.path);
      if (bytes === undefined) continue;
      const path = pathToPortableString(file.path);
      const sha256 = await this.digest(bytes);
      files[path] = {
        path,
        sha256,
        sizeBytes: bytes.byteLength,
        mediaType: mediaTypeForProfilePath(path),
        base64: bytesToBase64(new Uint8Array(bytes)),
      };
    }
    return {
      schemaVersion: 1,
      packageType: 'speech-enrollment-profile-export',
      exportedAt: this.options.now?.() ?? new Date().toISOString(),
      profileId: normalizedProfileId,
      profile: summary.profile,
      utterances: summary.utterances,
      checksums: summary.checksums,
      files,
      privacy: {
        containsRawAudio: summary.profile.privacy.containsRawAudio,
        containsTranscriptText: true,
        containsRawProfileData: true,
        exportEncrypted: false,
        localOnly: true,
      },
      warnings: [
        'This export can contain enrollment recordings, prompt text, microphone metadata, and derived voice profile data. Store it as sensitive personal data.',
      ],
    };
  }

  async importProfile(input: ImportEnrollmentProfileInput): Promise<EnrollmentProfileSummaryV1> {
    return (await this.importProfilePackage(input)).summary;
  }

  async importProfilePackage(
    input: ImportEnrollmentProfileInput,
  ): Promise<EnrollmentProfileImportCompletionV1> {
    const profilePackage = input.profilePackage;
    validateProfileExportPackageShape(profilePackage);
    const sourceProfileId = normalizeSegment(profilePackage.profileId, 'profileId');
    if (
      profilePackage.profile.id !== sourceProfileId ||
      profilePackage.checksums.profileId !== sourceProfileId
    ) {
      throw new Error('Profile export package id fields must match.');
    }
    const decodedFiles = await this.decodeProfileExportFiles(profilePackage, sourceProfileId);
    validateProfilePackageConsistency(sourceProfileId, profilePackage, decodedFiles);

    const mode = resolveProfileImportMode(input);
    const duplicate = await this.findDuplicateProfile(profilePackage);
    if (mode === 'dedupe' && duplicate !== undefined) {
      return {
        schemaVersion: 1,
        operation: 'deduped-existing',
        sourceProfileId,
        targetProfileId: duplicate.profile.id,
        displayName: duplicate.profile.displayName,
        nameCollisionResolved: false,
        summary: duplicate,
      };
    }

    const target = await this.resolveProfileImportTarget(
      profilePackage,
      input,
      mode === 'legacy' ? 'replace' : mode,
    );
    const existing = await this.getProfileSummary(target.profileId);
    if (existing !== undefined && mode !== 'replace') {
      throw new Error(
        `Profile ${target.profileId} already exists. Choose replace or import as a new profile.`,
      );
    }
    if (existing !== undefined) {
      await this.deleteProfile(target.profileId);
    }
    await this.writeImportedProfilePackage(profilePackage, decodedFiles, target);
    const summary = await this.getProfileSummary(target.profileId);
    if (summary === undefined) {
      throw new Error(`Imported profile ${target.profileId} is missing profile metadata.`);
    }
    return {
      schemaVersion: 1,
      operation: existing === undefined ? 'imported-new' : 'replaced-existing',
      sourceProfileId,
      targetProfileId: target.profileId,
      displayName: summary.profile.displayName,
      nameCollisionResolved: target.nameCollisionResolved,
      summary,
    };
  }

  async importPortableSpeechModel(
    input: ImportPortableSpeechModelInput,
  ): Promise<PortableSpeechModelImportSummaryV1> {
    const bundleId = normalizeSegment(input.archive.manifest.bundleId, 'portableBundleId');
    const importId = normalizeSegment(
      input.importId ?? this.createPortableImportId(),
      'portableImportId',
    );
    const activeRecordPath = portableSpeechModelActiveRecordPath(bundleId);
    const existingRecord = await this.readPortableSpeechModelImportRecord(bundleId);
    if (existingRecord !== undefined && input.overwriteExisting !== true) {
      throw new Error(
        `Portable speech model bundle ${bundleId} is already imported. Set overwriteExisting to replace it.`,
      );
    }
    assertPortableImportBaseModelCompatible(
      input.archive.manifest.baseModel,
      input.expectedBaseModel,
    );
    assertPortableImportManifestReady(input.archive.manifest);
    assertPortableImportArchiveConsistent(input.archive);

    const stagingRoot = portableSpeechModelImportStagingPath(importId);
    const finalRoot = portableSpeechModelImportVersionPath(bundleId, importId);
    await this.backend.deleteDirectory(stagingRoot);
    await this.backend.deleteDirectory(finalRoot);
    let committed = false;
    try {
      await this.writeAndVerifyPortableImportFiles(stagingRoot, input.archive.files);
      const smokeTest = await runPortableImportSmokeWithTimeout(
        input.smokeTest({
          bundleId,
          manifest: input.archive.manifest,
          expectedBaseModel: input.expectedBaseModel,
          testVectors: input.archive.manifest.testVectors,
          files: input.archive.files,
          readStagedFile: async (path) =>
            new Uint8Array(
              await readRequiredProfileFile(
                this.backend,
                portableImportFilePath(stagingRoot, path),
              ),
            ),
        }),
        input.smokeTimeoutMs,
      );
      assertPortableImportSmokeResult(smokeTest, input.archive.manifest.testVectors.length);
      const storedFiles = await this.copyPortableImportFiles(
        stagingRoot,
        finalRoot,
        input.archive.files,
      );
      const importedAt = this.options.now?.() ?? new Date().toISOString();
      const record: PortableSpeechModelImportRecordV1 = {
        schemaVersion: 1,
        recordType: 'portable-speechmodel-import',
        bundleId,
        importId,
        importedAt,
        manifest: input.archive.manifest,
        baseModel: input.archive.manifest.baseModel,
        files: storedFiles,
        summary: {
          encrypted: input.archive.summary.encrypted,
          fileCount: input.archive.files.length,
          expandedBytes: input.archive.summary.expandedBytes,
          adaptationType: input.archive.manifest.adaptation.type,
          testVectorCount: input.archive.manifest.testVectors.length,
        },
        smokeTest,
        privacy: {
          localOnly: true,
          defaultExportIncludesImportedPortableModel: false,
          containsRawAudio: false,
          containsTranscriptText: false,
          containsFeatureTensors: false,
          containsCheckpoints: false,
          containsAdapterWeights: true,
          containsPrivateVocabularyTerms: input.archive.manifest.vocabulary?.included === true,
          networkUpload: false,
          telemetry: false,
        },
      };
      await writeJsonAtomically(
        this.backend,
        portableSpeechModelImportRecordPath(bundleId, importId),
        record,
      );
      await writeJsonAtomically(this.backend, activeRecordPath, record);
      committed = true;
      return summarizePortableSpeechModelImportRecord(record);
    } finally {
      await this.backend.deleteDirectory(stagingRoot);
      if (!committed) {
        await this.backend.deleteDirectory(finalRoot);
      }
    }
  }

  async getPortableSpeechModelImport(
    bundleId: string,
  ): Promise<PortableSpeechModelImportRecordV1 | undefined> {
    return this.readPortableSpeechModelImportRecord(normalizeSegment(bundleId, 'portableBundleId'));
  }

  async migrateSpeechProfileManifestToV2(
    input: MigrateSpeechProfileManifestToV2Input,
  ): Promise<SpeechProfileManifestMigrationResultV1> {
    const profileId = normalizeSegment(input.profileId, 'profileId');
    const sourcePath = normalizeSpeechProfileMigrationPath(
      input.sourcePath ?? speechProfileManifestV1Path(profileId),
      'sourcePath',
      'profile.json',
    );
    const targetPath = normalizeSpeechProfileMigrationPath(
      input.targetPath ?? speechProfileManifestV2Path(profileId),
      'targetPath',
      'profile.v2.json',
    );
    if (pathToPortableString(sourcePath) === pathToPortableString(targetPath)) {
      throw new Error('Speech profile migration source and target paths must be different.');
    }

    const deletedTemporaryFiles = await cleanupSpeechProfileMigrationTemps(
      this.backend,
      targetPath,
    );
    const targetBytes = await this.backend.getFile(targetPath);
    let invalidTargetPresent = false;
    if (targetBytes !== undefined) {
      let existingV2: SpeechProfileManifestV2 | undefined;
      try {
        existingV2 = parseSpeechProfileManifestV2(parseJson<unknown>(targetBytes));
      } catch {
        invalidTargetPresent = true;
      }
      if (existingV2 !== undefined) {
        const sourceBytes = await this.backend.getFile(sourcePath);
        let sourceSchemaVersion: 1 | 2 = 2;
        let v1ManifestRetained = false;
        if (sourceBytes !== undefined) {
          try {
            sourceSchemaVersion = parseSpeechProfileManifest(
              parseJson<unknown>(sourceBytes),
            ).schemaVersion;
            v1ManifestRetained = sourceSchemaVersion === 1;
          } catch {
            sourceSchemaVersion = 2;
          }
        }
        return summarizeSpeechProfileManifestMigration({
          status: 'recovered-existing-v2',
          migratedAt: this.options.now?.() ?? new Date().toISOString(),
          sourceSchemaVersion,
          manifest: existingV2,
          deletedTemporaryFiles,
          reusedExistingV2: true,
          replacedInvalidV2: false,
          v1ManifestRetained,
        });
      }
    }

    const sourceBytes = await this.backend.getFile(sourcePath);
    if (sourceBytes === undefined) {
      throw new Error('Speech profile migration source profile.json is missing.');
    }
    const sourceManifest = parseSpeechProfileManifest(parseJson<unknown>(sourceBytes));
    if (sourceManifest.schemaVersion === 2) {
      return summarizeSpeechProfileManifestMigration({
        status: 'already-v2',
        migratedAt: this.options.now?.() ?? new Date().toISOString(),
        sourceSchemaVersion: 2,
        manifest: sourceManifest,
        deletedTemporaryFiles,
        reusedExistingV2: false,
        replacedInvalidV2: false,
        v1ManifestRetained: false,
      });
    }

    const migrated = migrateSpeechProfileManifestV1ToV2(sourceManifest);
    await writeJsonAtomically(this.backend, targetPath, migrated);
    const verifiedTarget = parseSpeechProfileManifestV2(
      parseJson<unknown>(await readRequiredProfileFile(this.backend, targetPath)),
    );
    return summarizeSpeechProfileManifestMigration({
      status: invalidTargetPresent ? 'replaced-invalid-v2' : 'migrated',
      migratedAt: this.options.now?.() ?? new Date().toISOString(),
      sourceSchemaVersion: 1,
      manifest: verifiedTarget,
      deletedTemporaryFiles,
      reusedExistingV2: false,
      replacedInvalidV2: invalidTargetPresent,
      v1ManifestRetained: (await this.backend.getFile(sourcePath)) !== undefined,
    });
  }

  async freezeTrainingJobRevision(
    input: FreezeTrainingJobRevisionInput,
  ): Promise<TrainingJobRevisionV1> {
    const profileId = normalizeSegment(input.profileId, 'profileId');
    const jobId = normalizeSegment(input.jobId ?? this.createTrainingJobId(), 'trainingJobId');
    const path = trainingJobRevisionPath(jobId);
    if ((await this.backend.getFile(path)) !== undefined) {
      throw new Error(`Training job revision ${jobId} already exists.`);
    }
    const summary = await this.getProfileSummary(profileId);
    if (summary === undefined) {
      throw new Error(`Cannot freeze training job for missing enrollment profile ${profileId}.`);
    }
    const vocabulary =
      input.vocabularyStore === undefined
        ? undefined
        : await buildTrainingJobVocabularyRevision(input.vocabularyStore, (bytes) =>
            this.digest(bytes),
          );
    const enrollment = await buildTrainingJobEnrollmentRevision(
      summary,
      (bytes) => this.digest(bytes),
      (path) => this.backend.getFile(path),
      vocabulary,
    );
    const revision: TrainingJobRevisionV1 = {
      schemaVersion: 1,
      jobId,
      profileId,
      createdAt: this.options.now?.() ?? new Date().toISOString(),
      enrollment,
      ...(vocabulary === undefined ? {} : { vocabulary }),
      privacy: {
        localOnly: true,
        defaultExportIncludesRevision: false,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        containsCheckpoints: false,
        containsAdapterWeights: false,
        containsPrivateVocabularyTerms: (vocabulary?.revision.entries.length ?? 0) > 0,
        networkUpload: false,
        telemetry: false,
      },
    };
    await writeJsonAtomically(this.backend, path, revision);
    return revision;
  }

  async getTrainingJobRevision(jobId: string): Promise<TrainingJobRevisionV1 | undefined> {
    const bytes = await this.backend.getFile(trainingJobRevisionPath(jobId));
    return bytes === undefined ? undefined : parseJson<TrainingJobRevisionV1>(bytes);
  }

  async listTrainingJobRevisions(profileId?: string): Promise<TrainingJobRevisionV1[]> {
    const files = await this.backend.listFiles(trainingJobRevisionPath());
    const revisions: TrainingJobRevisionV1[] = [];
    for (const file of files) {
      if (file.path[file.path.length - 1] !== 'revision.json') continue;
      const bytes = await this.backend.getFile(file.path);
      if (bytes === undefined) continue;
      const revision = parseJson<TrainingJobRevisionV1>(bytes);
      if (
        profileId === undefined ||
        revision.profileId === normalizeSegment(profileId, 'profileId')
      ) {
        revisions.push(revision);
      }
    }
    return revisions.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async verifyTrainingJobRevisionSources(
    input: VerifyTrainingJobRevisionInput,
  ): Promise<TrainingJobRevisionVerificationResultV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const revision = await this.getTrainingJobRevision(jobId);
    if (revision === undefined) {
      throw new Error(`Training job revision ${jobId} was not found.`);
    }
    const checkedAt = this.options.now?.() ?? new Date().toISOString();
    const errors: string[] = [];
    const summary = await this.getProfileSummary(revision.profileId);
    let enrollment: TrainingJobRevisionVerificationResultV1['enrollment'];
    if (summary === undefined) {
      enrollment = {
        status: 'missing',
        expectedRevisionSha256: revision.enrollment.revisionSha256,
      };
      errors.push(`Enrollment profile ${revision.profileId} is missing.`);
    } else {
      try {
        const actualEnrollment = await buildTrainingJobEnrollmentRevision(
          summary,
          (bytes) => this.digest(bytes),
          (path) => this.backend.getFile(path),
          revision.vocabulary,
        );
        const status =
          actualEnrollment.revisionSha256 === revision.enrollment.revisionSha256
            ? 'match'
            : 'changed';
        enrollment = {
          status,
          expectedRevisionSha256: revision.enrollment.revisionSha256,
          actualRevisionSha256: actualEnrollment.revisionSha256,
        };
        if (status !== 'match') {
          errors.push('Enrollment profile accepted-utterance revision changed after job freeze.');
        }
      } catch (error) {
        enrollment = {
          status: 'missing',
          expectedRevisionSha256: revision.enrollment.revisionSha256,
        };
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    let vocabulary: TrainingJobRevisionVerificationResultV1['vocabulary'];
    if (revision.vocabulary !== undefined) {
      if (input.vocabularyStore === undefined) {
        vocabulary = {
          status: 'missing',
          expectedRevisionSha256: revision.vocabulary.revisionSha256,
        };
        errors.push('Vocabulary store snapshot is required to verify this training job revision.');
      } else {
        const actualVocabulary = await buildTrainingJobVocabularyRevision(
          input.vocabularyStore,
          (bytes) => this.digest(bytes),
        );
        const status =
          actualVocabulary.revisionSha256 === revision.vocabulary.revisionSha256
            ? 'match'
            : 'changed';
        vocabulary = {
          status,
          expectedRevisionSha256: revision.vocabulary.revisionSha256,
          actualRevisionSha256: actualVocabulary.revisionSha256,
        };
        if (status !== 'match') {
          errors.push('Vocabulary revision changed after job freeze.');
        }
      }
    }

    return {
      schemaVersion: 1,
      jobId,
      profileId: revision.profileId,
      checkedAt,
      ok: errors.length === 0,
      enrollment,
      ...(vocabulary === undefined ? {} : { vocabulary }),
      errors,
      privacy: {
        aggregateOnly: true,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsPrivateVocabularyTerms: false,
        networkUpload: false,
        telemetry: false,
        localOnly: true,
      },
    };
  }

  async buildTrainingJobPromptIdentitySplit(
    input: TrainingJobPromptIdentitySplitInput,
  ): Promise<TrainingJobPromptIdentitySplitPlanV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const revision = await this.getTrainingJobRevision(jobId);
    if (revision === undefined) {
      throw new Error(`Training job revision ${jobId} was not found.`);
    }
    return buildTrainingJobPromptIdentitySplitPlan(revision, input.config);
  }

  async prepareTrainingJobFeatureShards(
    input: PrepareTrainingJobFeatureShardsInput,
  ): Promise<TrainingJobFeaturePreparationManifestV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const featureSetId = normalizeSegment(
      input.featureSetId ?? this.createFeatureSetId(),
      'featureSetId',
    );
    const manifestPath = trainingJobFeatureManifestPath(jobId, featureSetId);
    if ((await this.backend.getFile(manifestPath)) !== undefined) {
      throw new Error(`Training job feature set ${featureSetId} already exists for ${jobId}.`);
    }
    const revision = await this.getTrainingJobRevision(jobId);
    if (revision === undefined) {
      throw new Error(`Training job revision ${jobId} was not found.`);
    }
    const split = buildTrainingJobPromptIdentitySplitPlan(revision, input.splitConfig);
    const featureConfig = resolveLogMelFeatureConfig(input.featureConfig);
    const maxFramesPerShard = normalizeMaxFramesPerShard(input.maxFramesPerShard);
    const tempPrefix = trainingJobFeatureTempPath(
      jobId,
      `${featureSetId}-${Date.now().toString(36)}`,
    );

    try {
      const prepared = await prepareFeatureShardFiles({
        revision,
        split,
        featureSetId,
        featureConfig,
        maxFramesPerShard,
        readFile: (path) => this.backend.getFile(path),
        writeStagedFile: (path, bytes, sha256) =>
          writeCheckedFileAtomically(this.backend, path, bytes, sha256, (body) =>
            this.digest(body),
          ),
        digest: (bytes) => this.digest(bytes),
        now: this.options.now?.() ?? new Date().toISOString(),
        tempPrefix,
      });

      for (const shard of prepared.shards) {
        const stagedBytes = await this.backend.getFile(portablePathToSegments(shard.stagedPath));
        if (stagedBytes === undefined) {
          throw new Error(`Prepared feature shard ${shard.shardId} is missing from staging.`);
        }
        await writeCheckedFileAtomically(
          this.backend,
          portablePathToSegments(shard.finalPath),
          stagedBytes,
          shard.sha256,
          (bytes) => this.digest(bytes),
        );
      }

      const manifest = await finalizeFeaturePreparationManifest(
        prepared.manifest,
        prepared.shards.map(toCommittedFeatureShard),
        (bytes) => this.digest(bytes),
      );
      await writeJsonAtomically(this.backend, manifestPath, manifest);
      await this.backend.deleteDirectory(tempPrefix);
      return manifest;
    } catch (error) {
      await this.backend.deleteDirectory(tempPrefix);
      await this.backend.deleteDirectory(trainingJobFeatureSetPath(jobId, featureSetId));
      throw error;
    }
  }

  async getTrainingJobFeaturePreparationManifest(
    input: VerifyTrainingJobFeatureShardsInput,
  ): Promise<TrainingJobFeaturePreparationManifestV1 | undefined> {
    const bytes = await this.backend.getFile(
      trainingJobFeatureManifestPath(input.jobId, input.featureSetId),
    );
    return bytes === undefined
      ? undefined
      : parseJson<TrainingJobFeaturePreparationManifestV1>(bytes);
  }

  async verifyTrainingJobFeatureShards(
    input: VerifyTrainingJobFeatureShardsInput,
  ): Promise<TrainingJobFeatureShardVerificationResultV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const featureSetId = normalizeSegment(input.featureSetId, 'featureSetId');
    const manifest = await this.getTrainingJobFeaturePreparationManifest({ jobId, featureSetId });
    if (manifest === undefined) {
      throw new Error(`Training job feature set ${featureSetId} was not found for ${jobId}.`);
    }
    const errors: string[] = [];
    const actualManifestSha256 = await calculateFeaturePreparationManifestSha256(
      manifest,
      (bytes) => this.digest(bytes),
    );
    const manifestStatus = actualManifestSha256 === manifest.manifestSha256 ? 'match' : 'changed';
    if (manifestStatus !== 'match') {
      errors.push('Feature preparation manifest checksum changed.');
    }
    const shards: Array<TrainingJobFeatureShardVerificationResultV1['shards'][number]> = [];
    for (const shard of manifest.shards) {
      const bytes = await this.backend.getFile(portablePathToSegments(shard.path));
      if (bytes === undefined) {
        errors.push(`Feature shard ${shard.shardId} is missing.`);
        shards.push({
          shardId: shard.shardId,
          status: 'missing',
          expectedSha256: shard.sha256,
        });
        continue;
      }
      const actualSha256 = await this.digest(bytes);
      const status =
        actualSha256 === shard.sha256 && bytes.byteLength === shard.sizeBytes ? 'match' : 'changed';
      if (status !== 'match') {
        errors.push(`Feature shard ${shard.shardId} checksum or size changed.`);
      }
      shards.push({
        shardId: shard.shardId,
        status,
        expectedSha256: shard.sha256,
        actualSha256,
      });
    }
    return {
      schemaVersion: 1,
      jobId,
      featureSetId,
      checkedAt: this.options.now?.() ?? new Date().toISOString(),
      ok: errors.length === 0,
      manifestStatus,
      expectedManifestSha256: manifest.manifestSha256,
      actualManifestSha256,
      shards,
      errors,
      privacy: createFeatureSummaryPrivacy(),
    };
  }

  async deleteTrainingJobFeatureShards(input: DeleteTrainingJobFeatureShardsInput): Promise<void> {
    await this.backend.deleteDirectory(trainingJobFeatureSetPath(input.jobId, input.featureSetId));
  }

  async prepareTrainingJobFrameLabels(
    input: PrepareTrainingJobFrameLabelsInput,
  ): Promise<TrainingJobFrameLabelsManifestV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const featureSetId = normalizeSegment(input.featureSetId, 'featureSetId');
    const alignmentSetId = normalizeSegment(
      input.alignmentSetId ?? this.createFrameLabelSetId(),
      'alignmentSetId',
    );
    const manifestPath = trainingJobFrameLabelsManifestPath(jobId, featureSetId, alignmentSetId);
    if ((await this.backend.getFile(manifestPath)) !== undefined) {
      throw new Error(
        `Training job frame-label set ${alignmentSetId} already exists for ${jobId}/${featureSetId}.`,
      );
    }
    const featureManifest = await this.getTrainingJobFeaturePreparationManifest({
      jobId,
      featureSetId,
    });
    if (featureManifest === undefined) {
      throw new Error(`Training job feature set ${featureSetId} was not found for ${jobId}.`);
    }
    const actualFeatureManifestSha256 = await calculateFeaturePreparationManifestSha256(
      featureManifest,
      (bytes) => this.digest(bytes),
    );
    if (actualFeatureManifestSha256 !== featureManifest.manifestSha256) {
      throw new Error('Feature preparation manifest checksum changed before frame labeling.');
    }
    const featureVerification = await this.verifyTrainingJobFeatureShards({ jobId, featureSetId });
    if (!featureVerification.ok) {
      throw new Error('Feature shards must verify before frame labeling.');
    }

    try {
      const prepared = await prepareFrameLabelFiles({
        featureManifest,
        alignmentSetId,
        alignments: input.alignments,
        ...(input.options === undefined ? {} : { options: input.options }),
        digest: (bytes) => this.digest(bytes),
        now: this.options.now?.() ?? new Date().toISOString(),
      });
      await writeCheckedFileAtomically(
        this.backend,
        portablePathToSegments(prepared.labelFile.path),
        prepared.labelFile.bytes,
        prepared.labelFile.sha256,
        (bytes) => this.digest(bytes),
      );
      await writeJsonAtomically(this.backend, manifestPath, prepared.manifest);
      return prepared.manifest;
    } catch (error) {
      await this.backend.deleteDirectory(
        trainingJobFrameLabelsSetPath(jobId, featureSetId, alignmentSetId),
      );
      throw error;
    }
  }

  async getTrainingJobFrameLabelsManifest(
    input: VerifyTrainingJobFrameLabelsInput,
  ): Promise<TrainingJobFrameLabelsManifestV1 | undefined> {
    const bytes = await this.backend.getFile(
      trainingJobFrameLabelsManifestPath(input.jobId, input.featureSetId, input.alignmentSetId),
    );
    return bytes === undefined ? undefined : parseJson<TrainingJobFrameLabelsManifestV1>(bytes);
  }

  async verifyTrainingJobFrameLabels(
    input: VerifyTrainingJobFrameLabelsInput,
  ): Promise<TrainingJobFrameLabelsVerificationResultV1> {
    const jobId = normalizeSegment(input.jobId, 'trainingJobId');
    const featureSetId = normalizeSegment(input.featureSetId, 'featureSetId');
    const alignmentSetId = normalizeSegment(input.alignmentSetId, 'alignmentSetId');
    const manifest = await this.getTrainingJobFrameLabelsManifest({
      jobId,
      featureSetId,
      alignmentSetId,
    });
    if (manifest === undefined) {
      throw new Error(
        `Training job frame-label set ${alignmentSetId} was not found for ${jobId}/${featureSetId}.`,
      );
    }
    const errors: string[] = [];
    const actualManifestSha256 = await calculateFrameLabelsManifestSha256(manifest, (bytes) =>
      this.digest(bytes),
    );
    const manifestStatus = actualManifestSha256 === manifest.manifestSha256 ? 'match' : 'changed';
    if (manifestStatus !== 'match') {
      errors.push('Frame-label manifest checksum changed.');
    }
    const bytes = await this.backend.getFile(portablePathToSegments(manifest.labelFile.path));
    let labelFile: TrainingJobFrameLabelsVerificationResultV1['labelFile'];
    if (bytes === undefined) {
      errors.push('Frame-label file is missing.');
      labelFile = {
        status: 'missing',
        expectedSha256: manifest.labelFile.sha256,
      };
    } else {
      const actualSha256 = await this.digest(bytes);
      const status =
        actualSha256 === manifest.labelFile.sha256 &&
        bytes.byteLength === manifest.labelFile.sizeBytes
          ? 'match'
          : 'changed';
      if (status !== 'match') {
        errors.push('Frame-label file checksum or size changed.');
      }
      labelFile = {
        status,
        expectedSha256: manifest.labelFile.sha256,
        actualSha256,
      };
    }
    return {
      schemaVersion: 1,
      jobId,
      featureSetId,
      alignmentSetId,
      checkedAt: this.options.now?.() ?? new Date().toISOString(),
      ok: errors.length === 0,
      manifestStatus,
      expectedManifestSha256: manifest.manifestSha256,
      actualManifestSha256,
      labelFile,
      errors,
      privacy: createFrameLabelsSummaryPrivacy(),
    };
  }

  async deleteTrainingJobFrameLabels(input: DeleteTrainingJobFrameLabelsInput): Promise<void> {
    await this.backend.deleteDirectory(
      trainingJobFrameLabelsSetPath(input.jobId, input.featureSetId, input.alignmentSetId),
    );
  }

  async deleteProfile(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    await this.deleteTrainingJobDataForProfile(normalizedProfileId);
    await this.backend.deleteDirectory(['profiles', normalizedProfileId]);
    const activeState = await this.getActiveProfileState();
    if (
      activeState.activeProfileId === normalizedProfileId ||
      activeState.previousProfileId === normalizedProfileId
    ) {
      const promotedPreviousProfileId =
        activeState.activeProfileId === normalizedProfileId &&
        activeState.previousProfileId !== undefined &&
        activeState.previousProfileId !== normalizedProfileId &&
        (await this.getProfileSummary(activeState.previousProfileId)) !== undefined
          ? activeState.previousProfileId
          : undefined;
      const retainedActiveProfileId =
        activeState.activeProfileId !== undefined &&
        activeState.activeProfileId !== normalizedProfileId
          ? activeState.activeProfileId
          : promotedPreviousProfileId;
      const nextState: ActiveEnrollmentProfileStateV1 = {
        schemaVersion: 1,
        ...(retainedActiveProfileId === undefined
          ? {}
          : { activeProfileId: retainedActiveProfileId }),
        updatedAt: this.options.now?.() ?? new Date().toISOString(),
      };
      await writeJsonAtomically(
        this.backend,
        profileLifecyclePath('active-profile.json'),
        nextState,
      );
    }
  }

  private async deleteTrainingJobDataForProfile(profileId: string): Promise<void> {
    const revisions = await this.listTrainingJobRevisions(profileId);
    for (const revision of revisions) {
      await this.backend.deleteDirectory(['training-jobs', revision.jobId]);
    }
  }

  private async decodeProfileExportFiles(
    profilePackage: EnrollmentProfileExportPackageV1,
    profileId: string,
  ): Promise<Record<string, ArrayBuffer>> {
    const decodedFiles: Record<string, ArrayBuffer> = {};
    for (const [path, file] of Object.entries(profilePackage.files)) {
      if (path !== file.path) {
        throw new Error(`Profile export file key ${path} does not match its path.`);
      }
      const segments = portablePathToSegments(file.path);
      assertProfilePackagePath(profileId, segments);
      const bytes = base64ToArrayBuffer(file.base64);
      if (bytes.byteLength !== file.sizeBytes) {
        throw new Error(`Profile export file ${file.path} size does not match metadata.`);
      }
      const sha256 = await this.digest(bytes);
      if (sha256 !== file.sha256) {
        throw new Error(`Profile export file ${file.path} checksum mismatch.`);
      }
      decodedFiles[file.path] = bytes;
    }
    return decodedFiles;
  }

  private async findDuplicateProfile(
    profilePackage: EnrollmentProfileExportPackageV1,
  ): Promise<EnrollmentProfileSummaryV1 | undefined> {
    const incomingFingerprint = fingerprintProfileContent(profilePackage);
    for (const summary of await this.listProfileSummaries()) {
      if (fingerprintProfileContent(summary) === incomingFingerprint) return summary;
    }
    return undefined;
  }

  private async resolveProfileImportTarget(
    profilePackage: EnrollmentProfileExportPackageV1,
    input: ImportEnrollmentProfileInput,
    mode: EnrollmentProfileImportMode,
  ): Promise<{
    readonly profileId: string;
    readonly displayName: string;
    readonly nameCollisionResolved: boolean;
  }> {
    const existingSummaries = await this.listProfileSummaries();
    const requestedDisplayName = normalizeProfileDisplayName(
      input.targetDisplayName ?? profilePackage.profile.displayName,
    );
    const requestedProfileId =
      input.targetProfileId === undefined
        ? mode === 'import-as-new'
          ? this.createImportedProfileId(requestedDisplayName)
          : profilePackage.profileId
        : normalizeSegment(input.targetProfileId, 'targetProfileId');
    const profileId =
      mode === 'import-as-new' && input.targetProfileId === undefined
        ? resolveUniqueProfileId(requestedProfileId, existingSummaries)
        : requestedProfileId;
    const displayName = resolveUniqueProfileDisplayName(
      requestedDisplayName,
      existingSummaries,
      mode === 'replace' ? profileId : undefined,
    );
    return {
      profileId,
      displayName,
      nameCollisionResolved: displayName !== requestedDisplayName,
    };
  }

  private async writeImportedProfilePackage(
    profilePackage: EnrollmentProfileExportPackageV1,
    decodedFiles: Readonly<Record<string, ArrayBuffer>>,
    target: { readonly profileId: string; readonly displayName: string },
  ): Promise<void> {
    const utterances = profilePackage.utterances.map((utterance) =>
      rewriteImportedUtterance(utterance, profilePackage.profileId, target.profileId),
    );
    for (const utterance of utterances) {
      const sourcePath = replaceProfilePathPrefix(
        utterance.audio.path,
        target.profileId,
        profilePackage.profileId,
      );
      const bytes = decodedFiles[sourcePath];
      if (bytes === undefined) {
        throw new Error(`Profile export is missing audio file ${sourcePath}.`);
      }
      await writeFileAtomically(this.backend, portablePathToSegments(utterance.audio.path), bytes);
      await writeJsonAtomically(
        this.backend,
        profilePath(
          target.profileId,
          'utterances',
          `${normalizeSegment(utterance.id, 'utteranceId')}.json`,
        ),
        utterance,
      );
    }
    await this.rebuildProfileFiles(target.profileId, {
      displayName: target.displayName,
      sentenceBankVersion: profilePackage.profile.enrollment.sentenceBankVersion,
      ...(profilePackage.profile.baseModel === undefined
        ? {}
        : { baseModel: profilePackage.profile.baseModel }),
    });
  }

  private createImportedProfileId(displayName: string): string {
    const slug = slugifyProfileId(displayName);
    return `${slug}-${this.options.randomId?.() ?? `import-${Date.now().toString(36)}`}`;
  }

  private async rebuildProfileFiles(
    profileId: string,
    input: {
      readonly displayName: string;
      readonly sentenceBankVersion: string;
      readonly baseModel?: ProfileBaseModelIdentity;
    },
  ): Promise<void> {
    const existing = await this.readProfile(profileId);
    const utterances = await this.listEnrollmentUtterances(profileId);
    const now = this.options.now?.() ?? new Date().toISOString();
    const profile: EnrollmentProfileManifestV1 = {
      schemaVersion: 1,
      id: profileId,
      displayName: input.displayName,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(input.baseModel === undefined
        ? existing?.baseModel === undefined
          ? {}
          : { baseModel: existing.baseModel }
        : { baseModel: input.baseModel }),
      enrollment: summarizeEnrollment(utterances, input.sentenceBankVersion),
      privacy: {
        containsRawAudio: utterances.length > 0,
        exportEncrypted: false,
        localOnly: true,
      },
    };
    const enrollmentJsonl = utterances.map((utterance) => JSON.stringify(utterance)).join('\n');
    const enrollmentBytes = textEncoder.encode(
      enrollmentJsonl.length > 0 ? `${enrollmentJsonl}\n` : '',
    );
    await writeFileAtomically(
      this.backend,
      profilePath(profileId, 'enrollment.jsonl'),
      enrollmentBytes,
    );
    await writeJsonAtomically(this.backend, profilePath(profileId, 'profile.json'), profile);
    await writeJsonAtomically(
      this.backend,
      profilePath(profileId, 'checksums.json'),
      await this.buildChecksums(profileId, now),
    );
  }

  private async buildChecksums(
    profileId: string,
    updatedAt: string,
  ): Promise<EnrollmentProfileChecksumsV1> {
    const files: Record<string, { readonly sha256: string; readonly sizeBytes: number }> = {};
    for (const file of await this.backend.listFiles(profilePath(profileId))) {
      const path = pathToPortableString(file.path);
      if (path.endsWith('/checksums.json')) continue;
      const bytes = await this.backend.getFile(file.path);
      if (bytes === undefined) continue;
      files[path] = { sha256: await this.digest(bytes), sizeBytes: bytes.byteLength };
    }
    return { schemaVersion: 1, profileId, updatedAt, files };
  }

  private async writeAndVerifyPortableImportFiles(
    root: readonly string[],
    files: readonly ImportedPortableSpeechModelFileV1[],
  ): Promise<void> {
    for (const file of files) {
      const path = portableImportFilePath(root, file.path);
      await writeFileAtomically(this.backend, path, file.bytes);
      const stored = await readRequiredProfileFile(this.backend, path);
      if (stored.byteLength !== file.sizeBytes || (await this.digest(stored)) !== file.sha256) {
        throw new Error(`Staged portable speech model file ${file.path} failed verification.`);
      }
    }
  }

  private async copyPortableImportFiles(
    sourceRoot: readonly string[],
    targetRoot: readonly string[],
    files: readonly ImportedPortableSpeechModelFileV1[],
  ): Promise<PortableSpeechModelStoredFileV1[]> {
    const stored: PortableSpeechModelStoredFileV1[] = [];
    for (const file of files) {
      const sourcePath = portableImportFilePath(sourceRoot, file.path);
      const targetPath = portableImportFilePath(targetRoot, file.path);
      const bytes = await readRequiredProfileFile(this.backend, sourcePath);
      await writeFileAtomically(this.backend, targetPath, bytes);
      const copied = await readRequiredProfileFile(this.backend, targetPath);
      const copiedSha256 = await this.digest(copied);
      if (copied.byteLength !== file.sizeBytes || copiedSha256 !== file.sha256) {
        throw new Error(`Committed portable speech model file ${file.path} failed verification.`);
      }
      stored.push({
        path: file.path,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        mediaType: file.mediaType,
        storagePath: pathToPortableString(targetPath),
      });
    }
    return stored.sort((left, right) => left.path.localeCompare(right.path));
  }

  private async readPortableSpeechModelImportRecord(
    bundleId: string,
  ): Promise<PortableSpeechModelImportRecordV1 | undefined> {
    const bytes = await this.backend.getFile(portableSpeechModelActiveRecordPath(bundleId));
    return bytes === undefined ? undefined : parseJson<PortableSpeechModelImportRecordV1>(bytes);
  }

  private async readProfile(profileId: string): Promise<EnrollmentProfileManifestV1 | undefined> {
    const bytes = await this.backend.getFile(profilePath(profileId, 'profile.json'));
    return bytes === undefined ? undefined : parseJson<EnrollmentProfileManifestV1>(bytes);
  }

  private async readChecksums(
    profileId: string,
  ): Promise<EnrollmentProfileChecksumsV1 | undefined> {
    const bytes = await this.backend.getFile(profilePath(profileId, 'checksums.json'));
    return bytes === undefined ? undefined : parseJson<EnrollmentProfileChecksumsV1>(bytes);
  }

  private async digest(bytes: ArrayBuffer): Promise<string> {
    if (this.options.digest) return this.options.digest(bytes.slice(0));
    return sha256ArrayBuffer(bytes);
  }

  private createUtteranceId(): string {
    return (
      this.options.randomId?.() ??
      `utt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private createTrainingJobId(): string {
    return (
      this.options.randomId?.() ??
      `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private createFeatureSetId(): string {
    return (
      this.options.randomId?.() ??
      `features-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private createFrameLabelSetId(): string {
    return (
      this.options.randomId?.() ??
      `alignments-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private createPortableImportId(): string {
    return (
      this.options.randomId?.() ??
      `portable-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }
}

export function encodePcm16Wav(
  samples: Float32Array | readonly number[],
  sampleRateHz: number,
): ArrayBuffer {
  const sampleRate = assertPositiveInteger(sampleRateHz, 'sampleRateHz');
  const headerBytes = 44;
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = headerBytes;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export async function sha256ArrayBuffer(bytes: ArrayBuffer): Promise<string> {
  const cryptoLike = globalThis.crypto;
  if (cryptoLike?.subtle?.digest) {
    const digest = await cryptoLike.subtle.digest('SHA-256', bytes.slice(0));
    return bytesToHex(new Uint8Array(digest));
  }
  throw new Error('SHA-256 digest is unavailable in this runtime. Provide a digest dependency.');
}

export function summarizeTrainingJobRevision(
  revision: TrainingJobRevisionV1,
): TrainingJobRevisionSummaryV1 {
  return {
    schemaVersion: 1,
    jobId: revision.jobId,
    profileId: revision.profileId,
    createdAt: revision.createdAt,
    enrollment: {
      acceptedUtterances: revision.enrollment.acceptedUtterances,
      acceptedSeconds: revision.enrollment.acceptedSeconds,
      revisionSha256: revision.enrollment.revisionSha256,
    },
    ...(revision.vocabulary === undefined
      ? {}
      : {
          vocabulary: {
            storeRevision: revision.vocabulary.storeRevision,
            activeEntryCount: revision.vocabulary.activeEntryCount,
            revisionSha256: revision.vocabulary.revisionSha256,
            selectedEntryCount: revision.enrollment.selectedVocabulary?.selectedEntryCount ?? 0,
            selectedUtteranceCount: revision.enrollment.selectedVocabulary?.utteranceCount ?? 0,
          },
        }),
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateVocabularyTerms: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}

export function buildTrainingJobPromptIdentitySplitPlan(
  revision: TrainingJobRevisionV1,
  config?: PromptIdentitySplitConfigV1,
): TrainingJobPromptIdentitySplitPlanV1 {
  const split = buildPromptIdentitySplitPlan(
    revision.enrollment.utterances.map((utterance) => ({
      schemaVersion: 1,
      utteranceId: utterance.id,
      promptId: utterance.promptId,
      language: utterance.language,
      voiceCondition: utterance.voiceCondition,
      durationMs: utterance.durationMs,
      customVocabularyEntryIds: utterance.selectedVocabularyEntryIds,
    })),
    config,
  );
  return {
    schemaVersion: 1,
    jobId: revision.jobId,
    profileId: revision.profileId,
    enrollmentRevisionSha256: revision.enrollment.revisionSha256,
    split,
    privacy: {
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawPromptIds: true,
      exposesRawVocabularyEntryIds: true,
      networkUpload: false,
      telemetry: false,
    },
  };
}

export function summarizeTrainingJobPromptIdentitySplitPlan(
  plan: TrainingJobPromptIdentitySplitPlanV1,
): TrainingJobPromptIdentitySplitSummaryV1 {
  return {
    schemaVersion: 1,
    jobId: plan.jobId,
    profileId: plan.profileId,
    enrollmentRevisionSha256: plan.enrollmentRevisionSha256,
    split: summarizePromptIdentitySplitPlan(plan.split),
    privacy: {
      aggregateOnly: true,
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
      networkUpload: false,
      telemetry: false,
    },
  };
}

export function summarizeTrainingJobFeaturePreparationManifest(
  manifest: TrainingJobFeaturePreparationManifestV1,
): TrainingJobFeaturePreparationSummaryV1 {
  return {
    schemaVersion: 1,
    manifestType: manifest.manifestType,
    jobId: manifest.jobId,
    profileId: manifest.profileId,
    featureSetId: manifest.featureSetId,
    createdAt: manifest.createdAt,
    enrollmentRevisionSha256: manifest.enrollmentRevisionSha256,
    manifestSha256: manifest.manifestSha256,
    dtype: manifest.dtype,
    feature: {
      sampleRateHz: manifest.feature.sampleRateHz,
      melBinCount: manifest.feature.melBinCount,
      frameLengthMs: manifest.feature.frameLengthMs,
      frameShiftMs: manifest.feature.frameShiftMs,
      fftSize: manifest.feature.fftSize,
      snipEdges: manifest.feature.snipEdges,
    },
    totals: manifest.totals,
    selectedVocabulary: manifest.selectedVocabulary,
    privacy: createFeatureSummaryPrivacy(),
  };
}

export function summarizeTrainingJobFrameLabelsManifest(
  manifest: TrainingJobFrameLabelsManifestV1,
): TrainingJobFrameLabelsSummaryV1 {
  return {
    schemaVersion: 1,
    manifestType: manifest.manifestType,
    jobId: manifest.jobId,
    profileId: manifest.profileId,
    featureSetId: manifest.featureSetId,
    alignmentSetId: manifest.alignmentSetId,
    createdAt: manifest.createdAt,
    enrollmentRevisionSha256: manifest.enrollmentRevisionSha256,
    featureManifestSha256: manifest.featureManifestSha256,
    manifestSha256: manifest.manifestSha256,
    totals: manifest.totals,
    selectedVocabulary: manifest.selectedVocabulary,
    privacy: createFrameLabelsSummaryPrivacy(),
  };
}

interface PreparedFeatureShardRecord extends Omit<TrainingJobFeatureShardV1, 'path'> {
  readonly stagedPath: string;
  readonly finalPath: string;
}

interface PrepareFeatureShardFilesInput {
  readonly revision: TrainingJobRevisionV1;
  readonly split: TrainingJobPromptIdentitySplitPlanV1;
  readonly featureSetId: string;
  readonly featureConfig: ResolvedLogMelFeatureConfig;
  readonly maxFramesPerShard: number;
  readonly readFile: (path: readonly string[]) => Promise<ArrayBuffer | undefined>;
  readonly writeStagedFile: (
    path: readonly string[],
    bytes: ArrayBuffer,
    sha256: string,
  ) => Promise<void>;
  readonly digest: (bytes: ArrayBuffer) => Promise<string>;
  readonly now: string;
  readonly tempPrefix: readonly string[];
}

interface PreparedFeatureShardFiles {
  readonly manifest: Omit<TrainingJobFeaturePreparationManifestV1, 'shards' | 'manifestSha256'>;
  readonly shards: readonly PreparedFeatureShardRecord[];
}

async function prepareFeatureShardFiles(
  input: PrepareFeatureShardFilesInput,
): Promise<PreparedFeatureShardFiles> {
  const assignmentByPrompt = new Map(
    input.split.split.assignments.map((assignment) => [assignment.promptId, assignment.split]),
  );
  const builders = createFeatureShardBuilders(input.featureConfig.melBinCount);
  const shards: PreparedFeatureShardRecord[] = [];

  for (const utterance of input.revision.enrollment.utterances) {
    const split = assignmentByPrompt.get(utterance.promptId) ?? 'train';
    const audioBytes = await readAndVerifyFrozenAudio(utterance, input.readFile, input.digest);
    const samples = decodePcm16MonoWav(audioBytes, input.featureConfig.sampleRateHz);
    const features = extractLogMelFeatures(samples, input.featureConfig);
    const builder = builders[split];
    if (
      builder.frameCount > 0 &&
      builder.frameCount + features.frameCount > input.maxFramesPerShard
    ) {
      await flushFeatureShardBuilder(builder, input, shards);
    }
    addUtteranceFeaturesToShardBuilders(builder, utterance, features);
    if (builder.frameCount >= input.maxFramesPerShard) {
      await flushFeatureShardBuilder(builder, input, shards);
    }
  }

  for (const split of featureSplitNames) {
    const builder = builders[split];
    if (builder.utterances.length > 0) {
      await flushFeatureShardBuilder(builder, input, shards);
    }
  }

  const totals = summarizeFeatureShardTotals(shards);
  const selectedVocabulary = summarizeFeatureSelectedVocabulary(
    shards,
    input.revision.enrollment.selectedVocabulary?.vocabularyRevisionSha256,
  );
  return {
    manifest: {
      schemaVersion: 1,
      manifestType: 'training-job-feature-shards',
      jobId: input.revision.jobId,
      profileId: input.revision.profileId,
      featureSetId: input.featureSetId,
      createdAt: input.now,
      enrollmentRevisionSha256: input.revision.enrollment.revisionSha256,
      promptSplit: {
        seed: input.split.split.seed,
        assignmentSha256: await input.digest(stableJsonBytes(input.split.split.assignments)),
        totals: input.split.split.totals,
      },
      feature: input.featureConfig,
      dtype: 'float16-le',
      maxFramesPerShard: input.maxFramesPerShard,
      totals,
      selectedVocabulary,
      privacy: {
        localOnly: true,
        defaultExportIncludesFeatures: false,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        referencesFeatureTensorFiles: true,
        containsCheckpoints: false,
        containsAdapterWeights: false,
        exposesRawPromptIds: true,
        exposesRawVocabularyEntryIds: true,
        networkUpload: false,
        telemetry: false,
      },
    },
    shards,
  };
}

async function finalizeFeaturePreparationManifest(
  manifest: Omit<TrainingJobFeaturePreparationManifestV1, 'shards' | 'manifestSha256'>,
  shards: readonly TrainingJobFeatureShardV1[],
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<TrainingJobFeaturePreparationManifestV1> {
  const unsigned = { ...manifest, shards };
  return {
    ...unsigned,
    manifestSha256: await digest(stableJsonBytes(unsigned)),
  };
}

async function calculateFeaturePreparationManifestSha256(
  manifest: TrainingJobFeaturePreparationManifestV1,
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<string> {
  const { manifestSha256: _manifestSha256, ...unsigned } = manifest;
  return digest(stableJsonBytes(unsigned));
}

interface PrepareFrameLabelFilesInput {
  readonly featureManifest: TrainingJobFeaturePreparationManifestV1;
  readonly alignmentSetId: string;
  readonly alignments: readonly TrainingJobCtcAlignmentInputV1[];
  readonly options?: CtcForcedAlignmentOptionsV1;
  readonly digest: (bytes: ArrayBuffer) => Promise<string>;
  readonly now: string;
}

interface PreparedFrameLabelFiles {
  readonly manifest: TrainingJobFrameLabelsManifestV1;
  readonly labelFile: {
    readonly path: string;
    readonly bytes: ArrayBuffer;
    readonly sha256: string;
  };
}

interface TrainingJobFrameLabelsFileV1 {
  readonly schemaVersion: 1;
  readonly fileType: 'training-job-frame-labels';
  readonly jobId: string;
  readonly featureSetId: string;
  readonly alignmentSetId: string;
  readonly utterances: readonly {
    readonly utteranceId: string;
    readonly split: 'train' | 'validation' | 'test';
    readonly frameCount: number;
    readonly targetTokenCount: number;
    readonly status: CtcForcedAlignmentResultV1['summary']['status'];
    readonly selectedVocabularyEntryIds: readonly string[];
    readonly frames: readonly {
      readonly tokenId: number;
      readonly targetTokenIndex?: number;
      readonly confidence: number;
      readonly weight: number;
      readonly trainingMask: 0 | 1;
    }[];
  }[];
  readonly privacy: TrainingJobFrameLabelsManifestV1['privacy'];
}

async function prepareFrameLabelFiles(
  input: PrepareFrameLabelFilesInput,
): Promise<PreparedFrameLabelFiles> {
  if (input.alignments.length === 0) {
    throw new Error('At least one utterance alignment is required.');
  }
  const featureUtterances = flattenFeatureManifestUtterances(input.featureManifest);
  const alignmentByUtterance = new Map<string, TrainingJobCtcAlignmentInputV1>();
  for (const alignment of input.alignments) {
    const utteranceId = normalizeSegment(alignment.utteranceId, 'utteranceId');
    if (alignmentByUtterance.has(utteranceId)) {
      throw new Error(`Duplicate CTC alignment input for utterance ${utteranceId}.`);
    }
    alignmentByUtterance.set(utteranceId, alignment);
  }
  const extraUtteranceIds = [...alignmentByUtterance.keys()].filter(
    (utteranceId) => !featureUtterances.some((utterance) => utterance.utteranceId === utteranceId),
  );
  if (extraUtteranceIds.length > 0) {
    throw new Error(`CTC alignment input references unknown utterance ${extraUtteranceIds[0]}.`);
  }
  const utterances: TrainingJobFrameLabelsUtteranceV1[] = [];
  const labelFileUtterances: Array<TrainingJobFrameLabelsFileV1['utterances'][number]> = [];
  let expectedBlankId: number | undefined;
  let expectedVocabularySize: number | undefined;
  let expectedOptions: Required<CtcForcedAlignmentOptionsV1> | undefined;

  for (const featureUtterance of featureUtterances) {
    const alignmentInput = alignmentByUtterance.get(featureUtterance.utteranceId);
    if (alignmentInput === undefined) {
      throw new Error(`Missing CTC alignment input for utterance ${featureUtterance.utteranceId}.`);
    }
    if (alignmentInput.frameCount !== featureUtterance.frameCount) {
      throw new Error(
        `CTC alignment frame count for utterance ${featureUtterance.utteranceId} must match prepared features.`,
      );
    }
    const alignment = buildCtcForcedAlignment({
      utteranceId: featureUtterance.utteranceId,
      targetTokenIds: alignmentInput.targetTokenIds,
      frameLogits: alignmentInput.frameLogits,
      frameCount: alignmentInput.frameCount,
      vocabularySize: alignmentInput.vocabularySize,
      blankId: alignmentInput.blankId,
      ...(input.options === undefined ? {} : { options: input.options }),
    });
    expectedBlankId ??= alignment.blankId;
    expectedVocabularySize ??= alignment.vocabularySize;
    expectedOptions ??= alignment.options;
    if (
      alignment.blankId !== expectedBlankId ||
      alignment.vocabularySize !== expectedVocabularySize
    ) {
      throw new Error(
        'All CTC alignments in one frame-label set must share blankId and vocabularySize.',
      );
    }
    utterances.push({
      utteranceId: featureUtterance.utteranceId,
      promptId: featureUtterance.promptId,
      split: featureUtterance.split,
      featureShardId: featureUtterance.shardId,
      frameOffset: featureUtterance.frameOffset,
      frameCount: featureUtterance.frameCount,
      status: alignment.summary.status,
      usableFrameCount: alignment.summary.usableFrameCount,
      excludedFrameCount: alignment.summary.excludedFrameCount,
      blankFrameCount: alignment.summary.blankFrameCount,
      lowConfidenceFrameCount: alignment.summary.lowConfidenceFrameCount,
      meanFrameConfidence: alignment.summary.meanFrameConfidence,
      meanTokenConfidence: alignment.summary.meanTokenConfidence,
      selectedVocabularyEntryIds: featureUtterance.selectedVocabularyEntryIds,
    });
    labelFileUtterances.push({
      utteranceId: featureUtterance.utteranceId,
      split: featureUtterance.split,
      frameCount: featureUtterance.frameCount,
      targetTokenCount: alignment.targetTokenCount,
      status: alignment.summary.status,
      selectedVocabularyEntryIds: featureUtterance.selectedVocabularyEntryIds,
      frames: alignment.frames.map((frame) => ({
        tokenId: frame.tokenId,
        ...(frame.targetTokenIndex === undefined
          ? {}
          : { targetTokenIndex: frame.targetTokenIndex }),
        confidence: frame.confidence,
        weight: frame.weight,
        trainingMask: frame.trainingMask,
      })),
    });
  }
  if (
    expectedBlankId === undefined ||
    expectedVocabularySize === undefined ||
    expectedOptions === undefined
  ) {
    throw new Error('At least one CTC alignment is required.');
  }
  const labelPath = pathToPortableString([
    ...trainingJobFrameLabelsSetPath(
      input.featureManifest.jobId,
      input.featureManifest.featureSetId,
      input.alignmentSetId,
    ),
    'labels.json',
  ]);
  const privacy = createFrameLabelsManifestPrivacy();
  const labelFileValue: TrainingJobFrameLabelsFileV1 = {
    schemaVersion: 1,
    fileType: 'training-job-frame-labels',
    jobId: input.featureManifest.jobId,
    featureSetId: input.featureManifest.featureSetId,
    alignmentSetId: input.alignmentSetId,
    utterances: labelFileUtterances,
    privacy,
  };
  const labelBytes = stableJsonBytes(labelFileValue);
  const labelSha256 = await input.digest(labelBytes);
  const unsignedManifest: Omit<TrainingJobFrameLabelsManifestV1, 'manifestSha256'> = {
    schemaVersion: 1,
    manifestType: 'training-job-frame-labels',
    jobId: input.featureManifest.jobId,
    profileId: input.featureManifest.profileId,
    featureSetId: input.featureManifest.featureSetId,
    alignmentSetId: input.alignmentSetId,
    createdAt: input.now,
    enrollmentRevisionSha256: input.featureManifest.enrollmentRevisionSha256,
    featureManifestSha256: input.featureManifest.manifestSha256,
    alignment: {
      algorithmId: 'ctc-viterbi-forced-alignment-v1',
      blankId: expectedBlankId,
      vocabularySize: expectedVocabularySize,
      options: expectedOptions,
    },
    labelFile: {
      path: labelPath,
      mediaType: 'application/json',
      sizeBytes: labelBytes.byteLength,
      sha256: labelSha256,
    },
    totals: summarizeFrameLabelTotals(utterances),
    selectedVocabulary: summarizeFrameLabelSelectedVocabulary(
      utterances,
      input.featureManifest.selectedVocabulary.vocabularyRevisionSha256,
    ),
    utterances,
    privacy,
  };
  return {
    manifest: {
      ...unsignedManifest,
      manifestSha256: await input.digest(stableJsonBytes(unsignedManifest)),
    },
    labelFile: { path: labelPath, bytes: labelBytes, sha256: labelSha256 },
  };
}

async function calculateFrameLabelsManifestSha256(
  manifest: TrainingJobFrameLabelsManifestV1,
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<string> {
  const { manifestSha256: _manifestSha256, ...unsigned } = manifest;
  return digest(stableJsonBytes(unsigned));
}

function toCommittedFeatureShard(shard: PreparedFeatureShardRecord): TrainingJobFeatureShardV1 {
  return {
    schemaVersion: shard.schemaVersion,
    shardId: shard.shardId,
    split: shard.split,
    path: shard.finalPath,
    dtype: shard.dtype,
    frameCount: shard.frameCount,
    melBinCount: shard.melBinCount,
    utteranceCount: shard.utteranceCount,
    sizeBytes: shard.sizeBytes,
    sha256: shard.sha256,
    utterances: shard.utterances,
  };
}

function flattenFeatureManifestUtterances(
  manifest: TrainingJobFeaturePreparationManifestV1,
): Array<TrainingJobFeatureShardUtteranceV1 & { readonly shardId: string }> {
  return manifest.shards.flatMap((shard) =>
    shard.utterances.map((utterance) => ({ ...utterance, shardId: shard.shardId })),
  );
}

interface MutableFrameLabelSplitTotals {
  utterances: number;
  alignedUtterances: number;
  lowConfidenceExcludedUtterances: number;
  frames: number;
  usableFrames: number;
  excludedFrames: number;
}

function summarizeFrameLabelTotals(
  utterances: readonly TrainingJobFrameLabelsUtteranceV1[],
): TrainingJobFrameLabelsManifestV1['totals'] {
  const splits: Record<(typeof featureSplitNames)[number], MutableFrameLabelSplitTotals> = {
    train: createEmptyFrameLabelSplitTotals(),
    validation: createEmptyFrameLabelSplitTotals(),
    test: createEmptyFrameLabelSplitTotals(),
  };
  let alignedUtterances = 0;
  let lowConfidenceExcludedUtterances = 0;
  let frames = 0;
  let usableFrames = 0;
  let excludedFrames = 0;
  for (const utterance of utterances) {
    const split = splits[utterance.split];
    split.utterances += 1;
    split.frames += utterance.frameCount;
    split.usableFrames += utterance.usableFrameCount;
    split.excludedFrames += utterance.excludedFrameCount;
    frames += utterance.frameCount;
    usableFrames += utterance.usableFrameCount;
    excludedFrames += utterance.excludedFrameCount;
    if (utterance.status === 'aligned') {
      alignedUtterances += 1;
      split.alignedUtterances += 1;
    } else {
      lowConfidenceExcludedUtterances += 1;
      split.lowConfidenceExcludedUtterances += 1;
    }
  }
  return {
    utterances: utterances.length,
    alignedUtterances,
    lowConfidenceExcludedUtterances,
    frames,
    usableFrames,
    excludedFrames,
    splits,
  };
}

function createEmptyFrameLabelSplitTotals(): MutableFrameLabelSplitTotals {
  return {
    utterances: 0,
    alignedUtterances: 0,
    lowConfidenceExcludedUtterances: 0,
    frames: 0,
    usableFrames: 0,
    excludedFrames: 0,
  };
}

function summarizeFeatureSelectedVocabulary(
  shards: readonly PreparedFeatureShardRecord[],
  vocabularyRevisionSha256: string | undefined,
): TrainingJobFeatureSelectedVocabularyTotalsV1 {
  const entryIds = new Set<string>();
  const splits = createSelectedFeatureSplits();
  let utterances = 0;
  let frames = 0;
  for (const shard of shards) {
    for (const utterance of shard.utterances) {
      if (utterance.selectedVocabularyEntryIds.length === 0) continue;
      utterances += 1;
      frames += utterance.frameCount;
      splits[utterance.split].utterances += 1;
      splits[utterance.split].frames += utterance.frameCount;
      utterance.selectedVocabularyEntryIds.forEach((entryId) => entryIds.add(entryId));
    }
  }
  return {
    ...(vocabularyRevisionSha256 === undefined ? {} : { vocabularyRevisionSha256 }),
    selectedEntryCount: entryIds.size,
    utterances,
    frames,
    splits,
  };
}

function summarizeFrameLabelSelectedVocabulary(
  utterances: readonly TrainingJobFrameLabelsUtteranceV1[],
  vocabularyRevisionSha256: string | undefined,
): TrainingJobFrameLabelsSelectedVocabularyTotalsV1 {
  const entryIds = new Set<string>();
  const splits = createSelectedFrameLabelSplits();
  let utteranceCount = 0;
  let frames = 0;
  let usableFrames = 0;
  let excludedFrames = 0;
  for (const utterance of utterances) {
    if (utterance.selectedVocabularyEntryIds.length === 0) continue;
    utteranceCount += 1;
    frames += utterance.frameCount;
    usableFrames += utterance.usableFrameCount;
    excludedFrames += utterance.excludedFrameCount;
    splits[utterance.split].utterances += 1;
    splits[utterance.split].frames += utterance.frameCount;
    splits[utterance.split].usableFrames += utterance.usableFrameCount;
    splits[utterance.split].excludedFrames += utterance.excludedFrameCount;
    utterance.selectedVocabularyEntryIds.forEach((entryId) => entryIds.add(entryId));
  }
  return {
    ...(vocabularyRevisionSha256 === undefined ? {} : { vocabularyRevisionSha256 }),
    selectedEntryCount: entryIds.size,
    utterances: utteranceCount,
    frames,
    usableFrames,
    excludedFrames,
    splits,
  };
}

function createSelectedFeatureSplits(): Record<
  (typeof featureSplitNames)[number],
  { utterances: number; frames: number }
> {
  return {
    train: { utterances: 0, frames: 0 },
    validation: { utterances: 0, frames: 0 },
    test: { utterances: 0, frames: 0 },
  };
}

function createSelectedFrameLabelSplits(): Record<
  (typeof featureSplitNames)[number],
  { utterances: number; frames: number; usableFrames: number; excludedFrames: number }
> {
  return {
    train: { utterances: 0, frames: 0, usableFrames: 0, excludedFrames: 0 },
    validation: { utterances: 0, frames: 0, usableFrames: 0, excludedFrames: 0 },
    test: { utterances: 0, frames: 0, usableFrames: 0, excludedFrames: 0 },
  };
}

const featureSplitNames = ['train', 'validation', 'test'] as const;

interface MutableFeatureShardBuilder {
  readonly split: (typeof featureSplitNames)[number];
  readonly melBinCount: number;
  shardIndex: number;
  frameCount: number;
  readonly frames: number[];
  readonly utterances: TrainingJobFeatureShardUtteranceV1[];
}

function createFeatureShardBuilders(
  melBinCount: number,
): Record<(typeof featureSplitNames)[number], MutableFeatureShardBuilder> {
  return {
    train: createFeatureShardBuilder('train', melBinCount),
    validation: createFeatureShardBuilder('validation', melBinCount),
    test: createFeatureShardBuilder('test', melBinCount),
  };
}

function createFeatureShardBuilder(
  split: (typeof featureSplitNames)[number],
  melBinCount: number,
): MutableFeatureShardBuilder {
  return {
    split,
    melBinCount,
    shardIndex: 0,
    frameCount: 0,
    frames: [],
    utterances: [],
  };
}

function addUtteranceFeaturesToShardBuilders(
  builder: MutableFeatureShardBuilder,
  utterance: TrainingJobEnrollmentUtteranceRefV1,
  features: ReturnType<typeof extractLogMelFeatures>,
): void {
  const frameOffset = builder.frameCount;
  for (const value of features.frames) {
    builder.frames.push(value);
  }
  builder.frameCount += features.frameCount;
  builder.utterances.push({
    utteranceId: utterance.id,
    promptId: utterance.promptId,
    split: builder.split,
    frameOffset,
    frameCount: features.frameCount,
    durationMs: utterance.durationMs,
    audioSha256: utterance.audio.sha256,
    selectedVocabularyEntryIds: utterance.selectedVocabularyEntryIds,
  });
}

async function flushFeatureShardBuilder(
  builder: MutableFeatureShardBuilder,
  input: PrepareFeatureShardFilesInput,
  output: PreparedFeatureShardRecord[],
): Promise<void> {
  const shardId = `${builder.split}-${String(builder.shardIndex + 1).padStart(4, '0')}`;
  const finalPath = pathToPortableString([
    ...trainingJobFeatureSetPath(input.revision.jobId, input.featureSetId),
    'shards',
    `${shardId}.f16`,
  ]);
  const stagedPath = pathToPortableString([...input.tempPrefix, `${shardId}.f16`]);
  const bytes = encodeFloat16Array(builder.frames);
  const sha256 = await input.digest(bytes);
  await input.writeStagedFile(portablePathToSegments(stagedPath), bytes, sha256);
  output.push({
    schemaVersion: 1,
    shardId,
    split: builder.split,
    stagedPath,
    finalPath,
    dtype: 'float16-le',
    frameCount: builder.frameCount,
    melBinCount: builder.melBinCount,
    utteranceCount: builder.utterances.length,
    sizeBytes: bytes.byteLength,
    sha256,
    utterances: [...builder.utterances],
  });
  builder.shardIndex += 1;
  builder.frameCount = 0;
  builder.frames.length = 0;
  builder.utterances.length = 0;
}

interface MutableFeatureSplitTotals {
  utterances: number;
  frames: number;
  shards: number;
  durationSeconds: number;
  sizeBytes: number;
}

function summarizeFeatureShardTotals(
  shards: readonly PreparedFeatureShardRecord[] | readonly TrainingJobFeatureShardV1[],
): TrainingJobFeaturePreparationManifestV1['totals'] {
  const splits: Record<(typeof featureSplitNames)[number], MutableFeatureSplitTotals> = {
    train: createEmptyFeatureSplitTotals(),
    validation: createEmptyFeatureSplitTotals(),
    test: createEmptyFeatureSplitTotals(),
  };
  let utterances = 0;
  let frames = 0;
  let sizeBytes = 0;
  let durationSeconds = 0;
  for (const shard of shards) {
    const split = splits[shard.split];
    split.utterances += shard.utteranceCount;
    split.frames += shard.frameCount;
    split.shards += 1;
    split.sizeBytes += shard.sizeBytes;
    const shardDurationSeconds = roundSeconds(
      shard.utterances.reduce((sum, utterance) => sum + utterance.durationMs, 0) / 1_000,
    );
    split.durationSeconds = roundSeconds(split.durationSeconds + shardDurationSeconds);
    utterances += shard.utteranceCount;
    frames += shard.frameCount;
    sizeBytes += shard.sizeBytes;
    durationSeconds = roundSeconds(durationSeconds + shardDurationSeconds);
  }
  return {
    utterances,
    frames,
    shards: shards.length,
    durationSeconds,
    sizeBytes,
    splits,
  };
}

function createEmptyFeatureSplitTotals(): MutableFeatureSplitTotals {
  return { utterances: 0, frames: 0, shards: 0, durationSeconds: 0, sizeBytes: 0 };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

async function readAndVerifyFrozenAudio(
  utterance: TrainingJobEnrollmentUtteranceRefV1,
  readFile: (path: readonly string[]) => Promise<ArrayBuffer | undefined>,
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<ArrayBuffer> {
  const bytes = await readFile(portablePathToSegments(utterance.audio.path));
  if (bytes === undefined) {
    throw new Error(`Enrollment audio file ${utterance.audio.path} is missing.`);
  }
  const sha256 = await digest(bytes);
  if (sha256 !== utterance.audio.sha256 || bytes.byteLength !== utterance.audio.sizeBytes) {
    throw new Error(`Enrollment audio file ${utterance.audio.path} changed after job freeze.`);
  }
  return bytes;
}

function decodePcm16MonoWav(bytes: ArrayBuffer, expectedSampleRateHz: number): Float32Array {
  const view = new DataView(bytes);
  if (
    bytes.byteLength < 44 ||
    readAscii(view, 0, 4) !== 'RIFF' ||
    readAscii(view, 8, 12) !== 'WAVE'
  ) {
    throw new Error('Enrollment audio must be a RIFF/WAVE file.');
  }
  let offset = 12;
  let sampleRateHz: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;
  let dataOffset: number | undefined;
  let dataBytes: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(view, offset, offset + 4);
    const chunkBytes = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkBytes > bytes.byteLength) {
      throw new Error('Enrollment WAV file has an invalid chunk size.');
    }
    if (chunkId === 'fmt ') {
      if (chunkBytes < 16) {
        throw new Error('Enrollment WAV fmt chunk is too short.');
      }
      const audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRateHz = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (audioFormat !== 1) {
        throw new Error('Enrollment WAV audio must use PCM format.');
      }
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataBytes = chunkBytes;
    }
    offset = chunkDataOffset + chunkBytes + (chunkBytes % 2);
  }
  if (channels !== 1 || bitsPerSample !== 16 || sampleRateHz !== expectedSampleRateHz) {
    throw new Error(
      `Enrollment WAV must be mono 16-bit PCM at ${expectedSampleRateHz.toString()} Hz.`,
    );
  }
  if (dataOffset === undefined || dataBytes === undefined || dataBytes % 2 !== 0) {
    throw new Error('Enrollment WAV file is missing valid PCM data.');
  }
  const samples = new Float32Array(dataBytes / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 0x8000;
  }
  return samples;
}

function readAscii(view: DataView, start: number, end: number): string {
  let text = '';
  for (let index = start; index < end; index += 1) {
    text += String.fromCharCode(view.getUint8(index));
  }
  return text;
}

function normalizeMaxFramesPerShard(value: number | undefined): number {
  const maxFrames = value ?? 512;
  if (!Number.isInteger(maxFrames) || maxFrames <= 0) {
    throw new Error('maxFramesPerShard must be a positive integer.');
  }
  return maxFrames;
}

function createFeatureSummaryPrivacy(): TrainingJobFeaturePreparationSummaryV1['privacy'] {
  return {
    aggregateOnly: true,
    localOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    exposesRawPromptIds: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    telemetry: false,
  };
}

function createFrameLabelsManifestPrivacy(): TrainingJobFrameLabelsManifestV1['privacy'] {
  return {
    localOnly: true,
    defaultExportIncludesFrameLabels: false,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsFrameLabels: true,
    containsTokenIds: true,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    exposesRawPromptIds: true,
    exposesRawVocabularyEntryIds: true,
    networkUpload: false,
    telemetry: false,
  };
}

function createFrameLabelsSummaryPrivacy(): TrainingJobFrameLabelsSummaryV1['privacy'] {
  return {
    aggregateOnly: true,
    localOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsFrameLabels: false,
    containsTokenIds: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    exposesRawPromptIds: false,
    exposesRawVocabularyEntryIds: false,
    networkUpload: false,
    telemetry: false,
  };
}

async function buildTrainingJobEnrollmentRevision(
  summary: EnrollmentProfileSummaryV1,
  digest: (bytes: ArrayBuffer) => Promise<string>,
  readFile?: (path: readonly string[]) => Promise<ArrayBuffer | undefined>,
  vocabulary?: TrainingJobVocabularyRevisionV1,
): Promise<TrainingJobEnrollmentRevisionV1> {
  const utterances = await Promise.all(
    summary.utterances.map(async (utterance): Promise<TrainingJobEnrollmentUtteranceRefV1> => {
      const audioBytes = await readFile?.(portablePathToSegments(utterance.audio.path));
      if (readFile !== undefined && audioBytes === undefined) {
        throw new Error(`Enrollment audio file ${utterance.audio.path} is missing.`);
      }
      const audioSha256 =
        audioBytes === undefined ? utterance.audio.sha256 : await digest(audioBytes);
      const audioSizeBytes =
        audioBytes === undefined ? utterance.audio.sizeBytes : audioBytes.byteLength;
      const selectedVocabularyEntryIds = selectedVocabularyEntryIdsForUtterance(
        utterance,
        vocabulary,
      );
      return {
        id: utterance.id,
        promptId: utterance.promptId,
        promptVersion: utterance.promptVersion,
        language: utterance.language,
        voiceCondition: utterance.voiceCondition,
        repetitionIndex: utterance.repetitionIndex,
        durationMs: utterance.audio.durationMs,
        qualityStatus: utterance.quality.status,
        selectedVocabularyEntryIds,
        audio: {
          path: utterance.audio.path,
          sha256: audioSha256,
          sizeBytes: audioSizeBytes,
        },
        metadataPath: pathToPortableString(
          profilePath(summary.profile.id, 'utterances', `${utterance.id}.json`),
        ),
        metadataSha256: await digest(stableJsonBytes(utterance)),
      };
    }),
  );
  const selectedVocabulary = summarizeEnrollmentSelectedVocabulary(utterances, vocabulary);
  const unsigned = {
    schemaVersion: 1,
    profileUpdatedAt: summary.profile.updatedAt,
    sentenceBankVersion: summary.profile.enrollment.sentenceBankVersion,
    acceptedUtterances: summary.profile.enrollment.acceptedUtterances,
    acceptedSeconds: summary.profile.enrollment.acceptedSeconds,
    utterances,
    ...(selectedVocabulary === undefined ? {} : { selectedVocabulary }),
  } satisfies Omit<TrainingJobEnrollmentRevisionV1, 'revisionSha256'>;
  return {
    ...unsigned,
    revisionSha256: await digest(stableJsonBytes(unsigned)),
  };
}

async function buildTrainingJobVocabularyRevision(
  vocabularyStore: VocabularyStoreSnapshotV1,
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<TrainingJobVocabularyRevisionV1> {
  const validation = validateVocabularyStoreSnapshot(vocabularyStore);
  if (validation.normalizedSnapshot === undefined || validation.revision === undefined) {
    throw new Error(
      `Cannot freeze invalid vocabulary store snapshot: ${validation.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  const unsigned = {
    schemaVersion: 1,
    storeRevision: validation.normalizedSnapshot.revision,
    activeSetIds: validation.normalizedSnapshot.activeSetIds,
    activeEntryCount: validation.activeEntryCount,
    revision: validation.revision,
  } satisfies Omit<TrainingJobVocabularyRevisionV1, 'revisionSha256'>;
  return {
    ...unsigned,
    revisionSha256: await digest(stableJsonBytes(unsigned)),
  };
}

function selectedVocabularyEntryIdsForUtterance(
  utterance: EnrollmentUtteranceV1,
  vocabulary: TrainingJobVocabularyRevisionV1 | undefined,
): readonly string[] {
  if (vocabulary === undefined) return [];
  const activeEntryIds = new Set(vocabulary.revision.entries.map((entry) => entry.id));
  const explicitIds = normalizeSelectedVocabularyEntryIds(utterance.customVocabularyEntryIds ?? []);
  const parsedId = parseCustomVocabularyPromptId(utterance.promptId)?.vocabularyEntryId;
  return normalizeSelectedVocabularyEntryIds([
    ...explicitIds,
    ...(parsedId === undefined ? [] : [parsedId]),
  ]).filter((entryId) => activeEntryIds.has(entryId));
}

function summarizeEnrollmentSelectedVocabulary(
  utterances: readonly TrainingJobEnrollmentUtteranceRefV1[],
  vocabulary: TrainingJobVocabularyRevisionV1 | undefined,
): TrainingJobEnrollmentRevisionV1['selectedVocabulary'] {
  if (vocabulary === undefined) return undefined;
  const selectedEntryIds = normalizeSelectedVocabularyEntryIds(
    utterances.flatMap((utterance) => utterance.selectedVocabularyEntryIds),
  );
  return {
    vocabularyRevisionSha256: vocabulary.revisionSha256,
    selectedEntryIds,
    selectedEntryCount: selectedEntryIds.length,
    utteranceCount: utterances.filter(
      (utterance) => utterance.selectedVocabularyEntryIds.length > 0,
    ).length,
  };
}

function normalizeSelectedVocabularyEntryIds(entryIds: readonly string[]): readonly string[] {
  return [
    ...new Set(
      entryIds
        .map((entryId) => entryId.trim())
        .filter(Boolean)
        .map((entryId) => normalizeSegment(entryId, 'vocabularyEntryId')),
    ),
  ].sort((left, right) => left.localeCompare(right, 'vi'));
}

export function buildTrainingReadinessCoverageReportForProfile(
  summary: EnrollmentProfileSummaryV1,
  policy?: TrainingReadinessPolicyV1,
  identityOptions?: TrainingReadinessIdentityOptions,
): TrainingReadinessCoverageReportV1 {
  return buildTrainingReadinessCoverageReport(
    summary.utterances.map(toTrainingReadinessUtterance),
    policy,
    identityOptions,
  );
}

function toTrainingReadinessUtterance(
  utterance: EnrollmentUtteranceV1,
): TrainingReadinessAcceptedUtteranceV1 {
  return {
    schemaVersion: 1,
    utteranceId: utterance.id,
    promptId: utterance.promptId,
    language: utterance.language,
    voiceCondition: utterance.voiceCondition,
    durationMs: utterance.audio.durationMs,
    qualityStatus: utterance.quality.status,
    ...(utterance.customVocabularyEntryIds === undefined
      ? {}
      : { customVocabularyEntryIds: utterance.customVocabularyEntryIds }),
  };
}

export interface ProfileManagerPackageInfo {
  readonly name: '@speech/profile-manager';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: ProfileManagerPackageInfo = {
  name: '@speech/profile-manager',
  status: 'active',
  description:
    'Private profile storage, multi-profile import/dedupe/naming, atomic portable model imports, SpeechProfileManifest V1-to-V2 migration recovery, activation-review guarded enables, frozen training-job revisions, FP16 feature shards, CTC frame-label alignment sets, prompt split planning, readiness reporting, import/export, rollback, and deletion.',
};

type ResolvedEnrollmentProfileImportMode = EnrollmentProfileImportMode | 'legacy';

function resolveProfileImportMode(
  input: ImportEnrollmentProfileInput,
): ResolvedEnrollmentProfileImportMode {
  if (input.mode !== undefined) return input.mode;
  return input.overwriteExisting === true ? 'replace' : 'legacy';
}

function createProfileImportResultPrivacy(): EnrollmentProfileImportResultV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsRawProfileId: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  };
}

function createSpeechProfileMigrationPrivacy(): SpeechProfileManifestMigrationResultV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsRawProfileId: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    exposesStoragePaths: false,
    localOnly: true,
  };
}

function summarizeSpeechProfileManifestMigration(input: {
  readonly status: SpeechProfileManifestMigrationStatusV1;
  readonly migratedAt: string;
  readonly sourceSchemaVersion: 1 | 2;
  readonly manifest: SpeechProfileManifestV2;
  readonly deletedTemporaryFiles: number;
  readonly reusedExistingV2: boolean;
  readonly replacedInvalidV2: boolean;
  readonly v1ManifestRetained: boolean;
}): SpeechProfileManifestMigrationResultV1 {
  return {
    schemaVersion: 1,
    migrationType: 'speech-profile-manifest-v1-to-v2',
    status: input.status,
    migratedAt: input.migratedAt,
    sourceSchemaVersion: input.sourceSchemaVersion,
    targetSchemaVersion: 2,
    manifest: {
      adaptationType: input.manifest.adaptation.type,
      baseModel: {
        id: input.manifest.baseModel.id,
        version: input.manifest.baseModel.version,
      },
      languageCount: input.manifest.languages.length,
      activationGatePassed: input.manifest.evaluation.activationGatePassed,
      warningCount: input.manifest.evaluation.warnings.length,
      cliResidualAdapterPreserved: input.manifest.adaptation.type === 'residual-adapter',
    },
    recovery: {
      deletedTemporaryFiles: input.deletedTemporaryFiles,
      reusedExistingV2: input.reusedExistingV2,
      replacedInvalidV2: input.replacedInvalidV2,
    },
    downgrade: {
      v1ManifestRetained: input.v1ManifestRetained,
      v2ManifestFileName: 'profile.v2.json',
    },
    privacy: createSpeechProfileMigrationPrivacy(),
  };
}

function fingerprintProfileContent(
  value: EnrollmentProfileExportPackageV1 | EnrollmentProfileSummaryV1,
): string {
  const { profile, utterances } = value;
  return JSON.stringify({
    baseModel: profile.baseModel ?? null,
    enrollment: profile.enrollment,
    utterances: utterances.map((utterance) => ({
      promptId: utterance.promptId,
      promptVersion: utterance.promptVersion,
      language: utterance.language,
      voiceCondition: utterance.voiceCondition,
      repetitionIndex: utterance.repetitionIndex,
      customVocabularyEntryIds: utterance.customVocabularyEntryIds ?? [],
      audioSha256: utterance.audio.sha256,
      durationMs: utterance.audio.durationMs,
      sizeBytes: utterance.audio.sizeBytes,
      acceptedBy: utterance.acceptedBy,
    })),
  });
}

function rewriteImportedUtterance(
  utterance: EnrollmentUtteranceV1,
  sourceProfileId: string,
  targetProfileId: string,
): EnrollmentUtteranceV1 {
  return {
    ...utterance,
    profileId: targetProfileId,
    audio: {
      ...utterance.audio,
      path: replaceProfilePathPrefix(utterance.audio.path, sourceProfileId, targetProfileId),
    },
  };
}

function replaceProfilePathPrefix(
  path: string,
  fromProfileId: string,
  toProfileId: string,
): string {
  const fromPrefix = pathToPortableString(profilePath(fromProfileId));
  const toPrefix = pathToPortableString(profilePath(toProfileId));
  if (path === fromPrefix) return toPrefix;
  if (!path.startsWith(`${fromPrefix}/`)) {
    throw new Error(`Profile export file path ${path} is outside profile ${fromProfileId}.`);
  }
  return `${toPrefix}${path.slice(fromPrefix.length)}`;
}

function normalizeProfileDisplayName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) throw new Error('Profile display name must not be empty.');
  if (trimmed.length > 80) throw new Error('Profile display name must be at most 80 characters.');
  return trimmed;
}

function resolveUniqueProfileId(
  requestedProfileId: string,
  summaries: readonly EnrollmentProfileSummaryV1[],
): string {
  const existing = new Set(summaries.map((summary) => summary.profile.id));
  if (!existing.has(requestedProfileId)) return requestedProfileId;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${requestedProfileId}-${index.toString()}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('Could not resolve a unique imported profile id.');
}

function resolveUniqueProfileDisplayName(
  requestedDisplayName: string,
  summaries: readonly EnrollmentProfileSummaryV1[],
  replacingProfileId?: string,
): string {
  const existing = new Set(
    summaries
      .filter((summary) => summary.profile.id !== replacingProfileId)
      .map((summary) => summary.profile.displayName.toLowerCase()),
  );
  if (!existing.has(requestedDisplayName.toLowerCase())) return requestedDisplayName;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${requestedDisplayName} (${index.toString()})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error('Could not resolve a unique imported profile display name.');
}

function slugifyProfileId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length === 0 ? 'imported-profile' : slug;
}

async function writeJsonAtomically(
  backend: ProfileStorageBackend,
  path: readonly string[],
  value: unknown,
): Promise<void> {
  await writeFileAtomically(
    backend,
    path,
    textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`),
  );
}

async function writeFileAtomically(
  backend: ProfileStorageBackend,
  path: readonly string[],
  bytes: ProfileBinaryFile,
): Promise<void> {
  const normalizedPath = normalizePath(path);
  const body = toOwnedArrayBuffer(bytes);
  const fileName = normalizedPath[normalizedPath.length - 1];
  if (fileName === undefined) throw new Error('Profile storage path must include a file name.');
  const tempPath = [...normalizedPath.slice(0, -1), `${fileName}.tmp-${Date.now().toString(36)}`];
  await backend.putFile(tempPath, body);
  const tempBytes = await backend.getFile(tempPath);
  if (tempBytes === undefined || tempBytes.byteLength !== body.byteLength) {
    throw new Error(
      `Temporary profile file verification failed for ${pathToPortableString(path)}.`,
    );
  }
  await backend.putFile(normalizedPath, tempBytes);
  await backend.deleteFile(tempPath);
}

async function writeCheckedFileAtomically(
  backend: ProfileStorageBackend,
  path: readonly string[],
  bytes: ProfileBinaryFile,
  expectedSha256: string,
  digest: (bytes: ArrayBuffer) => Promise<string>,
): Promise<void> {
  await writeFileAtomically(backend, path, bytes);
  const storedBytes = await backend.getFile(path);
  if (storedBytes === undefined) {
    throw new Error(`Profile storage write failed for ${pathToPortableString(path)}.`);
  }
  const actualSha256 = await digest(storedBytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Profile storage checksum verification failed for ${pathToPortableString(path)}.`,
    );
  }
}

async function readRequiredProfileFile(
  backend: ProfileStorageBackend,
  path: readonly string[],
): Promise<ArrayBuffer> {
  const bytes = await backend.getFile(path);
  if (bytes === undefined) {
    throw new Error(`Profile storage is missing required file ${pathToPortableString(path)}.`);
  }
  return bytes;
}

function createEmptyChecksumIndex(
  profileId: string,
  updatedAt: string,
): EnrollmentProfileChecksumsV1 {
  return { schemaVersion: 1, profileId, updatedAt, files: {} };
}

function summarizeEnrollment(
  utterances: readonly EnrollmentUtteranceV1[],
  sentenceBankVersion: string,
): EnrollmentProfileManifestV1['enrollment'] {
  const languageCounts = createLanguageCounts();
  const voiceConditionCounts = createVoiceConditionCounts();
  let acceptedSeconds = 0;
  for (const utterance of utterances) {
    languageCounts[utterance.language] += 1;
    voiceConditionCounts[utterance.voiceCondition] += 1;
    acceptedSeconds += utterance.audio.durationMs / 1_000;
  }
  return {
    acceptedUtterances: utterances.length,
    acceptedSeconds,
    languageCounts,
    voiceConditionCounts,
    sentenceBankVersion,
  };
}

function sanitizeCapture(capture: EnrollmentCaptureMetadataV1): EnrollmentCaptureMetadataV1 {
  return {
    requestedConstraints: sanitizeRecord(capture.requestedConstraints),
    actualSettings: sanitizeRecord(capture.actualSettings),
    ...(capture.userMicrophoneLabel === undefined
      ? {}
      : { userMicrophoneLabel: capture.userMicrophoneLabel }),
  };
}

function sanitizeRecord(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(record)) as Readonly<Record<string, unknown>>;
}

function createLanguageCounts(): Record<EnrollmentSentenceLanguage, number> {
  return { vi: 0, en: 0, mixed: 0 };
}

function createVoiceConditionCounts(): Record<EnrollmentVoiceCondition, number> {
  return { whisper: 0, normal: 0, projected: 0 };
}

function profilePath(profileId: string, ...segments: readonly string[]): string[] {
  return [
    'profiles',
    normalizeSegment(profileId, 'profileId'),
    ...segments.map((segment) => normalizeSegment(segment, 'profilePath')),
  ];
}

function speechProfileManifestV1Path(profileId: string): string[] {
  return profilePath(profileId, 'profile.json');
}

function speechProfileManifestV2Path(profileId: string): string[] {
  return profilePath(profileId, 'profile.v2.json');
}

function normalizeSpeechProfileMigrationPath(
  path: readonly string[],
  fieldName: string,
  requiredFileName: 'profile.json' | 'profile.v2.json',
): string[] {
  const normalizedPath = normalizePath(path);
  const fileName = normalizedPath[normalizedPath.length - 1];
  if (fileName !== requiredFileName) {
    throw new Error(`${fieldName} must end with ${requiredFileName}.`);
  }
  return normalizedPath;
}

async function cleanupSpeechProfileMigrationTemps(
  backend: ProfileStorageBackend,
  targetPath: readonly string[],
): Promise<number> {
  const parentPath = targetPath.slice(0, -1);
  const fileName = targetPath[targetPath.length - 1];
  if (fileName === undefined) return 0;
  let deleted = 0;
  for (const file of await backend.listFiles(parentPath)) {
    if (file.path.length !== targetPath.length) continue;
    const candidate = file.path[file.path.length - 1];
    if (candidate !== undefined && candidate.startsWith(`${fileName}.tmp-`)) {
      if (await backend.deleteFile(file.path)) deleted += 1;
    }
  }
  return deleted;
}

function profileLifecyclePath(...segments: readonly string[]): string[] {
  return [
    'profile-lifecycle',
    ...segments.map((segment) => normalizeSegment(segment, 'profilePath')),
  ];
}

function portableSpeechModelImportStagingPath(importId: string): string[] {
  return ['portable-import-staging', normalizeSegment(importId, 'portableImportId')];
}

function portableSpeechModelImportVersionPath(bundleId: string, importId: string): string[] {
  return [
    'portable-models',
    normalizeSegment(bundleId, 'portableBundleId'),
    'imports',
    normalizeSegment(importId, 'portableImportId'),
  ];
}

function portableSpeechModelImportRecordPath(bundleId: string, importId: string): string[] {
  return [...portableSpeechModelImportVersionPath(bundleId, importId), 'record.json'];
}

function portableSpeechModelActiveRecordPath(bundleId: string): string[] {
  return ['portable-models', normalizeSegment(bundleId, 'portableBundleId'), 'active-import.json'];
}

function portableImportFilePath(root: readonly string[], portablePath: string): string[] {
  return [...normalizePath(root), 'files', ...portablePathToSegments(portablePath)];
}

function trainingJobRevisionPath(jobId?: string): string[] {
  return jobId === undefined
    ? ['training-jobs']
    : ['training-jobs', normalizeSegment(jobId, 'trainingJobId'), 'revision.json'];
}

function trainingJobFeatureSetPath(jobId: string, featureSetId: string): string[] {
  return [
    'training-jobs',
    normalizeSegment(jobId, 'trainingJobId'),
    'features',
    normalizeSegment(featureSetId, 'featureSetId'),
  ];
}

function trainingJobFeatureManifestPath(jobId: string, featureSetId: string): string[] {
  return [...trainingJobFeatureSetPath(jobId, featureSetId), 'manifest.json'];
}

function trainingJobFeatureTempPath(jobId: string, tempId: string): string[] {
  return [
    'training-jobs',
    normalizeSegment(jobId, 'trainingJobId'),
    'feature-staging',
    normalizeSegment(tempId, 'featureTempId'),
  ];
}

function trainingJobFrameLabelsSetPath(
  jobId: string,
  featureSetId: string,
  alignmentSetId: string,
): string[] {
  return [
    ...trainingJobFeatureSetPath(jobId, featureSetId),
    'frame-labels',
    normalizeSegment(alignmentSetId, 'alignmentSetId'),
  ];
}

function trainingJobFrameLabelsManifestPath(
  jobId: string,
  featureSetId: string,
  alignmentSetId: string,
): string[] {
  return [...trainingJobFrameLabelsSetPath(jobId, featureSetId, alignmentSetId), 'manifest.json'];
}

function stableJsonBytes(value: unknown): ArrayBuffer {
  return textEncoder.encode(`${stableJsonStringify(value)}\n`).buffer;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`;
}

function assertBaseModelCompatible(
  actual: ProfileBaseModelIdentity | undefined,
  expected: ProfileBaseModelIdentity,
  profileId: string,
): void {
  if (actual === undefined) {
    throw new Error(`Profile ${profileId} does not declare a base-model identity.`);
  }
  if (
    actual.id !== expected.id ||
    actual.version !== expected.version ||
    actual.manifestSha256 !== expected.manifestSha256 ||
    actual.graphContractSha256 !== expected.graphContractSha256
  ) {
    throw new Error(`Profile ${profileId} base-model identity does not match the active model.`);
  }
}

function assertPortableImportBaseModelCompatible(
  actual: ExactBaseModelIdentityV1,
  expected: ExactBaseModelIdentityV1,
): void {
  if (
    actual.id !== expected.id ||
    actual.version !== expected.version ||
    actual.manifestSha256 !== expected.manifestSha256 ||
    actual.graphContractSha256 !== expected.graphContractSha256 ||
    actual.tokenizerSha256 !== expected.tokenizerSha256
  ) {
    throw new Error('Portable speech model base-model identity does not match the active model.');
  }
}

function assertPortableImportManifestReady(manifest: PortableSpeechModelManifestV1): void {
  const result = validatePortableSpeechModelManifestV1(manifest);
  if (!result.ok) {
    throw new Error(`Portable speech model manifest is invalid: ${result.errors.join('; ')}`);
  }
  if (!manifest.evaluation.gatePassed) {
    throw new Error('Portable speech model evaluation gate must pass before import staging.');
  }
  if (!manifest.privacy.containsVoiceDerivedWeights) {
    throw new Error('Portable speech model import must declare voice-derived weights.');
  }
  if (manifest.testVectors.length === 0) {
    throw new Error('Portable speech model import requires at least one runtime smoke vector.');
  }
}

function assertPortableImportArchiveConsistent(
  archive: ImportedPortableSpeechModelArchiveV1,
): void {
  if (archive.summary.containsVoiceDerivedWeights !== true) {
    throw new Error('Portable speech model import summary must declare voice-derived weights.');
  }
  if (archive.summary.fileCount !== archive.files.length) {
    throw new Error('Portable speech model import summary file count does not match files.');
  }
  const expandedBytes = archive.files.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (archive.summary.expandedBytes !== expandedBytes) {
    throw new Error('Portable speech model import summary expanded bytes does not match files.');
  }

  const manifestFilePaths = new Set(archive.manifest.files.map((ref) => ref.path));
  const allowedPaths = new Set(['manifest.json', ...manifestFilePaths]);
  const filesByPath = new Map<string, ImportedPortableSpeechModelFileV1>();
  const normalizedPaths = new Set<string>();
  for (const file of archive.files) {
    const normalizedPath = pathToPortableString(portablePathToSegments(file.path));
    const collisionKey = normalizedPath.toLowerCase();
    if (normalizedPaths.has(collisionKey)) {
      throw new Error(`Portable speech model import has duplicate or colliding file ${file.path}.`);
    }
    normalizedPaths.add(collisionKey);
    if (!allowedPaths.has(file.path)) {
      throw new Error(`Portable speech model import contains unmanifested file ${file.path}.`);
    }
    if (file.sizeBytes !== file.bytes.byteLength) {
      throw new Error(`Portable speech model import file ${file.path} size does not match bytes.`);
    }
    if (file.mediaType.trim().length === 0) {
      throw new Error(`Portable speech model import file ${file.path} has an empty media type.`);
    }
    filesByPath.set(file.path, file);
  }
  for (const ref of archive.manifest.files) {
    const file = filesByPath.get(ref.path);
    if (file === undefined) {
      throw new Error(`Portable speech model import is missing manifest file ${ref.path}.`);
    }
    if (
      file.sha256 !== ref.sha256 ||
      file.sizeBytes !== ref.sizeBytes ||
      file.mediaType !== ref.mediaType
    ) {
      throw new Error(
        `Portable speech model import file ${ref.path} metadata does not match manifest.`,
      );
    }
  }
}

async function runPortableImportSmokeWithTimeout(
  smokeTest: Promise<PortableSpeechModelImportSmokeResultV1>,
  timeoutMs: number | undefined,
): Promise<PortableSpeechModelImportSmokeResultV1> {
  const timeout = timeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('Portable speech model runtime smoke timeout must be positive.');
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      smokeTest,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Portable speech model runtime smoke timed out.'));
        }, timeout);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

function assertPortableImportSmokeResult(
  result: PortableSpeechModelImportSmokeResultV1,
  expectedVectorCount: number,
): void {
  if (
    result.schemaVersion !== 1 ||
    result.smokeType !== 'portable-speechmodel-import-runtime-smoke' ||
    result.status !== 'passed'
  ) {
    throw new Error('Portable speech model runtime smoke test did not pass.');
  }
  if (result.vectorCount !== expectedVectorCount) {
    throw new Error('Portable speech model runtime smoke vector count does not match manifest.');
  }
  if (!result.privacy.aggregateOnly || !result.privacy.localOnly) {
    throw new Error('Portable speech model runtime smoke result must be aggregate-only and local.');
  }
  if (
    result.privacy.containsRawAudio ||
    result.privacy.containsTranscriptText ||
    result.privacy.containsFeatureTensors ||
    result.privacy.containsCheckpoints ||
    result.privacy.containsAdapterWeights ||
    result.privacy.containsPrivateVocabularyTerms
  ) {
    throw new Error('Portable speech model runtime smoke result exposes private artifacts.');
  }
}

function summarizePortableSpeechModelImportRecord(
  record: PortableSpeechModelImportRecordV1,
): PortableSpeechModelImportSummaryV1 {
  return {
    schemaVersion: 1,
    bundleId: record.bundleId,
    importId: record.importId,
    displayName: record.manifest.displayName,
    importedAt: record.importedAt,
    baseModel: {
      id: record.baseModel.id,
      version: record.baseModel.version,
      exactCompatibility: true,
    },
    adaptationType: record.summary.adaptationType,
    vocabulary: {
      included: record.manifest.vocabulary?.included === true,
      containsPrivateTerms: false,
    },
    fileCount: record.summary.fileCount,
    expandedBytes: record.summary.expandedBytes,
    smokeTest: {
      status: 'passed',
      vectorCount: record.smokeTest.vectorCount,
      warningCount: record.smokeTest.warnings.length,
    },
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

function assertActivationReviewAllowsProfileEnable(
  review: EnrollmentProfileActivationReviewV1,
): void {
  if (review.schemaVersion !== 1 || review.decisionType !== 'personal-model-activation-decision') {
    throw new Error('Unsupported personal-model activation review.');
  }
  if (!review.privacy.aggregateOnly || !review.privacy.localOnly) {
    throw new Error('Personal-model activation review must be aggregate-only and local.');
  }
  if (
    review.privacy.containsRawAudio ||
    review.privacy.containsTranscriptText ||
    review.privacy.containsCaseIds ||
    review.privacy.containsRawProfileId ||
    review.privacy.containsFeatureTensors ||
    review.privacy.containsCheckpoints ||
    review.privacy.containsAdapterWeights ||
    review.privacy.exposesRawVocabularyEntryIds
  ) {
    throw new Error('Personal-model activation review exposes private artifacts.');
  }
  if (review.automaticActivationAllowed && (!review.hardGatePassed || !review.softGatePassed)) {
    throw new Error('Personal-model activation review has inconsistent automatic gate status.');
  }
  if (!review.hardGatePassed) {
    throw new Error('Cannot enable personal profile because hard activation gates failed.');
  }
  if (!review.activationAllowed) {
    throw new Error(
      'Cannot enable personal profile until activation gates pass or an explicit advanced override is accepted.',
    );
  }
  if (!review.automaticActivationAllowed && !review.advancedOverrideAccepted) {
    throw new Error('Advanced activation override must be accepted before enabling this profile.');
  }
}

function validateProfileExportPackageShape(profilePackage: EnrollmentProfileExportPackageV1): void {
  if (
    profilePackage.schemaVersion !== 1 ||
    profilePackage.packageType !== 'speech-enrollment-profile-export'
  ) {
    throw new Error('Unsupported enrollment profile export package.');
  }
  normalizeSegment(profilePackage.profileId, 'profileId');
  if (Object.keys(profilePackage.files).length === 0) {
    throw new Error('Profile export package must contain files.');
  }
}

function assertProfilePackagePath(profileId: string, path: readonly string[]): void {
  const normalizedPath = normalizePath(path);
  const expectedPrefix = profilePath(profileId);
  if (!expectedPrefix.every((segment, index) => normalizedPath[index] === segment)) {
    throw new Error(
      `Profile export file path ${pathToPortableString(path)} is outside profile ${profileId}.`,
    );
  }
}

function validateProfilePackageConsistency(
  profileId: string,
  profilePackage: EnrollmentProfileExportPackageV1,
  decodedFiles: Readonly<Record<string, ArrayBuffer>>,
): void {
  const embeddedProfile = parseRequiredExportJson<EnrollmentProfileManifestV1>(
    decodedFiles,
    profilePath(profileId, 'profile.json'),
  );
  assertJsonEquivalent(
    embeddedProfile,
    profilePackage.profile,
    'Profile export package profile metadata does not match embedded profile.json.',
  );

  const embeddedChecksums = parseRequiredExportJson<EnrollmentProfileChecksumsV1>(
    decodedFiles,
    profilePath(profileId, 'checksums.json'),
  );
  assertJsonEquivalent(
    embeddedChecksums,
    profilePackage.checksums,
    'Profile export package checksum metadata does not match embedded checksums.json.',
  );

  const utterancePrefix = `${pathToPortableString(profilePath(profileId, 'utterances'))}/`;
  const embeddedUtterances = Object.entries(decodedFiles)
    .filter(([path]) => path.startsWith(utterancePrefix) && path.endsWith('.json'))
    .map(([, bytes]) => parseJson<EnrollmentUtteranceV1>(bytes))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  assertJsonEquivalent(
    embeddedUtterances,
    profilePackage.utterances,
    'Profile export package utterance metadata does not match embedded utterance files.',
  );
  assertChecksumIndexMatchesExportFiles(profilePackage.checksums, profilePackage.files);
}

function parseRequiredExportJson<T>(
  decodedFiles: Readonly<Record<string, ArrayBuffer>>,
  path: readonly string[],
): T {
  const portablePath = pathToPortableString(path);
  const bytes = decodedFiles[portablePath];
  if (bytes === undefined) {
    throw new Error(`Profile export package is missing required file ${portablePath}.`);
  }
  return parseJson<T>(bytes);
}

function assertChecksumIndexMatchesExportFiles(
  checksums: EnrollmentProfileChecksumsV1,
  files: Readonly<Record<string, ProfileExportFileV1>>,
): void {
  for (const [path, checksum] of Object.entries(checksums.files)) {
    const file = files[path];
    if (file === undefined) {
      throw new Error(`Profile export checksum references missing file ${path}.`);
    }
    if (file.sha256 !== checksum.sha256 || file.sizeBytes !== checksum.sizeBytes) {
      throw new Error(`Profile export checksum metadata does not match file ${path}.`);
    }
  }
  for (const path of Object.keys(files)) {
    if (path.endsWith('/checksums.json')) continue;
    if (checksums.files[path] === undefined) {
      throw new Error(`Profile export file ${path} is missing from the checksum index.`);
    }
  }
}

function assertJsonEquivalent(actual: unknown, expected: unknown, message: string): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(message);
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Readonly<Record<string, unknown>>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
}

function mediaTypeForProfilePath(path: string): string {
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.json') || path.endsWith('.jsonl')) return 'application/json';
  if (path.endsWith('.f16') || path.endsWith('.f32')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += alphabet[(triplet >> 18) & 0x3f] ?? '';
    output += alphabet[(triplet >> 12) & 0x3f] ?? '';
    output += index + 1 < bytes.length ? (alphabet[(triplet >> 6) & 0x3f] ?? '') : '=';
    output += index + 2 < bytes.length ? (alphabet[triplet & 0x3f] ?? '') : '=';
  }
  return output;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/\s+/g, '');
  if (normalized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new Error('Profile export file is not valid base64.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const output = new Uint8Array((normalized.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const first = alphabet.indexOf(chars[0] ?? '');
    const second = alphabet.indexOf(chars[1] ?? '');
    const third = chars[2] === '=' ? 0 : alphabet.indexOf(chars[2] ?? '');
    const fourth = chars[3] === '=' ? 0 : alphabet.indexOf(chars[3] ?? '');
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new Error('Profile export file is not valid base64.');
    }
    const triplet = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (offset < output.length) output[offset] = (triplet >> 16) & 0xff;
    offset += 1;
    if (offset < output.length) output[offset] = (triplet >> 8) & 0xff;
    offset += 1;
    if (offset < output.length) output[offset] = triplet & 0xff;
    offset += 1;
  }
  return output.buffer;
}

function portablePathToSegments(path: string): string[] {
  return normalizePath(path.split('/'));
}

function pathToPortableString(path: readonly string[]): string {
  return normalizePath(path).join('/');
}

function parseJson<T>(bytes: ArrayBuffer): T {
  return JSON.parse(textDecoder.decode(bytes)) as T;
}

function normalizePath(
  path: readonly string[],
  options: { readonly allowEmpty?: boolean } = {},
): string[] {
  if (path.length === 0 && options.allowEmpty) return [];
  if (path.length === 0) throw new Error('Profile storage path must not be empty.');
  return path.map((segment, index) => normalizeSegment(segment, `path[${index.toString()}]`));
}

function normalizeSegment(value: string, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new Error(`${name} must be a safe non-empty path segment.`);
  }
  return value;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertNonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function toOwnedArrayBuffer(bytes: ProfileBinaryFile): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes.slice(0);
  const view = bytes as ArrayBufferView;
  const output = new ArrayBuffer(view.byteLength);
  new Uint8Array(output).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return output;
}

function storageKey(path: readonly string[]): string {
  return normalizePath(path, { allowEmpty: true }).map(encodeSegment).join('/');
}

function parseStorageKey(key: string): string[] {
  if (key.length === 0) return [];
  return key.split('/').map(decodeSegment);
}

function sortFileRecords(records: ProfileStorageFileRecord[]): ProfileStorageFileRecord[] {
  return records.sort((left, right) => storageKey(left.path).localeCompare(storageKey(right.path)));
}

async function collectOpfsFiles(
  directory: OpfsDirectoryHandleLike,
  currentPath: readonly string[],
  prefix: readonly string[],
  records: ProfileStorageFileRecord[],
): Promise<void> {
  for await (const [name, handle] of iterateDirectory(directory)) {
    const decodedName = decodeSegment(name);
    const nextPath = [...currentPath, decodedName];
    if (!couldMatchPrefix(nextPath, prefix)) continue;
    if (isDirectoryHandle(handle)) {
      await collectOpfsFiles(handle, nextPath, prefix, records);
      continue;
    }
    if (isFileHandle(handle) && matchesPrefix(nextPath, prefix)) {
      const file = await handle.getFile();
      records.push({ path: nextPath, sizeBytes: file.size });
    }
  }
}

function couldMatchPrefix(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => path[index] === undefined || path[index] === segment);
}

function matchesPrefix(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

async function* iterateDirectory(
  directory: OpfsDirectoryHandleLike,
): AsyncIterableIterator<[string, OpfsHandleLike]> {
  const entries = directory.entries;
  if (typeof entries === 'function') {
    yield* entries.call(directory);
    return;
  }
  const iterator = directory[Symbol.asyncIterator];
  if (typeof iterator === 'function') yield* iterator.call(directory);
}

function isDirectoryHandle(value: OpfsHandleLike): value is OpfsDirectoryHandleLike {
  return 'getDirectoryHandle' in value;
}

function isFileHandle(value: OpfsHandleLike): value is OpfsFileHandleLike {
  return 'getFile' in value;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function notFoundError(): DOMException {
  return new DOMException('Profile storage entry was not found.', 'NotFoundError');
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
