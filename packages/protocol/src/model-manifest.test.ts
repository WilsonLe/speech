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
    contextBiasing: {
      supported: false,
      algorithm: 'token-trie',
      maxActiveEntries: 0,
      maxPhraseTokens: 0,
      defaultWeight: 0,
      maxCumulativeBonus: 0,
    },
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

  it('rejects token IDs and language modes outside declared limits', () => {
    const manifest = createManifest({
      languages: ['vi'],
      supportedLanguageModes: ['auto'],
      tokenizer: {
        type: 'tokens',
        vocabularySize: 4,
        byteFallback: true,
        blankId: 4,
        languageTokenIds: { vi: 10, klingon: 2 } as Record<string, number>,
      },
    } as Partial<SpeechModelManifestV2>);

    const result = validateSpeechModelManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('supportedLanguageModes must include language vi');
    expect(result.errors).toContain('tokenizer.blankId must be less than tokenizer.vocabularySize');
    expect(result.errors).toContain(
      'tokenizer.languageTokenIds.vi must be less than tokenizer.vocabularySize',
    );
    expect(result.errors).toContain(
      'tokenizer.languageTokenIds.klingon is not a supported language mode',
    );
  });
});
