import { describe, expect, it } from 'vitest';
import type { ProfileFileRef } from '@speech/protocol';
import {
  PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC,
  PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
  buildPortableSpeechModelInnerBundle,
  createPortableSpeechModelFileRef,
  importPortableSpeechModelArchive,
  parseAndVerifyPortableSpeechModelInnerBundle,
  sha256PortableModelBytes,
  stablePortableModelJson,
  type PortableSpeechModelBundleFileInputV1,
  type PortableSpeechModelInnerBundleEntryV1,
  type PortableSpeechModelInnerBundleIndexV1,
} from './bundle';
import {
  PORTABLE_SPEECH_MODEL_MAGIC,
  PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT,
  buildUnencryptedPortableSpeechModelEnvelope,
  encryptPortableSpeechModelEnvelope,
} from './envelope';
import type { PortableSpeechModelManifestV1 } from './manifest';

const textEncoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function jsonBytes(value: unknown): Uint8Array {
  return bytes(stablePortableModelJson(value));
}

function binaryBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('portable import security corpus', () => {
  it('rejects invalid outer envelope magic and version before archive parsing', async () => {
    const bundle = await buildPortableSpeechModelInnerBundle(await samplePortableBundleInput());
    const envelope = buildUnencryptedPortableSpeechModelEnvelope(bundle.bytes).bytes;

    const badMagic = new Uint8Array(envelope);
    badMagic[0] = 0;
    await expect(importPortableSpeechModelArchive(badMagic)).rejects.toThrow(/magic prefix/);

    const badVersion = new Uint8Array(envelope);
    badVersion[PORTABLE_SPEECH_MODEL_MAGIC.byteLength] = 2;
    await expect(importPortableSpeechModelArchive(badVersion)).rejects.toThrow(
      /Unsupported envelope formatVersion/,
    );
  });

  it('rejects wrong passphrases and GCM tag corruption without exposing plaintext', async () => {
    const bundle = await buildPortableSpeechModelInnerBundle(await samplePortableBundleInput());
    const envelope = await encryptPortableSpeechModelEnvelope({
      body: bundle.bytes,
      passphrase: 'correct passphrase',
      randomBytes: deterministicRandomBytes(
        new Uint8Array(16).fill(0x31),
        new Uint8Array(12).fill(0x42),
      ),
    });

    await expect(
      importPortableSpeechModelArchive(envelope.bytes, { passphrase: 'wrong passphrase' }),
    ).rejects.toThrow(/could not be decrypted/);

    const tampered = new Uint8Array(envelope.bytes);
    const finalIndex = tampered.byteLength - 1;
    const finalByte = tampered[finalIndex];
    if (finalByte === undefined) throw new Error('Expected encrypted envelope bytes');
    tampered[finalIndex] = finalByte ^ 0xff;
    await expect(
      importPortableSpeechModelArchive(tampered, { passphrase: 'correct passphrase' }),
    ).rejects.toThrow(/could not be decrypted/);

    expect(new TextDecoder().decode(envelope.bytes)).not.toContain('portable fixture adapter');
    expect(new TextDecoder().decode(envelope.bytes)).not.toContain('adapter-weights');
  });

  it('rejects malformed inner archive magic, schema, and JSON corpus cases', async () => {
    const bundle = await buildPortableSpeechModelInnerBundle(await samplePortableBundleInput());
    const badInnerMagic = new Uint8Array(bundle.bytes);
    badInnerMagic[0] = 0;
    await expect(parseAndVerifyPortableSpeechModelInnerBundle(badInnerMagic)).rejects.toThrow(
      /inner bundle magic/,
    );

    await expect(
      parseAndVerifyPortableSpeechModelInnerBundle(
        encodeInnerBundleBytes(bytes('{not-json'), new Uint8Array()),
      ),
    ).rejects.toThrow();

    const schemaTwo = await encodeInnerBundleFromIndex(
      { ...emptyIndex(), schemaVersion: 2 as 1, files: [] },
      [],
    );
    await expect(parseAndVerifyPortableSpeechModelInnerBundle(schemaTwo)).rejects.toThrow(
      /schemaVersion must be 1/,
    );

    const malformedManifest = bytes('{not-json');
    const malformedManifestIndex = emptyIndex({
      files: [
        await entryFor(
          PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
          'application/json',
          malformedManifest,
          0,
        ),
      ],
    });
    await expect(
      parseAndVerifyPortableSpeechModelInnerBundle(
        await encodeInnerBundleFromIndex(malformedManifestIndex, [malformedManifest]),
      ),
    ).rejects.toThrow();
  });

  it('rejects traversal, duplicate/colliding paths, and file-count archive bombs', async () => {
    const traversalPayload = bytes('{}');
    const traversalIndex = emptyIndex({
      files: [await entryFor('../manifest.json', 'application/json', traversalPayload, 0)],
    });
    await expect(
      parseAndVerifyPortableSpeechModelInnerBundle(
        await encodeInnerBundleFromIndex(traversalIndex, [traversalPayload]),
      ),
    ).rejects.toThrow(/unsafe path/);

    const duplicatePayloads = [bytes('a'), bytes('b')];
    const duplicateIndex = emptyIndex({
      files: [
        await entryFor(
          PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
          'application/json',
          duplicatePayloads[0]!,
          0,
        ),
        await entryFor(
          PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
          'application/json',
          duplicatePayloads[1]!,
          1,
        ),
      ],
    });
    await expect(
      parseAndVerifyPortableSpeechModelInnerBundle(
        await encodeInnerBundleFromIndex(duplicateIndex, duplicatePayloads),
      ),
    ).rejects.toThrow(/duplicate file path/);

    const bombPayloads = Array.from(
      { length: PORTABLE_SPEECH_MODEL_MAX_FILE_COUNT + 1 },
      (_value, index) => binaryBytes([index % 256]),
    );
    let offset = 0;
    const bombEntries: PortableSpeechModelInnerBundleEntryV1[] = [];
    for (let index = 0; index < bombPayloads.length; index += 1) {
      const payload = bombPayloads[index]!;
      bombEntries.push(
        await entryFor(
          `metadata/file-${index.toString().padStart(2, '0')}.json`,
          'application/json',
          payload,
          offset,
        ),
      );
      offset += payload.byteLength;
    }
    await expect(
      parseAndVerifyPortableSpeechModelInnerBundle(
        await encodeInnerBundleFromIndex(emptyIndex({ files: bombEntries }), bombPayloads),
      ),
    ).rejects.toThrow(/too many files/);
  });

  it('rejects hostile JSON tensor payloads, external-data declarations, and oversized arrays', async () => {
    const input = await samplePortableBundleInput();
    const tensorPayload = await withExtraTestVector(
      input,
      file(
        'test-vectors/tensor-mismatch.json',
        'application/json',
        jsonBytes({
          schemaVersion: 1,
          tensors: [{ name: 'logits', shape: [1, 2], values: [1, 2, 3] }],
        }),
      ),
    );
    const tensorBundle = await buildPortableSpeechModelInnerBundle(tensorPayload);
    await expect(
      importPortableSpeechModelArchive(
        buildUnencryptedPortableSpeechModelEnvelope(tensorBundle.bytes).bytes,
      ),
    ).rejects.toThrow(/forbidden tensor\/operator\/external-data key/);

    const externalDataPayload = await withExtraTestVector(
      input,
      file(
        'test-vectors/external-data.json',
        'application/json',
        jsonBytes({ externalDataLocation: 'weights.bin' }),
      ),
    );
    const externalDataBundle = await buildPortableSpeechModelInnerBundle(externalDataPayload);
    await expect(
      importPortableSpeechModelArchive(
        buildUnencryptedPortableSpeechModelEnvelope(externalDataBundle.bytes).bytes,
      ),
    ).rejects.toThrow(/forbidden tensor\/operator\/external-data key/);

    const arrayBombPayload = await withExtraTestVector(
      input,
      file(
        'test-vectors/array-bomb.json',
        'application/json',
        jsonBytes({ values: Array.from({ length: 4097 }, (_value, index) => index) }),
      ),
    );
    const arrayBombBundle = await buildPortableSpeechModelInnerBundle(arrayBombPayload);
    await expect(
      importPortableSpeechModelArchive(
        buildUnencryptedPortableSpeechModelEnvelope(arrayBombBundle.bytes).bytes,
      ),
    ).rejects.toThrow(/exceeds array limits/);
  });
});

async function samplePortableBundleInput(): Promise<{
  readonly manifest: PortableSpeechModelManifestV1;
  readonly files: readonly PortableSpeechModelBundleFileInputV1[];
  readonly refs: Readonly<Record<string, ProfileFileRef>>;
}> {
  const adapter = file(
    'artifacts/adapter-weights.bin',
    'application/octet-stream',
    binaryBytes([0x00, 0x10, 0x20, 0x30]),
  );
  const evaluationSummary = file(
    'evaluation/summary.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, gatePassed: true, privacy: { containsCaseIds: false } }),
  );
  const evaluationMetrics = file(
    'evaluation/metrics.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, slices: [{ slice: 'candidate', wer: 0.1 }] }),
  );
  const notices = file(
    'notices/THIRD_PARTY_NOTICES.txt',
    'text/plain',
    bytes('Synthetic portable import security fixture. No raw audio or transcript text.\n'),
  );
  const vector = file(
    'test-vectors/forward.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, vectorId: 'portable-import-security-corpus-v1' }),
  );
  const payloadWithoutChecksums = [adapter, evaluationSummary, evaluationMetrics, notices, vector];
  const refsWithoutChecksums = Object.fromEntries(
    await Promise.all(
      payloadWithoutChecksums.map(async (payload) => [
        payload.path,
        await createPortableSpeechModelFileRef(payload),
      ]),
    ),
  ) as Readonly<Record<string, ProfileFileRef>>;
  const checksums = file(
    'metadata/checksums.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      files: Object.values(refsWithoutChecksums).sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      excludes: ['metadata/checksums.json', PORTABLE_SPEECH_MODEL_MANIFEST_PATH],
    }),
  );
  const checksumsRef = await createPortableSpeechModelFileRef(checksums);
  const refs = { ...refsWithoutChecksums, [checksums.path]: checksumsRef };
  const manifest: PortableSpeechModelManifestV1 = {
    schemaVersion: 1,
    bundleType: 'personal-voice-model',
    bundleId: 'portable-import-security-corpus',
    modelRevision: 'security-corpus-rev-1',
    displayName: 'Portable import security corpus',
    createdAt: '2026-06-26T00:00:00.000Z',
    exportedAt: '2026-06-26T00:00:00.000Z',
    sourceAppVersion: '0.5.0',
    profile: {
      sourceProfileId: 'security-corpus-profile',
      languages: ['vi', 'en'],
      supportsMixed: true,
    },
    baseModel: {
      id: 'mock-vi-en-rnnt',
      version: '0.5.0-portable',
      manifestSha256: 'a'.repeat(64),
      graphContractSha256: 'b'.repeat(64),
      tokenizerSha256: 'c'.repeat(64),
    },
    adaptation: {
      type: 'browser-top-adapter',
      contractVersion: 1,
      algorithmId: 'browser-training-fixed-adamw-v1',
      files: { weights: ref(refs, 'artifacts/adapter-weights.bin') },
    },
    evaluation: {
      gatePassed: true,
      summaryFile: ref(refs, 'evaluation/summary.json'),
      metricsFile: ref(refs, 'evaluation/metrics.json'),
    },
    noticesFile: ref(refs, 'notices/THIRD_PARTY_NOTICES.txt'),
    checksumsFile: ref(refs, 'metadata/checksums.json'),
    testVectors: [ref(refs, 'test-vectors/forward.json')],
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsVoiceDerivedWeights: true,
    },
    files: Object.values(refs).sort((left, right) => left.path.localeCompare(right.path)),
  };
  return { manifest, files: [...payloadWithoutChecksums, checksums], refs };
}

function file(
  path: string,
  mediaType: string,
  bytesValue: Uint8Array,
): PortableSpeechModelBundleFileInputV1 {
  return { path, mediaType, bytes: bytesValue };
}

function ref(refs: Readonly<Record<string, ProfileFileRef>>, path: string): ProfileFileRef {
  const value = refs[path];
  if (value === undefined) throw new Error(`Missing test ref ${path}`);
  return value;
}

async function withExtraTestVector(
  input: Awaited<ReturnType<typeof samplePortableBundleInput>>,
  extra: PortableSpeechModelBundleFileInputV1,
): Promise<Awaited<ReturnType<typeof samplePortableBundleInput>>> {
  const extraRef = await createPortableSpeechModelFileRef(extra);
  const manifest: PortableSpeechModelManifestV1 = {
    ...input.manifest,
    testVectors: [...input.manifest.testVectors, extraRef],
    files: [...input.manifest.files, extraRef].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
  return {
    manifest,
    files: [...input.files, extra],
    refs: { ...input.refs, [extra.path]: extraRef },
  };
}

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

function emptyIndex(
  overrides: Partial<PortableSpeechModelInnerBundleIndexV1> = {},
): PortableSpeechModelInnerBundleIndexV1 {
  return {
    schemaVersion: 1,
    archiveType: 'speechmodel-inner-bundle',
    compression: 'none',
    files: [],
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsCheckpoints: false,
      containsBaseModel: false,
      containsVoiceDerivedWeights: true,
    },
    ...overrides,
  };
}

async function entryFor(
  path: string,
  mediaType: string,
  payload: Uint8Array,
  offset: number,
): Promise<PortableSpeechModelInnerBundleEntryV1> {
  return {
    path,
    mediaType,
    sizeBytes: payload.byteLength,
    sha256: await sha256PortableModelBytes(payload),
    offset,
  };
}

async function encodeInnerBundleFromIndex(
  index: PortableSpeechModelInnerBundleIndexV1,
  payloads: readonly Uint8Array[],
): Promise<Uint8Array> {
  const indexBytes = bytes(JSON.stringify(index));
  const payloadByteLength = payloads.reduce((total, payload) => total + payload.byteLength, 0);
  const payloadBytes = new Uint8Array(payloadByteLength);
  let offset = 0;
  for (const payload of payloads) {
    payloadBytes.set(payload, offset);
    offset += payload.byteLength;
  }
  return encodeInnerBundleBytes(indexBytes, payloadBytes);
}

function encodeInnerBundleBytes(indexBytes: Uint8Array, payloadBytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(
    PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength +
      4 +
      indexBytes.byteLength +
      payloadBytes.byteLength,
  );
  output.set(PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC, 0);
  new DataView(output.buffer).setUint32(
    PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength,
    indexBytes.byteLength,
    true,
  );
  output.set(indexBytes, PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength + 4);
  output.set(
    payloadBytes,
    PORTABLE_SPEECH_MODEL_INNER_BUNDLE_MAGIC.byteLength + 4 + indexBytes.byteLength,
  );
  return output;
}
