import { describe, expect, it } from 'vitest';
import {
  parseSpeechProfileManifestV1,
  validateSpeechProfileManifestV1,
  type ResidualAdapterAdaptationV1,
  type SpeechProfileManifestV1,
} from './profile';

const sha = 'a'.repeat(64);
const baseModel = {
  id: 'mock-vi-en-rnnt',
  version: '0.4.0-test',
  manifestSha256: 'b'.repeat(64),
  graphContractSha256: 'c'.repeat(64),
};

function residualAdapterProfile(
  overrides: Partial<SpeechProfileManifestV1> = {},
): SpeechProfileManifestV1 {
  return {
    schemaVersion: 1,
    id: 'profile-adapter-local',
    displayName: 'Local adapter profile',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    baseModel,
    languages: ['vi', 'en'],
    enrollment: {
      acceptedUtterances: 90,
      acceptedSeconds: 420,
      languageCounts: { vi: 36, en: 36, mixed: 18 },
      voiceConditionCounts: { whisper: 22, normal: 45, projected: 23 },
      sentenceBankVersion: 'synthetic-bank-v1',
    },
    vocabularyRevision: 12,
    adaptation: {
      type: 'residual-adapter',
      contractVersion: 1,
      files: {
        adapterGraph: {
          path: 'adapters/v1/adapter.onnx',
          sha256: sha,
          sizeBytes: 512_000,
          mediaType: 'application/onnx',
        },
      },
      adapter: {
        graphFileKey: 'adapterGraph',
        graphContractSha256: 'd'.repeat(64),
        parameterCount: 42_000,
        maxParameters: 500_000,
        precision: 'float16',
        insertionPointIds: ['encoder-block-11', 'encoder-block-12'],
        application: 'residual-add',
        activationSwap: 'utterance-boundary',
      },
      training: {
        runtime: 'python-profile-trainer',
        trainerVersion: '0.4.0-test',
        configSha256: 'e'.repeat(64),
        profilePackageSha256: 'f'.repeat(64),
        baseModelSha256: '0'.repeat(64),
        randomSeed: 20260623,
      },
    },
    evaluation: {
      baseMetrics: { wer: 0.2, cer: 0.12, realTimeFactor: 0.2 },
      adaptedMetrics: { wer: 0.16, cer: 0.1, realTimeFactor: 0.22 },
      activationGatePassed: true,
      warnings: [],
    },
    privacy: { containsRawAudio: false, exportEncrypted: false },
    ...overrides,
  };
}

function residualAdapterAdaptationFixture(): ResidualAdapterAdaptationV1 {
  const adaptation = residualAdapterProfile().adaptation;
  if (adaptation.type !== 'residual-adapter') {
    throw new Error('Expected residual-adapter fixture.');
  }
  return adaptation;
}

describe('speech profile manifest contract', () => {
  it('accepts a residual-adapter profile manifest with graph binding and training provenance', () => {
    const manifest = residualAdapterProfile();

    expect(validateSpeechProfileManifestV1(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechProfileManifestV1(manifest)).toBe(manifest);
  });

  it('accepts speaker-embedding manifests with normalized vector bindings', () => {
    const manifest = residualAdapterProfile({
      id: 'profile-speaker-local',
      adaptation: {
        type: 'speaker-embedding',
        contractVersion: 1,
        files: {
          speaker: {
            path: 'embeddings/speaker.f32',
            sha256: sha,
            sizeBytes: 768,
            mediaType: 'application/octet-stream',
          },
        },
        embedding: {
          fileKey: 'speaker',
          dimension: 192,
          format: 'float32-vector',
          l2Normalized: true,
        },
      },
    });

    expect(validateSpeechProfileManifestV1(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('rejects adapter manifests that exceed the declared parameter budget or reference missing files', () => {
    const baseAdaptation = residualAdapterAdaptationFixture();
    const manifest = residualAdapterProfile({
      adaptation: {
        ...baseAdaptation,
        adapter: {
          ...baseAdaptation.adapter,
          graphFileKey: 'missingGraph',
          graphContractSha256: 'not-a-sha',
          parameterCount: 600_000,
          maxParameters: 500_000,
          insertionPointIds: ['encoder-block-11', 'encoder-block-11'],
          activationSwap: 'while-listening' as 'utterance-boundary',
        },
      },
    });

    const result = validateSpeechProfileManifestV1(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'adaptation.adapter.graphFileKey must reference adaptation.files',
    );
    expect(result.errors).toContain('adaptation.adapter.graphContractSha256 has invalid format');
    expect(result.errors).toContain(
      'adaptation.adapter.parameterCount must not exceed maxParameters',
    );
    expect(result.errors).toContain('adaptation.adapter.insertionPointIds[1] must be unique');
    expect(result.errors).toContain('adaptation.adapter.activationSwap must be utterance-boundary');
  });

  it('rejects invalid training provenance and metric/privacy shapes', () => {
    const manifest = residualAdapterProfile({
      languages: ['vi', 'vi'],
      adaptation: {
        ...residualAdapterAdaptationFixture(),
        training: {
          runtime: 'browser-magic',
          trainerVersion: '',
          configSha256: 'bad',
          profilePackageSha256: 'bad',
          baseModelSha256: 'bad',
          randomSeed: -1,
        },
      } as unknown as SpeechProfileManifestV1['adaptation'],
      evaluation: {
        baseMetrics: { wer: -1 },
        adaptedMetrics: {},
        activationGatePassed: 'yes' as unknown as boolean,
        warnings: [],
      },
      privacy: { containsRawAudio: false, exportEncrypted: 'no' as unknown as boolean },
    });

    const result = validateSpeechProfileManifestV1(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'languages[1] must be unique',
        'adaptation.training.runtime is not supported',
        'adaptation.training.trainerVersion must be a non-empty string',
        'adaptation.training.configSha256 has invalid format',
        'adaptation.training.profilePackageSha256 has invalid format',
        'adaptation.training.baseModelSha256 has invalid format',
        'adaptation.training.randomSeed must be a non-negative integer',
        'evaluation.baseMetrics.wer must be a non-negative finite number',
        'evaluation.activationGatePassed must be boolean',
        'privacy.exportEncrypted must be boolean',
      ]),
    );
  });
});
