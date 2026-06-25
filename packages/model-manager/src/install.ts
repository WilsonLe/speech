import {
  parseSpeechModelManifest,
  parseSpeechModelManifestV3,
  type BrowserTrainingArtifactRefV1,
  type SpeechModelManifest,
  type SpeechModelManifestV3,
} from '@speech/protocol';
import type { BinaryModelFile, ModelStorageBackend, ModelStorageLocator } from './storage';

export type ModelInstallErrorCode =
  | 'MODEL_MANIFEST_INVALID'
  | 'MODEL_LICENSE_REJECTED'
  | 'MODEL_DOWNLOAD_FAILED'
  | 'MODEL_CHECKSUM_MISMATCH'
  | 'MODEL_STORAGE_QUOTA_EXCEEDED'
  | 'MODEL_STORAGE_WRITE_FAILED'
  | 'MODEL_VERSION_ACTIVE'
  | 'MODEL_VERSION_NOT_ACTIVE'
  | 'MODEL_TRAINING_COMPANION_UNAVAILABLE';

export type ModelInstallProgressPhase =
  | 'validating-manifest'
  | 'requesting-persistence'
  | 'downloading-file'
  | 'hashing-file'
  | 'writing-temporary-file'
  | 'verifying-temporary-file'
  | 'copying-active-version'
  | 'verifying-active-version'
  | 'activating-version'
  | 'cleaning-temporary-version';

export interface ModelInstallProgress {
  readonly phase: ModelInstallProgressPhase;
  readonly modelId?: string;
  readonly version?: string;
  readonly fileKey?: string;
  readonly completedFiles?: number;
  readonly totalFiles?: number;
  readonly completedBytes?: number;
  readonly totalBytes?: number;
}

export interface ModelPackFileDownloadRequest {
  readonly manifest: SpeechModelManifest;
  readonly fileKey: string;
  readonly url: string;
  readonly mediaType: string;
  readonly expectedSizeBytes: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completedBytes: number, totalBytes: number | undefined) => void;
}

export type ModelPackFileDownloader = (
  request: ModelPackFileDownloadRequest,
) => Promise<ArrayBuffer>;

export type ModelPackFileHasher = (bytes: ArrayBuffer) => Promise<string>;

export interface InstallModelPackOptions {
  readonly storage: ModelStorageBackend;
  readonly downloadFile?: ModelPackFileDownloader;
  readonly hashFile?: ModelPackFileHasher;
  readonly requestPersistentStorage?: () => Promise<boolean>;
  readonly acceptLicense?: (manifest: SpeechModelManifest) => boolean | Promise<boolean>;
  readonly onProgress?: (progress: ModelInstallProgress) => void;
  readonly installId?: string;
  readonly now?: () => Date;
  readonly signal?: AbortSignal;
}

export interface InstalledModelFileRecord {
  readonly fileKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface InstalledTrainingCompanionRecord {
  readonly contractVersion: 1;
  readonly files: readonly InstalledModelFileRecord[];
  readonly requiredStorageBytes: number;
  readonly installId: string;
  readonly installedAt: string;
  readonly activatedAt: string;
}

export interface InstalledModelRecord {
  readonly schemaVersion: 1;
  readonly modelId: string;
  readonly activeVersion: string;
  readonly manifest: SpeechModelManifest;
  readonly files: readonly InstalledModelFileRecord[];
  readonly requiredStorageBytes: number;
  readonly backendKind: ModelStorageBackend['kind'];
  readonly installId: string;
  readonly installedAt: string;
  readonly activatedAt: string;
  readonly persistentStorageGranted?: boolean;
  readonly trainingCompanion?: InstalledTrainingCompanionRecord;
}

export interface ModelFileVerificationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const registryModelId = '__speech-model-install-registry';
const registryVersion = 'v1';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class ModelInstallError extends Error {
  readonly code: ModelInstallErrorCode;
  readonly recoverable: boolean;

  constructor(
    code: ModelInstallErrorCode,
    message: string,
    options: { readonly recoverable?: boolean; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ModelInstallError';
    this.code = code;
    this.recoverable = options.recoverable ?? true;
  }
}

export async function installModelPack(
  manifestInput: unknown,
  options: InstallModelPackOptions,
): Promise<InstalledModelRecord> {
  const { storage } = options;
  const hashFile = options.hashFile ?? sha256ArrayBuffer;
  const downloadFile = options.downloadFile ?? defaultDownloadModelFile;
  const now = options.now ?? (() => new Date());
  const installId = options.installId ?? createInstallId();

  let manifest: SpeechModelManifest;
  try {
    emitProgress(options, { phase: 'validating-manifest' });
    manifest = parseSpeechModelManifest(manifestInput);
  } catch (error) {
    throw new ModelInstallError('MODEL_MANIFEST_INVALID', errorMessage(error), {
      cause: error,
    });
  }

  const activeRecord = await getInstalledModelRecord(storage, manifest.id);
  if (activeRecord?.activeVersion === manifest.version) {
    throw new ModelInstallError(
      'MODEL_VERSION_ACTIVE',
      `Model ${manifest.id}@${manifest.version} is already active; delete or roll back before reinstalling it.`,
    );
  }

  await assertLicenseAccepted(manifest, options.acceptLicense);

  const requiredStorageBytes = getManifestRequiredStorageBytes(manifest);
  let persistentStorageGranted: boolean | undefined;
  if (options.requestPersistentStorage !== undefined) {
    emitProgress(options, modelProgress(manifest, 'requesting-persistence'));
    persistentStorageGranted = await options.requestPersistentStorage();
  }

  const tempVersion = `${manifest.version}__install-${installId}`;
  const fileKeys = getInferenceModelFileKeys(manifest);
  const installedAt = now().toISOString();
  const installedFiles: InstalledModelFileRecord[] = [];

  try {
    throwIfAborted(options.signal);
    await storage.clearVersion(manifest.id, tempVersion);

    for (const [index, fileKey] of fileKeys.entries()) {
      const file = manifest.files[fileKey];
      if (file === undefined) {
        throw new ModelInstallError(
          'MODEL_MANIFEST_INVALID',
          `Manifest file entry ${fileKey} disappeared during installation.`,
        );
      }

      const progressBase = fileProgress(manifest, fileKey, index, fileKeys.length, file.sizeBytes);
      emitProgress(options, { ...progressBase, phase: 'downloading-file', completedBytes: 0 });
      const bytes = await withDownloadErrors(fileKey, () =>
        downloadFile(
          downloadRequest(manifest, fileKey, file, options.signal, (completedBytes, totalBytes) => {
            emitProgress(options, {
              ...progressBase,
              phase: 'downloading-file',
              completedBytes,
              ...(totalBytes === undefined ? {} : { totalBytes }),
            });
          }),
        ),
      );

      assertExpectedSize(fileKey, bytes.byteLength, file.sizeBytes);
      emitProgress(options, {
        ...progressBase,
        phase: 'hashing-file',
        completedBytes: bytes.byteLength,
      });
      const downloadedSha256 = await hashFile(bytes);
      assertExpectedSha256(fileKey, downloadedSha256, file.sha256);

      emitProgress(options, {
        ...progressBase,
        phase: 'writing-temporary-file',
        completedBytes: bytes.byteLength,
      });
      await withStorageErrors(() =>
        storage.putFile({ modelId: manifest.id, version: tempVersion, fileKey }, bytes),
      );

      emitProgress(options, {
        ...progressBase,
        phase: 'verifying-temporary-file',
        completedBytes: bytes.byteLength,
      });
      await verifyStoredFile(
        storage,
        { modelId: manifest.id, version: tempVersion, fileKey },
        file,
        hashFile,
      );
      installedFiles.push({
        fileKey,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        mediaType: file.mediaType,
      });
    }

    await storage.clearVersion(manifest.id, manifest.version);
    for (const [index, installedFile] of installedFiles.entries()) {
      const bytes = await storage.getFile({
        modelId: manifest.id,
        version: tempVersion,
        fileKey: installedFile.fileKey,
      });
      if (bytes === undefined) {
        throw new ModelInstallError(
          'MODEL_STORAGE_WRITE_FAILED',
          `Temporary model file ${installedFile.fileKey} is missing before activation.`,
        );
      }
      emitProgress(options, {
        ...fileProgress(
          manifest,
          installedFile.fileKey,
          index,
          installedFiles.length,
          installedFile.sizeBytes,
        ),
        phase: 'copying-active-version',
        completedBytes: bytes.byteLength,
      });
      await withStorageErrors(() =>
        storage.putFile(
          { modelId: manifest.id, version: manifest.version, fileKey: installedFile.fileKey },
          bytes,
        ),
      );
    }

    emitProgress(options, modelProgress(manifest, 'verifying-active-version'));
    const verification = await verifyInstalledModelFiles(storage, manifest, { hashFile });
    if (!verification.ok) {
      throw new ModelInstallError(
        'MODEL_STORAGE_WRITE_FAILED',
        `Active model version verification failed: ${verification.errors.join('; ')}`,
      );
    }

    emitProgress(options, modelProgress(manifest, 'cleaning-temporary-version'));
    await storage.clearVersion(manifest.id, tempVersion);

    const activatedAt = now().toISOString();
    const record = makeInstalledModelRecord({
      manifest,
      files: installedFiles,
      requiredStorageBytes,
      backendKind: storage.kind,
      installId,
      installedAt,
      activatedAt,
      persistentStorageGranted,
    });

    emitProgress(options, modelProgress(manifest, 'activating-version'));
    await writeInstalledModelRecord(storage, record);
    return record;
  } catch (error) {
    await clearTemporaryVersionAfterFailure(storage, manifest.id, tempVersion);
    throw normalizeInstallError(error);
  }
}

export async function installTrainingCompanionPack(
  manifestInput: unknown,
  options: InstallModelPackOptions,
): Promise<InstalledModelRecord> {
  const { storage } = options;
  const hashFile = options.hashFile ?? sha256ArrayBuffer;
  const downloadFile = options.downloadFile ?? defaultDownloadModelFile;
  const now = options.now ?? (() => new Date());
  const installId = options.installId ?? createInstallId();

  let manifest: SpeechModelManifestV3;
  try {
    emitProgress(options, { phase: 'validating-manifest' });
    manifest = parseSpeechModelManifestV3(manifestInput);
  } catch (error) {
    throw new ModelInstallError('MODEL_MANIFEST_INVALID', errorMessage(error), {
      cause: error,
    });
  }

  const activeRecord = await getInstalledModelRecord(storage, manifest.id);
  if (activeRecord?.activeVersion !== manifest.version) {
    throw new ModelInstallError(
      'MODEL_VERSION_NOT_ACTIVE',
      `Training companion pack for ${manifest.id}@${manifest.version} requires that exact model version to be active.`,
    );
  }

  await assertLicenseAccepted(manifest, options.acceptLicense);
  assertTrainingCompanionArtifactLicenses(manifest);

  const activeVerification = await verifyInstalledModelFiles(storage, manifest, { hashFile });
  if (!activeVerification.ok) {
    throw new ModelInstallError(
      'MODEL_STORAGE_WRITE_FAILED',
      `Active model version verification failed before training companion install: ${activeVerification.errors.join('; ')}`,
    );
  }

  const fileKeys = getTrainingCompanionFileKeys(manifest);
  if (fileKeys.length === 0) {
    throw new ModelInstallError(
      'MODEL_TRAINING_COMPANION_UNAVAILABLE',
      `Model ${manifest.id}@${manifest.version} does not declare browser-training companion files.`,
    );
  }

  const requiredStorageBytes = getTrainingCompanionRequiredStorageBytes(manifest);
  let persistentStorageGranted = activeRecord.persistentStorageGranted;
  if (options.requestPersistentStorage !== undefined) {
    emitProgress(options, modelProgress(manifest, 'requesting-persistence'));
    persistentStorageGranted = await options.requestPersistentStorage();
  }

  const tempVersion = `${manifest.version}__training-companion-${installId}`;
  const installedAt = now().toISOString();
  const installedFiles: InstalledModelFileRecord[] = [];

  try {
    throwIfAborted(options.signal);
    await storage.clearVersion(manifest.id, tempVersion);

    for (const [index, fileKey] of fileKeys.entries()) {
      const file = manifest.files[fileKey];
      if (file === undefined) {
        throw new ModelInstallError(
          'MODEL_MANIFEST_INVALID',
          `Training companion file entry ${fileKey} disappeared during installation.`,
        );
      }

      const progressBase = fileProgress(manifest, fileKey, index, fileKeys.length, file.sizeBytes);
      emitProgress(options, { ...progressBase, phase: 'downloading-file', completedBytes: 0 });
      const bytes = await withDownloadErrors(fileKey, () =>
        downloadFile(
          downloadRequest(manifest, fileKey, file, options.signal, (completedBytes, totalBytes) => {
            emitProgress(options, {
              ...progressBase,
              phase: 'downloading-file',
              completedBytes,
              ...(totalBytes === undefined ? {} : { totalBytes }),
            });
          }),
        ),
      );

      assertExpectedSize(fileKey, bytes.byteLength, file.sizeBytes);
      emitProgress(options, {
        ...progressBase,
        phase: 'hashing-file',
        completedBytes: bytes.byteLength,
      });
      const downloadedSha256 = await hashFile(bytes);
      assertExpectedSha256(fileKey, downloadedSha256, file.sha256);

      emitProgress(options, {
        ...progressBase,
        phase: 'writing-temporary-file',
        completedBytes: bytes.byteLength,
      });
      await withStorageErrors(() =>
        storage.putFile({ modelId: manifest.id, version: tempVersion, fileKey }, bytes),
      );

      emitProgress(options, {
        ...progressBase,
        phase: 'verifying-temporary-file',
        completedBytes: bytes.byteLength,
      });
      await verifyStoredFile(
        storage,
        { modelId: manifest.id, version: tempVersion, fileKey },
        file,
        hashFile,
      );
      installedFiles.push({
        fileKey,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        mediaType: file.mediaType,
      });
    }

    for (const [index, installedFile] of installedFiles.entries()) {
      const bytes = await storage.getFile({
        modelId: manifest.id,
        version: tempVersion,
        fileKey: installedFile.fileKey,
      });
      if (bytes === undefined) {
        throw new ModelInstallError(
          'MODEL_STORAGE_WRITE_FAILED',
          `Temporary training companion file ${installedFile.fileKey} is missing before activation.`,
        );
      }
      emitProgress(options, {
        ...fileProgress(
          manifest,
          installedFile.fileKey,
          index,
          installedFiles.length,
          installedFile.sizeBytes,
        ),
        phase: 'copying-active-version',
        completedBytes: bytes.byteLength,
      });
      await withStorageErrors(() =>
        storage.putFile(
          { modelId: manifest.id, version: manifest.version, fileKey: installedFile.fileKey },
          bytes,
        ),
      );
    }

    emitProgress(options, modelProgress(manifest, 'verifying-active-version'));
    const verification = await verifyInstalledTrainingCompanionFiles(storage, manifest, {
      hashFile,
    });
    if (!verification.ok) {
      throw new ModelInstallError(
        'MODEL_STORAGE_WRITE_FAILED',
        `Training companion verification failed: ${verification.errors.join('; ')}`,
      );
    }

    emitProgress(options, modelProgress(manifest, 'cleaning-temporary-version'));
    await storage.clearVersion(manifest.id, tempVersion);

    const activatedAt = now().toISOString();
    const record: InstalledModelRecord = {
      ...activeRecord,
      manifest: cloneJson(manifest),
      ...(persistentStorageGranted === undefined ? {} : { persistentStorageGranted }),
      trainingCompanion: {
        contractVersion: manifest.browserTraining.contractVersion,
        files: installedFiles.map((file) => ({ ...file })),
        requiredStorageBytes,
        installId,
        installedAt,
        activatedAt,
      },
    };

    emitProgress(options, modelProgress(manifest, 'activating-version'));
    await writeInstalledModelRecord(storage, record);
    return record;
  } catch (error) {
    await clearTemporaryVersionAfterFailure(storage, manifest.id, tempVersion);
    throw normalizeInstallError(error);
  }
}

export interface ManifestStorageByteOptions {
  readonly includeTrainingCompanion?: boolean;
}

export function getManifestRequiredStorageBytes(
  manifest: SpeechModelManifest,
  options: ManifestStorageByteOptions = {},
): number {
  return manifestFileKeysForStorage(manifest, options).reduce((total, fileKey) => {
    const file = manifest.files[fileKey];
    return file === undefined ? total : total + file.sizeBytes;
  }, 0);
}

export function getInferenceModelFileKeys(manifest: SpeechModelManifest): string[] {
  if (manifest.schemaVersion === 2) {
    return Object.keys(manifest.files).sort();
  }
  return uniqueSorted(
    Object.values(manifest.graphs).flatMap((graph) => (graph === undefined ? [] : [graph.fileKey])),
  );
}

export function getTrainingCompanionFileKeys(manifest: SpeechModelManifest): string[] {
  if (manifest.schemaVersion !== 3) return [];
  const { browserTraining } = manifest;
  return uniqueSorted(
    trainingCompanionArtifactRefs(browserTraining).map((artifactRef) => artifactRef.fileKey),
  );
}

export function getTrainingCompanionRequiredStorageBytes(manifest: SpeechModelManifest): number {
  return getTrainingCompanionFileKeys(manifest).reduce((total, fileKey) => {
    const file = manifest.files[fileKey];
    return file === undefined ? total : total + file.sizeBytes;
  }, 0);
}

export async function deleteInstalledModelRecord(
  storage: ModelStorageBackend,
  modelId: string,
): Promise<boolean> {
  const activeRecord = await getInstalledModelRecord(storage, modelId);
  if (activeRecord !== undefined) {
    await storage.clearVersion(activeRecord.modelId, activeRecord.activeVersion);
  }
  return storage.deleteFile(registryLocator(modelId));
}

export async function getInstalledModelRecord(
  storage: ModelStorageBackend,
  modelId: string,
): Promise<InstalledModelRecord | undefined> {
  const bytes = await storage.getFile(registryLocator(modelId));
  if (bytes === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new ModelInstallError(
      'MODEL_STORAGE_WRITE_FAILED',
      `Installed model registry record for ${modelId} is not valid JSON.`,
      { cause: error },
    );
  }
  if (!isInstalledModelRecord(parsed)) {
    throw new ModelInstallError(
      'MODEL_STORAGE_WRITE_FAILED',
      `Installed model registry record for ${modelId} is invalid.`,
    );
  }
  return parsed;
}

export async function verifyInstalledModelFiles(
  storage: ModelStorageBackend,
  manifest: SpeechModelManifest,
  options: {
    readonly version?: string;
    readonly hashFile?: ModelPackFileHasher;
    readonly includeTrainingCompanion?: boolean;
    readonly fileKeys?: readonly string[];
  } = {},
): Promise<ModelFileVerificationResult> {
  const version = options.version ?? manifest.version;
  const hashFile = options.hashFile ?? sha256ArrayBuffer;
  const errors: string[] = [];
  const fileKeys =
    options.fileKeys ??
    manifestFileKeysForStorage(
      manifest,
      options.includeTrainingCompanion === undefined
        ? {}
        : { includeTrainingCompanion: options.includeTrainingCompanion },
    );

  for (const fileKey of fileKeys) {
    const file = manifest.files[fileKey];
    if (file === undefined) {
      errors.push(`${fileKey} is not declared in ${manifest.id}@${version}`);
      continue;
    }
    const bytes = await storage.getFile({ modelId: manifest.id, version, fileKey });
    if (bytes === undefined) {
      errors.push(`${fileKey} is missing from ${manifest.id}@${version}`);
      continue;
    }
    if (bytes.byteLength !== file.sizeBytes) {
      errors.push(`${fileKey} size ${bytes.byteLength} did not match expected ${file.sizeBytes}`);
      continue;
    }
    const actualSha256 = await hashFile(bytes);
    if (actualSha256 !== file.sha256) {
      errors.push(`${fileKey} sha256 ${actualSha256} did not match expected ${file.sha256}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function verifyInstalledTrainingCompanionFiles(
  storage: ModelStorageBackend,
  manifest: SpeechModelManifestV3,
  options: { readonly version?: string; readonly hashFile?: ModelPackFileHasher } = {},
): Promise<ModelFileVerificationResult> {
  return verifyInstalledModelFiles(storage, manifest, {
    ...options,
    fileKeys: getTrainingCompanionFileKeys(manifest),
  });
}

export async function sha256ArrayBuffer(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new ModelInstallError(
      'MODEL_CHECKSUM_MISMATCH',
      'SHA-256 verification requires Web Crypto subtle.digest().',
    );
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function defaultDownloadModelFile(
  request: ModelPackFileDownloadRequest,
): Promise<ArrayBuffer> {
  if (typeof globalThis.fetch !== 'function') {
    throw new ModelInstallError(
      'MODEL_DOWNLOAD_FAILED',
      'fetch() is not available in this context.',
    );
  }

  const response = await globalThis.fetch(request.url, requestOptions(request.signal));
  if (!response.ok) {
    throw new ModelInstallError(
      'MODEL_DOWNLOAD_FAILED',
      `Downloading ${request.fileKey} failed with HTTP ${response.status}.`,
    );
  }

  const totalBytes = parseContentLength(response.headers.get('content-length'));
  if (response.body === null) {
    const bytes = await response.arrayBuffer();
    request.onProgress?.(bytes.byteLength, totalBytes);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let completedBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      chunks.push(copy);
      completedBytes += copy.byteLength;
      request.onProgress?.(completedBytes, totalBytes);
    }
  } finally {
    reader.releaseLock();
  }
  return concatenateChunks(chunks, completedBytes);
}

function makeInstalledModelRecord(input: {
  readonly manifest: SpeechModelManifest;
  readonly files: readonly InstalledModelFileRecord[];
  readonly requiredStorageBytes: number;
  readonly backendKind: ModelStorageBackend['kind'];
  readonly installId: string;
  readonly installedAt: string;
  readonly activatedAt: string;
  readonly persistentStorageGranted: boolean | undefined;
}): InstalledModelRecord {
  return {
    schemaVersion: 1,
    modelId: input.manifest.id,
    activeVersion: input.manifest.version,
    manifest: cloneJson(input.manifest),
    files: input.files.map((file) => ({ ...file })),
    requiredStorageBytes: input.requiredStorageBytes,
    backendKind: input.backendKind,
    installId: input.installId,
    installedAt: input.installedAt,
    activatedAt: input.activatedAt,
    ...(input.persistentStorageGranted === undefined
      ? {}
      : { persistentStorageGranted: input.persistentStorageGranted }),
  };
}

async function assertLicenseAccepted(
  manifest: SpeechModelManifest,
  acceptLicense: InstallModelPackOptions['acceptLicense'],
): Promise<void> {
  if (manifest.license.redistributionAllowed) {
    return;
  }
  if (acceptLicense !== undefined && (await acceptLicense(manifest))) {
    return;
  }
  throw new ModelInstallError(
    'MODEL_LICENSE_REJECTED',
    `Model ${manifest.id}@${manifest.version} license is not accepted for installation.`,
  );
}

function assertTrainingCompanionArtifactLicenses(manifest: SpeechModelManifestV3): void {
  const blocked = trainingCompanionArtifactRefs(manifest.browserTraining).filter(
    (artifactRef) => artifactRef.license.redistributionAllowed !== true,
  );
  if (blocked.length === 0) return;
  throw new ModelInstallError(
    'MODEL_LICENSE_REJECTED',
    `Training companion pack for ${manifest.id}@${manifest.version} contains non-redistributable artifact refs: ${blocked
      .map((artifactRef) => artifactRef.fileKey)
      .join(', ')}.`,
  );
}

function manifestFileKeysForStorage(
  manifest: SpeechModelManifest,
  options: ManifestStorageByteOptions,
): string[] {
  const fileKeys = new Set(getInferenceModelFileKeys(manifest));
  if (options.includeTrainingCompanion === true) {
    for (const fileKey of getTrainingCompanionFileKeys(manifest)) {
      fileKeys.add(fileKey);
    }
  }
  return uniqueSorted(fileKeys);
}

function trainingCompanionArtifactRefs(
  browserTraining: SpeechModelManifestV3['browserTraining'],
): BrowserTrainingArtifactRefV1[] {
  return [
    browserTraining.ctcProjection.artifact,
    browserTraining.adapter.runtimeGraph,
    browserTraining.artifacts.trainingModel,
    browserTraining.artifacts.evalModel,
    browserTraining.artifacts.optimizerModel,
    browserTraining.artifacts.contractTestVectors,
    ...browserTraining.artifacts.nominalCheckpoint,
    ...browserTraining.artifacts.anchorPack,
  ];
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function downloadRequest(
  manifest: SpeechModelManifest,
  fileKey: string,
  file: SpeechModelManifest['files'][string],
  signal: AbortSignal | undefined,
  onProgress: ModelPackFileDownloadRequest['onProgress'],
): ModelPackFileDownloadRequest {
  return {
    manifest,
    fileKey,
    url: file.url,
    mediaType: file.mediaType,
    expectedSizeBytes: file.sizeBytes,
    ...(signal === undefined ? {} : { signal }),
    ...(onProgress === undefined ? {} : { onProgress }),
  };
}

async function verifyStoredFile(
  storage: ModelStorageBackend,
  locator: ModelStorageLocator,
  file: SpeechModelManifest['files'][string],
  hashFile: ModelPackFileHasher,
): Promise<void> {
  const bytes = await storage.getFile(locator);
  if (bytes === undefined) {
    throw new ModelInstallError(
      'MODEL_STORAGE_WRITE_FAILED',
      `Stored model file ${locator.fileKey} is missing after write.`,
    );
  }
  assertExpectedSize(locator.fileKey, bytes.byteLength, file.sizeBytes);
  assertExpectedSha256(locator.fileKey, await hashFile(bytes), file.sha256);
}

async function writeInstalledModelRecord(
  storage: ModelStorageBackend,
  record: InstalledModelRecord,
): Promise<void> {
  await withStorageErrors(() =>
    storage.putFile(registryLocator(record.modelId), encodeJson(record)),
  );
}

async function clearTemporaryVersionAfterFailure(
  storage: ModelStorageBackend,
  modelId: string,
  tempVersion: string,
): Promise<void> {
  try {
    await storage.clearVersion(modelId, tempVersion);
  } catch {
    // Preserve the original install failure. A later lifecycle cleanup can remove stale temp files.
  }
}

function registryLocator(modelId: string): ModelStorageLocator {
  return { modelId: registryModelId, version: registryVersion, fileKey: modelId };
}

function modelProgress(
  manifest: SpeechModelManifest,
  phase: ModelInstallProgressPhase,
): ModelInstallProgress {
  return {
    phase,
    modelId: manifest.id,
    version: manifest.version,
  };
}

function fileProgress(
  manifest: SpeechModelManifest,
  fileKey: string,
  completedFiles: number,
  totalFiles: number,
  totalBytes: number,
): Omit<ModelInstallProgress, 'phase'> {
  return {
    modelId: manifest.id,
    version: manifest.version,
    fileKey,
    completedFiles,
    totalFiles,
    totalBytes,
  };
}

function emitProgress(options: InstallModelPackOptions, progress: ModelInstallProgress): void {
  options.onProgress?.(progress);
}

function assertExpectedSize(
  fileKey: string,
  actualSizeBytes: number,
  expectedSizeBytes: number,
): void {
  if (actualSizeBytes !== expectedSizeBytes) {
    throw new ModelInstallError(
      'MODEL_CHECKSUM_MISMATCH',
      `${fileKey} size ${actualSizeBytes} did not match expected ${expectedSizeBytes}.`,
    );
  }
}

function assertExpectedSha256(fileKey: string, actualSha256: string, expectedSha256: string): void {
  if (actualSha256 !== expectedSha256) {
    throw new ModelInstallError(
      'MODEL_CHECKSUM_MISMATCH',
      `${fileKey} sha256 ${actualSha256} did not match expected ${expectedSha256}.`,
    );
  }
}

async function withDownloadErrors<T>(fileKey: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ModelInstallError) throw error;
    throw new ModelInstallError('MODEL_DOWNLOAD_FAILED', `Downloading ${fileKey} failed.`, {
      cause: error,
    });
  }
}

async function withStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ModelInstallError) throw error;
    throw new ModelInstallError(storageErrorCode(error), errorMessage(error), { cause: error });
  }
}

function normalizeInstallError(error: unknown): ModelInstallError {
  if (error instanceof ModelInstallError) return error;
  return new ModelInstallError(storageErrorCode(error), errorMessage(error), { cause: error });
}

function storageErrorCode(error: unknown): ModelInstallErrorCode {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'MODEL_STORAGE_QUOTA_EXCEEDED';
  }
  return 'MODEL_STORAGE_WRITE_FAILED';
}

function requestOptions(signal: AbortSignal | undefined): RequestInit {
  return signal === undefined ? {} : { signal };
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function concatenateChunks(chunks: readonly Uint8Array[], totalBytes: number): ArrayBuffer {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException('Model installation was aborted.', 'AbortError');
  }
}

function createInstallId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function encodeJson(value: unknown): BinaryModelFile {
  return textEncoder.encode(JSON.stringify(value, null, 2));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isInstalledModelRecord(value: unknown): value is InstalledModelRecord {
  if (!isRecord(value)) return false;
  return (
    value['schemaVersion'] === 1 &&
    typeof value['modelId'] === 'string' &&
    typeof value['activeVersion'] === 'string' &&
    isRecord(value['manifest']) &&
    Array.isArray(value['files']) &&
    typeof value['requiredStorageBytes'] === 'number' &&
    typeof value['backendKind'] === 'string' &&
    typeof value['installId'] === 'string' &&
    typeof value['installedAt'] === 'string' &&
    typeof value['activatedAt'] === 'string' &&
    (value['trainingCompanion'] === undefined ||
      isInstalledTrainingCompanionRecord(value['trainingCompanion']))
  );
}

function isInstalledTrainingCompanionRecord(
  value: unknown,
): value is InstalledTrainingCompanionRecord {
  return (
    isRecord(value) &&
    value['contractVersion'] === 1 &&
    Array.isArray(value['files']) &&
    typeof value['requiredStorageBytes'] === 'number' &&
    typeof value['installId'] === 'string' &&
    typeof value['installedAt'] === 'string' &&
    typeof value['activatedAt'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
