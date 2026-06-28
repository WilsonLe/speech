import { describe, expect, it } from 'vitest';
import { buildUnencryptedPortableSpeechModelEnvelope } from '@speech/portable-model';
import type { PortableSpeechModelImportSummaryV1 } from '@speech/profile-manager';
import type { InstalledModelRecord } from '@speech/model-manager';
import {
  buildPortableImportBaseModelReview,
  buildPortableImportReview,
  buildPortableImportStepView,
  formatPortableImportError,
  inspectPortableImportEnvelope,
} from './personal-model-import-flow';

const encoder = new TextEncoder();

describe('personal model import flow helpers', () => {
  it('inspects only the .speechmodel envelope prefix for local preview', () => {
    const envelope = buildUnencryptedPortableSpeechModelEnvelope(encoder.encode('inner-bundle'));
    const preview = inspectPortableImportEnvelope(envelope.bytes, 'voice.speechmodel');

    expect(preview).toMatchObject({
      fileName: 'voice.speechmodel',
      encrypted: false,
      passphraseRequired: false,
      privacy: {
        localOnly: true,
        parsedPrefixOnly: true,
        expandedArchiveOnMainThread: false,
        containsManifestHashes: false,
        containsStoragePaths: false,
      },
    });
  });

  it('rejects unsupported file names before any archive expansion', () => {
    const envelope = buildUnencryptedPortableSpeechModelEnvelope(encoder.encode('inner-bundle'));

    expect(() => inspectPortableImportEnvelope(envelope.bytes, 'voice.zip')).toThrow(/speechmodel/);
  });

  it('requires the installed exact speech-model identity without exposing hashes', () => {
    const missing = buildPortableImportBaseModelReview([]);
    expect(missing.status).toBe('missing-compatible-base');
    expect(missing.privacy).toEqual({
      aggregateOnly: true,
      exposesModelId: false,
      exposesManifestHash: false,
      exposesTokenizerHash: false,
      exposesGraphHash: false,
    });

    const ready = buildPortableImportBaseModelReview([installedModelFixture]);
    expect(ready.status).toBe('ready');
    expect(ready.detail).toBe('Version 2026.06 is installed for compatibility checks.');
    expect(ready.expectedBaseModel).toEqual(exactBaseModel);
    expect(JSON.stringify(ready)).not.toContain('hash');
  });

  it('builds dedicated choose, unlock, validate, and review steps', () => {
    const envelope = buildUnencryptedPortableSpeechModelEnvelope(encoder.encode('inner-bundle'));
    const preview = inspectPortableImportEnvelope(envelope.bytes, 'voice.speechmodel');

    expect(
      buildPortableImportStepView({
        preview,
        passphrase: '',
        validating: false,
        summary: null,
        error: null,
      }),
    ).toEqual([
      { id: 'choose', label: 'Choose file', status: 'complete' },
      { id: 'unlock', label: 'Unlock', status: 'complete' },
      { id: 'validate', label: 'Validate locally', status: 'current' },
      { id: 'review', label: 'Review', status: 'pending' },
    ]);

    const encryptedPreview = {
      ...preview,
      encrypted: true,
      passphraseRequired: true,
      mode: 'encrypted' as const,
    };
    expect(
      buildPortableImportStepView({
        preview: encryptedPreview,
        passphrase: '',
        validating: false,
        summary: null,
        error: null,
      })[1],
    ).toEqual({ id: 'unlock', label: 'Unlock', status: 'current' });
  });

  it('summarizes staged import results without raw IDs, hashes, or private terms', () => {
    const review = buildPortableImportReview(importSummaryFixture);

    expect(review.title).toBe('Ready on this device');
    expect(review.rows).toContainEqual({ label: 'Vocabulary', value: 'Included, terms hidden' });
    expect(review.rows).toContainEqual({
      label: 'Speech model',
      value: 'Exact version 2026.06 matched',
    });
    expect(review.privacySummary).toContain('private vocabulary terms were not displayed');
    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain(importSummaryFixture.bundleId);
    expect(serialized).not.toContain(importSummaryFixture.importId);
    expect(serialized).not.toContain(importSummaryFixture.baseModel.id);
    expect(serialized).not.toContain(exactBaseModel.manifestSha256);
  });

  it('maps raw import errors to concise recovery copy', () => {
    expect(formatPortableImportError(new Error('base model id mismatch'))).toBe(
      'This voice model needs the exact speech model it was created with.',
    );
    expect(formatPortableImportError(new Error('wrong passphrase'))).toBe(
      'Unlock failed. Check the passphrase, then try again.',
    );
    expect(formatPortableImportError(new Error('archive traversal detected'))).toBe(
      'Choose a valid .speechmodel file. No model data was imported.',
    );
    expect(formatPortableImportError(new Error('unexpected /private/path/profile-123'))).toBe(
      'Import failed. No active voice model changed.',
    );
  });
});

const exactBaseModel = {
  id: 'vietasr-iter3-int8',
  version: '2026.06',
  manifestSha256: 'a'.repeat(64),
  graphContractSha256: 'b'.repeat(64),
  tokenizerSha256: 'c'.repeat(64),
};

const installedModelFixture = {
  schemaVersion: 1,
  modelId: exactBaseModel.id,
  activeVersion: exactBaseModel.version,
  manifest: {
    schemaVersion: 3,
    id: exactBaseModel.id,
    version: exactBaseModel.version,
    browserTraining: {
      supported: true,
      exactBaseModel,
    },
  },
} as InstalledModelRecord;

const importSummaryFixture: PortableSpeechModelImportSummaryV1 = {
  schemaVersion: 1,
  bundleId: 'private-bundle-id',
  importId: 'private-import-id',
  displayName: 'Office voice',
  importedAt: '2026-06-28T00:00:00.000Z',
  baseModel: {
    ...exactBaseModel,
    exactCompatibility: true,
  },
  adaptationType: 'browser-top-adapter',
  vocabulary: {
    included: true,
    containsPrivateTerms: false,
  },
  fileCount: 6,
  expandedBytes: 1024,
  smokeTest: {
    status: 'passed',
    vectorCount: 2,
    warningCount: 0,
  },
  privacy: {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  },
};
