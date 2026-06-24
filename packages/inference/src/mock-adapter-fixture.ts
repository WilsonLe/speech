import type {
  ModelIdentity,
  SpeechModelManifestV2,
  SpeechProfileManifestV1,
} from '@speech/protocol';

export const mockResidualAdapterGraphSha256 =
  '3f41bab9f03ee8d3c4d88ea98adaf564dba7d3c8346a9535360f520971ccc5cd';
export const mockResidualAdapterGraphSizeBytes = 231;
export const mockResidualAdapterGraphContractSha256 =
  '2222222222222222222222222222222222222222222222222222222222222222';
export const mockResidualAdapterBaseManifestSha256 =
  '1111111111111111111111111111111111111111111111111111111111111111';

const mockResidualAdapterGraphBase64 =
  'CAgSFXdpbHNvbmxlLXNwZWVjaC10b29scygBOsUBClkKFWVuY29kZXIuYmxvY2sxMS5pbnB1dBIWZW5jb2Rlci5ibG9jazExLm91dHB1dBoebW9jay1yZXNpZHVhbC1hZGFwdGVyLWlkZW50aXR5IghJZGVudGl0eRIVbW9jay1yZXNpZHVhbC1hZGFwdGVyWicKFWVuY29kZXIuYmxvY2sxMS5pbnB1dBIOCgwIARIICgIIAQoCCARiKAoWZW5jb2Rlci5ibG9jazExLm91dHB1dBIOCgwIARIICgIIAQoCCARCAhAN';

export const mockResidualAdapterBaseModelIdentity: ModelIdentity = {
  id: 'local-dev-rnnt-mock',
  version: '0.0.1',
  manifestSha256: mockResidualAdapterBaseManifestSha256,
  graphContractSha256: mockResidualAdapterGraphContractSha256,
};

export const mockResidualAdapterBaseModelManifest: SpeechModelManifestV2 = {
  schemaVersion: 2,
  id: 'local-dev-rnnt-mock',
  version: '0.0.1',
  displayName: 'Local development RNN-T mock model',
  languages: ['vi', 'en'],
  supportedLanguageModes: ['vi', 'en', 'auto', 'mixed'],
  architecture: 'rnnt',
  license: {
    spdx: 'Apache-2.0',
    name: 'Apache-2.0 generated mock ONNX test graphs',
    redistributionAllowed: true,
  },
  sampleRateHz: 16_000,
  feature: {
    type: 'log-mel',
    bins: 4,
    frameLengthMs: 25,
    frameShiftMs: 10,
    fftSize: 512,
    lowFreqHz: 20,
    highFreqHz: 7_600,
    dither: 0,
    snipEdges: false,
  },
  tokenizer: {
    type: 'tokens',
    vocabularySize: 4,
    byteFallback: true,
    blankId: 0,
    languageTokenIds: { vi: 1, en: 2, mixed: 3 },
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
  personalization: {
    residualAdapter: {
      supported: true,
      contractVersion: 1,
      insertionPoints: [
        {
          id: 'encoder-block-11',
          targetGraph: 'encoder',
          inputTensor: 'encoder.block11.input',
          outputTensor: 'encoder.block11.output',
          application: 'residual-add',
        },
      ],
      maxParameters: 500_000,
      maxAdapterSizeBytes: 10_000_000,
      allowedPrecisions: ['float32'],
      activationSwap: 'utterance-boundary',
    },
  },
  files: {
    encoder: {
      url: 'files/encoder.onnx',
      sha256: '99391d7616f2af0635d8330a440d922c66b2e3435029cf5b71adb9ed3fb59ace',
      sizeBytes: 308,
      mediaType: 'application/onnx',
    },
    predictor: {
      url: 'files/predictor.onnx',
      sha256: 'ad2dead2da2bbe72b19af2adfe1f58e3743a3804cf56d273327b85ca3ab64779',
      sizeBytes: 160,
      mediaType: 'application/onnx',
    },
    joiner: {
      url: 'files/joiner.onnx',
      sha256: '510d5d2b3d235fcc6553e56337be0cc172f0bcb65c3b60a388986c13db183485',
      sizeBytes: 181,
      mediaType: 'application/onnx',
    },
    adapter: {
      url: 'files/adapter.onnx',
      sha256: mockResidualAdapterGraphSha256,
      sizeBytes: mockResidualAdapterGraphSizeBytes,
      mediaType: 'application/onnx',
    },
  },
  graphs: {
    encoder: {
      fileKey: 'encoder',
      inputs: [
        { name: 'features', dataType: 'float32', shape: [1, 4], description: 'mock features' },
        {
          name: 'encoder_cache_in',
          dataType: 'float32',
          shape: [1, 4],
          description: 'mock encoder cache input',
        },
      ],
      outputs: [
        { name: 'encoded', dataType: 'float32', shape: [1, 4], description: 'mock encoded' },
        {
          name: 'encoder_cache_out',
          dataType: 'float32',
          shape: [1, 4],
          description: 'mock encoder cache output',
        },
      ],
      stateRelationships: [
        {
          input: 'encoder_cache_in',
          output: 'encoder_cache_out',
          resetAtUtteranceBoundary: true,
        },
      ],
    },
    predictor: {
      fileKey: 'predictor',
      inputs: [{ name: 'tokens', dataType: 'float32', shape: [1, 4], description: 'mock tokens' }],
      outputs: [
        { name: 'predicted', dataType: 'float32', shape: [1, 4], description: 'mock predicted' },
      ],
    },
    joiner: {
      fileKey: 'joiner',
      inputs: [
        { name: 'encoded', dataType: 'float32', shape: [1, 4], description: 'mock encoded' },
        { name: 'predicted', dataType: 'float32', shape: [1, 4], description: 'mock predicted' },
      ],
      outputs: [{ name: 'logits', dataType: 'float32', shape: [1, 4], description: 'mock logits' }],
    },
    adapter: {
      fileKey: 'adapter',
      inputs: [
        {
          name: 'encoder.block11.input',
          dataType: 'float32',
          shape: [1, 4],
          description: 'mock frozen base encoder activation',
        },
      ],
      outputs: [
        {
          name: 'encoder.block11.output',
          dataType: 'float32',
          shape: [1, 4],
          description: 'mock residual adapter output',
        },
      ],
    },
  },
  recommended: { webgpu: false, wasmThreads: 1, expectedMemoryMb: 16 },
};

export const mockResidualAdapterProfileManifest: SpeechProfileManifestV1 = {
  schemaVersion: 1,
  id: 'profile-local-adapter-smoke',
  displayName: 'Local adapter smoke profile',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z',
  baseModel: mockResidualAdapterBaseModelIdentity,
  languages: ['vi', 'en'],
  enrollment: {
    acceptedUtterances: 5,
    acceptedSeconds: 15,
    languageCounts: { vi: 2, en: 2, mixed: 1 },
    voiceConditionCounts: { whisper: 1, normal: 3, projected: 1 },
    sentenceBankVersion: 'mock-adapter-smoke-v1',
  },
  adaptation: {
    type: 'residual-adapter',
    contractVersion: 1,
    files: {
      adapterGraph: {
        path: 'profiles/profile-local-adapter-smoke/adapters/mock-adapter/adapter.onnx',
        sha256: mockResidualAdapterGraphSha256,
        sizeBytes: mockResidualAdapterGraphSizeBytes,
        mediaType: 'application/onnx',
      },
    },
    adapter: {
      graphFileKey: 'adapterGraph',
      graphContractSha256: mockResidualAdapterGraphContractSha256,
      parameterCount: 4,
      maxParameters: 500_000,
      precision: 'float32',
      insertionPointIds: ['encoder-block-11'],
      application: 'residual-add',
      activationSwap: 'utterance-boundary',
    },
    training: {
      runtime: 'python-profile-trainer',
      trainerVersion: '0.1.0',
      configSha256: '3333333333333333333333333333333333333333333333333333333333333333',
      profilePackageSha256: '4444444444444444444444444444444444444444444444444444444444444444',
      baseModelSha256: mockResidualAdapterBaseManifestSha256,
      randomSeed: 1337,
    },
  },
  evaluation: {
    baseMetrics: { wer: 0.2, cer: 0.1, customTermRecall: 0.5, realTimeFactor: 0.1 },
    adaptedMetrics: { wer: 0.15, cer: 0.08, customTermRecall: 0.7, realTimeFactor: 0.11 },
    activationGatePassed: true,
    warnings: [],
  },
  privacy: { containsRawAudio: false, exportEncrypted: false },
};

export function createMockResidualAdapterGraphBytes(): Uint8Array<ArrayBuffer> {
  const binary = atob(mockResidualAdapterGraphBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createMockResidualAdapterRuntimeInputs(): {
  readonly baseModelManifest: SpeechModelManifestV2;
  readonly activeBaseModel: ModelIdentity;
  readonly profileManifest: SpeechProfileManifestV1;
  readonly adapterBytes: Uint8Array<ArrayBuffer>;
} {
  return {
    baseModelManifest: structuredClone(mockResidualAdapterBaseModelManifest),
    activeBaseModel: structuredClone(mockResidualAdapterBaseModelIdentity),
    profileManifest: structuredClone(mockResidualAdapterProfileManifest),
    adapterBytes: createMockResidualAdapterGraphBytes(),
  };
}
