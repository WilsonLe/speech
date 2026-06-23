import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
} from '@speech/enrollment';

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

  async deleteProfile(profileId: string): Promise<void> {
    await this.backend.deleteDirectory(['profiles', normalizeSegment(profileId, 'profileId')]);
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

export interface ProfileManagerPackageInfo {
  readonly name: '@speech/profile-manager';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: ProfileManagerPackageInfo = {
  name: '@speech/profile-manager',
  status: 'active',
  description: 'Private profile storage, import/export, rollback, and deletion.',
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
