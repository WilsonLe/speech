import type { ProfileFileRef } from '@speech/protocol';
import {
  PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES,
  PORTABLE_SPEECH_MODEL_MAX_EXPANDED_BYTES,
  PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT,
  decryptPortableSpeechModelEnvelope,
  isSafePortableModelPath,
  normalizePortableModelPath,
  parsePortableSpeechModelEnvelopePrefix,
  portableModelPathsCollide,
  type DecryptPortableSpeechModelEnvelopeOptionsV1,
  type PortableSpeechModelEnvelopeHeaderV1,
} from './envelope';
import {
  parsePortableSpeechModelManifestV1,
  validatePortableSpeechModelManifestV1,
  type PortableSpeechModelManifestV1,
} from './manifest';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Magic for the decrypted/unencrypted payload inside a `.speechmodel` envelope.
 * The outer envelope identifies encryption; this inner archive identifies the
 * deterministic file table after decryption.
 */
export const PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC = new Uint8Array([
  ...textEncoder.encode('WLSPEECHBUNDLE'),
  0,
  1,
]);

export const PORTABLE_SPEECH_MODEL_INNER_BUNDLE_SCHEMA_VERSION = 1;
export const PORTABLE_SPEECH_MODEL_MANIFEST_PATH = 'manifest.json';

const INNER_BUNDLE_HEADER_BYTES = PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength + 4;

export interface PortableSpeechModelBundleFileInputV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: ArrayBuffer | ArrayBufferView;
}

export interface PortableSpeechModelInnerBundleEntryV1 extends ProfileFileRef {
  /** Offset relative to the first payload byte after the index JSON. */
  readonly offset: number;
}

export interface PortableSpeechModelInnerBundleIndexV1 {
  readonly schemaVersion: 1;
  readonly archiveType: 'speechmodel-inner-bundle';
  readonly compression: 'none';
  readonly files: readonly PortableSpeechModelInnerBundleEntryV1[];
  readonly privacy: {
    readonly containsRawAudio: false;
    readonly containsPreparedFeatures: false;
    readonly containsCheckpoints: false;
    readonly containsBaseModel: false;
    readonly containsVoiceDerivedWeights: true;
  };
}

export interface BuildPortableSpeechModelInnerBundleInputV1 {
  readonly manifest: PortableSpeechModelManifestV1;
  readonly files: readonly PortableSpeechModelBundleFileInputV1[];
}

export interface PortableSpeechModelInnerBundleV1 {
  readonly bytes: Uint8Array;
  readonly index: PortableSpeechModelInnerBundleIndexV1;
  readonly manifest: PortableSpeechModelManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface ParsedPortableSpeechModelInnerBundleV1 {
  readonly index: PortableSpeechModelInnerBundleIndexV1;
  readonly manifest: PortableSpeechModelManifestV1;
  readonly dataOffset: number;
}

export interface ImportedPortableSpeechModelFileV1 extends ProfileFileRef {
  readonly bytes: Uint8Array;
}

export interface ImportedPortableSpeechModelArchiveV1 {
  readonly envelopeHeader: PortableSpeechModelEnvelopeHeaderV1;
  readonly index: PortableSpeechModelInnerBundleIndexV1;
  readonly manifest: PortableSpeechModelManifestV1;
  readonly files: readonly ImportedPortableSpeechModelFileV1[];
  readonly summary: {
    readonly encrypted: boolean;
    readonly fileCount: number;
    readonly expandedBytes: number;
    readonly containsVoiceDerivedWeights: true;
  };
}

export type ImportPortableSpeechModelArchiveOptionsV1 = DecryptPortableSpeechModelEnvelopeOptionsV1;

export async function createPortableSpeechModelFileRef(
  file: PortableSpeechModelBundleFileInputV1,
): Promise<ProfileFileRef> {
  const normalized = normalizePortableBundleFile(file);
  return {
    path: normalized.path,
    sha256: await sha256PortableModelBytes(normalized.bytes),
    sizeBytes: normalized.bytes.byteLength,
    mediaType: normalized.mediaType,
  };
}

export async function buildPortableSpeechModelInnerBundle({
  manifest,
  files,
}: BuildPortableSpeechModelInnerBundleInputV1): Promise<PortableSpeechModelInnerBundleV1> {
  assertPortableManifestForBundle(manifest);
  const normalizedFiles = await normalizeAndVerifyBundlePayload(manifest, files);
  const manifestBytes = textEncoder.encode(stablePortableModelJson(manifest));
  const allFiles = [
    ...normalizedFiles,
    {
      path: PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
      mediaType: 'application/json',
      bytes: manifestBytes,
      sha256: await sha256PortableModelBytes(manifestBytes),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));

  const entries: PortableSpeechModelInnerBundleEntryV1[] = [];
  let payloadOffset = 0;
  for (const file of allFiles) {
    entries.push({
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.bytes.byteLength,
      mediaType: file.mediaType,
      offset: payloadOffset,
    });
    payloadOffset += file.bytes.byteLength;
  }

  const index: PortableSpeechModelInnerBundleIndexV1 = {
    schemaVersion: 1,
    archiveType: 'speechmodel-inner-bundle',
    compression: 'none',
    files: entries,
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsCheckpoints: false,
      containsBaseModel: false,
      containsVoiceDerivedWeights: true,
    },
  };
  const indexBytes = textEncoder.encode(stablePortableModelJson(index));
  const totalBytes = INNER_BUNDLE_HEADER_BYTES + indexBytes.byteLength + payloadOffset;
  if (totalBytes > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error('Portable speech model inner bundle exceeds the hard size limit.');
  }
  if (payloadOffset > PORTABLE_SPEECH_MODEL_MAX_EXPANDED_BYTES) {
    throw new Error('Portable speech model inner bundle expanded payload exceeds the limit.');
  }

  const output = new Uint8Array(totalBytes);
  output.set(PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC, 0);
  new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(
    PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength,
    indexBytes.byteLength,
    true,
  );
  output.set(indexBytes, INNER_BUNDLE_HEADER_BYTES);
  let writeOffset = INNER_BUNDLE_HEADER_BYTES + indexBytes.byteLength;
  for (const file of allFiles) {
    output.set(file.bytes, writeOffset);
    writeOffset += file.bytes.byteLength;
  }

  return { bytes: output, index, manifest, manifestBytes };
}

export async function parseAndVerifyPortableSpeechModelInnerBundle(
  bytes: Uint8Array,
): Promise<ParsedPortableSpeechModelInnerBundleV1> {
  const parsed = parsePortableSpeechModelInnerBundleHeader(bytes);
  assertPortableInnerBundleIndex(parsed.index, bytes.byteLength, parsed.dataOffset);
  for (const entry of parsed.index.files) {
    const entryBytes = getPortableSpeechModelInnerBundleFileBytes(bytes, parsed, entry.path);
    const sha256 = await sha256PortableModelBytes(entryBytes);
    if (sha256 !== entry.sha256) {
      throw new Error(`Portable speech model inner bundle file ${entry.path} checksum mismatch.`);
    }
  }
  const manifestBytes = getPortableSpeechModelInnerBundleFileBytes(
    bytes,
    parsed,
    PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
  );
  const manifest = parsePortableSpeechModelManifestV1(parseJson(manifestBytes));
  assertManifestRefsMatchInnerBundle(manifest, parsed.index);
  return { ...parsed, manifest };
}

export async function importPortableSpeechModelArchive(
  bytes: Uint8Array,
  options: ImportPortableSpeechModelArchiveOptionsV1 = {},
): Promise<ImportedPortableSpeechModelArchiveV1> {
  throwIfPortableImportAborted(options.signal);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Portable speech model import must be a Uint8Array.');
  }
  if (bytes.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error('Portable speech model import exceeds the hard size limit.');
  }
  const { header: envelopeHeader } = parsePortableSpeechModelEnvelopePrefix(bytes);
  const innerBundleBytes = await decryptPortableSpeechModelEnvelope(bytes, options);
  throwIfPortableImportAborted(options.signal);
  const parsed = await parseAndVerifyPortableSpeechModelInnerBundle(innerBundleBytes);
  throwIfPortableImportAborted(options.signal);
  const files = extractAndValidateImportedFiles(innerBundleBytes, parsed);
  const expandedBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  return {
    envelopeHeader,
    index: parsed.index,
    manifest: parsed.manifest,
    files,
    summary: {
      encrypted: envelopeHeader.mode === 'encrypted',
      fileCount: files.length,
      expandedBytes,
      containsVoiceDerivedWeights: true,
    },
  };
}

export function getPortableSpeechModelInnerBundleFileBytes(
  bytes: Uint8Array,
  parsed: Pick<ParsedPortableSpeechModelInnerBundleV1, 'index' | 'dataOffset'>,
  path: string,
): Uint8Array {
  const entry = parsed.index.files.find((file) => file.path === path);
  if (entry === undefined) {
    throw new Error(`Portable speech model inner bundle is missing file ${path}.`);
  }
  const start = parsed.dataOffset + entry.offset;
  const end = start + entry.sizeBytes;
  if (start < parsed.dataOffset || end > bytes.byteLength) {
    throw new Error(`Portable speech model inner bundle file ${path} exceeds archive bounds.`);
  }
  return bytes.subarray(start, end);
}

export async function sha256PortableModelBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error('Web Crypto SHA-256 is unavailable for portable model checksums.');
  }
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function stablePortableModelJson(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(
      'Portable model stable JSON does not support undefined, functions, or symbols.',
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Portable model stable JSON requires finite numbers.');
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePortableModelJson).join(',')}]`;
  const entries = Object.entries(value as Readonly<Record<string, unknown>>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stablePortableModelJson(entry)}`)
    .join(',')}}`;
}

function parsePortableSpeechModelInnerBundleHeader(
  bytes: Uint8Array,
): Omit<ParsedPortableSpeechModelInnerBundleV1, 'manifest'> {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Portable speech model inner bundle must be a Uint8Array.');
  }
  if (bytes.byteLength < INNER_BUNDLE_HEADER_BYTES) {
    throw new Error('Portable speech model inner bundle is too small.');
  }
  for (let index = 0; index < PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength; index += 1) {
    if (bytes[index] !== PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC[index]) {
      throw new Error('Portable speech model inner bundle magic is invalid.');
    }
  }
  const indexLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength,
    true,
  );
  const indexOffset = INNER_BUNDLE_HEADER_BYTES;
  if (indexLength > bytes.byteLength - indexOffset) {
    throw new Error('Portable speech model inner bundle index length exceeds remaining bytes.');
  }
  const indexBytes = bytes.subarray(indexOffset, indexOffset + indexLength);
  const index = parseInnerBundleIndex(parseJson(indexBytes));
  return { index, dataOffset: indexOffset + indexLength };
}

function parseInnerBundleIndex(value: unknown): PortableSpeechModelInnerBundleIndexV1 {
  if (!isRecord(value)) {
    throw new Error('Portable speech model inner bundle index must be an object.');
  }
  if (value['schemaVersion'] !== 1) {
    throw new Error('Portable speech model inner bundle index schemaVersion must be 1.');
  }
  if (value['archiveType'] !== 'speechmodel-inner-bundle') {
    throw new Error('Portable speech model inner bundle index archiveType is invalid.');
  }
  if (value['compression'] !== 'none') {
    throw new Error('Portable speech model inner bundle must use compression=none.');
  }
  if (!Array.isArray(value['files']) || value['files'].length === 0) {
    throw new Error('Portable speech model inner bundle index files must be non-empty.');
  }
  const files = value['files'].map((entry, index) => parseInnerBundleEntry(entry, index));
  const privacy = value['privacy'];
  if (!isRecord(privacy)) {
    throw new Error('Portable speech model inner bundle index privacy must be an object.');
  }
  if (
    privacy['containsRawAudio'] !== false ||
    privacy['containsPreparedFeatures'] !== false ||
    privacy['containsCheckpoints'] !== false ||
    privacy['containsBaseModel'] !== false ||
    privacy['containsVoiceDerivedWeights'] !== true
  ) {
    throw new Error('Portable speech model inner bundle index privacy flags are invalid.');
  }
  return {
    schemaVersion: 1,
    archiveType: 'speechmodel-inner-bundle',
    compression: 'none',
    files,
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsCheckpoints: false,
      containsBaseModel: false,
      containsVoiceDerivedWeights: true,
    },
  };
}

function parseInnerBundleEntry(
  value: unknown,
  index: number,
): PortableSpeechModelInnerBundleEntryV1 {
  if (!isRecord(value)) {
    throw new Error(
      `Portable speech model inner bundle file entry ${index.toString()} is invalid.`,
    );
  }
  const path = value['path'];
  const sha256 = value['sha256'];
  const sizeBytes = value['sizeBytes'];
  const mediaType = value['mediaType'];
  const offset = value['offset'];
  if (typeof path !== 'string' || !isSafePortableModelPath(path)) {
    throw new Error(
      `Portable speech model inner bundle file entry ${index.toString()} has unsafe path.`,
    );
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Portable speech model inner bundle file ${path} has invalid SHA-256.`);
  }
  if (!Number.isInteger(sizeBytes) || (sizeBytes as number) <= 0) {
    throw new Error(`Portable speech model inner bundle file ${path} has invalid size.`);
  }
  if (typeof mediaType !== 'string' || mediaType.length === 0) {
    throw new Error(`Portable speech model inner bundle file ${path} has invalid media type.`);
  }
  if (!Number.isInteger(offset) || (offset as number) < 0) {
    throw new Error(`Portable speech model inner bundle file ${path} has invalid offset.`);
  }
  return {
    path,
    sha256,
    sizeBytes: sizeBytes as number,
    mediaType,
    offset: offset as number,
  };
}

function assertPortableInnerBundleIndex(
  index: PortableSpeechModelInnerBundleIndexV1,
  archiveBytes: number,
  dataOffset: number,
): void {
  if (index.files.length > PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT) {
    throw new Error('Portable speech model inner bundle has too many files.');
  }
  const paths = new Set<string>();
  let previousPath = '';
  let expectedOffset = 0;
  let expandedBytes = 0;
  for (const entry of index.files) {
    assertDefaultPortablePayloadAllowed(entry.path, entry.mediaType);
    if (paths.has(entry.path)) {
      throw new Error(`Portable speech model inner bundle has duplicate file path ${entry.path}.`);
    }
    for (const existing of paths) {
      if (portableBundlePathsCollide(existing, entry.path)) {
        throw new Error(
          `Portable speech model inner bundle has colliding file path ${entry.path}.`,
        );
      }
    }
    if (previousPath.length > 0 && previousPath.localeCompare(entry.path) > 0) {
      throw new Error('Portable speech model inner bundle files must be sorted by path.');
    }
    if (entry.offset !== expectedOffset) {
      throw new Error(
        `Portable speech model inner bundle file ${entry.path} has non-contiguous offset.`,
      );
    }
    if (dataOffset + entry.offset + entry.sizeBytes > archiveBytes) {
      throw new Error(
        `Portable speech model inner bundle file ${entry.path} exceeds archive bounds.`,
      );
    }
    paths.add(entry.path);
    previousPath = entry.path;
    expectedOffset += entry.sizeBytes;
    expandedBytes += entry.sizeBytes;
  }
  if (!paths.has(PORTABLE_SPEECH_MODEL_MANIFEST_PATH)) {
    throw new Error('Portable speech model inner bundle must include manifest.json.');
  }
  if (dataOffset + expectedOffset !== archiveBytes) {
    throw new Error('Portable speech model inner bundle has trailing bytes.');
  }
  if (expandedBytes > PORTABLE_SPEECH_MODEL_MAX_EXPANDED_BYTES) {
    throw new Error('Portable speech model inner bundle expanded payload exceeds the limit.');
  }
}

interface NormalizedPortableBundleFile {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

async function normalizeAndVerifyBundlePayload(
  manifest: PortableSpeechModelManifestV1,
  files: readonly PortableSpeechModelBundleFileInputV1[],
): Promise<readonly NormalizedPortableBundleFile[]> {
  if (files.length === 0) {
    throw new Error('Portable speech model inner bundle must contain payload files.');
  }
  if (files.length + 1 > PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT) {
    throw new Error('Portable speech model inner bundle has too many files.');
  }
  const normalizedFiles: NormalizedPortableBundleFile[] = [];
  for (const file of files) {
    const normalized = normalizePortableBundleFile(file);
    if (normalized.path === PORTABLE_SPEECH_MODEL_MANIFEST_PATH) {
      throw new Error('Portable speech model inner bundle generates manifest.json automatically.');
    }
    normalizedFiles.push({
      ...normalized,
      sha256: await sha256PortableModelBytes(normalized.bytes),
    });
  }
  normalizedFiles.sort((left, right) => left.path.localeCompare(right.path));
  assertNoDuplicateBundlePaths(normalizedFiles.map((file) => file.path));
  const refsByPath = new Map(manifest.files.map((ref) => [ref.path, ref]));
  const filesByPath = new Map(normalizedFiles.map((file) => [file.path, file]));
  for (const file of normalizedFiles) {
    const ref = refsByPath.get(file.path);
    if (ref === undefined) {
      throw new Error(`Portable manifest is missing file ref for ${file.path}.`);
    }
    assertFileRefMatches(file, ref);
  }
  for (const ref of manifest.files) {
    if (ref.path === PORTABLE_SPEECH_MODEL_MANIFEST_PATH) {
      throw new Error('Portable manifest files must not include manifest.json self-reference.');
    }
    const file = filesByPath.get(ref.path);
    if (file === undefined) {
      throw new Error(`Portable bundle is missing payload file ${ref.path}.`);
    }
    assertFileRefMatches(file, ref);
  }
  for (const ref of collectRequiredManifestRefs(manifest)) {
    const listed = refsByPath.get(ref.path);
    if (listed === undefined) {
      throw new Error(`Portable manifest required file ${ref.path} is missing from files list.`);
    }
    assertProfileFileRefEquivalent(listed, ref, `Portable manifest required file ${ref.path}`);
  }
  return normalizedFiles;
}

function normalizePortableBundleFile(file: PortableSpeechModelBundleFileInputV1): {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
} {
  const path = file.path;
  if (!isSafePortableModelPath(path)) {
    throw new Error(`Portable speech model inner bundle file path ${path} is unsafe.`);
  }
  const mediaType = file.mediaType.trim();
  if (mediaType.length === 0) {
    throw new Error(`Portable speech model inner bundle file ${path} has an empty media type.`);
  }
  assertDefaultPortablePayloadAllowed(path, mediaType);
  const bytes = toUint8Array(file.bytes);
  if (bytes.byteLength <= 0) {
    throw new Error(`Portable speech model inner bundle file ${path} must not be empty.`);
  }
  if (bytes.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error(`Portable speech model inner bundle file ${path} exceeds per-file limit.`);
  }
  return { path, mediaType, bytes };
}

function assertPortableManifestForBundle(manifest: PortableSpeechModelManifestV1): void {
  const result = validatePortableSpeechModelManifestV1(manifest);
  if (!result.ok) {
    throw new Error(`Portable speech model manifest v1 is invalid: ${result.errors.join('; ')}`);
  }
  if (manifest.files.some((ref) => ref.path === PORTABLE_SPEECH_MODEL_MANIFEST_PATH)) {
    throw new Error('Portable manifest files must not include manifest.json self-reference.');
  }
  assertNoDuplicateBundlePaths(manifest.files.map((ref) => ref.path));
  if (!manifest.privacy.containsVoiceDerivedWeights) {
    throw new Error('Portable manifest must flag voice-derived weights.');
  }
}

function collectRequiredManifestRefs(
  manifest: PortableSpeechModelManifestV1,
): readonly ProfileFileRef[] {
  return [
    ...Object.values(manifest.adaptation.files),
    ...(manifest.vocabulary === undefined ? [] : [manifest.vocabulary.file]),
    manifest.evaluation.summaryFile,
    manifest.evaluation.metricsFile,
    manifest.noticesFile,
    manifest.checksumsFile,
    ...manifest.testVectors,
  ];
}

function assertManifestRefsMatchInnerBundle(
  manifest: PortableSpeechModelManifestV1,
  index: PortableSpeechModelInnerBundleIndexV1,
): void {
  const indexRefsByPath = new Map(index.files.map((entry) => [entry.path, entry]));
  const allowedPaths = new Set([
    PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
    ...manifest.files.map((ref) => ref.path),
  ]);
  for (const entry of index.files) {
    if (!allowedPaths.has(entry.path)) {
      throw new Error(
        `Portable speech model inner bundle contains unmanifested file ${entry.path}.`,
      );
    }
  }
  for (const ref of manifest.files) {
    const entry = indexRefsByPath.get(ref.path);
    if (entry === undefined) {
      throw new Error(`Portable speech model inner bundle is missing manifest file ${ref.path}.`);
    }
    assertProfileFileRefEquivalent(
      entry,
      ref,
      `Portable speech model inner bundle file ${ref.path}`,
    );
  }
  for (const ref of collectRequiredManifestRefs(manifest)) {
    const entry = indexRefsByPath.get(ref.path);
    if (entry === undefined) {
      throw new Error(`Portable speech model inner bundle is missing required file ${ref.path}.`);
    }
    assertProfileFileRefEquivalent(
      entry,
      ref,
      `Portable speech model inner bundle required file ${ref.path}`,
    );
  }
}

function extractAndValidateImportedFiles(
  bytes: Uint8Array,
  parsed: ParsedPortableSpeechModelInnerBundleV1,
): readonly ImportedPortableSpeechModelFileV1[] {
  const files = parsed.index.files.map((entry) => {
    const entryBytes = getPortableSpeechModelInnerBundleFileBytes(bytes, parsed, entry.path);
    assertImportedPortablePayloadAllowed(entry, entryBytes);
    return {
      path: entry.path,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
      mediaType: entry.mediaType,
      bytes: copyBytes(entryBytes),
    };
  });
  if (files.length > PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT) {
    throw new Error('Portable speech model import has too many files.');
  }
  return files;
}

function assertImportedPortablePayloadAllowed(ref: ProfileFileRef, bytes: Uint8Array): void {
  assertDefaultPortablePayloadAllowed(ref.path, ref.mediaType);
  assertPortableImportFileKindAllowed(ref.path, ref.mediaType);
  if (ref.sizeBytes !== bytes.byteLength) {
    throw new Error(`Portable speech model import file ${ref.path} size does not match index.`);
  }
  if (ref.mediaType === 'application/json') {
    assertImportedJsonPayloadAllowed(ref.path, parseJson(bytes));
  }
}

function assertPortableImportFileKindAllowed(path: string, mediaType: string): void {
  const lowerPath = path.toLowerCase();
  const lowerMediaType = mediaType.toLowerCase();
  const forbiddenExtensions = [
    '.onnx',
    '.ort',
    '.pb',
    '.pbtxt',
    '.safetensors',
    '.ckpt',
    '.pt',
    '.pth',
  ];
  if (forbiddenExtensions.some((extension) => lowerPath.endsWith(extension))) {
    throw new Error(
      'Portable speech model imports must not contain base-model, operator, checkpoint, or external-data files.',
    );
  }
  if (
    lowerMediaType.includes('onnx') ||
    lowerMediaType.includes('protobuf') ||
    lowerMediaType.includes('safetensors')
  ) {
    throw new Error(
      'Portable speech model imports must not contain base-model, operator, checkpoint, or external-data media types.',
    );
  }
}

function assertImportedJsonPayloadAllowed(path: string, value: unknown): void {
  scanPortableImportJson(path, value, []);
}

function scanPortableImportJson(path: string, value: unknown, keyPath: readonly string[]): void {
  if (value === null) return;
  if (Array.isArray(value)) {
    if (value.length > 4096) {
      throw new Error(`Portable speech model import JSON file ${path} exceeds array limits.`);
    }
    value.forEach((entry, index) => {
      scanPortableImportJson(path, entry, [...keyPath, index.toString()]);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    assertPortableImportJsonKeyAllowed(path, key, entry, keyPath);
    scanPortableImportJson(path, entry, [...keyPath, key]);
  }
}

function assertPortableImportJsonKeyAllowed(
  path: string,
  key: string,
  value: unknown,
  keyPath: readonly string[],
): void {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  const forbiddenKeys = new Set([
    'externaldata',
    'externaldatalocation',
    'externaldatareference',
    'operatorsetimports',
    'opsetimports',
    'operatorimports',
    'initializer',
    'initializers',
    'tensor',
    'tensors',
    'tensordata',
    'tensorvalues',
    'rawdata',
    'rawaudio',
    'audiosamples',
    'featuretensors',
    'checkpoint',
    'checkpoints',
  ]);
  if (forbiddenKeys.has(normalized)) {
    throw new Error(
      `Portable speech model import JSON file ${path} contains forbidden tensor/operator/external-data key ${key}.`,
    );
  }
  if (
    keyPath.at(-1) === 'privacy' &&
    typeof value === 'boolean' &&
    value === true &&
    forbiddenTruePrivacyFlags.has(key)
  ) {
    throw new Error(
      `Portable speech model import JSON file ${path} declares forbidden privacy data.`,
    );
  }
}

const forbiddenTruePrivacyFlags = new Set([
  'containsRawAudio',
  'containsTranscriptText',
  'containsPreparedFeatures',
  'containsFeatureTensors',
  'containsCheckpoints',
  'containsBaseModel',
  'containsRawTerms',
  'containsCaseIds',
]);

function assertFileRefMatches(file: NormalizedPortableBundleFile, ref: ProfileFileRef): void {
  assertProfileFileRefEquivalent(
    {
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.bytes.byteLength,
      mediaType: file.mediaType,
    },
    ref,
    `Portable speech model file ${file.path}`,
  );
}

function assertProfileFileRefEquivalent(
  actual: ProfileFileRef,
  expected: ProfileFileRef,
  label: string,
): void {
  if (
    actual.path !== expected.path ||
    actual.sha256 !== expected.sha256 ||
    actual.sizeBytes !== expected.sizeBytes ||
    actual.mediaType !== expected.mediaType
  ) {
    throw new Error(`${label} metadata does not match its file ref.`);
  }
}

function assertNoDuplicateBundlePaths(paths: readonly string[]): void {
  const seen: string[] = [];
  for (const path of paths) {
    for (const existing of seen) {
      if (portableBundlePathsCollide(existing, path)) {
        throw new Error(
          `Portable speech model inner bundle has duplicate or colliding path ${path}.`,
        );
      }
    }
    seen.push(path);
  }
}

function portableBundlePathsCollide(left: string, right: string): boolean {
  return (
    portableModelPathsCollide(left, right) ||
    normalizePortableModelPath(left).toLowerCase() ===
      normalizePortableModelPath(right).toLowerCase()
  );
}

function assertDefaultPortablePayloadAllowed(path: string, mediaType: string): void {
  const lowerPath = path.toLowerCase();
  const lowerSegments = lowerPath.split('/');
  const forbiddenSegments = new Set([
    'audio',
    'recordings',
    'features',
    'feature-shards',
    'checkpoints',
    'optimizer',
    'training-jobs',
    'base-model',
    'base_model',
    'graphs',
    'operators',
    'external-data',
    'external_data',
  ]);
  if (mediaType.toLowerCase().startsWith('audio/') || lowerPath.endsWith('.wav')) {
    throw new Error('Default portable .speechmodel bundles must exclude raw audio files.');
  }
  if (lowerSegments.some((segment) => forbiddenSegments.has(segment))) {
    throw new Error(
      'Default portable .speechmodel bundles must exclude raw audio, prepared features, checkpoints, optimizer state, base-model graphs, operator files, and external data.',
    );
  }
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(bytes)) as unknown;
}

function throwIfPortableImportAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new Error('Portable speech model import was aborted.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
