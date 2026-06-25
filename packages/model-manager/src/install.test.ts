import { describe, expect, it } from 'vitest';
import type {
  BrowserTrainingArtifactRefV1,
  SpeechModelManifest,
  SpeechModelManifestV2,
  SpeechModelManifestV3,
} from '@speech/protocol';
import {
  deleteInstalledModelRecord,
  getInferenceModelFileKeys,
  getInstalledModelRecord,
  getManifestRequiredStorageBytes,
  getTrainingCompanionFileKeys,
  getTrainingCompanionRequiredStorageBytes,
  installModelPack,
  installTrainingCompanionPack,
  sha256ArrayBuffer,
  verifyInstalledModelFiles,
  verifyInstalledTrainingCompanionFiles,
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

  it('installs only inference files from a v3 manifest by default', async () => {
    const storage = new InMemoryModelStorageBackend();
    const inferenceFiles = modelFileBytes({ encoder: [1, 2, 3], predictor: [4], joiner: [5] });
    const companionFiles = trainingCompanionFileBytes();
    const manifest = await makeBrowserTrainingManifest('1.0.0', inferenceFiles, companionFiles);
    const allFiles = { ...inferenceFiles, ...companionFiles };

    expect(getInferenceModelFileKeys(manifest)).toEqual(['encoder', 'joiner', 'predictor']);
    expect(getTrainingCompanionFileKeys(manifest)).toEqual([
      'adapter-runtime',
      'anchor-pack',
      'contract-test-vectors',
      'eval-model',
      'nominal-checkpoint',
      'optimizer-model',
      'training-model',
    ]);
    expect(getManifestRequiredStorageBytes(manifest)).toBe(5);
    expect(getTrainingCompanionRequiredStorageBytes(manifest)).toBe(77);
    expect(getManifestRequiredStorageBytes(manifest, { includeTrainingCompanion: true })).toBe(82);

    const result = await installModelPack(manifest, {
      storage,
      installId: 'v3-core-only',
      downloadFile: fakeDownloader(allFiles),
    });

    expect(result.manifest.schemaVersion).toBe(3);
    expect(result.files.map((file) => file.fileKey)).toEqual(['encoder', 'joiner', 'predictor']);
    expect(result.requiredStorageBytes).toBe(5);
    expect(result.trainingCompanion).toBeUndefined();
    expect(await storage.hasFile(locator(manifest, '1.0.0', 'training-model'))).toBe(false);
    expect(await verifyInstalledModelFiles(storage, manifest)).toEqual({ ok: true, errors: [] });
    expect(
      await verifyInstalledModelFiles(storage, manifest, { includeTrainingCompanion: true }),
    ).toEqual({
      ok: false,
      errors: [
        'adapter-runtime is missing from local-dev-rnnt-mock@1.0.0',
        'anchor-pack is missing from local-dev-rnnt-mock@1.0.0',
        'contract-test-vectors is missing from local-dev-rnnt-mock@1.0.0',
        'eval-model is missing from local-dev-rnnt-mock@1.0.0',
        'nominal-checkpoint is missing from local-dev-rnnt-mock@1.0.0',
        'optimizer-model is missing from local-dev-rnnt-mock@1.0.0',
        'training-model is missing from local-dev-rnnt-mock@1.0.0',
      ],
    });
  });

  it('installs optional training companions only for the exact active model version', async () => {
    const storage = new InMemoryModelStorageBackend();
    const inferenceFiles = modelFileBytes({ encoder: [1, 2, 3], predictor: [4], joiner: [5] });
    const companionFiles = trainingCompanionFileBytes();
    const manifest = await makeBrowserTrainingManifest('1.0.0', inferenceFiles, companionFiles);
    const allFiles = { ...inferenceFiles, ...companionFiles };

    await expect(
      installTrainingCompanionPack(manifest, {
        storage,
        installId: 'no-active-version',
        downloadFile: fakeDownloader(allFiles),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_VERSION_NOT_ACTIVE' });

    await installModelPack(manifest, {
      storage,
      installId: 'active-core',
      downloadFile: fakeDownloader(allFiles),
    });

    const blockedLicenseManifest = makeCompanionArtifactNonRedistributable(
      manifest,
      'optimizerModel',
    );
    await expect(
      installTrainingCompanionPack(blockedLicenseManifest, {
        storage,
        installId: 'blocked-companion-license',
        downloadFile: fakeDownloader(allFiles),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_LICENSE_REJECTED' });
    expect(
      (await getInstalledModelRecord(storage, manifest.id))?.trainingCompanion,
    ).toBeUndefined();

    const updated = await installTrainingCompanionPack(manifest, {
      storage,
      installId: 'companion',
      downloadFile: fakeDownloader(allFiles),
      requestPersistentStorage: async () => true,
      now: fixedNow,
    });

    expect(updated.trainingCompanion).toMatchObject({
      contractVersion: 1,
      requiredStorageBytes: 77,
      installId: 'companion',
      installedAt: '2026-06-22T00:00:00.000Z',
      activatedAt: '2026-06-22T00:00:00.000Z',
    });
    expect(updated.trainingCompanion?.files.map((file) => file.fileKey)).toEqual([
      'adapter-runtime',
      'anchor-pack',
      'contract-test-vectors',
      'eval-model',
      'nominal-checkpoint',
      'optimizer-model',
      'training-model',
    ]);
    expect(updated.files.map((file) => file.fileKey)).toEqual(['encoder', 'joiner', 'predictor']);
    expect(updated.persistentStorageGranted).toBe(true);
    await expect(verifyInstalledTrainingCompanionFiles(storage, manifest)).resolves.toEqual({
      ok: true,
      errors: [],
    });
    expect(await readBytes(storage, locator(manifest, '1.0.0', 'training-model'))).toEqual([
      11, 12,
    ]);
    expect(
      await storage.listFiles({
        modelId: manifest.id,
        version: '1.0.0__training-companion-companion',
      }),
    ).toEqual([]);
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
      supportedEntryLanguages: [],
      maxActiveEntries: 0,
      maxPhraseTokens: 0,
      maxAliasesPerEntry: 0,
      maxAliasTokens: 0,
      defaultWeight: 0,
      maxCumulativeBonus: 0,
      weightRange: { min: 0, max: 0 },
      presets: { light: 0, normal: 0, strong: 0 },
      scoring: { prefixBonus: 0, completionBonus: 0, mismatchPenalty: 0 },
      wordBoundary: { mode: 'none', requireForSingleToken: false },
      revisionSwap: 'utterance-boundary',
      diagnostics: { emitMatchedVocabularyIds: false, emitScoreBreakdown: false },
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

async function makeBrowserTrainingManifest(
  version: string,
  fileBytes: Record<'encoder' | 'predictor' | 'joiner', ArrayBuffer>,
  companionBytes: Record<string, ArrayBuffer>,
): Promise<SpeechModelManifestV3> {
  const base = await makeManifest(version, fileBytes);
  const files = { ...base.files };
  for (const [fileKey, data] of Object.entries(companionBytes)) {
    files[fileKey] = await fileEntry(fileKey, data);
  }
  return {
    ...base,
    schemaVersion: 3,
    files,
    browserTraining: browserTrainingContract(version),
  };
}

function browserTrainingContract(version: string): SpeechModelManifestV3['browserTraining'] {
  return {
    supported: true,
    contractVersion: 1,
    backend: {
      interface: 'BrowserTrainingBackend',
      kind: 'repository-fixed-adapter-math',
      proofStatus: 'fixed-adapter-math-required',
    },
    algorithmId: 'browser-top-adapter-frame-ce-v1',
    minimumAppVersion: '0.5.0',
    exactBaseModel: {
      id: 'local-dev-rnnt-mock',
      version,
      manifestSha256: '4'.repeat(64),
      graphContractSha256: '5'.repeat(64),
      tokenizerSha256: '6'.repeat(64),
    },
    featureTap: {
      graphId: 'encoder',
      outputName: 'encoded',
      dimension: 256,
      frameShiftMs: 10,
      persistedDtype: 'float16',
    },
    ctcProjection: {
      kind: 'frozen-linear-ctc-projection-v1',
      inputGraphId: 'encoder',
      inputName: 'encoded',
      inputDimension: 256,
      logitsName: 'ctc_logits',
      logitsDtype: 'float32',
      vocabularySize: 4,
      blankId: 0,
      trainable: false,
      artifact: trainingArtifact('eval-model', 'eval-model'),
    },
    adapter: {
      architecture: 'residual-bottleneck-lhuc-v1',
      inputDimension: 256,
      rank: 8,
      residualScale: 0.25,
      parameterTensors: [
        { name: 'w_down', dataType: 'float32', shape: [256, 8], description: 'Down projection' },
        { name: 'b_down', dataType: 'float32', shape: [8], description: 'Down bias' },
        { name: 'w_up', dataType: 'float32', shape: [8, 256], description: 'Up projection' },
        { name: 'b_up', dataType: 'float32', shape: [256], description: 'Up bias' },
        { name: 'lhuc', dataType: 'float32', shape: [256], description: 'LHUC scale' },
      ],
      runtimeGraph: trainingArtifact('adapter-runtime', 'runtime-adapter'),
      preferredMaxBytes: 4096,
      hardMaxBytes: 1_048_576,
    },
    artifacts: {
      trainingModel: trainingArtifact('training-model', 'training-model'),
      evalModel: trainingArtifact('eval-model', 'eval-model'),
      optimizerModel: trainingArtifact('optimizer-model', 'optimizer-model'),
      nominalCheckpoint: [trainingArtifact('nominal-checkpoint', 'nominal-checkpoint')],
      contractTestVectors: trainingArtifact('contract-test-vectors', 'contract-test-vectors'),
      anchorPack: [trainingArtifact('anchor-pack', 'anchor-pack')],
    },
    limits: {
      maxUtterances: 12,
      maxAcceptedSeconds: 120,
      maxFramesPerBatch: 128,
      maxEpochs: 50,
      maxOptimizerSteps: 400,
      checkpointIntervalSteps: 25,
    },
  };
}

function trainingArtifact(
  fileKey: string,
  role: BrowserTrainingArtifactRefV1['role'],
): BrowserTrainingArtifactRefV1 {
  return {
    fileKey,
    role,
    license: {
      spdx: 'Apache-2.0',
      name: 'Synthetic browser-training fixture',
      redistributionAllowed: true,
    },
    provenance: {
      source: 'repo-generated-synthetic-fixture',
      generatedBy: 'packages/model-manager install tests',
      createdAt: '2026-06-25T00:00:00.000Z',
    },
  };
}

function makeCompanionArtifactNonRedistributable(
  manifest: SpeechModelManifestV3,
  artifactKey: 'trainingModel' | 'evalModel' | 'optimizerModel' | 'contractTestVectors',
): SpeechModelManifestV3 {
  const artifact = manifest.browserTraining.artifacts[artifactKey];
  return {
    ...manifest,
    browserTraining: {
      ...manifest.browserTraining,
      artifacts: {
        ...manifest.browserTraining.artifacts,
        [artifactKey]: {
          ...artifact,
          license: { ...artifact.license, redistributionAllowed: false },
        },
      },
    },
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

function trainingCompanionFileBytes(): Record<string, ArrayBuffer> {
  return {
    'training-model': bytes([11, 12]),
    'eval-model': sequenceBytes(20, 3),
    'optimizer-model': sequenceBytes(30, 5),
    'nominal-checkpoint': sequenceBytes(40, 7),
    'adapter-runtime': sequenceBytes(50, 11),
    'contract-test-vectors': sequenceBytes(70, 13),
    'anchor-pack': sequenceBytes(90, 36),
  };
}

function sequenceBytes(start: number, length: number): ArrayBuffer {
  return bytes(Array.from({ length }, (_, index) => start + index));
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
  manifest: SpeechModelManifest,
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
