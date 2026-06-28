import { describe, expect, it } from 'vitest';
import type { InstalledModelRecord } from '@speech/model-manager';
import type { PortableSpeechModelExportSummaryV1 } from '@speech/profile-manager';
import {
  buildPortableExportBaseModelReview,
  buildPortableExportReview,
  buildPortableExportStepView,
  formatPortableExportError,
  validatePortableExportPassphrase,
} from './personal-model-export-flow';

const exactBaseModel = {
  id: 'mock-model',
  version: '2026.06',
  manifestSha256: 'a'.repeat(64),
  graphContractSha256: 'b'.repeat(64),
  tokenizerSha256: 'c'.repeat(64),
};

const installedModel = {
  schemaVersion: 1,
  modelId: 'mock-model',
  activeVersion: exactBaseModel.version,
  manifest: {
    schemaVersion: 3,
    id: 'mock-model',
    version: exactBaseModel.version,
    browserTraining: {
      supported: true,
      exactBaseModel,
    },
  },
} as InstalledModelRecord;

const exportSummary: PortableSpeechModelExportSummaryV1 = {
  schemaVersion: 1,
  fileName: 'wilson.speechmodel',
  exportedAt: '2026-06-27T00:00:00.000Z',
  displayName: 'Wilson',
  encrypted: true,
  envelopeHeader: {
    formatVersion: 1,
    mode: 'encrypted',
    encryption: {
      kdf: 'pbkdf2-hmac-sha-256',
      iterations: 600_000,
      saltBase64: 'salt',
      ivBase64: 'iv',
      ciphertextLength: 123,
    },
  },
  adaptationType: 'browser-top-adapter',
  languages: ['vi', 'en'],
  supportsMixed: true,
  fileCount: 7,
  expandedBytes: 4096,
  vocabulary: { included: false, containsPrivateTerms: false },
  excluded: {
    recordings: true,
    trainingCheckpoints: true,
    preparedFeatures: true,
    baseModel: true,
  },
  privacy: {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: true,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  },
};

describe('personal model export flow', () => {
  it('builds aggregate-only exact-base readiness for installed speech models', () => {
    expect(buildPortableExportBaseModelReview([installedModel])).toMatchObject({
      status: 'ready',
      title: 'Speech model ready',
      exactBaseModel,
      privacy: {
        aggregateOnly: true,
        exposesModelId: false,
        exposesManifestHash: false,
        exposesTokenizerHash: false,
        exposesGraphHash: false,
      },
    });
    const missing = buildPortableExportBaseModelReview([]);
    expect(missing.status).toBe('missing-compatible-base');
    expect(missing).not.toHaveProperty('exactBaseModel');
  });

  it('blocks export when the installed speech model does not match the selected profile', () => {
    const review = buildPortableExportBaseModelReview([installedModel], {
      id: exactBaseModel.id,
      version: 'different-version',
      manifestSha256: exactBaseModel.manifestSha256,
      graphContractSha256: exactBaseModel.graphContractSha256,
    });

    expect(review.status).toBe('missing-compatible-base');
    expect(review.title).toBe('Install the matching speech model first');
    expect(review).not.toHaveProperty('exactBaseModel');
  });

  it('tracks encrypted export steps without marking save complete before bytes exist', () => {
    expect(
      buildPortableExportStepView({
        baseModelReady: true,
        encrypted: true,
        passphrase: 'passphrase',
        confirmPassphrase: 'passphrase',
        exporting: false,
        summary: null,
        error: null,
      }),
    ).toEqual([
      { id: 'contents', label: 'Choose contents', status: 'complete' },
      { id: 'encrypt', label: 'Protect file', status: 'complete' },
      { id: 'review', label: 'Review', status: 'current' },
      { id: 'save', label: 'Save file', status: 'pending' },
    ]);
  });

  it('builds review copy with sensitive data exclusions visible', () => {
    const review = buildPortableExportReview(exportSummary);
    expect(review.rows).toEqual(
      expect.arrayContaining([
        { label: 'Vocabulary', value: 'Not included' },
        { label: 'Security', value: 'Encrypted' },
      ]),
    );
    expect(review.privacySummary).toBe('Recordings and training checkpoints are not included.');
    expect(JSON.stringify(review)).not.toContain('manifestSha256');
    expect(JSON.stringify(review)).not.toContain('tokenizerSha256');
  });

  it('validates encrypted passphrases and maps worker errors to safe copy', () => {
    expect(validatePortableExportPassphrase(true, '', '')).toBe(
      'Enter a passphrase to encrypt this export.',
    );
    expect(validatePortableExportPassphrase(true, 'short', 'short')).toBe(
      'Use at least 8 characters.',
    );
    expect(validatePortableExportPassphrase(true, 'passphrase', 'different')).toBe(
      'Passphrases do not match.',
    );
    expect(validatePortableExportPassphrase(true, 'passphrase', 'passphrase')).toBeNull();
    expect(
      formatPortableExportError(
        'This voice model does not have an exportable personal-model artifact.',
      ),
    ).toBe('This voice model is not ready for portable export yet.');
  });
});
