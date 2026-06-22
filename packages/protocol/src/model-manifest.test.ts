import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseSpeechModelManifestV2,
  validateSpeechModelManifestV2,
  type SpeechModelManifestV2,
} from './model-manifest';

const exampleManifest = JSON.parse(
  readFileSync(
    new URL('../../../model-packs/example-manifest/local-dev-rnnt-mock.json', import.meta.url),
    'utf8',
  ),
) as SpeechModelManifestV2;

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

describe('model manifest validation', () => {
  it('accepts a complete manifest v2 contract', () => {
    const manifest = createManifest();

    expect(validateSpeechModelManifestV2(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechModelManifestV2(manifest)).toBe(manifest);
  });

  it('accepts the checked-in metadata-only example manifest', () => {
    expect(validateSpeechModelManifestV2(exampleManifest)).toEqual({ ok: true, errors: [] });
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
});
