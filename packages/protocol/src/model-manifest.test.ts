import { describe, expect, it } from 'vitest';
import { validateSpeechModelManifestV2, type SpeechModelManifestV2 } from './model-manifest';

const graph = {
  fileKey: 'encoder',
  inputs: [
    { name: 'x', dataType: 'float32', shape: ['batch', 'frames', 80], description: 'features' },
  ],
  outputs: [
    { name: 'y', dataType: 'float32', shape: ['batch', 'frames', 256], description: 'encoded' },
  ],
} as const;

describe('model manifest validation', () => {
  it('accepts a minimal manifest v2 contract', () => {
    const manifest: SpeechModelManifestV2 = {
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
      },
      graphs: {
        encoder: graph,
        predictor: { ...graph, fileKey: 'predictor' },
        joiner: { ...graph, fileKey: 'joiner' },
      },
      recommended: { webgpu: false, wasmThreads: 1, expectedMemoryMb: 64 },
    };

    expect(validateSpeechModelManifestV2(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('rejects missing graph contracts', () => {
    expect(validateSpeechModelManifestV2({ schemaVersion: 2 })).toMatchObject({ ok: false });
  });
});
