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

  async deleteProfile(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeSegment(profileId, 'profileId');
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
    'Private profile storage, frozen training-job revisions, prompt split planning, readiness reporting, import/export, rollback, and deletion.',
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
  if (path.endsWith('.f32')) return 'application/octet-stream';
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
