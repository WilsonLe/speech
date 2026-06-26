import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PORTABLE_SPEECH_MODEL_MAGIC,
  PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT,
  PORTABLE_SPEECH_MODEL_MAX_PATH_SEGMENTS,
  PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS,
  PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES,
  buildPortableSpeechModelEnvelopePrefix,
  buildUnencryptedPortableSpeechModelEnvelope,
  decryptPortableSpeechModelEnvelope,
  encryptPortableSpeechModelEnvelope,
  isSafePortableModelPath,
  normalizePortableModelPath,
  parsePortableSpeechModelEnvelopePrefix,
  portableModelPathsCollide,
  type PortableSpeechModelEnvelopeHeaderV1,
} from './envelope';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

afterEach(() => {
  vi.unstubAllGlobals();
});

const validEncryption = {
  kdf: 'pbkdf2-hmac-sha-256' as const,
  iterations: PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS,
  saltBase64: 'c2FsdA==',
  ivBase64: 'aXY=',
  ciphertextLength: 1_024,
};

describe('portable speech model envelope identity', () => {
  it('uses the WLSPEECHMODEL magic prefix', () => {
    expect(Array.from(PORTABLE_SPEECH_MODEL_MAGIC)).toEqual([
      ...'WLSPEECHMODEL'.split('').map((c) => c.charCodeAt(0)),
      0,
      1,
    ]);
  });

  it('enforces a 10 MB hard bundle ceiling and hostile-import limits', () => {
    expect(PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT).toBeLessThanOrEqual(64);
    expect(PORTABLE_SPEECH_MODEL_MAX_PATH_SEGMENTS).toBeLessThanOrEqual(8);
  });
});

describe('portable speech model envelope prefix', () => {
  it('round-trips an unencrypted envelope header', () => {
    const header: PortableSpeechModelEnvelopeHeaderV1 = {
      formatVersion: 1,
      mode: 'unencrypted',
    };
    const prefix = buildPortableSpeechModelEnvelopePrefix(header);
    const body = new Uint8Array([1, 2, 3]);
    const full = new Uint8Array(prefix.byteLength + body.byteLength);
    full.set(prefix, 0);
    full.set(body, prefix.byteLength);

    const parsed = parsePortableSpeechModelEnvelopePrefix(full);

    expect(parsed.header).toEqual(header);
    expect(parsed.bodyOffset).toBe(prefix.byteLength);
    expect(Array.from(full.subarray(parsed.bodyOffset))).toEqual([1, 2, 3]);
  });

  it('round-trips an encrypted envelope header with PBKDF2 parameters', () => {
    const header: PortableSpeechModelEnvelopeHeaderV1 = {
      formatVersion: 1,
      mode: 'encrypted',
      encryption: validEncryption,
    };
    const prefix = buildPortableSpeechModelEnvelopePrefix(header);

    const parsed = parsePortableSpeechModelEnvelopePrefix(prefix);

    expect(parsed.header).toEqual(header);
    expect(parsed.header.encryption?.iterations).toBe(PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS);
  });

  it('rejects an invalid magic prefix', () => {
    const prefix = buildPortableSpeechModelEnvelopePrefix({
      formatVersion: 1,
      mode: 'unencrypted',
    });
    prefix[0] = 0;

    expect(() => parsePortableSpeechModelEnvelopePrefix(prefix)).toThrow(/magic prefix is invalid/);
  });

  it('rejects unencrypted envelopes that declare encryption parameters', () => {
    expect(() =>
      buildPortableSpeechModelEnvelopePrefix({
        formatVersion: 1,
        mode: 'unencrypted',
        encryption: validEncryption,
      } as PortableSpeechModelEnvelopeHeaderV1),
    ).toThrow(/must not declare encryption parameters/);
  });

  it('rejects encrypted envelopes below the minimum PBKDF2 iteration count', () => {
    expect(() =>
      buildPortableSpeechModelEnvelopePrefix({
        formatVersion: 1,
        mode: 'encrypted',
        encryption: { ...validEncryption, iterations: 1_000 },
      }),
    ).toThrow(/iterations must be at least/);
  });

  it('rejects buffers too small to contain a prefix', () => {
    expect(() => parsePortableSpeechModelEnvelopePrefix(new Uint8Array(4))).toThrow(/too small/);
  });

  it('rejects a header payload length that exceeds remaining bytes', () => {
    const prefix = buildPortableSpeechModelEnvelopePrefix({
      formatVersion: 1,
      mode: 'unencrypted',
    });
    const truncated = prefix.subarray(0, prefix.byteLength - 1);

    expect(() => parsePortableSpeechModelEnvelopePrefix(truncated)).toThrow(
      /payload length exceeds remaining bytes/,
    );
  });
});

describe('portable speech model encrypted envelopes', () => {
  it('decrypts unencrypted envelopes without a passphrase for explicit unencrypted export flows', async () => {
    const body = textEncoder.encode('deterministic-inner-bundle-body');
    const envelope = buildUnencryptedPortableSpeechModelEnvelope(body);

    const parsed = parsePortableSpeechModelEnvelopePrefix(envelope.bytes);
    const decrypted = await decryptPortableSpeechModelEnvelope(envelope.bytes);

    expect(parsed.header).toEqual({ formatVersion: 1, mode: 'unencrypted' });
    expect(Array.from(decrypted)).toEqual(Array.from(body));
  });

  it('encrypts and decrypts with AES-256-GCM and PBKDF2-HMAC-SHA-256 parameters', async () => {
    const body = textEncoder.encode('SECRET_ADAPTER_WEIGHTS_AND_TEST_VECTOR_BYTES');
    const salt = new Uint8Array(Array.from({ length: 16 }, (_value, index) => index + 1));
    const iv = new Uint8Array(Array.from({ length: 12 }, (_value, index) => 0xa0 + index));
    const envelope = await encryptPortableSpeechModelEnvelope({
      body,
      passphrase: 'correct horse battery staple',
      randomBytes: deterministicRandomBytes(salt, iv),
    });

    const parsed = parsePortableSpeechModelEnvelopePrefix(envelope.bytes);
    const decrypted = await decryptPortableSpeechModelEnvelope(envelope.bytes, {
      passphrase: 'correct horse battery staple',
    });
    const decodedEnvelope = textDecoder.decode(envelope.bytes);

    expect(parsed.header.mode).toBe('encrypted');
    expect(parsed.header.encryption).toEqual({
      kdf: 'pbkdf2-hmac-sha-256',
      iterations: PORTABLE_SPEECH_MODEL_MIN_PBKDF2_ITERATIONS,
      saltBase64: 'AQIDBAUGBwgJCgsMDQ4PEA==',
      ivBase64: 'oKGio6Slpqeoqaqr',
      ciphertextLength: envelope.bytes.byteLength - parsed.bodyOffset,
    });
    expect(Array.from(decrypted)).toEqual(Array.from(body));
    expect(decodedEnvelope).not.toContain('SECRET_ADAPTER_WEIGHTS');
    expect(decodedEnvelope).not.toContain('TEST_VECTOR_BYTES');
  });

  it('rejects wrong passphrases, tampered ciphertext, and missing passphrases', async () => {
    const envelope = await encryptPortableSpeechModelEnvelope({
      body: textEncoder.encode('private portable payload'),
      passphrase: 'export passphrase',
      randomBytes: deterministicRandomBytes(new Uint8Array(16).fill(7), new Uint8Array(12).fill(8)),
    });

    await expect(
      decryptPortableSpeechModelEnvelope(envelope.bytes, { passphrase: 'wrong passphrase' }),
    ).rejects.toThrow('could not be decrypted');
    await expect(decryptPortableSpeechModelEnvelope(envelope.bytes)).rejects.toThrow(
      'requires a passphrase',
    );

    const tampered = new Uint8Array(envelope.bytes);
    const finalIndex = tampered.byteLength - 1;
    const finalByte = tampered[finalIndex];
    if (finalByte === undefined) throw new Error('Expected encrypted envelope bytes');
    tampered[finalIndex] = finalByte ^ 0xff;
    await expect(
      decryptPortableSpeechModelEnvelope(tampered, { passphrase: 'export passphrase' }),
    ).rejects.toThrow('could not be decrypted');
  });

  it('rejects weak iteration counts and supports cancellation checks', async () => {
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      encryptPortableSpeechModelEnvelope({
        body: textEncoder.encode('payload'),
        passphrase: 'export passphrase',
        iterations: 1_000,
      }),
    ).rejects.toThrow('iterations must be at least');
    await expect(
      encryptPortableSpeechModelEnvelope({
        body: textEncoder.encode('payload'),
        passphrase: 'export passphrase',
        signal: aborted.signal,
      }),
    ).rejects.toThrow('was aborted');
    await expect(
      decryptPortableSpeechModelEnvelope(
        buildUnencryptedPortableSpeechModelEnvelope(textEncoder.encode('x')).bytes,
        {
          signal: aborted.signal,
        },
      ),
    ).rejects.toThrow('was aborted');
  });

  it('reports controlled errors when Web Crypto or base64 helpers are unavailable', async () => {
    const body = textEncoder.encode('payload');

    vi.stubGlobal('crypto', undefined);
    await expect(
      encryptPortableSpeechModelEnvelope({
        body,
        passphrase: 'export passphrase',
        randomBytes: deterministicRandomBytes(
          new Uint8Array(16).fill(1),
          new Uint8Array(12).fill(2),
        ),
      }),
    ).rejects.toThrow('SubtleCrypto is unavailable');
    vi.unstubAllGlobals();

    vi.stubGlobal('btoa', undefined);
    await expect(
      encryptPortableSpeechModelEnvelope({
        body,
        passphrase: 'export passphrase',
        randomBytes: deterministicRandomBytes(
          new Uint8Array(16).fill(1),
          new Uint8Array(12).fill(2),
        ),
      }),
    ).rejects.toThrow('Base64 encoding is unavailable');
    vi.unstubAllGlobals();

    const envelope = await encryptPortableSpeechModelEnvelope({
      body,
      passphrase: 'export passphrase',
      randomBytes: deterministicRandomBytes(new Uint8Array(16).fill(1), new Uint8Array(12).fill(2)),
    });
    vi.stubGlobal('atob', undefined);
    await expect(
      decryptPortableSpeechModelEnvelope(envelope.bytes, { passphrase: 'export passphrase' }),
    ).rejects.toThrow('salt is not valid base64');
  });
});

function deterministicRandomBytes(
  ...chunks: readonly Uint8Array[]
): (length: number) => Uint8Array {
  let index = 0;
  return (length) => {
    const chunk = chunks[index];
    index += 1;
    if (chunk === undefined || chunk.byteLength !== length) {
      throw new Error(`Expected deterministic random chunk of ${length.toString()} bytes`);
    }
    return new Uint8Array(chunk);
  };
}

describe('portable model path safety', () => {
  it('accepts clean relative paths', () => {
    expect(isSafePortableModelPath('manifest.json')).toBe(true);
    expect(isSafePortableModelPath('artifacts/adapter-weights.bin')).toBe(true);
    expect(isSafePortableModelPath('evaluation/metrics.json')).toBe(true);
  });

  it.each([
    ['absolute unix path', '/etc/passwd'],
    ['windows drive path', 'C:/Windows/System32'],
    ['parent traversal', '../escape'],
    ['nested parent traversal', 'artifacts/../../escape'],
    ['backslash separator', 'artifacts\\adapter.bin'],
    ['empty string', ''],
    ['null byte', 'man\0ifest.json'],
    ['control character', 'man\x01ifest.json'],
    ['leading slash', '/manifest.json'],
    ['empty segment', 'artifacts//adapter.bin'],
    ['dot segment', './manifest.json'],
    ['symlink suffix', 'link.lnk'],
    ['too many segments', 'a/b/c/d/e/f/g/h/i'],
  ])('rejects %s', (_label, path) => {
    expect(isSafePortableModelPath(path)).toBe(false);
  });

  it('detects duplicate normalized paths', () => {
    expect(portableModelPathsCollide('artifacts//adapter.bin', 'artifacts/adapter.bin')).toBe(true);
    expect(portableModelPathsCollide('a/b.json', 'c/b.json')).toBe(false);
  });

  it('normalizes repeated slashes and leading slashes', () => {
    expect(normalizePortableModelPath('artifacts///adapter.bin')).toBe('artifacts/adapter.bin');
    expect(normalizePortableModelPath('/manifest.json')).toBe('manifest.json');
  });
});
