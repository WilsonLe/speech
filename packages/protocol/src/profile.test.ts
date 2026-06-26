import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  migrateSpeechProfileManifestV1ToV2,
  parseSpeechProfileManifest,
  parseSpeechProfileManifestV1,
  parseSpeechProfileManifestV2,
  validateSpeechProfileManifest,
  validateSpeechProfileManifestV1,
  validateSpeechProfileManifestV2,
  type BrowserTopAdapterAdaptationV1,
  type ResidualAdapterAdaptationV1,
  type SpeechProfileManifest,
  type SpeechProfileManifestV1,
  type SpeechProfileManifestV2,
} from './profile';

const v040Fixture = JSON.parse(
  readFileSync(
    new URL('../../../test-data/expected/speech-profile-v1-v0.4.0.json', import.meta.url),
    'utf8',
  ),
) as SpeechProfileManifestV1;

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

function browserTopAdapterAdaptation(): BrowserTopAdapterAdaptationV1 {
  return {
    type: 'browser-top-adapter',
    contractVersion: 1,
    algorithmId: 'browser-top-adapter-frame-ce-v1',
    source: 'browser',
    weights: {
      path: 'adapters/browser-top/weights.bin',
      sha256: sha,
      sizeBytes: 256_000,
      mediaType: 'application/octet-stream',
    },
    speakerEmbedding: {
      path: 'embeddings/speaker.f32',
      sha256: sha,
      sizeBytes: 768,
      mediaType: 'application/octet-stream',
    },
    vocabularyRevision: 7,
    trainingJobId: 'job-001',
    evaluationId: 'eval-001',
  };
}

function browserTopAdapterProfileV2(
  overrides: Partial<SpeechProfileManifestV2> = {},
): SpeechProfileManifestV2 {
  return {
    ...residualAdapterProfile(),
    schemaVersion: 2,
    id: 'profile-browser-top',
    displayName: 'Browser-trained profile',
    adaptation: browserTopAdapterAdaptation(),
    ...overrides,
  };
}

describe('speech profile manifest v2 and migration', () => {
  it('accepts a V2 browser-top-adapter profile manifest', () => {
    const manifest = browserTopAdapterProfileV2();

    expect(validateSpeechProfileManifestV2(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechProfileManifestV2(manifest)).toBe(manifest);
    expect(validateSpeechProfileManifest(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechProfileManifest(manifest)).toBe(manifest);
  });

  it('keeps V1 manifests loadable through the dispatch validator', () => {
    const manifest = residualAdapterProfile();

    expect(validateSpeechProfileManifest(manifest)).toEqual({ ok: true, errors: [] });
    expect(parseSpeechProfileManifest(manifest)).toBe(manifest);
  });

  it('rejects browser-top-adapter under V1 but accepts it under V2', () => {
    const v1WithBrowser = {
      ...residualAdapterProfile(),
      adaptation: browserTopAdapterAdaptation(),
    } as unknown as SpeechProfileManifestV1;

    expect(validateSpeechProfileManifestV1(v1WithBrowser).ok).toBe(false);
    expect(validateSpeechProfileManifestV1(v1WithBrowser).errors).toContain(
      'adaptation.type is not supported',
    );
  });

  it('rejects unsupported schema versions through the dispatch validator', () => {
    const manifest = {
      ...residualAdapterProfile(),
      schemaVersion: 9,
    } as unknown as SpeechProfileManifest;

    expect(validateSpeechProfileManifest(manifest).ok).toBe(false);
    expect(validateSpeechProfileManifest(manifest).errors).toContain(
      'schemaVersion must be 1 or 2',
    );
    expect(() => parseSpeechProfileManifest(manifest)).toThrow(/schemaVersion must be 1 or 2/);
  });

  it('rejects invalid browser-top-adapter bindings', () => {
    const manifest = browserTopAdapterProfileV2({
      adaptation: {
        ...browserTopAdapterAdaptation(),
        algorithmId: 'wrong-algorithm' as 'browser-top-adapter-frame-ce-v1',
        source: 'python' as 'browser',
        weights: {
          path: 'adapters/browser-top/weights.bin',
          sha256: 'not-a-sha',
          sizeBytes: 0,
          mediaType: '',
        },
        trainingJobId: '',
        evaluationId: '',
      },
    });

    const result = validateSpeechProfileManifestV2(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'adaptation.algorithmId must be browser-top-adapter-frame-ce-v1',
        'adaptation.source must be browser',
        'adaptation.weights.sha256 has invalid format',
        'adaptation.weights.sizeBytes must be a positive integer',
        'adaptation.weights.mediaType must be a non-empty string',
        'adaptation.trainingJobId must be a non-empty string',
        'adaptation.evaluationId must be a non-empty string',
      ]),
    );
  });

  it('migrates a V1 manifest to V2 copy-on-write without rewriting CLI residual adapters', () => {
    const v1 = residualAdapterProfile();
    const v2 = migrateSpeechProfileManifestV1ToV2(v1);

    expect(v2.schemaVersion).toBe(2);
    expect(v1.schemaVersion).toBe(1);
    expect(v2.adaptation).toBe(v1.adaptation);
    expect(v2.id).toBe(v1.id);
    expect(v2.baseModel).toEqual(v1.baseModel);
    expect(v2.evaluation).toEqual(v1.evaluation);
    expect(validateSpeechProfileManifestV2(v2)).toEqual({ ok: true, errors: [] });
  });

  it('migrates the synthetic v0.4.0 residual-adapter fixture without changing adaptation metadata', () => {
    expect(validateSpeechProfileManifestV1(v040Fixture)).toEqual({ ok: true, errors: [] });

    const migrated = migrateSpeechProfileManifestV1ToV2(v040Fixture);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.adaptation).toBe(v040Fixture.adaptation);
    expect(migrated.baseModel.version).toBe('0.4.0');
    expect(migrated.evaluation.activationGatePassed).toBe(true);
    expect(validateSpeechProfileManifestV2(migrated)).toEqual({ ok: true, errors: [] });
  });

  it('refuses to migrate an invalid V1 manifest', () => {
    const invalid = {
      ...residualAdapterProfile(),
      id: 'Bad ID With Spaces',
    } as SpeechProfileManifestV1;

    expect(() => migrateSpeechProfileManifestV1ToV2(invalid)).toThrow(
      /invalid V1 profile manifest/,
    );
  });

  it('accepts an optional browser-top-adapter profile without speaker embedding or vocabulary', () => {
    const minimal: BrowserTopAdapterAdaptationV1 = {
      type: 'browser-top-adapter',
      contractVersion: 1,
      algorithmId: 'browser-top-adapter-frame-ce-v1',
      source: 'browser',
      weights: {
        path: 'adapters/browser-top/weights.bin',
        sha256: sha,
        sizeBytes: 256_000,
        mediaType: 'application/octet-stream',
      },
      trainingJobId: 'job-001',
      evaluationId: 'eval-001',
    };
    const manifest = browserTopAdapterProfileV2({ adaptation: minimal });

    expect(validateSpeechProfileManifestV2(manifest)).toEqual({ ok: true, errors: [] });
  });
});
