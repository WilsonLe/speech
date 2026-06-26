import { PORTABLE_SPEECH_MODEL_EXTENSION, PORTABLE_SPEECH_MODEL_MIME_TYPE } from './manifest';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Fixed binary magic prefix for `.speechmodel` files: `WLSPEECHMODEL\0\x01`.
 * Used to identify the file before allocating or decrypting the full payload.
 */
export const PORTABLE_SPEECH_MODEL_MAGIC = new Uint8Array([
  ...textEncoder.encode('WLSPEECHMODEL'),
  0,
  1,
]);

/** Current binary envelope format version. */
export const PORTABLE_SPEECH_MODEL_ENVELOPE_VERSION = 1;

export type PortableSpeechModelEnvelopeMode = 'encrypted' | 'unencrypted';

/**
 * Encryption parameters for an encrypted envelope. Stored unencrypted in the
 * envelope header (never the passphrase or derived key). Uses AES-256-GCM with
 * a PBKDF2-HMAC-SHA-256 key-encryption key.
 */
export interface PortableSpeechModelEncryptionParametersV1 {
  readonly kdf: 'pbkdf2-hmac-sha-256';
  readonly iterations: number;
  readonly saltBase64: string;
  readonly ivBase64: string;
  readonly ciphertextLength: number;
}

/**
 * Envelope header. The same extension is used for encrypted and unencrypted
 * files; `mode` declares which. Unencrypted exports are allowed only for
 * explicit user choice; encryption is the default.
 */
export interface PortableSpeechModelEnvelopeHeaderV1 {
  readonly formatVersion: 1;
  readonly mode: PortableSpeechModelEnvelopeMode;
  readonly encryption?: PortableSpeechModelEncryptionParametersV1;
}

/** Minimum PBKDF2-HMAC-SHA-256 iteration count for encrypted exports. */
export const PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS = 600_000;

/**
 * Hard size ceiling for a default `.speechmodel` bundle (no raw audio).
 * Enforced before decryption and after expansion.
 */
export const PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES = 10 * 1024 * 1024;

/** Maximum number of payload files inside one bundle. */
export const PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT = 64;

/** Maximum size of a single expanded payload file. */
export const PORTABLE_SPEECH_MODEL_MAX_PER_FILE_BYTES = 10 * 1024 * 1024;

/** Maximum total expanded size of all payload files. */
export const PORTABLE_SPEECH_MODEL_MAX_EXPANDED_BYTES = 12 * 1024 * 1024;

/** Maximum archive compression ratio (expanded / compressed) to reject bombs. */
export const PORTABLE_SPEECH_MODEL_MAX_COMPRESSION_RATIO = 100;

/** Maximum path-segment depth for a payload file. */
export const PORTABLE_SPEECH_MODEL_MAX_PATH_SEGMENTS = 8;

const encryptionModeByte: Readonly<Record<PortableSpeechModelEnvelopeMode, number>> = {
  unencrypted: 0,
  encrypted: 1,
};
const encryptionModeFromByte: Readonly<Record<number, PortableSpeechModelEnvelopeMode>> = {
  0: 'unencrypted',
  1: 'encrypted',
};

const PORTABLE_SPEECH_MODEL_ENCRYPTION_SALT_BYTES = 16;
const PORTABLE_SPEECH_MODEL_ENCRYPTION_IV_BYTES = 12;

/** Magic(15) + formatVersion(1) + mode(1) + headerPayloadLength(uint32 LE). */
const ENVELOPE_PREFIX_FIXED_BYTES = 15 + 1 + 1 + 4;

export interface PortableSpeechModelEnvelopePrefix {
  readonly header: PortableSpeechModelEnvelopeHeaderV1;
  readonly bodyOffset: number;
}

export type PortableSpeechModelRandomBytes = (length: number) => Uint8Array;

export interface EncryptPortableSpeechModelEnvelopeOptionsV1 {
  readonly body: Uint8Array;
  readonly passphrase: string | Uint8Array;
  readonly iterations?: number;
  readonly randomBytes?: PortableSpeechModelRandomBytes;
  readonly signal?: AbortSignal;
}

export interface DecryptPortableSpeechModelEnvelopeOptionsV1 {
  readonly passphrase?: string | Uint8Array;
  readonly signal?: AbortSignal;
}

export interface PortableSpeechModelEnvelopeBytesV1 {
  readonly bytes: Uint8Array;
  readonly header: PortableSpeechModelEnvelopeHeaderV1;
  readonly bodyOffset: number;
}

/** Build the binary envelope prefix for a header. */
export function buildPortableSpeechModelEnvelopePrefix(
  header: PortableSpeechModelEnvelopeHeaderV1,
): Uint8Array {
  if (header.formatVersion !== 1) {
    throw new Error(`Unsupported envelope formatVersion: ${String(header.formatVersion)}`);
  }
  if (header.mode === 'encrypted') {
    assertEncryptionParameters(header.encryption);
  } else if (header.encryption !== undefined) {
    throw new Error('Unencrypted envelopes must not declare encryption parameters.');
  }

  const payloadJson = JSON.stringify(header);
  const payloadBytes = textEncoder.encode(payloadJson);
  if (payloadBytes.byteLength > 0xffffffff) {
    throw new Error('Envelope header payload is too large.');
  }

  const output = new Uint8Array(ENVELOPE_PREFIX_FIXED_BYTES + payloadBytes.byteLength);
  output.set(PORTABLE_SPEECH_MODEL_MAGIC, 0);
  output[15] = PORTABLE_SPEECH_MODEL_ENVELOPE_VERSION;
  const modeByte = encryptionModeByte[header.mode];
  output[16] = modeByte;
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(17, payloadBytes.byteLength, true);
  output.set(payloadBytes, ENVELOPE_PREFIX_FIXED_BYTES);
  return output;
}

/** Parse and validate the binary envelope prefix from a byte buffer. */
export function parsePortableSpeechModelEnvelopePrefix(
  bytes: Uint8Array,
): PortableSpeechModelEnvelopePrefix {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Envelope must be a Uint8Array.');
  }
  if (bytes.byteLength < ENVELOPE_PREFIX_FIXED_BYTES) {
    throw new Error('Envelope is too small to contain a valid prefix.');
  }
  for (let index = 0; index < PORTABLE_SPEECH_MODEL_MAGIC.byteLength; index += 1) {
    if (bytes[index] !== PORTABLE_SPEECH_MODEL_MAGIC[index]) {
      throw new Error('Envelope magic prefix is invalid.');
    }
  }
  const formatVersion = bytes[15];
  if (formatVersion === undefined || formatVersion !== PORTABLE_SPEECH_MODEL_ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope formatVersion: ${formatVersion?.toString()}`);
  }
  const modeByte = bytes[16];
  if (modeByte === undefined) {
    throw new Error('Envelope mode byte is missing.');
  }
  const mode = encryptionModeFromByte[modeByte];
  if (mode === undefined) {
    throw new Error(`Unsupported envelope mode byte: ${modeByte.toString()}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint32(17, true);
  const payloadOffset = ENVELOPE_PREFIX_FIXED_BYTES;
  if (payloadLength > bytes.byteLength - payloadOffset) {
    throw new Error('Envelope header payload length exceeds remaining bytes.');
  }
  const payloadBytes = bytes.subarray(payloadOffset, payloadOffset + payloadLength);
  const parsed = JSON.parse(textDecoder.decode(payloadBytes)) as unknown;
  const header = normalizeEnvelopeHeader(parsed, mode);

  return {
    header,
    bodyOffset: payloadOffset + payloadLength,
  };
}

export function buildUnencryptedPortableSpeechModelEnvelope(
  body: Uint8Array,
): PortableSpeechModelEnvelopeBytesV1 {
  assertEnvelopeBodyBytes(body, 'Unencrypted portable speech model body');
  const header: PortableSpeechModelEnvelopeHeaderV1 = { formatVersion: 1, mode: 'unencrypted' };
  const prefix = buildPortableSpeechModelEnvelopePrefix(header);
  return {
    bytes: concatenateBytes(prefix, body),
    header,
    bodyOffset: prefix.byteLength,
  };
}

export async function encryptPortableSpeechModelEnvelope({
  body,
  passphrase,
  iterations = PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS,
  randomBytes = secureRandomBytes,
  signal,
}: EncryptPortableSpeechModelEnvelopeOptionsV1): Promise<PortableSpeechModelEnvelopeBytesV1> {
  throwIfPortableEncryptionAborted(signal);
  assertEnvelopeBodyBytes(body, 'Portable speech model body');
  if (!Number.isInteger(iterations) || iterations < PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS) {
    throw new Error(
      `encryption.iterations must be at least ${PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS.toString()}.`,
    );
  }
  const salt = randomBytes(PORTABLE_SPEECH_MODEL_ENCRYPTION_SALT_BYTES);
  const iv = randomBytes(PORTABLE_SPEECH_MODEL_ENCRYPTION_IV_BYTES);
  if (salt.byteLength !== PORTABLE_SPEECH_MODEL_ENCRYPTION_SALT_BYTES) {
    throw new Error('Portable speech model encryption salt must be 16 bytes.');
  }
  if (iv.byteLength !== PORTABLE_SPEECH_MODEL_ENCRYPTION_IV_BYTES) {
    throw new Error('Portable speech model encryption IV must be 12 bytes.');
  }

  const paramsWithoutLength = {
    kdf: 'pbkdf2-hmac-sha-256' as const,
    iterations,
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
  };
  const passphraseBytes = normalizePassphraseBytes(passphrase);
  try {
    const key = await derivePortableSpeechModelEncryptionKey(passphraseBytes, salt, iterations, [
      'encrypt',
    ]);
    throwIfPortableEncryptionAborted(signal);
    const subtle = getPortableSpeechModelSubtleCrypto();
    const ciphertext = new Uint8Array(
      await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: copyBytes(iv),
          additionalData: copyBytes(encryptionAdditionalData(paramsWithoutLength)),
          tagLength: 128,
        },
        key,
        copyBytes(body),
      ),
    );
    throwIfPortableEncryptionAborted(signal);
    const encryption: PortableSpeechModelEncryptionParametersV1 = {
      ...paramsWithoutLength,
      ciphertextLength: ciphertext.byteLength,
    };
    const header: PortableSpeechModelEnvelopeHeaderV1 = {
      formatVersion: 1,
      mode: 'encrypted',
      encryption,
    };
    const prefix = buildPortableSpeechModelEnvelopePrefix(header);
    const bytes = concatenateBytes(prefix, ciphertext);
    if (bytes.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
      throw new Error('Encrypted portable speech model envelope exceeds the hard size limit.');
    }
    return { bytes, header, bodyOffset: prefix.byteLength };
  } finally {
    passphraseBytes.fill(0);
  }
}

export async function decryptPortableSpeechModelEnvelope(
  bytes: Uint8Array,
  options: DecryptPortableSpeechModelEnvelopeOptionsV1 = {},
): Promise<Uint8Array> {
  throwIfPortableEncryptionAborted(options.signal);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Portable speech model envelope must be a Uint8Array.');
  }
  if (bytes.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error('Portable speech model envelope exceeds the hard size limit.');
  }
  const { header, bodyOffset } = parsePortableSpeechModelEnvelopePrefix(bytes);
  const body = bytes.subarray(bodyOffset);
  if (header.mode === 'unencrypted') {
    assertEnvelopeBodyBytes(body, 'Unencrypted portable speech model body');
    return copyBytes(body);
  }
  const encryption = assertEncryptionParameters(header.encryption);
  if (body.byteLength !== encryption.ciphertextLength) {
    throw new Error('Encrypted portable speech model ciphertext length does not match header.');
  }
  if (options.passphrase === undefined) {
    throw new Error('Encrypted portable speech model export requires a passphrase.');
  }
  const salt = base64ToBytes(encryption.saltBase64, 'salt');
  const iv = base64ToBytes(encryption.ivBase64, 'IV');
  if (salt.byteLength !== PORTABLE_SPEECH_MODEL_ENCRYPTION_SALT_BYTES) {
    throw new Error('Encrypted portable speech model salt length is invalid.');
  }
  if (iv.byteLength !== PORTABLE_SPEECH_MODEL_ENCRYPTION_IV_BYTES) {
    throw new Error('Encrypted portable speech model IV length is invalid.');
  }
  const passphraseBytes = normalizePassphraseBytes(options.passphrase);
  try {
    const key = await derivePortableSpeechModelEncryptionKey(
      passphraseBytes,
      salt,
      encryption.iterations,
      ['decrypt'],
    );
    throwIfPortableEncryptionAborted(options.signal);
    const subtle = getPortableSpeechModelSubtleCrypto();
    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copyBytes(iv),
        additionalData: copyBytes(encryptionAdditionalData(encryption)),
        tagLength: 128,
      },
      key,
      copyBytes(body),
    );
    throwIfPortableEncryptionAborted(options.signal);
    const plaintextBytes = new Uint8Array(plaintext);
    assertEnvelopeBodyBytes(plaintextBytes, 'Decrypted portable speech model body');
    return plaintextBytes;
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    throw new Error(
      'Encrypted portable speech model could not be decrypted with the provided passphrase or file contents.',
      { cause: error },
    );
  } finally {
    passphraseBytes.fill(0);
  }
}

function normalizeEnvelopeHeader(
  parsed: unknown,
  mode: PortableSpeechModelEnvelopeMode,
): PortableSpeechModelEnvelopeHeaderV1 {
  if (!isRecord(parsed)) {
    throw new Error('Envelope header payload must be a JSON object.');
  }
  if (parsed['formatVersion'] !== 1) {
    throw new Error('Envelope header formatVersion must be 1.');
  }
  if (parsed['mode'] !== mode) {
    throw new Error('Envelope header mode does not match the binary mode byte.');
  }
  const header: PortableSpeechModelEnvelopeHeaderV1 =
    mode === 'encrypted'
      ? {
          formatVersion: 1,
          mode: 'encrypted',
          encryption: assertEncryptionParameters(parsed['encryption']),
        }
      : { formatVersion: 1, mode: 'unencrypted' };
  return header;
}

function assertEncryptionParameters(value: unknown): PortableSpeechModelEncryptionParametersV1 {
  if (!isRecord(value)) {
    throw new Error('Encrypted envelopes must declare encryption parameters.');
  }
  if (value['kdf'] !== 'pbkdf2-hmac-sha-256') {
    throw new Error('encryption.kdf must be pbkdf2-hmac-sha-256.');
  }
  const iterations = value['iterations'];
  if (
    !Number.isInteger(iterations) ||
    (iterations as number) < PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS
  ) {
    throw new Error(
      `encryption.iterations must be at least ${PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS.toString()}.`,
    );
  }
  if (typeof value['saltBase64'] !== 'string' || value['saltBase64'].length === 0) {
    throw new Error('encryption.saltBase64 must be a non-empty string.');
  }
  if (typeof value['ivBase64'] !== 'string' || value['ivBase64'].length === 0) {
    throw new Error('encryption.ivBase64 must be a non-empty string.');
  }
  if (!Number.isInteger(value['ciphertextLength']) || (value['ciphertextLength'] as number) < 0) {
    throw new Error('encryption.ciphertextLength must be a non-negative integer.');
  }
  return value as unknown as PortableSpeechModelEncryptionParametersV1;
}

async function derivePortableSpeechModelEncryptionKey(
  passphraseBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  usages: readonly KeyUsage[],
): Promise<CryptoKey> {
  const subtle = getPortableSpeechModelSubtleCrypto();
  const passphraseMaterial = await subtle.importKey(
    'raw',
    copyBytes(passphraseBytes),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: copyBytes(salt), iterations, hash: 'SHA-256' },
    passphraseMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [...usages],
  );
}

function getPortableSpeechModelSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error('Web Crypto SubtleCrypto is unavailable for portable model encryption.');
  }
  return subtle;
}

function normalizePassphraseBytes(passphrase: string | Uint8Array): Uint8Array {
  const passphraseBytes =
    typeof passphrase === 'string' ? textEncoder.encode(passphrase) : copyBytes(passphrase);
  if (passphraseBytes.byteLength === 0) {
    throw new Error('Portable speech model encryption passphrase must not be empty.');
  }
  return passphraseBytes;
}

function encryptionAdditionalData(
  params: Omit<PortableSpeechModelEncryptionParametersV1, 'ciphertextLength'>,
): Uint8Array {
  return textEncoder.encode(
    [
      'WLSPEECHMODEL-ENCRYPTION-AAD-V1',
      params.kdf,
      params.iterations.toString(),
      params.saltBase64,
      params.ivBase64,
    ].join('|'),
  );
}

function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Portable speech model random byte length must be positive.');
  }
  const webCrypto = globalThis.crypto;
  if (webCrypto?.getRandomValues === undefined) {
    throw new Error('Web Crypto getRandomValues is unavailable for portable model encryption.');
  }
  return webCrypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  if (globalThis.btoa === undefined) {
    throw new Error('Base64 encoding is unavailable for portable model encryption.');
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string, label: string): Uint8Array {
  try {
    if (globalThis.atob === undefined) {
      throw new Error('Base64 decoding is unavailable for portable model encryption.');
    }
    const binary = globalThis.atob(value);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      output[index] = binary.charCodeAt(index);
    }
    return output;
  } catch {
    throw new Error(`Encrypted portable speech model ${label} is not valid base64.`);
  }
}

function concatenateBytes(prefix: Uint8Array, body: Uint8Array): Uint8Array {
  const output = new Uint8Array(prefix.byteLength + body.byteLength);
  output.set(prefix, 0);
  output.set(body, prefix.byteLength);
  return output;
}

function assertEnvelopeBodyBytes(body: Uint8Array, label: string): void {
  if (!(body instanceof Uint8Array)) {
    throw new Error(`${label} must be a Uint8Array.`);
  }
  if (body.byteLength <= 0) {
    throw new Error(`${label} must not be empty.`);
  }
  if (body.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error(`${label} exceeds the hard size limit.`);
  }
}

function throwIfPortableEncryptionAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new Error('Portable speech model encryption was aborted.');
  }
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === 'Portable speech model encryption was aborted.'
  );
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  output.set(bytes);
  return output;
}

/**
 * Validate a payload path against the hostile-import boundary. Rejects empty,
 * absolute, parent traversal, backslash, control characters, and overly deep
 * paths. Symlinks are not representable in the bundle format; this guard also
 * rejects `.lnk`/symlink-style suffixes defensively.
 */
export function isSafePortableModelPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  if (path.includes('\\')) return false;
  if (path.includes('..')) return false;
  for (const char of path) {
    if (char.charCodeAt(0) <= 0x1f) return false;
  }
  const segments = path.split('/');
  if (segments.length === 0 || segments.length > PORTABLE_SPEECH_MODEL_MAX_PATH_SEGMENTS) {
    return false;
  }
  for (const segment of segments) {
    if (segment.length === 0) return false;
    if (segment === '.' || segment === '..') return false;
    if (segment.toLowerCase().endsWith('.lnk')) return false;
  }
  return true;
}

/** Normalize a payload path and return whether two paths collide after normalization. */
export function normalizePortableModelPath(path: string): string {
  return path.split('/').join('/').replace(/\/+/g, '/').replace(/^\/+/, '');
}

export function portableModelPathsCollide(a: string, b: string): boolean {
  return normalizePortableModelPath(a) === normalizePortableModelPath(b);
}

export { PORTABLE_SPEECH_MODEL_EXTENSION, PORTABLE_SPEECH_MODEL_MIME_TYPE };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
