import { describe, expect, it } from 'vitest';
import type { ProfileFileRef } from '@speech/protocol';
import {
  PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
  buildPortableSpeechModelInnerBundle,
  createPortableSpeechModelFileRef,
  getPortableSpeechModelInnerBundleFileBytes,
  parseAndVerifyPortableSpeechModelInnerBundle,
  stablePortableModelJson,
  type PortableSpeechModelBundleFileInputV1,
} from './bundle';
import type { PortableSpeechModelManifestV1 } from './manifest';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function jsonBytes(value: unknown): Uint8Array {
  return bytes(stablePortableModelJson(value));
}

function binaryBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(values);
}

async function samplePortableBundleInput(): Promise<{
  readonly manifest: PortableSpeechModelManifestV1;
  readonly files: readonly PortableSpeechModelBundleFileInputV1[];
  readonly refs: Readonly<Record<string, ProfileFileRef>>;
}> {
  const adapterWeights = file(
    'artifacts/adapter-weights.bin',
    'application/octet-stream',
    binaryBytes([0x00, 0x10, 0x20, 0x30, 0x40, 0x50]),
  );
  const speakerEmbedding = file(
    'embeddings/speaker.f32',
    'application/octet-stream',
    binaryBytes([0x9a, 0x99, 0x19, 0x3f, 0xcd, 0xcc, 0x4c, 0x3f]),
  );
  const vocabulary = file(
    'vocabulary/revision.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      revision: 8,
      entries: [
        { entryIdHash: 'vocab-hash-001', locale: 'vi' },
        { entryIdHash: 'vocab-hash-002', locale: 'en' },
      ],
      privacy: { containsRawTerms: false },
    }),
  );
  const evaluationSummary = file(
    'evaluation/summary.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      gatePassed: true,
      weightedRelativeWerReduction: 0.231,
      targetAnchorFalseInsertionDelta: 0.002,
      privacy: { containsCaseIds: false, containsVocabularyTerms: false },
    }),
  );
  const evaluationMetrics = file(
    'evaluation/metrics.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      slices: [
        { slice: 'generic', wer: 0.12 },
        { slice: 'candidate', wer: 0.09 },
        { slice: 'p1', wer: 0.1 },
      ],
      privacy: { containsCaseIds: false },
    }),
  );
  const notices = file(
    'notices/THIRD_PARTY_NOTICES.txt',
    'text/plain',
    bytes('Synthetic browser adapter fixture. Apache-2.0. No raw recordings or transcript text.\n'),
  );
  const forwardVector = file(
    'test-vectors/forward.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      inputDimension: 4,
      logitsSha256: 'f'.repeat(64),
      privacy: { containsRawAudio: false, containsTranscriptText: false },
    }),
  );

  const payloadWithoutChecksums = [
    adapterWeights,
    speakerEmbedding,
    vocabulary,
    evaluationSummary,
    evaluationMetrics,
    notices,
    forwardVector,
  ] as const;
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
    bundleId: 'portable-fixture-001',
    modelRevision: 'rev-2026-06-26',
    displayName: 'Portable fixture adapter',
    createdAt: '2026-06-26T00:00:00.000Z',
    exportedAt: '2026-06-26T00:00:00.000Z',
    sourceAppVersion: '0.5.0',
    profile: { sourceProfileId: 'profile-local-001', languages: ['vi', 'en'], supportsMixed: true },
    baseModel: {
      id: 'mock-vi-en-rnnt',
      version: '0.4.0',
      manifestSha256: 'a'.repeat(64),
      graphContractSha256: 'b'.repeat(64),
      tokenizerSha256: 'c'.repeat(64),
    },
    adaptation: {
      type: 'browser-top-adapter',
      contractVersion: 1,
      algorithmId: 'browser-training-fixed-adamw-v1',
      files: {
        weights: ref(refs, 'artifacts/adapter-weights.bin'),
        speakerEmbedding: ref(refs, 'embeddings/speaker.f32'),
      },
    },
    vocabulary: {
      included: true,
      schemaVersion: 1,
      revision: 8,
      file: ref(refs, 'vocabulary/revision.json'),
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
  return {
    manifest,
    files: [...payloadWithoutChecksums, checksums].reverse(),
    refs,
  };
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

describe('portable speech model inner bundle', () => {
  it('builds deterministic archive bytes with manifest, adapter, notices, checksums, and test vectors', async () => {
    const input = await samplePortableBundleInput();

    const first = await buildPortableSpeechModelInnerBundle(input);
    const second = await buildPortableSpeechModelInnerBundle({
      manifest: input.manifest,
      files: [...input.files].reverse(),
    });

    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes));
    expect(first.index.files.map((entry) => entry.path)).toEqual(
      [...first.index.files.map((entry) => entry.path)].sort(),
    );
    expect(first.index.files.map((entry) => entry.path)).toContain(
      PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
    );
    expect(first.index.privacy).toEqual({
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsCheckpoints: false,
      containsBaseModel: false,
      containsVoiceDerivedWeights: true,
    });

    const verified = await parseAndVerifyPortableSpeechModelInnerBundle(first.bytes);
    expect(verified.manifest).toEqual(input.manifest);
    const manifestBytes = getPortableSpeechModelInnerBundleFileBytes(
      first.bytes,
      verified,
      PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
    );
    expect(JSON.parse(textDecoder.decode(manifestBytes))).toEqual(input.manifest);
    for (const [path, ref] of Object.entries(input.refs)) {
      const entry = verified.index.files.find((fileRef) => fileRef.path === path);
      expect(entry).toMatchObject(ref);
    }
  });

  it('keeps private training data out of the deterministic fixture bundle', async () => {
    const input = await samplePortableBundleInput();
    const bundle = await buildPortableSpeechModelInnerBundle(input);
    const decoded = textDecoder.decode(bundle.bytes);

    expect(decoded).not.toContain('private/checkpoint');
    expect(decoded).not.toContain('feature-shards');
    expect(decoded).not.toContain('xin chào minh');
    expect(decoded).not.toContain('Project Condor');
  });

  it('rejects raw-audio payloads before building a portable bundle', async () => {
    await expect(
      createPortableSpeechModelFileRef(file('recordings/take-001.wav', 'audio/wav', bytes('RIFF'))),
    ).rejects.toThrow('exclude raw audio');
  });

  it('rejects colliding payload paths and manifest self-references', async () => {
    const input = await samplePortableBundleInput();

    await expect(
      buildPortableSpeechModelInnerBundle({
        manifest: input.manifest,
        files: [
          ...input.files,
          file('ARTIFACTS/adapter-weights.bin', 'application/octet-stream', binaryBytes([1])),
        ],
      }),
    ).rejects.toThrow('duplicate or colliding path');

    await expect(
      buildPortableSpeechModelInnerBundle({
        manifest: {
          ...input.manifest,
          files: [
            ...input.manifest.files,
            {
              ...ref(input.refs, 'metadata/checksums.json'),
              path: PORTABLE_SPEECH_MODEL_MANIFEST_PATH,
            },
          ],
        },
        files: input.files,
      }),
    ).rejects.toThrow('manifest.json self-reference');

    await expect(
      buildPortableSpeechModelInnerBundle({
        manifest: {
          ...input.manifest,
          files: [...input.manifest.files, ref(input.refs, 'metadata/checksums.json')],
        },
        files: input.files,
      }),
    ).rejects.toThrow('duplicate or colliding path');
  });

  it('rejects missing or mismatched manifest file refs', async () => {
    const input = await samplePortableBundleInput();
    const [firstFile, ...restFiles] = input.files;
    expect(firstFile).toBeDefined();

    await expect(
      buildPortableSpeechModelInnerBundle({ manifest: input.manifest, files: restFiles }),
    ).rejects.toThrow('missing payload file');

    const mutated = input.files.map((payload) =>
      payload.path === 'artifacts/adapter-weights.bin'
        ? { ...payload, bytes: binaryBytes([9, 9, 9]) }
        : payload,
    );
    await expect(
      buildPortableSpeechModelInnerBundle({ manifest: input.manifest, files: mutated }),
    ).rejects.toThrow('metadata does not match');
  });

  it('detects corrupted archive payload bytes and trailing data', async () => {
    const input = await samplePortableBundleInput();
    const bundle = await buildPortableSpeechModelInnerBundle(input);
    const corrupted = new Uint8Array(bundle.bytes);
    const finalIndex = corrupted.byteLength - 1;
    const finalByte = corrupted[finalIndex];
    if (finalByte === undefined) throw new Error('Expected non-empty bundle bytes');
    corrupted[finalIndex] = finalByte ^ 0xff;

    await expect(parseAndVerifyPortableSpeechModelInnerBundle(corrupted)).rejects.toThrow(
      'checksum mismatch',
    );
    const trailing = new Uint8Array(bundle.bytes.byteLength + 1);
    trailing.set(bundle.bytes);
    trailing[trailing.byteLength - 1] = 0x01;
    await expect(parseAndVerifyPortableSpeechModelInnerBundle(trailing)).rejects.toThrow(
      'trailing bytes',
    );
  });

  it('rejects unsupported stable JSON values for deterministic manifests', () => {
    expect(() => stablePortableModelJson({ ok: true, unsupported: undefined })).toThrow(
      'does not support undefined',
    );
    expect(() => stablePortableModelJson({ loss: Number.NaN })).toThrow('finite numbers');
  });
});
