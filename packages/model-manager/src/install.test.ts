import { describe, expect, it } from 'vitest';
import type { SpeechModelManifestV2 } from '@speech/protocol';
import {
  deleteInstalledModelRecord,
  getInstalledModelRecord,
  installModelPack,
  sha256ArrayBuffer,
  verifyInstalledModelFiles,
  type ModelInstallProgress,
  type ModelPackFileDownloader,
} from './install';
import {
  InMemoryModelStorageBackend,
  type BinaryModelFile,
  type ModelStorageLocator,
} from './storage';

describe('model pack installation', () => {
  it('downloads files into a temporary version, verifies them, and activates the final version last', async () => {
    const storage = new InMemoryModelStorageBackend();
    const files = modelFileBytes({ encoder: [1, 2, 3], predictor: [4, 5], joiner: [6] });
    const manifest = await makeManifest('1.0.0', files);
    const progress: ModelInstallProgress[] = [];

    const result = await installModelPack(manifest, {
      storage,
      installId: 'unit-install',
      downloadFile: fakeDownloader(files),
      requestPersistentStorage: async () => true,
      onProgress: (event) => progress.push(event),
      now: fixedNow,
    });

    expect(result.activeVersion).toBe('1.0.0');
    expect(result.requiredStorageBytes).toBe(6);
    expect(result.persistentStorageGranted).toBe(true);
    expect(result.files.map((file) => file.fileKey)).toEqual(['encoder', 'joiner', 'predictor']);
    expect(await readBytes(storage, locator(manifest, '1.0.0', 'encoder'))).toEqual([1, 2, 3]);
    expect(
      await storage.listFiles({ modelId: manifest.id, version: '1.0.0__install-unit-install' }),
    ).toEqual([]);

    const activeRecord = await getInstalledModelRecord(storage, manifest.id);
    expect(activeRecord?.activeVersion).toBe('1.0.0');
    await expect(verifyInstalledModelFiles(storage, manifest)).resolves.toEqual({
      ok: true,
      errors: [],
    });
    expect(progress.map((event) => event.phase)).toContain('cleaning-temporary-version');
    expect(progress.at(-1)?.phase).toBe('activating-version');
  });

  it('deletes the active registry record and active version files', async () => {
    const storage = new InMemoryModelStorageBackend();
    const files = modelFileBytes({ encoder: [1], predictor: [2], joiner: [3] });
    const manifest = await makeManifest('1.0.0', files);
    const record = await installModelPack(manifest, {
      storage,
      installId: 'delete-active',
      downloadFile: fakeDownloader(files),
    });

    await expect(deleteInstalledModelRecord(storage, manifest.id)).resolves.toBe(true);
    await expect(getInstalledModelRecord(storage, manifest.id)).resolves.toBeUndefined();
    await expect(
      storage.listFiles({ modelId: manifest.id, version: record.activeVersion }),
    ).resolves.toHaveLength(0);
  });

  it('rejects checksum mismatches and leaves no active model behind', async () => {
    const storage = new InMemoryModelStorageBackend();
    const expectedFiles = modelFileBytes({ encoder: [1, 2], predictor: [3], joiner: [4] });
    const manifest = await makeManifest('1.0.0', expectedFiles);
    const corruptedFiles = { ...expectedFiles, encoder: bytes([9, 9]) };

    await expect(
      installModelPack(manifest, {
        storage,
        installId: 'bad-checksum',
        downloadFile: fakeDownloader(corruptedFiles),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_CHECKSUM_MISMATCH' });

    expect(await getInstalledModelRecord(storage, manifest.id)).toBeUndefined();
    expect(await storage.listFiles({ modelId: manifest.id })).toEqual([]);
  });

  it('detects storage corruption before activation and leaves no active model behind', async () => {
    const storage = new CorruptingTemporaryStorageBackend('encoder');
    const files = modelFileBytes({ encoder: [1, 2, 3], predictor: [4], joiner: [5] });
    const manifest = await makeManifest('1.0.0', files);

    await expect(
      installModelPack(manifest, {
        storage,
        installId: 'storage-corrupts-temp',
        downloadFile: fakeDownloader(files),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_CHECKSUM_MISMATCH' });

    expect(await getInstalledModelRecord(storage, manifest.id)).toBeUndefined();
    expect(await storage.listFiles({ modelId: manifest.id })).toEqual([]);
  });

  it('preserves the previous active version when a later version is truncated', async () => {
    const storage = new InMemoryModelStorageBackend();
    const v1Files = modelFileBytes({ encoder: [1], predictor: [2], joiner: [3] });
    const v1Manifest = await makeManifest('1.0.0', v1Files);
    await installModelPack(v1Manifest, {
      storage,
      installId: 'first',
      downloadFile: fakeDownloader(v1Files),
    });

    const v2Files = modelFileBytes({ encoder: [4, 5], predictor: [6, 7], joiner: [8, 9] });
    const v2Manifest = await makeManifest('2.0.0', v2Files);
    const truncatedV2Files = { ...v2Files, predictor: bytes([6]) };

    await expect(
      installModelPack(v2Manifest, {
        storage,
        installId: 'second',
        downloadFile: fakeDownloader(truncatedV2Files),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_CHECKSUM_MISMATCH' });

    const activeRecord = await getInstalledModelRecord(storage, v1Manifest.id);
    expect(activeRecord?.activeVersion).toBe('1.0.0');
    expect(await readBytes(storage, locator(v1Manifest, '1.0.0', 'encoder'))).toEqual([1]);
    expect(await storage.listFiles({ modelId: v2Manifest.id, version: '2.0.0' })).toEqual([]);
  });

  it('rejects non-redistributable licenses unless the caller accepts the license gate', async () => {
    const storage = new InMemoryModelStorageBackend();
    const files = modelFileBytes({ encoder: [1], predictor: [2], joiner: [3] });
    const manifest = await makeManifest('1.0.0', files, { redistributionAllowed: false });

    await expect(
      installModelPack(manifest, {
        storage,
        installId: 'license-rejected',
        downloadFile: fakeDownloader(files),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_LICENSE_REJECTED' });

    const accepted = await installModelPack(manifest, {
      storage,
      installId: 'license-accepted',
      downloadFile: fakeDownloader(files),
      acceptLicense: async () => true,
    });
    expect(accepted.activeVersion).toBe('1.0.0');
  });

  it('refuses to overwrite the currently active model version in place', async () => {
    const storage = new InMemoryModelStorageBackend();
    const files = modelFileBytes({ encoder: [1], predictor: [2], joiner: [3] });
    const manifest = await makeManifest('1.0.0', files);
    await installModelPack(manifest, {
      storage,
      installId: 'first',
      downloadFile: fakeDownloader(files),
    });

    let downloadCalls = 0;
    await expect(
      installModelPack(manifest, {
        storage,
        installId: 'same-version',
        downloadFile: async (request) => {
          downloadCalls += 1;
          return fakeDownloader(files)(request);
        },
      }),
    ).rejects.toMatchObject({ code: 'MODEL_VERSION_ACTIVE' });
    expect(downloadCalls).toBe(0);
  });
});

async function makeManifest(
  version: string,
  fileBytes: Record<'encoder' | 'predictor' | 'joiner', ArrayBuffer>,
  license: { readonly redistributionAllowed: boolean } = { redistributionAllowed: true },
): Promise<SpeechModelManifestV2> {
  return {
    schemaVersion: 2,
    id: 'local-dev-rnnt-mock',
    version,
    displayName: `Local dev RNN-T mock ${version}`,
    languages: ['vi', 'en'],
    supportedLanguageModes: ['vi', 'en', 'auto', 'mixed'],
    architecture: 'rnnt',
    license: {
      name: 'Test model files',
      redistributionAllowed: license.redistributionAllowed,
    },
    sampleRateHz: 16000,
    feature: {
      type: 'log-mel',
      bins: 80,
      frameLengthMs: 25,
      frameShiftMs: 10,
      fftSize: 512,
      lowFreqHz: 20,
      highFreqHz: 7600,
      dither: 0,
      snipEdges: false,
    },
    tokenizer: {
      type: 'tokens',
      vocabularySize: 4,
      byteFallback: true,
      blankId: 0,
      languageTokenIds: {
        vi: 1,
        en: 2,
        mixed: 3,
      },
    },
    streaming: {
      chunkFrames: 16,
      chunkShiftFrames: 8,
      rightContextFrames: 4,
      maxSymbolsPerFrame: 3,
    },
    contextBiasing: {
      supported: false,
      algorithm: 'token-trie',
      maxActiveEntries: 0,
      maxPhraseTokens: 0,
      defaultWeight: 0,
      maxCumulativeBonus: 0,
    },
    files: {
      encoder: await fileEntry('encoder', fileBytes.encoder),
      predictor: await fileEntry('predictor', fileBytes.predictor),
      joiner: await fileEntry('joiner', fileBytes.joiner),
    },
    graphs: {
      encoder: graphContract('encoder', 'features', 'encoded'),
      predictor: graphContract('predictor', 'tokens', 'predicted'),
      joiner: graphContract('joiner', 'encoded', 'logits'),
    },
    recommended: {
      webgpu: false,
      wasmThreads: 1,
      expectedMemoryMb: 64,
    },
  };
}

async function fileEntry(fileKey: string, data: ArrayBuffer) {
  return {
    url: `/models/mock/${fileKey}.onnx`,
    sha256: await sha256ArrayBuffer(data),
    sizeBytes: data.byteLength,
    mediaType: 'application/octet-stream',
  };
}

function graphContract(fileKey: string, inputName: string, outputName: string) {
  return {
    fileKey,
    inputs: [
      {
        name: inputName,
        dataType: 'float32' as const,
        shape: ['batch', 'frames', 80],
        description: `${inputName} input`,
      },
    ],
    outputs: [
      {
        name: outputName,
        dataType: 'float32' as const,
        shape: ['batch', 'frames', 256],
        description: `${outputName} output`,
      },
    ],
  };
}

function modelFileBytes(
  input: Record<'encoder' | 'predictor' | 'joiner', readonly number[]>,
): Record<'encoder' | 'predictor' | 'joiner', ArrayBuffer> {
  return {
    encoder: bytes(input.encoder),
    predictor: bytes(input.predictor),
    joiner: bytes(input.joiner),
  };
}

function bytes(values: readonly number[]): ArrayBuffer {
  const output = new ArrayBuffer(values.length);
  new Uint8Array(output).set(values);
  return output;
}

function fakeDownloader(files: Record<string, ArrayBuffer>): ModelPackFileDownloader {
  return async (request) => {
    const file = files[request.fileKey];
    if (file === undefined) {
      throw new Error(`missing ${request.fileKey}`);
    }
    request.onProgress?.(Math.min(1, file.byteLength), file.byteLength);
    request.onProgress?.(file.byteLength, file.byteLength);
    return file.slice(0);
  };
}

async function readBytes(storage: InMemoryModelStorageBackend, fileLocator: ModelStorageLocator) {
  const stored = await storage.getFile(fileLocator);
  return Array.from(new Uint8Array(stored ?? new ArrayBuffer(0)));
}

function locator(
  manifest: SpeechModelManifestV2,
  version: string,
  fileKey: string,
): ModelStorageLocator {
  return { modelId: manifest.id, version, fileKey };
}

class CorruptingTemporaryStorageBackend extends InMemoryModelStorageBackend {
  private readonly corruptFileKey: string;

  constructor(corruptFileKey: string) {
    super();
    this.corruptFileKey = corruptFileKey;
  }

  override async putFile(locator: ModelStorageLocator, data: BinaryModelFile) {
    if (locator.version.includes('__install') && locator.fileKey === this.corruptFileKey) {
      return super.putFile(locator, bytes([0, 0, 0]));
    }
    return super.putFile(locator, data);
  }
}

function fixedNow(): Date {
  return new Date('2026-06-22T00:00:00.000Z');
}
