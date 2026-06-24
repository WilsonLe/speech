import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeEnrollmentTakeQuality } from '@speech/enrollment';
import {
  EnrollmentProfileStore,
  InMemoryProfileStorageBackend,
  OpfsProfileStorageBackend,
  encodePcm16Wav,
  requestPersistentProfileStorage,
  type EnrollmentCaptureMetadataV1,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsWritableFileStreamLike,
  type ProfileStorageBackend,
} from './index';

const capture: EnrollmentCaptureMetadataV1 = {
  requestedConstraints: { audio: { channelCount: { ideal: 1 }, autoGainControl: false } },
  actualSettings: { channelCount: 1, sampleRate: 16_000, autoGainControl: false },
  userMicrophoneLabel: 'Fake microphone',
};

const baseModel = {
  id: 'mock-vi-en-rnnt',
  version: '0.0.0-test',
  manifestSha256: 'manifest-sha256',
  graphContractSha256: 'graph-contract-sha256',
};

const quality = analyzeEnrollmentTakeQuality({
  pcm: makeTone(1_200, 0.1),
  sampleRateHz: 16_000,
  referenceText: 'Tôi vừa update dashboard.',
  language: 'mixed',
  voiceCondition: 'normal',
  calibration: { normalRms: 0.07, roomNoiseRms: 0.003 },
  alignment: { recognizedText: 'tôi vừa update dashboard', confidence: 0.8 },
});

describe('enrollment profile store', () => {
  it('encodes PCM as 16-bit mono WAV', () => {
    const wav = encodePcm16Wav(new Float32Array([-1, 0, 1]), 16_000);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);

    expect(text(bytes, 0, 4)).toBe('RIFF');
    expect(text(bytes, 8, 12)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('stores accepted utterance audio, metadata, profile summary, and checksums', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const wavBytes = encodePcm16Wav(makeTone(1_200, 0.1), 16_000);
    const utterance = await store.saveEnrollmentUtterance({
      profileId: 'profile-local',
      profileDisplayName: 'Local profile',
      sentenceBankVersion: 'synthetic-v1',
      promptId: 'prompt-001',
      promptVersion: 1,
      referenceText: 'Tôi vừa update dashboard.',
      language: 'mixed',
      voiceCondition: 'normal',
      repetitionIndex: 1,
      wavBytes,
      sampleRateHz: 16_000,
      durationMs: 1_200,
      capture,
      quality,
      acceptedBy: 'manual',
      utteranceId: 'utt-001',
    });

    expect(utterance.audio.path).toBe('profiles/profile-local/recordings/utt-001.wav');
    expect(utterance.audio.sha256).toBe(await digest(wavBytes));
    expect(utterance.quality.privacy.containsAudio).toBe(false);

    const summary = await store.getProfileSummary('profile-local');
    expect(summary?.profile).toMatchObject({
      schemaVersion: 1,
      id: 'profile-local',
      displayName: 'Local profile',
      enrollment: {
        acceptedUtterances: 1,
        languageCounts: { vi: 0, en: 0, mixed: 1 },
        voiceConditionCounts: { whisper: 0, normal: 1, projected: 0 },
        sentenceBankVersion: 'synthetic-v1',
      },
      privacy: { containsRawAudio: true, exportEncrypted: false, localOnly: true },
    });
    expect(summary?.utterances).toHaveLength(1);
    expect(Object.keys(summary?.checksums.files ?? {})).toEqual(
      expect.arrayContaining([
        'profiles/profile-local/enrollment.jsonl',
        'profiles/profile-local/profile.json',
        'profiles/profile-local/recordings/utt-001.wav',
        'profiles/profile-local/utterances/utt-001.json',
      ]),
    );
    expect(
      await readBytes(backend, ['profiles', 'profile-local', 'recordings', 'utt-001.wav']),
    ).toEqual(Array.from(new Uint8Array(wavBytes)));
  });

  it('rejects unsafe profile and prompt path segments before writing', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await expect(
      store.saveEnrollmentUtterance({
        profileId: '../private',
        profileDisplayName: 'Bad profile',
        sentenceBankVersion: 'synthetic-v1',
        promptId: 'prompt-001',
        promptVersion: 1,
        referenceText: 'Please read this sentence.',
        language: 'en',
        voiceCondition: 'normal',
        repetitionIndex: 1,
        wavBytes: encodePcm16Wav(makeTone(800, 0.1), 16_000),
        sampleRateHz: 16_000,
        durationMs: 800,
        capture,
        quality,
        acceptedBy: 'manual',
      }),
    ).rejects.toThrow(/profileId/);
    expect(await backend.listFiles()).toEqual([]);
  });

  it('deletes one profile without touching another profile or stale active state', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-a', 'utt-a');
    await saveFixtureTake(store, 'profile-b', 'utt-b');
    await store.enableProfile({ profileId: 'profile-a' });
    await store.enableProfile({ profileId: 'profile-b' });

    await store.deleteProfile('profile-a');

    expect(await store.getProfileSummary('profile-a')).toBeUndefined();
    expect(await store.getProfileSummary('profile-b')).toBeDefined();
    expect(await store.getActiveProfileState()).toMatchObject({ activeProfileId: 'profile-b' });
    expect((await store.getActiveProfileState()).previousProfileId).toBeUndefined();
    expect(await backend.listFiles(['profiles', 'profile-a'])).toEqual([]);
    expect((await backend.listFiles(['profiles', 'profile-b'])).length).toBeGreaterThan(0);
  });

  it('enables and rolls back active profiles with base-model compatibility checks', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-a', 'utt-a', baseModel);
    await saveFixtureTake(store, 'profile-b', 'utt-b', baseModel);

    await expect(
      store.enableProfile({
        profileId: 'profile-a',
        expectedBaseModel: { ...baseModel, graphContractSha256: 'different' },
      }),
    ).rejects.toThrow(/base-model/);

    await expect(
      store.enableProfile({ profileId: 'profile-a', expectedBaseModel: baseModel }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-a' });
    await expect(
      store.enableProfile({ profileId: 'profile-b', expectedBaseModel: baseModel }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-b', previousProfileId: 'profile-a' });
    await expect(store.rollbackActiveProfile()).resolves.toMatchObject({
      activeProfileId: 'profile-a',
      previousProfileId: 'profile-b',
    });
  });

  it('exports and imports a checksummed sensitive profile package', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export', baseModel);

    const exported = await store.exportProfile('profile-export');

    expect(exported).toMatchObject({
      schemaVersion: 1,
      packageType: 'speech-enrollment-profile-export',
      profileId: 'profile-export',
      privacy: {
        containsRawAudio: true,
        containsTranscriptText: true,
        containsRawProfileData: true,
        exportEncrypted: false,
        localOnly: true,
      },
    });
    expect(exported.warnings.join(' ')).toMatch(/sensitive personal data/i);
    expect(exported.files['profiles/profile-export/recordings/utt-export.wav']).toMatchObject({
      mediaType: 'audio/wav',
      sha256: await digest(encodePcm16Wav(makeTone(1_200, 0.1), 16_000)),
    });

    const importedBackend = new InMemoryProfileStorageBackend();
    const importedStore = createStore(importedBackend);
    const summary = await importedStore.importProfile({ profilePackage: exported });

    expect(summary.profile.id).toBe('profile-export');
    expect(summary.utterances).toHaveLength(1);
    expect(
      await readBytes(importedBackend, [
        'profiles',
        'profile-export',
        'recordings',
        'utt-export.wav',
      ]),
    ).toEqual(
      await readBytes(backend, ['profiles', 'profile-export', 'recordings', 'utt-export.wav']),
    );
    await expect(importedStore.importProfile({ profilePackage: exported })).rejects.toThrow(
      /already exists/,
    );
  });

  it('rejects tampered exported profile files during import', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export');
    const exported = await store.exportProfile('profile-export');
    const path = 'profiles/profile-export/profile.json';
    const tampered = {
      ...exported,
      files: {
        ...exported.files,
        [path]: { ...exported.files[path]!, base64: 'AAAA' },
      },
    };

    await expect(
      createStore(new InMemoryProfileStorageBackend()).importProfile({ profilePackage: tampered }),
    ).rejects.toThrow(/checksum mismatch|size does not match/);
  });

  it('rejects exports whose embedded metadata differs from the top-level package', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export');
    const exported = await store.exportProfile('profile-export');
    const path = 'profiles/profile-export/profile.json';
    const tamperedProfileBytes = jsonBytes({
      ...exported.profile,
      displayName: 'Different embedded profile',
    });
    const tampered = {
      ...exported,
      files: {
        ...exported.files,
        [path]: {
          ...exported.files[path]!,
          sha256: await digest(tamperedProfileBytes),
          sizeBytes: tamperedProfileBytes.byteLength,
          base64: Buffer.from(tamperedProfileBytes).toString('base64'),
        },
      },
    };

    await expect(
      createStore(new InMemoryProfileStorageBackend()).importProfile({ profilePackage: tampered }),
    ).rejects.toThrow(/profile metadata does not match embedded profile\.json/);
  });

  it('stores files through an OPFS-compatible backend', async () => {
    const backend = new OpfsProfileStorageBackend(new FakeOpfsDirectory());
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-opfs', 'utt-opfs');

    const summary = await store.getProfileSummary('profile-opfs');
    expect(summary?.utterances[0]?.audio.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await backend.listFiles(['profiles', 'profile-opfs'])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['profiles', 'profile-opfs', 'profile.json'] }),
        expect.objectContaining({
          path: ['profiles', 'profile-opfs', 'recordings', 'utt-opfs.wav'],
        }),
      ]),
    );
  });

  it('requests persistent storage when available', async () => {
    await expect(
      requestPersistentProfileStorage({
        persist: async () => true,
      }),
    ).resolves.toBe(true);
    await expect(requestPersistentProfileStorage({})).resolves.toBe(false);
  });
});

function createStore(backend: ProfileStorageBackend): EnrollmentProfileStore {
  return new EnrollmentProfileStore(backend, {
    digest,
    now: () => '2026-06-23T00:00:00.000Z',
    randomId: () => 'utt-generated',
  });
}

async function saveFixtureTake(
  store: EnrollmentProfileStore,
  profileId: string,
  utteranceId: string,
  model: typeof baseModel | undefined = undefined,
): Promise<void> {
  await store.saveEnrollmentUtterance({
    profileId,
    profileDisplayName: profileId,
    sentenceBankVersion: 'synthetic-v1',
    promptId: 'prompt-001',
    promptVersion: 1,
    referenceText: 'Tôi vừa update dashboard.',
    language: 'mixed',
    voiceCondition: 'normal',
    repetitionIndex: 1,
    wavBytes: encodePcm16Wav(makeTone(1_200, 0.1), 16_000),
    sampleRateHz: 16_000,
    durationMs: 1_200,
    capture,
    quality,
    acceptedBy: 'manual',
    utteranceId,
    ...(model === undefined ? {} : { baseModel: model }),
  });
}

function makeTone(durationMs: number, amplitude: number): Float32Array {
  const sampleRateHz = 16_000;
  const sampleCount = Math.round((durationMs / 1_000) * sampleRateHz);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * amplitude;
  }
  return pcm;
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
}

function jsonBytes(value: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function readBytes(
  backend: ProfileStorageBackend,
  path: readonly string[],
): Promise<number[]> {
  const bytes = await backend.getFile(path);
  return Array.from(new Uint8Array(bytes ?? new ArrayBuffer(0)));
}

function text(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.slice(start, end));
}

class FakeOpfsDirectory implements OpfsDirectoryHandleLike {
  private readonly directories = new Map<string, FakeOpfsDirectory>();
  private readonly files = new Map<string, FakeOpfsFile>();

  async getDirectoryHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsDirectoryHandleLike> {
    const existing = this.directories.get(name);
    if (existing !== undefined) return existing;
    if (options.create !== true) throw notFound();
    const directory = new FakeOpfsDirectory();
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsFileHandleLike> {
    const existing = this.files.get(name);
    if (existing !== undefined) return existing;
    if (options.create !== true) throw notFound();
    const file = new FakeOpfsFile();
    this.files.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name) || this.directories.delete(name)) return;
    throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, OpfsDirectoryHandleLike | OpfsFileHandleLike]> {
    for (const entry of this.directories.entries()) yield entry;
    for (const entry of this.files.entries()) yield entry;
  }
}

class FakeOpfsFile implements OpfsFileHandleLike {
  private bytes = new ArrayBuffer(0);

  async getFile(): Promise<Blob> {
    return new Blob([this.bytes.slice(0)]);
  }

  async createWritable(): Promise<OpfsWritableFileStreamLike> {
    return new FakeOpfsWritableFileStream((bytes) => {
      this.bytes = bytes;
    });
  }
}

class FakeOpfsWritableFileStream implements OpfsWritableFileStreamLike {
  private bytes = new ArrayBuffer(0);

  constructor(private readonly commit: (bytes: ArrayBuffer) => void) {}

  async write(data: BlobPart): Promise<void> {
    if (data instanceof ArrayBuffer) {
      this.bytes = data.slice(0);
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const output = new ArrayBuffer(data.byteLength);
      new Uint8Array(output).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.bytes = output;
      return;
    }
    if (data instanceof Blob) {
      this.bytes = await data.arrayBuffer();
      return;
    }
    this.bytes = new TextEncoder().encode(data).buffer;
  }

  async close(): Promise<void> {
    this.commit(this.bytes.slice(0));
  }
}

function notFound(): DOMException {
  return new DOMException('not found', 'NotFoundError');
}
