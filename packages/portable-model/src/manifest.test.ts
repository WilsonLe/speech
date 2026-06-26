import { describe, expect, it } from 'vitest';
import type { ProfileFileRef } from '@speech/protocol';
import {
  PORTABLE_SPEECH_MODEL_EXTENSION,
  PORTABLE_SPEECH_MODEL_MIME_TYPE,
  parsePortableSpeechModelManifestV1,
  validatePortableSpeechModelManifestV1,
  type PortableSpeechModelManifestV1,
} from './manifest';

const sha = 'a'.repeat(64);

function fileRef(path: string, sizeBytes = 1_000): ProfileFileRef {
  return { path, sha256: sha, sizeBytes, mediaType: 'application/octet-stream' };
}

function manifest(
  overrides: Partial<PortableSpeechModelManifestV1> = {},
): PortableSpeechModelManifestV1 {
  return {
    schemaVersion: 1,
    bundleType: 'personal-voice-model',
    bundleId: 'bundle-001',
    modelRevision: 'rev-001',
    displayName: 'My personal model',
    createdAt: '2026-06-24T00:00:00.000Z',
    exportedAt: '2026-06-24T00:00:00.000Z',
    sourceAppVersion: '0.5.0',
    profile: {
      sourceProfileId: 'profile-001',
      languages: ['vi', 'en'],
      supportsMixed: true,
    },
    baseModel: {
      id: 'mock-vi-en-rnnt',
      version: '0.4.0',
      manifestSha256: 'b'.repeat(64),
      graphContractSha256: 'c'.repeat(64),
      tokenizerSha256: 'd'.repeat(64),
    },
    adaptation: {
      type: 'browser-top-adapter',
      contractVersion: 1,
      algorithmId: 'browser-top-adapter-frame-ce-v1',
      files: { weights: fileRef('artifacts/adapter-weights.bin', 256_000) },
    },
    vocabulary: {
      included: true,
      schemaVersion: 1,
      revision: 3,
      file: fileRef('vocabulary/entries.json'),
    },
    evaluation: {
      gatePassed: true,
      summaryFile: fileRef('evaluation/summary.json'),
      metricsFile: fileRef('evaluation/metrics.json'),
    },
    noticesFile: fileRef('notices/THIRD_PARTY_NOTICES.txt'),
    checksumsFile: fileRef('metadata/checksums.json'),
    testVectors: [fileRef('test-vectors/forward.json')],
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsVoiceDerivedWeights: true,
    },
    files: [
      fileRef('artifacts/adapter-weights.bin', 256_000),
      fileRef('vocabulary/entries.json'),
      fileRef('evaluation/summary.json'),
      fileRef('evaluation/metrics.json'),
      fileRef('notices/THIRD_PARTY_NOTICES.txt'),
      fileRef('metadata/checksums.json'),
      fileRef('test-vectors/forward.json'),
    ],
    ...overrides,
  };
}

describe('portable speech model manifest v1', () => {
  it('exposes the file identity constants', () => {
    expect(PORTABLE_SPEECH_MODEL_EXTENSION).toBe('.speechmodel');
    expect(PORTABLE_SPEECH_MODEL_MIME_TYPE).toBe('application/vnd.wilsonle.speech.personal-model');
  });

  it('accepts a complete portable manifest with optional vocabulary', () => {
    const value = manifest();

    expect(validatePortableSpeechModelManifestV1(value)).toEqual({ ok: true, errors: [] });
    expect(parsePortableSpeechModelManifestV1(value)).toBe(value);
  });

  it('accepts a manifest without optional vocabulary', () => {
    const { vocabulary: _omitted, ...withoutVocabulary } = manifest();
    void _omitted;

    expect(validatePortableSpeechModelManifestV1(withoutVocabulary)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects privacy flags that allow raw audio or prepared features', () => {
    const value = manifest({
      privacy: {
        containsRawAudio: true,
        containsPreparedFeatures: false,
        containsVoiceDerivedWeights: true,
      } as unknown as PortableSpeechModelManifestV1['privacy'],
    });

    const result = validatePortableSpeechModelManifestV1(value);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('privacy.containsRawAudio must be false');
  });

  it('rejects invalid bundle id, base-model hashes, and adaptation files', () => {
    const value = manifest({
      bundleId: 'Bad Bundle ID',
      baseModel: {
        id: 'mock-vi-en-rnnt',
        version: '0.4.0',
        manifestSha256: 'not-a-sha',
        graphContractSha256: 'c'.repeat(64),
        tokenizerSha256: 'd'.repeat(64),
      },
      adaptation: {
        type: 'cli-residual-adapter',
        contractVersion: 0,
        algorithmId: '',
        files: {},
      },
    });

    const result = validatePortableSpeechModelManifestV1(value);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'bundleId has invalid format',
        'baseModel.manifestSha256 has invalid format',
        'adaptation.contractVersion must be a positive integer',
        'adaptation.algorithmId must be a non-empty string',
        'adaptation.files must include at least one file',
      ]),
    );
  });

  it('rejects unsupported adaptation types and schema versions', () => {
    const value = manifest({
      schemaVersion: 2,
      adaptation: {
        type: 'merged-model' as 'browser-top-adapter',
        contractVersion: 1,
        algorithmId: 'browser-top-adapter-frame-ce-v1',
        files: { weights: fileRef('artifacts/adapter-weights.bin') },
      },
    } as unknown as Partial<PortableSpeechModelManifestV1>);

    const result = validatePortableSpeechModelManifestV1(value);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['schemaVersion must be 1', 'adaptation.type is not supported']),
    );
  });

  it('rejects empty files arrays and malformed file refs', () => {
    const value = manifest({
      files: [
        fileRef('artifacts/adapter-weights.bin'),
        { path: '', sha256: 'bad', sizeBytes: 0, mediaType: '' },
      ],
    });

    const result = validatePortableSpeechModelManifestV1(value);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'files[1].path must be a non-empty string',
        'files[1].sha256 has invalid format',
        'files[1].sizeBytes must be a positive integer',
        'files[1].mediaType must be a non-empty string',
      ]),
    );
  });

  it('requires notices, checksums, and at least one test vector', () => {
    const value = manifest({
      noticesFile: undefined,
      checksumsFile: undefined,
      testVectors: [],
    } as unknown as Partial<PortableSpeechModelManifestV1>);

    const result = validatePortableSpeechModelManifestV1(value);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'noticesFile must be an object',
        'checksumsFile must be an object',
        'testVectors must be a non-empty array',
      ]),
    );
  });
});
