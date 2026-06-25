import { validateVocabularyStoreSnapshot } from '@speech/context-bias';
import {
  buildPromptIdentitySplitPlan,
  buildTrainingReadinessCoverageReport,
  summarizePromptIdentitySplitPlan,
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
import type { VocabularyRevisionV1, VocabularyStoreSnapshotV1 } from '@speech/protocol';

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

export interface EnableEnrollmentProfileInput {
  readonly profileId: string;
  readonly expectedBaseModel?: ProfileBaseModelIdentity;
}

export interface ImportEnrollmentProfileInput {
  readonly profilePackage: EnrollmentProfileExportPackageV1;
  readonly overwriteExisting?: boolean;
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
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawPromptIds: false;
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
    const profilePackage = input.profilePackage;
    validateProfileExportPackageShape(profilePackage);
    const profileId = normalizeSegment(profilePackage.profileId, 'profileId');
    if (
      profilePackage.profile.id !== profileId ||
      profilePackage.checksums.profileId !== profileId
    ) {
      throw new Error('Profile export package id fields must match.');
    }
    const existing = await this.getProfileSummary(profileId);
    if (existing !== undefined && input.overwriteExisting !== true) {
      throw new Error(`Profile ${profileId} already exists. Set overwriteExisting to replace it.`);
    }
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
    validateProfilePackageConsistency(profileId, profilePackage, decodedFiles);
    if (existing !== undefined) {
      await this.deleteProfile(profileId);
    }
    for (const [path, bytes] of Object.entries(decodedFiles)) {
      await writeFileAtomically(this.backend, portablePathToSegments(path), bytes);
    }
    const summary = await this.getProfileSummary(profileId);
    if (summary === undefined) {
      throw new Error(`Imported profile ${profileId} is missing profile metadata.`);
    }
    return summary;
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
    const enrollment = await buildTrainingJobEnrollmentRevision(
      summary,
      (bytes) => this.digest(bytes),
      (path) => this.backend.getFile(path),
    );
    const vocabulary =
      input.vocabularyStore === undefined
        ? undefined
        : await buildTrainingJobVocabularyRevision(input.vocabularyStore, (bytes) =>
            this.digest(bytes),
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

  async deleteProfile(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
    await this.deleteTrainingJobDataForProfile(normalizedProfileId);
    await this.backend.deleteDirectory(['profiles', normalizedProfileId]);
    const activeState = await this.getActiveProfileState();
    if (
      activeState.activeProfileId === normalizedProfileId ||
      activeState.previousProfileId === normalizedProfileId
    ) {
      const nextState: ActiveEnrollmentProfileStateV1 = {
        schemaVersion: 1,
        ...(activeState.activeProfileId === normalizedProfileId ||
        activeState.activeProfileId === undefined
          ? {}
          : { activeProfileId: activeState.activeProfileId }),
        ...(activeState.previousProfileId === normalizedProfileId ||
        activeState.previousProfileId === undefined
          ? {}
          : { previousProfileId: activeState.previousProfileId }),
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
    privacy: createFeatureSummaryPrivacy(),
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
    networkUpload: false,
    telemetry: false,
  };
}

async function buildTrainingJobEnrollmentRevision(
  summary: EnrollmentProfileSummaryV1,
  digest: (bytes: ArrayBuffer) => Promise<string>,
  readFile?: (path: readonly string[]) => Promise<ArrayBuffer | undefined>,
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
      return {
        id: utterance.id,
        promptId: utterance.promptId,
        promptVersion: utterance.promptVersion,
        language: utterance.language,
        voiceCondition: utterance.voiceCondition,
        repetitionIndex: utterance.repetitionIndex,
        durationMs: utterance.audio.durationMs,
        qualityStatus: utterance.quality.status,
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
  const unsigned = {
    schemaVersion: 1,
    profileUpdatedAt: summary.profile.updatedAt,
    sentenceBankVersion: summary.profile.enrollment.sentenceBankVersion,
    acceptedUtterances: summary.profile.enrollment.acceptedUtterances,
    acceptedSeconds: summary.profile.enrollment.acceptedSeconds,
    utterances,
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
    'Private profile storage, frozen training-job revisions, FP16 feature shards, prompt split planning, readiness reporting, import/export, rollback, and deletion.',
};

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

function profileLifecyclePath(...segments: readonly string[]): string[] {
  return [
    'profile-lifecycle',
    ...segments.map((segment) => normalizeSegment(segment, 'profilePath')),
  ];
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
