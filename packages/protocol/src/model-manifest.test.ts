import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseSpeechModelManifest,
  parseSpeechModelManifestV2,
  parseSpeechModelManifestV3,
  validateSpeechModelManifest,
  validateSpeechModelManifestV2,
  validateSpeechModelManifestV3,
  type BrowserTrainingArtifactRefV1,
  type BrowserTrainingContractV1,
  type SpeechModelManifestV2,
  type SpeechModelManifestV3,
} from './model-manifest';

const exampleManifest = JSON.parse(
  readFileSync(
    new URL('../../../model-packs/example-manifest/local-dev-rnnt-mock.json', import.meta.url),
    'utf8',
  ),
) as SpeechModelManifestV2;

const exampleBrowserTrainingManifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../model-packs/example-manifest/local-dev-rnnt-mock-browser-training.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as SpeechModelManifestV3;

const graph = {
  fileKey: 'encoder',
  inputs: [
    { name: 'x', dataType: 'float32', shape: ['batch', 'frames', 80], description: 'features' },
  ],
  outputs: [
    { name: 'y', dataType: 'float32', shape: ['batch', 'frames', 256], description: 'encoded' },
  ],
} as const;

type ContextBiasingContract = SpeechModelManifestV2['contextBiasing'];

function disabledContextBiasing(): ContextBiasingContract {
  return {
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
  };
}

function enabledContextBiasing(): ContextBiasingContract {
  return {
    supported: true,
    algorithm: 'aho-corasick',
    supportedEntryLanguages: ['vi', 'en', 'mixed'],
    maxActiveEntries: 250,
    maxPhraseTokens: 12,
    maxAliasesPerEntry: 4,
    maxAliasTokens: 12,
    defaultWeight: 3,
    maxCumulativeBonus: 8,
    weightRange: { min: 0, max: 10 },
    presets: { light: 1.5, normal: 3, strong: 6 },
    scoring: { prefixBonus: 1, completionBonus: 4, mismatchPenalty: 0.5 },
    wordBoundary: { mode: 'token', marker: '▁', requireForSingleToken: true },
    revisionSwap: 'utterance-boundary',
    diagnostics: { emitMatchedVocabularyIds: true, emitScoreBreakdown: true },
  };
}

type ResidualAdapterContract = NonNullable<
  NonNullable<SpeechModelManifestV2['personalization']>['residualAdapter']
>;

function enabledResidualAdapter(): ResidualAdapterContract {
  return {
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
    allowedPrecisions: ['float32', 'float16', 'int8'],
    activationSwap: 'utterance-boundary',
  };
}

function createManifest(overrides: Partial<SpeechModelManifestV2> = {}): SpeechModelManifestV2 {
  return {
    schemaVersion: 2,
    id: 'local-dev-mock',
    version: '0.0.0',
    displayName: 'Local Dev Mock',
    languages: ['vi', 'en'],
    supportedLanguageModes: ['vi', 'en', 'auto', 'mixed'],
    architecture: 'rnnt',
    license: { name: 'Test metadata only', redistributionAllowed: false },
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
    tokenizer: { type: 'tokens', vocabularySize: 4, byteFallback: true, blankId: 0 },
    streaming: {
      chunkFrames: 16,
      chunkShiftFrames: 8,
      rightContextFrames: 4,
      maxSymbolsPerFrame: 3,
    },
    contextBiasing: disabledContextBiasing(),
    files: {
      encoder: {
        url: '/models/mock/encoder.onnx',
        sha256: '0'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/octet-stream',
      },
      predictor: {
        url: '/models/mock/predictor.onnx',
        sha256: '1'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/octet-stream',
      },
      joiner: {
        url: '/models/mock/joiner.onnx',
        sha256: '2'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/octet-stream',
      },
    },
    graphs: {
      encoder: graph,
      predictor: { ...graph, fileKey: 'predictor' },
      joiner: { ...graph, fileKey: 'joiner' },
    },
    recommended: { webgpu: false, wasmThreads: 1, expectedMemoryMb: 64 },
    ...overrides,
  };
}

const artifactLicense = {
  spdx: 'Apache-2.0',
  name: 'Synthetic browser-training contract fixture',
  noticeUrl: '../../MODEL_LICENSES.md',
  redistributionAllowed: true,
} as const;

const artifactProvenance = {
  source: 'repo-generated-synthetic-fixture',
  generatedBy: 'packages/protocol model-manifest tests',
  createdAt: '2026-06-24T00:00:00.000Z',
} as const;

function trainingArtifact(
  fileKey: string,
  role: BrowserTrainingArtifactRefV1['role'],
): BrowserTrainingArtifactRefV1 {
  return { fileKey, role, license: artifactLicense, provenance: artifactProvenance };
}

function browserTrainingContract(
  overrides: Partial<BrowserTrainingContractV1> = {},
): BrowserTrainingContractV1 {
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
      id: 'local-dev-mock',
      version: '0.0.0',
      manifestSha256: '4'.repeat(64),
      graphContractSha256: '5'.repeat(64),
      tokenizerSha256: '6'.repeat(64),
    },
    featureTap: {
      graphId: 'encoder',
      outputName: 'y',
      dimension: 256,
      frameShiftMs: 10,
      persistedDtype: 'float16',
    },
    ctcProjection: {
      kind: 'frozen-linear-ctc-projection-v1',
      inputGraphId: 'encoder',
      inputName: 'y',
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
      preferredMaxBytes: 2_000_000,
      hardMaxBytes: 10_000_000,
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
      maxUtterances: 180,
      maxAcceptedSeconds: 1_800,
      maxFramesPerBatch: 8_000,
      maxEpochs: 20,
      maxOptimizerSteps: 2_000,
      checkpointIntervalSteps: 100,
    },
    ...overrides,
  };
}

function createManifestV3(overrides: Partial<SpeechModelManifestV3> = {}): SpeechModelManifestV3 {
  const v2 = createManifest();
  return {
    ...v2,
    schemaVersion: 3,
    files: {
      ...v2.files,
      'training-model': {
        url: '/models/mock/training-model.json',
        sha256: '7'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/json',
      },
      'eval-model': {
        url: '/models/mock/eval-model.json',
        sha256: '8'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/json',
      },
      'optimizer-model': {
        url: '/models/mock/optimizer-model.json',
        sha256: '9'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/json',
      },
      'nominal-checkpoint': {
        url: '/models/mock/nominal-checkpoint.bin',
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/octet-stream',
      },
      'adapter-runtime': {
        url: '/models/mock/adapter-runtime.onnx',
        sha256: 'b'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/onnx',
      },
      'contract-test-vectors': {
        url: '/models/mock/contract-test-vectors.bin',
        sha256: 'c'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/octet-stream',
      },
      'anchor-pack': {
        url: '/models/mock/anchor-pack.json',
        sha256: 'd'.repeat(64),
        sizeBytes: 1,
        mediaType: 'application/json',
      },
    },
    browserTraining: browserTrainingContract(),
    ...overrides,
  };
}

describe('model manifest validation', () => {
  it('accepts a complete manifest v2 contract', () => {
    const manifest = createManifest();

    expect(validateSpeechModelManifestV2(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechModelManifestV2(manifest)).toBe(manifest);
  });

  it('accepts the checked-in metadata-only example manifest', () => {
    expect(validateSpeechModelManifestV2(exampleManifest)).toEqual({ ok: true, errors: [] });
  });

  it('preserves V2 read compatibility through the version-dispatch parser', () => {
    const manifest = createManifest();

    expect(validateSpeechModelManifest(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechModelManifest(manifest)).toBe(manifest);
  });

  it('accepts a manifest v3 browser-training contract', () => {
    const manifest = createManifestV3();

    expect(validateSpeechModelManifestV3(manifest)).toEqual({ ok: true, errors: [] });
    expect(validateSpeechModelManifest(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechModelManifestV3(manifest)).toBe(manifest);
    expect(parseSpeechModelManifest(manifest)).toBe(manifest);
  });

  it('accepts the checked-in browser-training artifact scaffold manifest', () => {
    expect(validateSpeechModelManifestV3(exampleBrowserTrainingManifest)).toEqual({
      ok: true,
      errors: [],
    });
    expect(validateSpeechModelManifest(exampleBrowserTrainingManifest)).toEqual({
      ok: true,
      errors: [],
    });
    expect(exampleBrowserTrainingManifest.browserTraining.backend).toEqual({
      interface: 'BrowserTrainingBackend',
      kind: 'repository-fixed-adapter-math',
      proofStatus: 'fixed-adapter-math-required',
    });
    expect(exampleBrowserTrainingManifest.browserTraining.featureTap).toEqual({
      graphId: 'encoder',
      outputName: 'encoded',
      dimension: 4,
      frameShiftMs: 10,
      persistedDtype: 'float16',
    });
    expect(exampleBrowserTrainingManifest.browserTraining.ctcProjection).toMatchObject({
      kind: 'frozen-linear-ctc-projection-v1',
      inputGraphId: 'encoder',
      inputName: 'encoded',
      inputDimension: 4,
      logitsName: 'ctc_logits',
      logitsDtype: 'float32',
      vocabularySize: 4,
      blankId: 0,
      trainable: false,
      artifact: { fileKey: 'eval-model', role: 'eval-model' },
    });

    for (const fileKey of [
      'training-model',
      'eval-model',
      'optimizer-model',
      'nominal-checkpoint',
      'adapter-runtime',
      'contract-test-vectors',
      'anchor-pack',
    ]) {
      const fileRef = exampleBrowserTrainingManifest.files[fileKey];
      expect(fileRef).toBeDefined();
      const body = readFileSync(
        new URL(`../../../model-packs/example-manifest/${fileRef?.url ?? ''}`, import.meta.url),
      );
      expect(fileRef?.sizeBytes).toBe(body.byteLength);
      expect(fileRef?.sha256).toBe(createHash('sha256').update(body).digest('hex'));
      expect(fileRef?.mediaType).toBe(
        'application/vnd.wilsonle.speech.browser-training-artifact+json',
      );
    }
  });

  it('rejects invalid manifest v3 browser-training backend and identity bindings', () => {
    const manifest = createManifestV3({
      browserTraining: browserTrainingContract({
        backend: {
          interface: 'BrowserTrainingBackend',
          kind: 'repository-fixed-adapter-math',
          proofStatus: 'ort-training-worker-proof-passed',
        },
        exactBaseModel: {
          id: 'other-model',
          version: '9.9.9',
          manifestSha256: 'not-a-sha',
          graphContractSha256: '5'.repeat(64),
          tokenizerSha256: '6'.repeat(64),
        },
      }),
    });

    const result = validateSpeechModelManifestV3(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'browserTraining.backend.proofStatus must be fixed-adapter-math-required for repository-fixed-adapter-math',
        'browserTraining.exactBaseModel.id must match manifest id',
        'browserTraining.exactBaseModel.version must match manifest version',
        'browserTraining.exactBaseModel.manifestSha256 has invalid format',
      ]),
    );
  });

  it('rejects invalid manifest v3 feature tap, adapter tensors, artifact refs, and limits', () => {
    const manifest = createManifestV3({
      browserTraining: browserTrainingContract({
        featureTap: {
          graphId: 'missing-graph',
          outputName: 'missing-output',
          dimension: 128,
          frameShiftMs: 20,
          persistedDtype: 'float32' as 'float16',
        },
        ctcProjection: {
          ...browserTrainingContract().ctcProjection,
          kind: 'wrong-kind' as 'frozen-linear-ctc-projection-v1',
          inputGraphId: 'predictor',
          inputName: 'other-output',
          inputDimension: 64,
          logitsDtype: 'float16' as 'float32',
          vocabularySize: 5,
          blankId: 1,
          trainable: true as false,
          artifact: trainingArtifact('missing-eval-model', 'training-model'),
        },
        adapter: {
          ...browserTrainingContract().adapter,
          inputDimension: 256,
          residualScale: 2,
          parameterTensors: [
            {
              name: 'w_down',
              dataType: 'int32',
              shape: [256, 8],
              description: 'Invalid trainable dtype.',
            },
          ],
          runtimeGraph: trainingArtifact('missing-adapter-runtime', 'training-model'),
          preferredMaxBytes: 11,
          hardMaxBytes: 10,
        },
        artifacts: {
          ...browserTrainingContract().artifacts,
          contractTestVectors: trainingArtifact('missing-vectors', 'anchor-pack'),
          anchorPack: [],
        },
        limits: {
          ...browserTrainingContract().limits,
          maxOptimizerSteps: 10,
          checkpointIntervalSteps: 20,
        },
      }),
    });

    const result = validateSpeechModelManifestV3(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'browserTraining.featureTap.graphId must reference a declared graph',
        'browserTraining.featureTap.persistedDtype must be float16',
        'browserTraining.featureTap.frameShiftMs must match feature.frameShiftMs',
        'browserTraining.ctcProjection.kind must be frozen-linear-ctc-projection-v1',
        'browserTraining.ctcProjection.logitsDtype must be float32',
        'browserTraining.ctcProjection.trainable must be false',
        'browserTraining.ctcProjection.artifact.fileKey must reference an entry in files',
        'browserTraining.ctcProjection.artifact.role must be eval-model',
        'browserTraining.ctcProjection.inputName must reference the input graph outputs',
        'browserTraining.ctcProjection.inputGraphId must match featureTap.graphId',
        'browserTraining.ctcProjection.inputName must match featureTap.outputName',
        'browserTraining.ctcProjection.inputDimension must match featureTap.dimension',
        'browserTraining.ctcProjection.vocabularySize must match tokenizer.vocabularySize',
        'browserTraining.ctcProjection.blankId must match tokenizer.blankId',
        'browserTraining.ctcProjection.artifact.fileKey must match browserTraining.artifacts.evalModel.fileKey',
        'browserTraining.adapter.inputDimension must match featureTap.dimension',
        'browserTraining.adapter.residualScale must be less than or equal to 1',
        'browserTraining.adapter.parameterTensors must include b_down',
        'browserTraining.adapter.parameterTensors[0].dataType must be float32 or float16',
        'browserTraining.adapter.runtimeGraph.fileKey must reference an entry in files',
        'browserTraining.adapter.runtimeGraph.role must be runtime-adapter',
        'browserTraining.adapter.preferredMaxBytes must not exceed hardMaxBytes',
        'browserTraining.artifacts.contractTestVectors.fileKey must reference an entry in files',
        'browserTraining.artifacts.contractTestVectors.role must be contract-test-vectors',
        'browserTraining.artifacts.anchorPack must be a non-empty array',
        'browserTraining.limits.checkpointIntervalSteps must not exceed maxOptimizerSteps',
      ]),
    );
  });

  it('rejects unsupported manifest schema versions through the dispatch validator', () => {
    expect(validateSpeechModelManifest({ schemaVersion: 4 })).toEqual({
      ok: false,
      errors: ['schemaVersion must be 2 or 3'],
    });
  });

  it('rejects missing graph contracts', () => {
    const result = validateSpeechModelManifestV2({ schemaVersion: 2, graphs: {} });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('graphs.encoder is required');
    expect(result.errors).toContain('graphs.predictor is required');
    expect(result.errors).toContain('graphs.joiner is required');
  });

  it('rejects invalid file checksums and graph file references', () => {
    const manifest = createManifest({
      files: {
        encoder: {
          url: '/models/mock/encoder.onnx',
          sha256: 'not-a-sha',
          sizeBytes: 0,
          mediaType: '',
        },
      },
      graphs: {
        encoder: graph,
        predictor: { ...graph, fileKey: 'predictor' },
        joiner: { ...graph, fileKey: 'joiner' },
      },
    });

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('files.encoder.sha256 has invalid format');
    expect(result.errors).toContain('files.encoder.sizeBytes must be a positive integer');
    expect(result.errors).toContain('files.encoder.mediaType must be a non-empty string');
    expect(result.errors).toContain('graphs.predictor.fileKey must reference an entry in files');
    expect(result.errors).toContain('graphs.joiner.fileKey must reference an entry in files');
  });

  it('rejects invalid tensor contracts and state-cache relationships', () => {
    const manifest = createManifest({
      graphs: {
        encoder: {
          fileKey: 'encoder',
          inputs: [
            { name: 'cache', dataType: 'float32', shape: ['batch', 0], description: 'bad cache' },
            { name: 'cache', dataType: 'bad-type', shape: ['batch'], description: 'duplicate' },
          ],
          outputs: [{ name: 'out', dataType: 'float32', shape: ['batch'], description: 'output' }],
          stateRelationships: [
            { input: 'missing-input', output: 'missing-output', resetAtUtteranceBoundary: true },
          ],
        },
        predictor: { ...graph, fileKey: 'predictor' },
        joiner: { ...graph, fileKey: 'joiner' },
      },
    } as Partial<SpeechModelManifestV2>);

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'graphs.encoder.inputs[0].shape[1] must be a positive integer or symbolic string',
    );
    expect(result.errors).toContain(
      'graphs.encoder.inputs[1].name must be unique within graphs.encoder.inputs',
    );
    expect(result.errors).toContain('graphs.encoder.inputs[1].dataType is not supported');
    expect(result.errors).toContain(
      'graphs.encoder.stateRelationships[0].input must reference a graph input tensor',
    );
    expect(result.errors).toContain(
      'graphs.encoder.stateRelationships[0].output must reference a graph output tensor',
    );
  });

  it('accepts an enabled bilingual contextual-bias contract', () => {
    const manifest = createManifest({ contextBiasing: enabledContextBiasing() });

    expect(validateSpeechModelManifestV2(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('rejects token IDs and language modes outside declared limits', () => {
    const manifest = createManifest({
      languages: ['vi'],
      supportedLanguageModes: ['auto'],
      tokenizer: {
        type: 'tokens',
        vocabularySize: 4,
        byteFallback: true,
        blankId: 4,
        languageTokenIds: { vi: 10, en: 2, klingon: 2 } as Record<string, number>,
      },
    } as Partial<SpeechModelManifestV2>);

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('supportedLanguageModes must include language vi');
    expect(result.errors).toContain(
      'supportedLanguageModes.auto requires both vi and en languages',
    );
    expect(result.errors).toContain('tokenizer.blankId must be less than tokenizer.vocabularySize');
    expect(result.errors).toContain(
      'tokenizer.languageTokenIds.vi must be less than tokenizer.vocabularySize',
    );
    expect(result.errors).toContain(
      'tokenizer.languageTokenIds.en must reference a supported language mode',
    );
    expect(result.errors).toContain(
      'tokenizer.languageTokenIds.klingon is not a supported language mode',
    );
  });

  it('rejects unsupported contextual-bias contracts with active limits', () => {
    const manifest = createManifest({
      contextBiasing: {
        ...disabledContextBiasing(),
        supportedEntryLanguages: ['vi'],
        maxActiveEntries: 1,
        defaultWeight: 1,
        weightRange: { min: 0, max: 10 },
        diagnostics: { emitMatchedVocabularyIds: true, emitScoreBreakdown: false },
      },
    });

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'contextBiasing.supportedEntryLanguages must be empty when unsupported',
    );
    expect(result.errors).toContain('contextBiasing.maxActiveEntries must be 0 when unsupported');
    expect(result.errors).toContain('contextBiasing.defaultWeight must be 0 when unsupported');
    expect(result.errors).toContain('contextBiasing.weightRange must be 0..0 when unsupported');
    expect(result.errors).toContain('contextBiasing.diagnostics must be false when unsupported');
  });

  it('rejects enabled contextual-bias scoring and language coverage violations', () => {
    const manifest = createManifest({
      supportedLanguageModes: ['vi', 'en', 'mixed'],
      contextBiasing: {
        ...enabledContextBiasing(),
        supportedEntryLanguages: ['vi', 'auto'],
        maxAliasTokens: 0,
        defaultWeight: 12,
        maxCumulativeBonus: 3,
        presets: { light: 2, normal: 1, strong: 12 },
        scoring: { prefixBonus: 4, completionBonus: 5, mismatchPenalty: 0 },
        diagnostics: { emitMatchedVocabularyIds: false, emitScoreBreakdown: true },
      },
    });

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'contextBiasing.supportedEntryLanguages.auto must reference a supported language mode',
    );
    expect(result.errors).toContain(
      'contextBiasing.maxAliasTokens must be positive when aliases are enabled',
    );
    expect(result.errors).toContain(
      'contextBiasing.defaultWeight must be within contextBiasing.weightRange',
    );
    expect(result.errors).toContain(
      'contextBiasing.presets.strong must be within contextBiasing.weightRange',
    );
    expect(result.errors).toContain(
      'contextBiasing.presets must be ordered light <= normal <= strong',
    );
    expect(result.errors).toContain(
      'contextBiasing.scoring.prefixBonus must not exceed maxCumulativeBonus',
    );
    expect(result.errors).toContain(
      'contextBiasing.scoring.completionBonus must not exceed maxCumulativeBonus',
    );
    expect(result.errors).toContain(
      'contextBiasing.diagnostics.emitMatchedVocabularyIds must be true when supported',
    );
  });

  it('accepts a residual-adapter graph contract with explicit insertion points', () => {
    const manifest = createManifest({
      files: {
        ...createManifest().files,
        adapter: {
          url: '/models/mock/adapter.onnx',
          sha256: '3'.repeat(64),
          sizeBytes: 1,
          mediaType: 'application/octet-stream',
        },
      },
      graphs: {
        ...createManifest().graphs,
        adapter: {
          fileKey: 'adapter',
          inputs: [
            {
              name: 'encoder.block11.input',
              dataType: 'float16',
              shape: ['batch', 'frames', 256],
              description: 'Frozen base encoder activation before the adapter insertion point.',
            },
          ],
          outputs: [
            {
              name: 'encoder.block11.output',
              dataType: 'float16',
              shape: ['batch', 'frames', 256],
              description: 'Adapter residual output for the matching insertion point.',
            },
          ],
        },
      },
      personalization: { residualAdapter: enabledResidualAdapter() },
    });

    expect(validateSpeechModelManifestV2(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('rejects residual-adapter insertion points that do not bind to the adapter graph tensors', () => {
    const manifest = createManifest({
      files: {
        ...createManifest().files,
        adapter: {
          url: '/models/mock/adapter.onnx',
          sha256: '3'.repeat(64),
          sizeBytes: 1,
          mediaType: 'application/octet-stream',
        },
      },
      graphs: {
        ...createManifest().graphs,
        adapter: {
          fileKey: 'adapter',
          inputs: [
            {
              name: 'actual.input',
              dataType: 'float32',
              shape: ['batch', 'frames', 256],
              description: 'Actual adapter input tensor.',
            },
          ],
          outputs: [
            {
              name: 'actual.output',
              dataType: 'float32',
              shape: ['batch', 'frames', 256],
              description: 'Actual adapter output tensor.',
            },
          ],
        },
      },
      personalization: { residualAdapter: enabledResidualAdapter() },
    });

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'personalization.residualAdapter.insertionPoints[0].inputTensor must reference graphs.adapter.inputs',
        'personalization.residualAdapter.insertionPoints[0].outputTensor must reference graphs.adapter.outputs',
      ]),
    );
  });

  it('rejects residual-adapter contracts without graph/runtime safety bounds', () => {
    const manifest = createManifest({
      personalization: {
        residualAdapter: {
          ...enabledResidualAdapter(),
          insertionPoints: [
            {
              id: 'encoder-block-11',
              targetGraph: 'encoder',
              inputTensor: '',
              outputTensor: 'encoder.block11.output',
              application: 'residual-add',
            },
            {
              id: 'encoder-block-11',
              targetGraph: 'frontend' as 'encoder',
              inputTensor: 'encoder.block12.input',
              outputTensor: 'encoder.block12.output',
              application: 'magic' as 'residual-add',
            },
          ],
          maxParameters: 0,
          maxAdapterSizeBytes: 0,
          allowedPrecisions: ['float64' as 'float32'],
          activationSwap: 'while-listening' as 'utterance-boundary',
        },
      },
    });

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'graphs.adapter is required when residual adapters are supported',
        'personalization.residualAdapter.insertionPoints[0].inputTensor must be a non-empty string',
        'personalization.residualAdapter.insertionPoints[1].id must be unique',
        'personalization.residualAdapter.insertionPoints[1].targetGraph is not supported',
        'personalization.residualAdapter.insertionPoints[1].application is not supported',
        'personalization.residualAdapter.maxParameters must be positive when supported',
        'personalization.residualAdapter.maxAdapterSizeBytes must be positive when supported',
        'personalization.residualAdapter.allowedPrecisions[0] is not supported',
        'personalization.residualAdapter.activationSwap must be utterance-boundary',
      ]),
    );
  });
});
