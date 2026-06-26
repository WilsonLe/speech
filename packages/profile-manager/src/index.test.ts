import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeEnrollmentTakeQuality, defaultTrainingReadinessPolicyV1 } from '@speech/enrollment';
import { decodeFloat16Array } from '@speech/features';
import {
  buildPortableSpeechModelInnerBundle,
  buildUnencryptedPortableSpeechModelEnvelope,
  createPortableSpeechModelFileRef,
  importPortableSpeechModelArchive,
  type ImportedPortableSpeechModelArchiveV1,
  type PortableSpeechModelBundleFileInputV1,
  type PortableSpeechModelManifestV1,
} from '@speech/portable-model';
import type {
  ExactBaseModelIdentityV1,
  ProfileFileRef,
  SpeechProfileManifestV1,
  SpeechProfileManifestV2,
  VocabularyStoreSnapshotV1,
} from '@speech/protocol';
import {
  EnrollmentProfileStore,
  InMemoryProfileStorageBackend,
  OpfsProfileStorageBackend,
  buildTrainingReadinessCoverageReportForProfile,
  encodePcm16Wav,
  redactEnrollmentProfileImportResult,
  requestPersistentProfileStorage,
  summarizeTrainingJobFeaturePreparationManifest,
  summarizeTrainingJobFrameLabelsManifest,
  summarizeTrainingJobPromptIdentitySplitPlan,
  summarizeTrainingJobRevision,
  type EnrollmentCaptureMetadataV1,
  type EnrollmentProfileActivationReviewV1,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsWritableFileStreamLike,
  type PortableSpeechModelImportSmokeContextV1,
  type PortableSpeechModelImportSmokeResultV1,
  type ProfileStorageBackend,
} from './index';

const legacySpeechProfileFixture = JSON.parse(
  readFileSync(
    new URL('../../../test-data/expected/speech-profile-v1-v0.4.0.json', import.meta.url),
    'utf8',
  ),
) as SpeechProfileManifestV1;

const capture: EnrollmentCaptureMetadataV1 = {
  requestedConstraints: { audio: { channelCount: { ideal: 1 }, autoGainControl: false } },
  actualSettings: { channelCount: 1, sampleRate: 16_000, autoGainControl: false },
  userMicrophoneLabel: 'Fake microphone',
};

const baseModel = {
  id: 'mock-vi-en-rnnt',
  version: '0.0.0-test',
  manifestSha256: 'manifest-sha256',
  graphContractSha256: 'graph-contract-sha256',
};

const portableBaseModel: ExactBaseModelIdentityV1 = {
  id: 'mock-vi-en-rnnt',
  version: '0.5.0-portable',
  manifestSha256: 'a'.repeat(64),
  graphContractSha256: 'b'.repeat(64),
  tokenizerSha256: 'c'.repeat(64),
};

const quality = analyzeEnrollmentTakeQuality({
  pcm: makeTone(1_200, 0.1),
  sampleRateHz: 16_000,
  referenceText: 'Tôi vừa update dashboard.',
  language: 'mixed',
  voiceCondition: 'normal',
  calibration: { normalRms: 0.07, roomNoiseRms: 0.003 },
  alignment: { recognizedText: 'tôi vừa update dashboard', confidence: 0.8 },
});

describe('enrollment profile store', () => {
  it('encodes PCM as 16-bit mono WAV', () => {
    const wav = encodePcm16Wav(new Float32Array([-1, 0, 1]), 16_000);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);

    expect(text(bytes, 0, 4)).toBe('RIFF');
    expect(text(bytes, 8, 12)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('stores accepted utterance audio, metadata, profile summary, and checksums', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const wavBytes = encodePcm16Wav(makeTone(1_200, 0.1), 16_000);
    const utterance = await store.saveEnrollmentUtterance({
      profileId: 'profile-local',
      profileDisplayName: 'Local profile',
      sentenceBankVersion: 'synthetic-v1',
      promptId: 'prompt-001',
      promptVersion: 1,
      referenceText: 'Tôi vừa update dashboard.',
      language: 'mixed',
      voiceCondition: 'normal',
      repetitionIndex: 1,
      wavBytes,
      sampleRateHz: 16_000,
      durationMs: 1_200,
      capture,
      quality,
      acceptedBy: 'manual',
      utteranceId: 'utt-001',
    });

    expect(utterance.audio.path).toBe('profiles/profile-local/recordings/utt-001.wav');
    expect(utterance.audio.sha256).toBe(await digest(wavBytes));
    expect(utterance.quality.privacy.containsAudio).toBe(false);

    const summary = await store.getProfileSummary('profile-local');
    expect(summary?.profile).toMatchObject({
      schemaVersion: 1,
      id: 'profile-local',
      displayName: 'Local profile',
      enrollment: {
        acceptedUtterances: 1,
        languageCounts: { vi: 0, en: 0, mixed: 1 },
        voiceConditionCounts: { whisper: 0, normal: 1, projected: 0 },
        sentenceBankVersion: 'synthetic-v1',
      },
      privacy: { containsRawAudio: true, exportEncrypted: false, localOnly: true },
    });
    expect(summary?.utterances).toHaveLength(1);
    expect(Object.keys(summary?.checksums.files ?? {})).toEqual(
      expect.arrayContaining([
        'profiles/profile-local/enrollment.jsonl',
        'profiles/profile-local/profile.json',
        'profiles/profile-local/recordings/utt-001.wav',
        'profiles/profile-local/utterances/utt-001.json',
      ]),
    );
    expect(
      await readBytes(backend, ['profiles', 'profile-local', 'recordings', 'utt-001.wav']),
    ).toEqual(Array.from(new Uint8Array(wavBytes)));
  });

  it('builds a privacy-safe training-readiness report from stored utterance metadata', async () => {
    const store = createStore(new InMemoryProfileStorageBackend());
    await saveReadinessTake(store, {
      utteranceId: 'utt-001',
      promptId: 'prompt-vi',
      language: 'vi',
      voiceCondition: 'normal',
      durationMs: 3_000,
    });
    await saveReadinessTake(store, {
      utteranceId: 'utt-002',
      promptId: 'prompt-en',
      language: 'en',
      voiceCondition: 'whisper',
      durationMs: 3_000,
    });
    await saveReadinessTake(store, {
      utteranceId: 'utt-003',
      promptId: 'custom-vocab:term-secret:vi-beginning-open:projected',
      language: 'mixed',
      voiceCondition: 'projected',
      durationMs: 3_500,
    });

    const summary = await store.getProfileSummary('profile-readiness');
    if (summary === undefined) throw new Error('Expected profile readiness summary.');
    const report = buildTrainingReadinessCoverageReportForProfile(summary, {
      ...defaultTrainingReadinessPolicyV1,
      minAcceptedUtterances: 3,
      minTotalDurationSeconds: 9,
      minUniquePromptIdentities: 3,
      languageTargets: [
        { value: 'vi', minUtterances: 1 },
        { value: 'en', minUtterances: 1 },
        { value: 'mixed', minUtterances: 1 },
      ],
      voiceConditionTargets: [
        { value: 'normal', minUtterances: 1 },
        { value: 'whisper', minUtterances: 1 },
        { value: 'projected', minUtterances: 1 },
      ],
      vocabulary: {
        minCoveredEntries: 1,
        minUtterancesPerEntry: 1,
        minDurationSecondsPerEntry: 3,
      },
    });

    expect(report.status).toBe('ready');
    expect(report.totals).toMatchObject({
      acceptedUtterances: 3,
      totalDurationSeconds: 9.5,
      uniquePromptIdentities: 3,
    });
    expect(report.vocabularyCoverage.entries).toEqual([
      expect.objectContaining({ label: 'vocab-001', utterances: 1, status: 'pass' }),
    ]);
    expect(report.privacy).toMatchObject({
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('prompt-vi');
    expect(serialized).not.toContain('term-secret');
  });

  it('freezes enrollment and vocabulary state for immutable local training jobs', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-freeze', 'utt-freeze-001');
    const vocabularyStore = createVocabularyStoreFixture();

    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-freeze',
      jobId: 'job-freeze-001',
      vocabularyStore,
    });

    expect(revision).toMatchObject({
      schemaVersion: 1,
      jobId: 'job-freeze-001',
      profileId: 'profile-freeze',
      enrollment: {
        schemaVersion: 1,
        acceptedUtterances: 1,
        sentenceBankVersion: 'synthetic-v1',
      },
      vocabulary: {
        schemaVersion: 1,
        storeRevision: 4,
        activeEntryCount: 1,
      },
      privacy: {
        localOnly: true,
        defaultExportIncludesRevision: false,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        containsCheckpoints: false,
        containsAdapterWeights: false,
        containsPrivateVocabularyTerms: true,
        networkUpload: false,
        telemetry: false,
      },
    });
    expect(revision.enrollment.utterances).toEqual([
      expect.objectContaining({
        id: 'utt-freeze-001',
        promptId: 'prompt-001',
        metadataPath: 'profiles/profile-freeze/utterances/utt-freeze-001.json',
      }),
    ]);
    expect(revision.vocabulary?.revision.entries).toEqual([
      expect.objectContaining({ id: 'term-secret', phrase: 'Project Condor' }),
    ]);
    expect(revision.enrollment.revisionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.vocabulary?.revisionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(revision)).not.toContain('Tôi vừa update dashboard.');
    const publicSummary = summarizeTrainingJobRevision(revision);
    expect(publicSummary).toMatchObject({
      jobId: 'job-freeze-001',
      enrollment: { acceptedUtterances: 1 },
      vocabulary: { activeEntryCount: 1 },
      privacy: { aggregateOnly: true, containsPrivateVocabularyTerms: false },
    });
    expect(JSON.stringify(publicSummary)).not.toContain('Project Condor');

    await expect(store.getTrainingJobRevision('job-freeze-001')).resolves.toEqual(revision);
    await expect(store.listTrainingJobRevisions('profile-freeze')).resolves.toEqual([revision]);
    await expect(
      store.freezeTrainingJobRevision({
        profileId: 'profile-freeze',
        jobId: 'job-freeze-001',
        vocabularyStore,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('carries selected vocabulary ids through prompt, feature, and frame-label metadata', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveSelectedVocabularyTake(store, {
      utteranceId: 'utt-selected-vocab',
      promptId: 'custom-vocab:term-secret:en-beginning-review:normal',
    });
    const vocabularyStore = createVocabularyStoreFixture();
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-selected-vocab',
      jobId: 'job-selected-vocab',
      vocabularyStore,
    });

    expect(revision.enrollment.utterances[0]).toMatchObject({
      promptId: 'custom-vocab:term-secret:en-beginning-review:normal',
      selectedVocabularyEntryIds: ['term-secret'],
    });
    expect(revision.enrollment.selectedVocabulary).toMatchObject({
      vocabularyRevisionSha256: revision.vocabulary?.revisionSha256,
      selectedEntryIds: ['term-secret'],
      selectedEntryCount: 1,
      utteranceCount: 1,
    });
    expect(summarizeTrainingJobRevision(revision).vocabulary).toMatchObject({
      activeEntryCount: 1,
      selectedEntryCount: 1,
      selectedUtteranceCount: 1,
    });

    const split = await store.buildTrainingJobPromptIdentitySplit({
      jobId: revision.jobId,
      config: { seed: 'selected-vocab', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });
    expect(split.split.assignments[0]).toMatchObject({
      selectedVocabularyEntryIds: ['term-secret'],
    });
    const splitSummary = summarizeTrainingJobPromptIdentitySplitPlan(split);
    expect(splitSummary.split.assignments[0]).toMatchObject({ selectedVocabularyEntryCount: 1 });
    expect(splitSummary.privacy.exposesRawVocabularyEntryIds).toBe(false);

    const featureManifest = await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-selected-vocab',
      splitConfig: { seed: 'selected-vocab', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });
    expect(featureManifest.selectedVocabulary).toMatchObject({
      vocabularyRevisionSha256: revision.vocabulary?.revisionSha256,
      selectedEntryCount: 1,
      utterances: 1,
      frames: featureManifest.totals.frames,
    });
    expect(featureManifest.shards[0]?.utterances[0]?.selectedVocabularyEntryIds).toEqual([
      'term-secret',
    ]);
    const featureSummary = summarizeTrainingJobFeaturePreparationManifest(featureManifest);
    expect(featureSummary.selectedVocabulary).toMatchObject({ selectedEntryCount: 1 });
    expect(featureSummary.privacy.exposesRawVocabularyEntryIds).toBe(false);

    const featureUtterance = featureManifest.shards[0]?.utterances[0];
    if (featureUtterance === undefined) throw new Error('Expected selected vocabulary feature.');
    const labels = await store.prepareTrainingJobFrameLabels({
      jobId: revision.jobId,
      featureSetId: 'features-selected-vocab',
      alignmentSetId: 'alignments-selected-vocab',
      alignments: [
        {
          utteranceId: featureUtterance.utteranceId,
          targetTokenIds: [1, 2, 3],
          frameCount: featureUtterance.frameCount,
          vocabularySize: 5,
          blankId: 0,
          frameLogits: makeCtcLogitsForFrames(featureUtterance.frameCount, [1, 2, 3], 5, 0),
        },
      ],
    });
    expect(labels.utterances[0]).toMatchObject({ selectedVocabularyEntryIds: ['term-secret'] });
    expect(labels.selectedVocabulary).toMatchObject({
      vocabularyRevisionSha256: revision.vocabulary?.revisionSha256,
      selectedEntryCount: 1,
      utterances: 1,
      frames: featureUtterance.frameCount,
      usableFrames: labels.utterances[0]?.usableFrameCount,
    });
    const labelSummary = summarizeTrainingJobFrameLabelsManifest(labels);
    expect(labelSummary.selectedVocabulary).toMatchObject({ selectedEntryCount: 1 });
    expect(labelSummary.privacy.exposesRawVocabularyEntryIds).toBe(false);

    const redactedText = JSON.stringify({ splitSummary, featureSummary, labelSummary });
    expect(redactedText).not.toContain('term-secret');
    expect(redactedText).not.toContain('Project Condor');
  });

  it('builds deterministic prompt-identity splits from frozen training job revisions', async () => {
    const store = createStore(new InMemoryProfileStorageBackend());
    await saveSplitTake(
      store,
      'utt-dashboard-normal',
      'prompt-repeat-dashboard',
      'mixed',
      'normal',
    );
    await saveSplitTake(
      store,
      'utt-dashboard-whisper',
      'prompt-repeat-dashboard',
      'mixed',
      'whisper',
    );
    await saveSplitTake(
      store,
      'utt-dashboard-projected',
      'prompt-repeat-dashboard',
      'mixed',
      'projected',
    );
    await saveSplitTake(store, 'utt-vi-normal', 'prompt-vi-normal', 'vi', 'normal');
    await saveSplitTake(store, 'utt-vi-whisper', 'prompt-vi-whisper', 'vi', 'whisper');
    await saveSplitTake(store, 'utt-en-normal', 'prompt-en-normal', 'en', 'normal');
    await saveSplitTake(store, 'utt-en-projected', 'prompt-en-projected', 'en', 'projected');
    await saveSplitTake(store, 'utt-mixed-normal', 'prompt-mixed-normal', 'mixed', 'normal');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-split',
      jobId: 'job-split',
    });

    const plan = await store.buildTrainingJobPromptIdentitySplit({
      jobId: revision.jobId,
      config: {
        seed: 'profile-split-seed',
        trainRatio: 0.5,
        validationRatio: 0.25,
        testRatio: 0.25,
      },
    });

    expect(plan).toMatchObject({
      schemaVersion: 1,
      jobId: revision.jobId,
      profileId: 'profile-split',
      enrollmentRevisionSha256: revision.enrollment.revisionSha256,
      privacy: { localOnly: true, exposesRawPromptIds: true, containsRawAudio: false },
    });
    expect(plan.split.targetPromptIdentities).toEqual({ train: 3, validation: 2, test: 1 });
    expect(plan.split.totals).toEqual({ promptIdentities: 6, utterances: 8, durationSeconds: 9.6 });
    expect(
      plan.split.assignments.find(
        (assignment) => assignment.promptId === 'prompt-repeat-dashboard',
      ),
    ).toMatchObject({
      utterances: 3,
      voiceConditions: ['whisper', 'normal', 'projected'],
    });
    const summary = summarizeTrainingJobPromptIdentitySplitPlan(plan);
    const serialized = JSON.stringify(summary);
    expect(summary).toMatchObject({
      jobId: revision.jobId,
      privacy: { aggregateOnly: true, exposesRawPromptIds: false, containsTranscriptText: false },
      split: { privacy: { aggregateOnly: true, exposesRawPromptIds: false } },
    });
    expect(summary.split.assignments[0]?.label).toBe('prompt-001');
    expect(serialized).not.toContain('prompt-repeat-dashboard');
    expect(serialized).not.toContain('utt-dashboard-normal');
  });

  it('prepares checksummed FP16 feature shards from frozen training jobs', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveSplitTake(store, 'utt-feature-train-a', 'prompt-feature-a', 'vi', 'normal');
    await saveSplitTake(store, 'utt-feature-train-b', 'prompt-feature-b', 'en', 'whisper');
    await saveSplitTake(store, 'utt-feature-test', 'prompt-feature-c', 'mixed', 'projected');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-split',
      jobId: 'job-features',
    });

    const manifest = await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-001',
      maxFramesPerShard: 50,
      splitConfig: { seed: 'feature-seed', trainRatio: 0.67, validationRatio: 0.33, testRatio: 0 },
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      manifestType: 'training-job-feature-shards',
      jobId: 'job-features',
      profileId: 'profile-split',
      featureSetId: 'features-001',
      enrollmentRevisionSha256: revision.enrollment.revisionSha256,
      dtype: 'float16-le',
      feature: { sampleRateHz: 16_000, melBinCount: 80 },
      privacy: {
        localOnly: true,
        defaultExportIncludesFeatures: false,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        referencesFeatureTensorFiles: true,
        exposesRawPromptIds: true,
      },
    });
    expect(manifest.shards.length).toBeGreaterThan(1);
    expect(manifest.totals.utterances).toBe(3);
    expect(manifest.totals.frames).toBeGreaterThan(0);
    expect(manifest.totals.sizeBytes).toBe(manifest.totals.frames * 80 * 2);
    expect(manifest.totals.shards).toBe(manifest.shards.length);
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const shard of manifest.shards) {
      expect(shard.path).toMatch(
        /^training-jobs\/job-features\/features\/features-001\/shards\/(train|validation)-\d{4}\.f16$/,
      );
      expect(shard.sha256).toBe(await digest(await requiredBytes(backend, shard.path.split('/'))));
      expect(shard.sizeBytes).toBe(shard.frameCount * shard.melBinCount * 2);
      expect(decodeFloat16Array(await requiredBytes(backend, shard.path.split('/')))).toHaveLength(
        shard.frameCount * shard.melBinCount,
      );
    }
    expect(
      await store.getTrainingJobFeaturePreparationManifest({
        jobId: 'job-features',
        featureSetId: 'features-001',
      }),
    ).toEqual(manifest);
    await expect(
      store.verifyTrainingJobFeatureShards({ jobId: 'job-features', featureSetId: 'features-001' }),
    ).resolves.toMatchObject({
      ok: true,
      manifestStatus: 'match',
      expectedManifestSha256: manifest.manifestSha256,
      actualManifestSha256: manifest.manifestSha256,
      privacy: { aggregateOnly: true, containsFeatureTensors: false, exposesRawPromptIds: false },
    });

    const summary = summarizeTrainingJobFeaturePreparationManifest(manifest);
    expect(summary).toMatchObject({
      featureSetId: 'features-001',
      totals: { utterances: 3, frames: manifest.totals.frames },
      privacy: { aggregateOnly: true, containsFeatureTensors: false, exposesRawPromptIds: false },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('prompt-feature-a');
    expect(serialized).not.toContain('utt-feature-train-a');
  });

  it('prepares private CTC frame labels and excludes low-confidence frames without deleting recordings', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveSplitTake(store, 'utt-align-a', 'prompt-align-a', 'vi', 'normal');
    await saveSplitTake(store, 'utt-align-b', 'prompt-align-b', 'en', 'whisper');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-split',
      jobId: 'job-frame-labels',
    });
    const featureManifest = await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-labels',
      splitConfig: { seed: 'labels-seed', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });
    const featureUtterances = featureManifest.shards.flatMap((shard) => shard.utterances);

    const manifest = await store.prepareTrainingJobFrameLabels({
      jobId: revision.jobId,
      featureSetId: 'features-labels',
      alignmentSetId: 'alignments-001',
      options: { minimumFrameConfidence: 0.7, minimumMeanTokenConfidence: 0.7 },
      alignments: featureUtterances.map((utterance, index) => ({
        utteranceId: utterance.utteranceId,
        targetTokenIds: [1, 2, 3],
        frameCount: utterance.frameCount,
        vocabularySize: 5,
        blankId: 0,
        frameLogits:
          index === 0
            ? makeCtcLogitsForFrames(utterance.frameCount, [1, 2, 3], 5, 0)
            : new Float32Array(utterance.frameCount * 5),
      })),
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      manifestType: 'training-job-frame-labels',
      jobId: revision.jobId,
      profileId: 'profile-split',
      featureSetId: 'features-labels',
      alignmentSetId: 'alignments-001',
      enrollmentRevisionSha256: revision.enrollment.revisionSha256,
      featureManifestSha256: featureManifest.manifestSha256,
      alignment: {
        algorithmId: 'ctc-viterbi-forced-alignment-v1',
        blankId: 0,
        vocabularySize: 5,
      },
      privacy: {
        localOnly: true,
        defaultExportIncludesFrameLabels: false,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        containsFrameLabels: true,
        containsTokenIds: true,
        exposesRawPromptIds: true,
      },
    });
    expect(manifest.labelFile.path).toBe(
      'training-jobs/job-frame-labels/features/features-labels/frame-labels/alignments-001/labels.json',
    );
    expect(manifest.labelFile.sha256).toBe(
      await digest(await requiredBytes(backend, manifest.labelFile.path.split('/'))),
    );
    expect(manifest.totals).toMatchObject({
      utterances: 2,
      alignedUtterances: 1,
      lowConfidenceExcludedUtterances: 1,
      frames: featureManifest.totals.frames,
    });
    expect(manifest.totals.usableFrames).toBeGreaterThan(0);
    expect(manifest.totals.excludedFrames).toBeGreaterThan(0);
    expect(manifest.utterances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ utteranceId: 'utt-align-a', status: 'aligned' }),
        expect.objectContaining({ utteranceId: 'utt-align-b', status: 'low-confidence-excluded' }),
      ]),
    );
    await expect(
      store.verifyTrainingJobFrameLabels({
        jobId: revision.jobId,
        featureSetId: 'features-labels',
        alignmentSetId: 'alignments-001',
      }),
    ).resolves.toMatchObject({
      ok: true,
      manifestStatus: 'match',
      labelFile: { status: 'match' },
      privacy: {
        aggregateOnly: true,
        containsFrameLabels: false,
        containsTokenIds: false,
        exposesRawPromptIds: false,
      },
    });

    const summary = summarizeTrainingJobFrameLabelsManifest(manifest);
    expect(summary).toMatchObject({
      featureSetId: 'features-labels',
      alignmentSetId: 'alignments-001',
      totals: {
        utterances: 2,
        alignedUtterances: 1,
        lowConfidenceExcludedUtterances: 1,
      },
      privacy: { aggregateOnly: true, containsFrameLabels: false, containsTokenIds: false },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('prompt-align-a');
    expect(serialized).not.toContain('utt-align-a');

    const exported = await store.exportProfile('profile-split');
    expect(Object.keys(exported.files).some((path) => path.includes('alignments-001'))).toBe(false);
    expect(
      await backend.getFile(['profiles', 'profile-split', 'recordings', 'utt-align-b.wav']),
    ).toBeDefined();
  });

  it('detects missing or changed frame labels and deletes them deterministically', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveSplitTake(store, 'utt-label-verify', 'prompt-label-verify', 'mixed', 'normal');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-split',
      jobId: 'job-frame-label-verify',
    });
    const featureManifest = await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-label-verify',
      splitConfig: { seed: 'label-verify-seed', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });
    const featureShard = featureManifest.shards[0];
    const utterance = featureShard?.utterances[0];
    if (featureShard === undefined || utterance === undefined) {
      throw new Error('Expected a prepared utterance.');
    }
    const originalFeatureBytes = await requiredBytes(backend, featureShard.path.split('/'));
    await backend.putFile(featureShard.path.split('/'), new Uint8Array([9, 9, 9]));
    await expect(
      store.prepareTrainingJobFrameLabels({
        jobId: revision.jobId,
        featureSetId: 'features-label-verify',
        alignmentSetId: 'alignments-reject-corrupt-features',
        alignments: [
          {
            utteranceId: utterance.utteranceId,
            targetTokenIds: [1, 2],
            frameCount: utterance.frameCount,
            vocabularySize: 4,
            blankId: 0,
            frameLogits: makeCtcLogitsForFrames(utterance.frameCount, [1, 2], 4, 0),
          },
        ],
      }),
    ).rejects.toThrow(/Feature shards must verify/);
    await backend.putFile(featureShard.path.split('/'), originalFeatureBytes);

    const manifest = await store.prepareTrainingJobFrameLabels({
      jobId: revision.jobId,
      featureSetId: 'features-label-verify',
      alignmentSetId: 'alignments-verify',
      alignments: [
        {
          utteranceId: utterance.utteranceId,
          targetTokenIds: [1, 2],
          frameCount: utterance.frameCount,
          vocabularySize: 4,
          blankId: 0,
          frameLogits: makeCtcLogitsForFrames(utterance.frameCount, [1, 2], 4, 0),
        },
      ],
    });
    const manifestPath = [
      'training-jobs',
      revision.jobId,
      'features',
      'features-label-verify',
      'frame-labels',
      'alignments-verify',
      'manifest.json',
    ];
    await backend.putFile(
      manifestPath,
      jsonBytes({
        ...manifest,
        totals: { ...manifest.totals, frames: manifest.totals.frames + 1 },
      }),
    );
    await expect(
      store.verifyTrainingJobFrameLabels({
        jobId: revision.jobId,
        featureSetId: 'features-label-verify',
        alignmentSetId: 'alignments-verify',
      }),
    ).resolves.toMatchObject({
      ok: false,
      manifestStatus: 'changed',
      errors: ['Frame-label manifest checksum changed.'],
    });
    await backend.putFile(manifestPath, jsonBytes(manifest));
    await backend.putFile(manifest.labelFile.path.split('/'), new Uint8Array([1, 2, 3]));
    await expect(
      store.verifyTrainingJobFrameLabels({
        jobId: revision.jobId,
        featureSetId: 'features-label-verify',
        alignmentSetId: 'alignments-verify',
      }),
    ).resolves.toMatchObject({
      ok: false,
      labelFile: { status: 'changed' },
      errors: ['Frame-label file checksum or size changed.'],
    });

    await store.deleteTrainingJobFrameLabels({
      jobId: revision.jobId,
      featureSetId: 'features-label-verify',
      alignmentSetId: 'alignments-verify',
    });
    expect(
      await backend.listFiles([
        'training-jobs',
        revision.jobId,
        'features',
        'features-label-verify',
        'frame-labels',
        'alignments-verify',
      ]),
    ).toEqual([]);
  });

  it('detects missing or changed FP16 feature shards and deletes them deterministically', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveSplitTake(store, 'utt-feature-delete-a', 'prompt-feature-a', 'vi', 'normal');
    await saveSplitTake(store, 'utt-feature-delete-b', 'prompt-feature-b', 'en', 'whisper');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-split',
      jobId: 'job-feature-verify',
    });
    const manifest = await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-verify',
      maxFramesPerShard: 128,
      splitConfig: { seed: 'verify-seed', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });
    const shardPath = manifest.shards[0]?.path;
    if (shardPath === undefined) throw new Error('Expected at least one feature shard.');
    const manifestPath = [
      'training-jobs',
      revision.jobId,
      'features',
      'features-verify',
      'manifest.json',
    ];
    await backend.putFile(
      manifestPath,
      jsonBytes({
        ...manifest,
        totals: { ...manifest.totals, frames: manifest.totals.frames + 1 },
      }),
    );
    await expect(
      store.verifyTrainingJobFeatureShards({
        jobId: revision.jobId,
        featureSetId: 'features-verify',
      }),
    ).resolves.toMatchObject({
      ok: false,
      manifestStatus: 'changed',
      errors: ['Feature preparation manifest checksum changed.'],
    });
    await backend.putFile(manifestPath, jsonBytes(manifest));

    await backend.putFile(shardPath.split('/'), new Uint8Array([1, 2, 3, 4]));
    await expect(
      store.verifyTrainingJobFeatureShards({
        jobId: revision.jobId,
        featureSetId: 'features-verify',
      }),
    ).resolves.toMatchObject({
      ok: false,
      shards: expect.arrayContaining([expect.objectContaining({ status: 'changed' })]),
      errors: [expect.stringMatching(/checksum or size changed/)],
    });

    await store.deleteTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-verify',
    });
    expect(
      await backend.listFiles(['training-jobs', revision.jobId, 'features', 'features-verify']),
    ).toEqual([]);
    await expect(
      store.verifyTrainingJobFeatureShards({
        jobId: revision.jobId,
        featureSetId: 'features-verify',
      }),
    ).rejects.toThrow(/was not found/);
  });

  it('keeps feature shards outside default profile exports', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-feature-export', 'utt-feature-export');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-feature-export',
      jobId: 'job-feature-export',
    });
    await store.prepareTrainingJobFeatureShards({
      jobId: revision.jobId,
      featureSetId: 'features-not-exported',
      splitConfig: { seed: 'export-seed', trainRatio: 1, validationRatio: 0, testRatio: 0 },
    });

    const exported = await store.exportProfile('profile-feature-export');

    expect(Object.keys(exported.files).some((path) => path.includes('features-not-exported'))).toBe(
      false,
    );
    expect(JSON.stringify(exported)).not.toContain('training-job-feature-shards');

    await store.deleteProfile('profile-feature-export');
    expect(await backend.listFiles(['training-jobs', 'job-feature-export'])).toEqual([]);
  });

  it('detects enrollment and vocabulary edits after a training job revision is frozen', async () => {
    const store = createStore(new InMemoryProfileStorageBackend());
    await saveFixtureTake(store, 'profile-freeze', 'utt-freeze-001');
    const vocabularyStore = createVocabularyStoreFixture();
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-freeze',
      jobId: 'job-freeze-drift',
      vocabularyStore,
    });

    await expect(
      store.verifyTrainingJobRevisionSources({ jobId: revision.jobId, vocabularyStore }),
    ).resolves.toMatchObject({
      ok: true,
      enrollment: { status: 'match' },
      vocabulary: { status: 'match' },
      privacy: { aggregateOnly: true, containsPrivateVocabularyTerms: false, localOnly: true },
    });

    await saveFixtureTake(store, 'profile-freeze', 'utt-freeze-002');
    const editedVocabularyStore: VocabularyStoreSnapshotV1 = {
      ...vocabularyStore,
      revision: 5,
      sets: vocabularyStore.sets.map((set) => ({
        ...set,
        revision: set.revision + 1,
        entries: set.entries.map((entry) =>
          entry.id === 'term-secret'
            ? { ...entry, phrase: 'Project Heron', displayForm: 'Project Heron' }
            : entry,
        ),
      })),
    };

    const verification = await store.verifyTrainingJobRevisionSources({
      jobId: revision.jobId,
      vocabularyStore: editedVocabularyStore,
    });

    expect(verification.ok).toBe(false);
    expect(verification.enrollment.status).toBe('changed');
    expect(verification.vocabulary?.status).toBe('changed');
    expect(verification.errors).toEqual([
      'Enrollment profile accepted-utterance revision changed after job freeze.',
      'Vocabulary revision changed after job freeze.',
    ]);
    expect(await store.getTrainingJobRevision(revision.jobId)).toEqual(revision);
  });

  it('detects missing local audio referenced by a frozen training job', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-freeze', 'utt-freeze-001');
    const revision = await store.freezeTrainingJobRevision({
      profileId: 'profile-freeze',
      jobId: 'job-missing-audio',
      vocabularyStore: createVocabularyStoreFixture(),
    });

    await backend.deleteFile(['profiles', 'profile-freeze', 'recordings', 'utt-freeze-001.wav']);
    const verification = await store.verifyTrainingJobRevisionSources({
      jobId: revision.jobId,
      vocabularyStore: createVocabularyStoreFixture(),
    });

    expect(verification.ok).toBe(false);
    expect(verification.enrollment.status).toBe('missing');
    expect(verification.errors).toEqual([
      'Enrollment audio file profiles/profile-freeze/recordings/utt-freeze-001.wav is missing.',
    ]);
  });

  it('keeps training job revisions outside default profile exports', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-freeze', 'utt-freeze-001');
    await store.freezeTrainingJobRevision({
      profileId: 'profile-freeze',
      jobId: 'job-not-exported',
      vocabularyStore: createVocabularyStoreFixture(),
    });

    const exported = await store.exportProfile('profile-freeze');

    expect(Object.keys(exported.files)).not.toContain(
      'training-jobs/job-not-exported/revision.json',
    );
    expect(JSON.stringify(exported)).not.toContain('Project Condor');
  });

  it('rejects unsafe profile and prompt path segments before writing', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await expect(
      store.saveEnrollmentUtterance({
        profileId: '../private',
        profileDisplayName: 'Bad profile',
        sentenceBankVersion: 'synthetic-v1',
        promptId: 'prompt-001',
        promptVersion: 1,
        referenceText: 'Please read this sentence.',
        language: 'en',
        voiceCondition: 'normal',
        repetitionIndex: 1,
        wavBytes: encodePcm16Wav(makeTone(800, 0.1), 16_000),
        sampleRateHz: 16_000,
        durationMs: 800,
        capture,
        quality,
        acceptedBy: 'manual',
      }),
    ).rejects.toThrow(/profileId/);
    expect(await backend.listFiles()).toEqual([]);
  });

  it('deletes one profile without touching another profile or stale active state', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-a', 'utt-a');
    await saveFixtureTake(store, 'profile-b', 'utt-b');
    await store.enableProfile({ profileId: 'profile-a' });
    await store.enableProfile({ profileId: 'profile-b' });

    await store.deleteProfile('profile-a');

    expect(await store.getProfileSummary('profile-a')).toBeUndefined();
    expect(await store.getProfileSummary('profile-b')).toBeDefined();
    expect(await store.getActiveProfileState()).toMatchObject({ activeProfileId: 'profile-b' });
    expect((await store.getActiveProfileState()).previousProfileId).toBeUndefined();
    expect(await backend.listFiles(['profiles', 'profile-a'])).toEqual([]);
    expect((await backend.listFiles(['profiles', 'profile-b'])).length).toBeGreaterThan(0);
  });

  it('enables and rolls back active profiles with base-model compatibility checks', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-a', 'utt-a', baseModel);
    await saveFixtureTake(store, 'profile-b', 'utt-b', baseModel);

    await expect(
      store.enableProfile({
        profileId: 'profile-a',
        expectedBaseModel: { ...baseModel, graphContractSha256: 'different' },
      }),
    ).rejects.toThrow(/base-model/);

    await expect(
      store.enableProfile({ profileId: 'profile-a', expectedBaseModel: baseModel }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-a' });
    await expect(
      store.enableProfile({ profileId: 'profile-b', expectedBaseModel: baseModel }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-b', previousProfileId: 'profile-a' });
    await expect(store.rollbackActiveProfile()).resolves.toMatchObject({
      activeProfileId: 'profile-a',
      previousProfileId: 'profile-b',
    });
  });

  it('requires activation reviews to pass or accept advanced override before enabling', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-reviewed', 'utt-reviewed', baseModel);

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({ activationAllowed: true }),
      }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-reviewed' });

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({ activationAllowed: false }),
      }),
    ).rejects.toThrow(/activation gates pass/);

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({
          automaticActivationAllowed: true,
          softGatePassed: false,
        }),
      }),
    ).rejects.toThrow(/inconsistent automatic gate status/);

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({
          activationAllowed: true,
          automaticActivationAllowed: false,
          advancedOverrideAccepted: false,
          softGatePassed: false,
        }),
      }),
    ).rejects.toThrow(/Advanced activation override/);

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({
          activationAllowed: true,
          automaticActivationAllowed: false,
          advancedOverrideAccepted: true,
          softGatePassed: false,
        }),
      }),
    ).resolves.toMatchObject({ activeProfileId: 'profile-reviewed' });

    await expect(
      store.enableProfile({
        profileId: 'profile-reviewed',
        activationReview: createActivationReview({
          activationAllowed: true,
          automaticActivationAllowed: false,
          advancedOverrideAccepted: true,
          hardGatePassed: false,
        }),
      }),
    ).rejects.toThrow(/hard activation gates failed/);
  });

  it('exports and imports a checksummed sensitive profile package', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export', baseModel);

    const exported = await store.exportProfile('profile-export');

    expect(exported).toMatchObject({
      schemaVersion: 1,
      packageType: 'speech-enrollment-profile-export',
      profileId: 'profile-export',
      privacy: {
        containsRawAudio: true,
        containsTranscriptText: true,
        containsRawProfileData: true,
        exportEncrypted: false,
        localOnly: true,
      },
    });
    expect(exported.warnings.join(' ')).toMatch(/sensitive personal data/i);
    expect(exported.files['profiles/profile-export/recordings/utt-export.wav']).toMatchObject({
      mediaType: 'audio/wav',
      sha256: await digest(encodePcm16Wav(makeTone(1_200, 0.1), 16_000)),
    });

    const importedBackend = new InMemoryProfileStorageBackend();
    const importedStore = createStore(importedBackend);
    const summary = await importedStore.importProfile({ profilePackage: exported });

    expect(summary.profile.id).toBe('profile-export');
    expect(summary.utterances).toHaveLength(1);
    expect(
      await readBytes(importedBackend, [
        'profiles',
        'profile-export',
        'recordings',
        'utt-export.wav',
      ]),
    ).toEqual(
      await readBytes(backend, ['profiles', 'profile-export', 'recordings', 'utt-export.wav']),
    );
    await expect(importedStore.importProfile({ profilePackage: exported })).rejects.toThrow(
      /already exists/,
    );
  });

  it('lists, renames, dedupes, imports as new, and replaces multiple profiles', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const sourceStore = createStore(new InMemoryProfileStorageBackend());
    await saveFixtureTake(sourceStore, 'profile-export', 'utt-export', baseModel);
    const exported = await sourceStore.exportProfile('profile-export');
    const store = createStore(backend, { randomId: () => 'imported' });

    const imported = await store.importProfilePackage({ profilePackage: exported });
    expect(imported).toMatchObject({
      operation: 'imported-new',
      targetProfileId: 'profile-export',
      displayName: 'profile-export',
    });
    expect(redactEnrollmentProfileImportResult(imported)).toMatchObject({
      operation: 'imported-new',
      displayName: 'profile-export',
      privacy: { containsRawProfileId: false, aggregateOnly: true },
    });
    expect(redactEnrollmentProfileImportResult(imported)).not.toHaveProperty('targetProfileId');

    const deduped = await store.importProfilePackage({ profilePackage: exported, mode: 'dedupe' });
    expect(deduped).toMatchObject({
      operation: 'deduped-existing',
      targetProfileId: 'profile-export',
    });

    const renamed = await store.renameProfile({
      profileId: 'profile-export',
      displayName: 'Main personal profile',
    });
    expect(renamed.profile.displayName).toBe('Main personal profile');

    const importedAsNew = await store.importProfilePackage({
      profilePackage: exported,
      mode: 'import-as-new',
      targetDisplayName: 'Main personal profile',
    });
    expect(importedAsNew.operation).toBe('imported-new');
    expect(importedAsNew.targetProfileId).toBe('main-personal-profile-imported');
    expect(importedAsNew.displayName).toBe('Main personal profile (2)');
    expect(importedAsNew.nameCollisionResolved).toBe(true);
    expect(importedAsNew.summary.utterances[0]?.profileId).toBe(importedAsNew.targetProfileId);
    expect(importedAsNew.summary.utterances[0]?.audio.path).toContain(
      `profiles/${importedAsNew.targetProfileId}/recordings/`,
    );

    const collisionRenamed = await store.renameProfile({
      profileId: importedAsNew.targetProfileId,
      displayName: 'Main personal profile',
    });
    expect(collisionRenamed.profile.displayName).toBe('Main personal profile (2)');

    const replacement = await store.importProfilePackage({
      profilePackage: exported,
      mode: 'replace',
      targetProfileId: importedAsNew.targetProfileId,
      targetDisplayName: 'Replacement profile',
    });
    expect(replacement).toMatchObject({
      operation: 'replaced-existing',
      targetProfileId: importedAsNew.targetProfileId,
      displayName: 'Replacement profile',
    });

    await store.enableProfile({ profileId: 'profile-export' });
    await store.enableProfile({ profileId: importedAsNew.targetProfileId });
    await store.deleteProfile(importedAsNew.targetProfileId);
    await expect(store.getActiveProfileState()).resolves.toMatchObject({
      activeProfileId: 'profile-export',
    });

    const summaries = await store.listProfileSummaries();
    expect(summaries.map((summary) => summary.profile.id)).toEqual(['profile-export']);
  });

  it('rejects tampered exported profile files during import', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export');
    const exported = await store.exportProfile('profile-export');
    const path = 'profiles/profile-export/profile.json';
    const tampered = {
      ...exported,
      files: {
        ...exported.files,
        [path]: { ...exported.files[path]!, base64: 'AAAA' },
      },
    };

    await expect(
      createStore(new InMemoryProfileStorageBackend()).importProfile({ profilePackage: tampered }),
    ).rejects.toThrow(/checksum mismatch|size does not match/);
  });

  it('rejects exports whose embedded metadata differs from the top-level package', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-export', 'utt-export');
    const exported = await store.exportProfile('profile-export');
    const path = 'profiles/profile-export/profile.json';
    const tamperedProfileBytes = jsonBytes({
      ...exported.profile,
      displayName: 'Different embedded profile',
    });
    const tampered = {
      ...exported,
      files: {
        ...exported.files,
        [path]: {
          ...exported.files[path]!,
          sha256: await digest(tamperedProfileBytes),
          sizeBytes: tamperedProfileBytes.byteLength,
          base64: Buffer.from(tamperedProfileBytes).toString('base64'),
        },
      },
    };

    await expect(
      createStore(new InMemoryProfileStorageBackend()).importProfile({ profilePackage: tampered }),
    ).rejects.toThrow(/profile metadata does not match embedded profile\.json/);
  });

  it('migrates legacy speech profile manifests to profile.v2.json without mutating V1', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend, { now: () => '2026-06-26T09:30:00.000Z' });
    const sourcePath = ['profiles', legacySpeechProfileFixture.id, 'profile.json'];
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    await backend.putFile(sourcePath, jsonBytes(legacySpeechProfileFixture));
    await backend.putFile(
      [...targetPath.slice(0, -1), 'profile.v2.json.tmp-interrupted'],
      jsonBytes({ partial: true }),
    );
    await backend.putFile(
      [...targetPath.slice(0, -1), 'nested', 'profile.v2.json.tmp-unrelated'],
      jsonBytes({ keep: true }),
    );

    const result = await store.migrateSpeechProfileManifestToV2({
      profileId: legacySpeechProfileFixture.id,
    });

    expect(result).toMatchObject({
      status: 'migrated',
      sourceSchemaVersion: 1,
      targetSchemaVersion: 2,
      manifest: {
        adaptationType: 'residual-adapter',
        baseModel: { id: 'mock-vi-en-rnnt', version: '0.4.0' },
        cliResidualAdapterPreserved: true,
      },
      recovery: { deletedTemporaryFiles: 1, reusedExistingV2: false, replacedInvalidV2: false },
      downgrade: { v1ManifestRetained: true, v2ManifestFileName: 'profile.v2.json' },
      privacy: { aggregateOnly: true, containsAdapterWeights: false, exposesStoragePaths: false },
    });
    const source = jsonFromBytes(await requiredBytes(backend, sourcePath));
    const migrated = jsonFromBytes<SpeechProfileManifestV2>(
      await requiredBytes(backend, targetPath),
    );
    expect(source).toEqual(legacySpeechProfileFixture);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.adaptation).toEqual(legacySpeechProfileFixture.adaptation);
    expect(await backend.listFiles(['profiles', legacySpeechProfileFixture.id])).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: [...targetPath.slice(0, -1), 'profile.v2.json.tmp-interrupted'],
        }),
      ]),
    );
    expect(
      await backend.getFile([
        ...targetPath.slice(0, -1),
        'nested',
        'profile.v2.json.tmp-unrelated',
      ]),
    ).toBeDefined();
    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain(legacySpeechProfileFixture.id);
    expect(serializedResult).not.toContain('profiles/');
    expect(serializedResult).not.toContain('adapter.onnx');
  });

  it('resumes interrupted migrations when a valid V2 target already exists', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend, { now: () => '2026-06-26T09:31:00.000Z' });
    const sourcePath = ['profiles', legacySpeechProfileFixture.id, 'profile.json'];
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    const existingV2: SpeechProfileManifestV2 = {
      ...legacySpeechProfileFixture,
      schemaVersion: 2,
    };
    await backend.putFile(sourcePath, jsonBytes(legacySpeechProfileFixture));
    await backend.putFile(targetPath, jsonBytes(existingV2));
    await backend.putFile(
      [...targetPath.slice(0, -1), 'profile.v2.json.tmp-old'],
      jsonBytes({ partial: true }),
    );

    const result = await store.migrateSpeechProfileManifestToV2({
      profileId: legacySpeechProfileFixture.id,
    });

    expect(result.status).toBe('recovered-existing-v2');
    expect(result.sourceSchemaVersion).toBe(1);
    expect(result.downgrade.v1ManifestRetained).toBe(true);
    expect(result.recovery).toMatchObject({
      deletedTemporaryFiles: 1,
      reusedExistingV2: true,
      replacedInvalidV2: false,
    });
    expect(jsonFromBytes(await requiredBytes(backend, targetPath))).toEqual(existingV2);
  });

  it('recovers a valid existing V2 target even when the retained source is unparsable', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const sourcePath = ['profiles', legacySpeechProfileFixture.id, 'profile.json'];
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    const existingV2: SpeechProfileManifestV2 = {
      ...legacySpeechProfileFixture,
      schemaVersion: 2,
    };
    await backend.putFile(sourcePath, jsonBytes({ broken: true }));
    await backend.putFile(targetPath, jsonBytes(existingV2));

    const result = await store.migrateSpeechProfileManifestToV2({
      profileId: legacySpeechProfileFixture.id,
    });

    expect(result.status).toBe('recovered-existing-v2');
    expect(result.sourceSchemaVersion).toBe(2);
    expect(result.downgrade.v1ManifestRetained).toBe(false);
    expect(jsonFromBytes(await requiredBytes(backend, targetPath))).toEqual(existingV2);
  });

  it('returns already-v2 without writing a downgrade-retention claim when the source is V2', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const sourcePath = ['profiles', legacySpeechProfileFixture.id, 'profile.json'];
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    const sourceV2: SpeechProfileManifestV2 = {
      ...legacySpeechProfileFixture,
      schemaVersion: 2,
    };
    await backend.putFile(sourcePath, jsonBytes(sourceV2));

    const result = await store.migrateSpeechProfileManifestToV2({
      profileId: legacySpeechProfileFixture.id,
    });

    expect(result.status).toBe('already-v2');
    expect(result.sourceSchemaVersion).toBe(2);
    expect(result.recovery).toMatchObject({
      reusedExistingV2: false,
      replacedInvalidV2: false,
    });
    expect(result.downgrade.v1ManifestRetained).toBe(false);
    expect(await backend.getFile(targetPath)).toBeUndefined();
  });

  it('replaces an invalid interrupted V2 target from the retained V1 source', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend, { now: () => '2026-06-26T09:32:00.000Z' });
    const sourcePath = ['profiles', legacySpeechProfileFixture.id, 'profile.json'];
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    await backend.putFile(sourcePath, jsonBytes(legacySpeechProfileFixture));
    await backend.putFile(targetPath, jsonBytes({ schemaVersion: 2, id: 'partial' }));

    const result = await store.migrateSpeechProfileManifestToV2({
      profileId: legacySpeechProfileFixture.id,
    });

    expect(result.status).toBe('replaced-invalid-v2');
    expect(result.recovery.replacedInvalidV2).toBe(true);
    const migrated = jsonFromBytes<SpeechProfileManifestV2>(
      await requiredBytes(backend, targetPath),
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.id).toBe(legacySpeechProfileFixture.id);
  });

  it('fails migration without deleting a retained invalid target when the V1 source is missing', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const targetPath = ['profiles', legacySpeechProfileFixture.id, 'profile.v2.json'];
    const invalidTarget = jsonBytes({ schemaVersion: 2, id: 'partial' });
    await backend.putFile(targetPath, invalidTarget);

    await expect(
      store.migrateSpeechProfileManifestToV2({ profileId: legacySpeechProfileFixture.id }),
    ).rejects.toThrow(/source profile\.json is missing/);
    expect(await readBytes(backend, targetPath)).toEqual(Array.from(new Uint8Array(invalidTarget)));
  });

  it('stages portable speechmodel imports, runs smoke vectors, and commits the record last', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend, { now: () => '2026-06-26T06:30:00.000Z' });
    const archive = await createPortableArchiveFixture();
    const smokePaths: string[] = [];

    const summary = await store.importPortableSpeechModel({
      archive,
      expectedBaseModel: portableBaseModel,
      importId: 'portable-import-001',
      smokeTest: async (context) => {
        const vectorBytes = await context.readStagedFile('test-vectors/forward.json');
        smokePaths.push(text(vectorBytes, 0, vectorBytes.byteLength));
        expect(
          await backend.getFile([
            'portable-models',
            archive.manifest.bundleId,
            'active-import.json',
          ]),
        ).toBeUndefined();
        const adapterBytes = await context.readStagedFile('artifacts/adapter-weights.bin');
        expect(adapterBytes.byteLength).toBeGreaterThan(0);
        return createPortableSmokeResult(context);
      },
    });

    expect(summary).toMatchObject({
      bundleId: archive.manifest.bundleId,
      importId: 'portable-import-001',
      displayName: archive.manifest.displayName,
      baseModel: {
        id: portableBaseModel.id,
        version: portableBaseModel.version,
        exactCompatibility: true,
      },
      smokeTest: { status: 'passed', vectorCount: 1, warningCount: 0 },
      privacy: { aggregateOnly: true, containsAdapterWeights: false, localOnly: true },
    });
    expect(smokePaths[0]).toContain('portable-smoke-vector-v1');
    expect(await backend.listFiles(['portable-import-staging'])).toEqual([]);

    const record = await store.getPortableSpeechModelImport(archive.manifest.bundleId);
    expect(record).toMatchObject({
      bundleId: archive.manifest.bundleId,
      importId: 'portable-import-001',
      privacy: { containsAdapterWeights: true, localOnly: true },
      smokeTest: { status: 'passed', vectorCount: 1 },
    });
    expect(record?.files.map((file) => file.storagePath)).toEqual(
      expect.arrayContaining([
        'portable-models/portable-import-fixture/imports/portable-import-001/files/artifacts/adapter-weights.bin',
        'portable-models/portable-import-fixture/imports/portable-import-001/files/test-vectors/forward.json',
      ]),
    );
  });

  it('imports CLI residual-adapter portable bundles through the same staged path', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend, { randomId: () => 'portable-import-cli' });
    const archive = await createPortableArchiveFixture({ adaptationType: 'cli-residual-adapter' });

    const summary = await store.importPortableSpeechModel({
      archive,
      expectedBaseModel: portableBaseModel,
      smokeTest: createPortableSmokeResult,
      importId: 'portable-import-cli',
    });

    expect(summary).toMatchObject({
      bundleId: 'portable-import-fixture',
      importId: 'portable-import-cli',
      adaptationType: 'cli-residual-adapter',
      smokeTest: { status: 'passed', vectorCount: 1 },
      privacy: { containsAdapterWeights: false, containsRawAudio: false },
    });
    expect(summary.fileCount).toBeGreaterThanOrEqual(7);
    expect(await backend.listFiles(['portable-import-staging'])).toEqual([]);
    expect(await store.getPortableSpeechModelImport('portable-import-fixture')).toMatchObject({
      summary: { adaptationType: 'cli-residual-adapter' },
      privacy: { containsAdapterWeights: true },
    });
  });

  it('rejects portable imports with non-exact base-model identity before staging', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();

    await expect(
      store.importPortableSpeechModel({
        archive,
        expectedBaseModel: { ...portableBaseModel, tokenizerSha256: 'd'.repeat(64) },
        smokeTest: createPortableSmokeResult,
      }),
    ).rejects.toThrow(/base-model identity/);
    expect(await backend.listFiles()).toEqual([]);
  });

  it('rejects forged portable archive summaries before staging', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();

    await expect(
      store.importPortableSpeechModel({
        archive: {
          ...archive,
          summary: { ...archive.summary, expandedBytes: archive.summary.expandedBytes + 1 },
        },
        expectedBaseModel: portableBaseModel,
        smokeTest: createPortableSmokeResult,
      }),
    ).rejects.toThrow(/expanded bytes/);
    expect(await backend.listFiles()).toEqual([]);
  });

  it('rejects forged portable archives with duplicate file paths before staging', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();
    const duplicate = requirePortableImportFile(archive, 'artifacts/adapter-weights.bin');

    await expect(
      store.importPortableSpeechModel({
        archive: {
          ...archive,
          files: [...archive.files, duplicate],
          summary: {
            ...archive.summary,
            fileCount: archive.files.length + 1,
            expandedBytes: archive.summary.expandedBytes + duplicate.bytes.byteLength,
          },
        },
        expectedBaseModel: portableBaseModel,
        smokeTest: createPortableSmokeResult,
      }),
    ).rejects.toThrow(/duplicate or colliding file/);
    expect(await backend.listFiles()).toEqual([]);
  });

  it('cleans temporary portable import staging and leaves no committed record when smoke fails', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();

    await expect(
      store.importPortableSpeechModel({
        archive,
        expectedBaseModel: portableBaseModel,
        importId: 'portable-import-fail',
        smokeTest: async () => {
          throw new Error('synthetic runtime smoke failure');
        },
      }),
    ).rejects.toThrow(/synthetic runtime smoke failure/);

    expect(await backend.listFiles(['portable-import-staging'])).toEqual([]);
    expect(await backend.listFiles(['portable-models'])).toEqual([]);
    await expect(
      store.getPortableSpeechModelImport(archive.manifest.bundleId),
    ).resolves.toBeUndefined();
  });

  it('cleans temporary portable import staging and leaves no committed record when smoke times out', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();

    await expect(
      store.importPortableSpeechModel({
        archive,
        expectedBaseModel: portableBaseModel,
        importId: 'portable-import-timeout',
        smokeTimeoutMs: 1,
        smokeTest: () => new Promise<PortableSpeechModelImportSmokeResultV1>(() => undefined),
      }),
    ).rejects.toThrow(/runtime smoke timed out/);

    expect(await backend.listFiles(['portable-import-staging'])).toEqual([]);
    expect(await backend.listFiles(['portable-models'])).toEqual([]);
    await expect(
      store.getPortableSpeechModelImport(archive.manifest.bundleId),
    ).resolves.toBeUndefined();
  });

  it('requires explicit overwrite before replacing an imported portable bundle', async () => {
    const backend = new InMemoryProfileStorageBackend();
    const store = createStore(backend);
    const archive = await createPortableArchiveFixture();

    await store.importPortableSpeechModel({
      archive,
      expectedBaseModel: portableBaseModel,
      importId: 'portable-import-first',
      smokeTest: createPortableSmokeResult,
    });
    await expect(
      store.importPortableSpeechModel({
        archive,
        expectedBaseModel: portableBaseModel,
        importId: 'portable-import-second',
        smokeTest: createPortableSmokeResult,
      }),
    ).rejects.toThrow(/already imported/);

    await expect(
      store.importPortableSpeechModel({
        archive,
        expectedBaseModel: portableBaseModel,
        importId: 'portable-import-second',
        overwriteExisting: true,
        smokeTest: createPortableSmokeResult,
      }),
    ).resolves.toMatchObject({ importId: 'portable-import-second' });
    await expect(
      store.getPortableSpeechModelImport(archive.manifest.bundleId),
    ).resolves.toMatchObject({
      importId: 'portable-import-second',
    });
  });

  it('stores files through an OPFS-compatible backend', async () => {
    const backend = new OpfsProfileStorageBackend(new FakeOpfsDirectory());
    const store = createStore(backend);
    await saveFixtureTake(store, 'profile-opfs', 'utt-opfs');

    const summary = await store.getProfileSummary('profile-opfs');
    expect(summary?.utterances[0]?.audio.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await backend.listFiles(['profiles', 'profile-opfs'])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['profiles', 'profile-opfs', 'profile.json'] }),
        expect.objectContaining({
          path: ['profiles', 'profile-opfs', 'recordings', 'utt-opfs.wav'],
        }),
      ]),
    );
  });

  it('requests persistent storage when available', async () => {
    await expect(
      requestPersistentProfileStorage({
        persist: async () => true,
      }),
    ).resolves.toBe(true);
    await expect(requestPersistentProfileStorage({})).resolves.toBe(false);
  });
});

function createActivationReview(
  overrides: Partial<EnrollmentProfileActivationReviewV1> = {},
): EnrollmentProfileActivationReviewV1 {
  return {
    schemaVersion: 1,
    decisionType: 'personal-model-activation-decision',
    status: 'automatic-activation-allowed',
    activationAllowed: true,
    automaticActivationAllowed: true,
    advancedOverrideAccepted: false,
    hardGatePassed: true,
    softGatePassed: true,
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsCaseIds: false,
      containsRawProfileId: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawVocabularyEntryIds: false,
      localOnly: true,
    },
    ...overrides,
  };
}

async function createPortableArchiveFixture(
  options: {
    readonly adaptationType?: PortableSpeechModelManifestV1['adaptation']['type'];
  } = {},
): Promise<ImportedPortableSpeechModelArchiveV1> {
  const adaptationType = options.adaptationType ?? 'browser-top-adapter';
  const adapter = portableFile(
    'artifacts/adapter-weights.bin',
    'application/octet-stream',
    bytes(1, 2, 3, 4),
  );
  const speaker = portableFile(
    'embeddings/speaker.f32',
    'application/octet-stream',
    bytes(5, 6, 7, 8),
  );
  const profileManifest = portableFile(
    'metadata/profile-manifest.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      id: 'private-source-profile',
      adaptation: {
        type: 'residual-adapter',
        adapter: {
          graphFileKey: 'adapterGraph',
          graphContractSha256: portableBaseModel.graphContractSha256,
          insertionPointIds: ['encoder-block-11'],
          application: 'residual-add',
          activationSwap: 'utterance-boundary',
        },
      },
      privacy: { containsRawAudio: false },
    }),
  );
  const evaluationSummary = portableFile(
    'evaluation/summary.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, gatePassed: true, aggregateOnly: true }),
  );
  const evaluationMetrics = portableFile(
    'evaluation/metrics.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, wer: 0.12, privacy: { containsCaseIds: false } }),
  );
  const notices = portableFile(
    'notices/THIRD_PARTY_NOTICES.txt',
    'text/plain',
    new TextEncoder().encode('Synthetic notices for portable import tests.'),
  );
  const vector = portableFile(
    'test-vectors/forward.json',
    'application/json',
    jsonBytes({ schemaVersion: 1, vectorType: 'portable-smoke-vector-v1', expected: [0, 1] }),
  );
  const payloadWithoutChecksums =
    adaptationType === 'cli-residual-adapter'
      ? [adapter, profileManifest, evaluationSummary, evaluationMetrics, notices, vector]
      : [adapter, speaker, evaluationSummary, evaluationMetrics, notices, vector];
  const refsWithoutChecksums = await refsForPortableFiles(payloadWithoutChecksums);
  const checksums = portableFile(
    'metadata/checksums.json',
    'application/json',
    jsonBytes({
      schemaVersion: 1,
      files: Object.values(refsWithoutChecksums).sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    }),
  );
  const refs = {
    ...refsWithoutChecksums,
    [checksums.path]: await createPortableSpeechModelFileRef(checksums),
  };
  const manifest: PortableSpeechModelManifestV1 = {
    schemaVersion: 1,
    bundleType: 'personal-voice-model',
    bundleId: 'portable-import-fixture',
    modelRevision: 'rev-import-001',
    displayName: 'Portable import fixture',
    createdAt: '2026-06-26T00:00:00.000Z',
    exportedAt: '2026-06-26T00:00:00.000Z',
    sourceAppVersion: '0.5.0',
    profile: {
      sourceProfileId: 'private-source-profile',
      languages: ['vi', 'en'],
      supportsMixed: true,
    },
    baseModel: portableBaseModel,
    adaptation:
      adaptationType === 'cli-residual-adapter'
        ? {
            type: 'cli-residual-adapter',
            contractVersion: 1,
            algorithmId: 'cli-residual-adapter-v1',
            files: {
              adapterGraph: requirePortableRef(refs, adapter.path),
              profileManifest: requirePortableRef(refs, profileManifest.path),
            },
          }
        : {
            type: 'browser-top-adapter',
            contractVersion: 1,
            algorithmId: 'browser-top-adapter-frame-ce-v1',
            files: {
              weights: requirePortableRef(refs, adapter.path),
              speakerEmbedding: requirePortableRef(refs, speaker.path),
            },
          },
    evaluation: {
      gatePassed: true,
      summaryFile: requirePortableRef(refs, evaluationSummary.path),
      metricsFile: requirePortableRef(refs, evaluationMetrics.path),
    },
    noticesFile: requirePortableRef(refs, notices.path),
    checksumsFile: requirePortableRef(refs, checksums.path),
    testVectors: [requirePortableRef(refs, vector.path)],
    privacy: {
      containsRawAudio: false,
      containsPreparedFeatures: false,
      containsVoiceDerivedWeights: true,
    },
    files: Object.values(refs).sort((left, right) => left.path.localeCompare(right.path)),
  };
  const bundle = await buildPortableSpeechModelInnerBundle({
    manifest,
    files: [...payloadWithoutChecksums, checksums],
  });
  return importPortableSpeechModelArchive(
    buildUnencryptedPortableSpeechModelEnvelope(bundle.bytes).bytes,
  );
}

async function createPortableSmokeResult(
  context: PortableSpeechModelImportSmokeContextV1,
): Promise<PortableSpeechModelImportSmokeResultV1> {
  return {
    schemaVersion: 1,
    smokeType: 'portable-speechmodel-import-runtime-smoke',
    status: 'passed',
    vectorCount: context.testVectors.length,
    checkedAt: '2026-06-26T06:30:00.000Z',
    warnings: [],
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
}

async function refsForPortableFiles(
  files: readonly PortableSpeechModelBundleFileInputV1[],
): Promise<Record<string, ProfileFileRef>> {
  const refs: Record<string, ProfileFileRef> = {};
  for (const file of files) refs[file.path] = await createPortableSpeechModelFileRef(file);
  return refs;
}

function requirePortableRef(
  refs: Readonly<Record<string, ProfileFileRef>>,
  path: string,
): ProfileFileRef {
  const ref = refs[path];
  if (ref === undefined) throw new Error(`Missing portable fixture ref ${path}`);
  return ref;
}

function requirePortableImportFile(
  archive: ImportedPortableSpeechModelArchiveV1,
  path: string,
): ImportedPortableSpeechModelArchiveV1['files'][number] {
  const file = archive.files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`Missing portable archive file ${path}`);
  return file;
}

function portableFile(
  path: string,
  mediaType: string,
  body: ArrayBuffer | Uint8Array,
): PortableSpeechModelBundleFileInputV1 {
  return { path, mediaType, bytes: body };
}

function bytes(...values: readonly number[]): Uint8Array {
  return new Uint8Array(values);
}

function createStore(
  backend: ProfileStorageBackend,
  overrides: {
    readonly digest?: (bytes: ArrayBuffer) => Promise<string>;
    readonly now?: () => string;
    readonly randomId?: () => string;
  } = {},
): EnrollmentProfileStore {
  return new EnrollmentProfileStore(backend, {
    digest,
    now: () => '2026-06-23T00:00:00.000Z',
    randomId: () => 'utt-generated',
    ...overrides,
  });
}

async function saveFixtureTake(
  store: EnrollmentProfileStore,
  profileId: string,
  utteranceId: string,
  model: typeof baseModel | undefined = undefined,
): Promise<void> {
  await store.saveEnrollmentUtterance({
    profileId,
    profileDisplayName: profileId,
    sentenceBankVersion: 'synthetic-v1',
    promptId: 'prompt-001',
    promptVersion: 1,
    referenceText: 'Tôi vừa update dashboard.',
    language: 'mixed',
    voiceCondition: 'normal',
    repetitionIndex: 1,
    wavBytes: encodePcm16Wav(makeTone(1_200, 0.1), 16_000),
    sampleRateHz: 16_000,
    durationMs: 1_200,
    capture,
    quality,
    acceptedBy: 'manual',
    utteranceId,
    ...(model === undefined ? {} : { baseModel: model }),
  });
}

async function saveSplitTake(
  store: EnrollmentProfileStore,
  utteranceId: string,
  promptId: string,
  language: 'vi' | 'en' | 'mixed',
  voiceCondition: 'whisper' | 'normal' | 'projected',
): Promise<void> {
  await store.saveEnrollmentUtterance({
    profileId: 'profile-split',
    profileDisplayName: 'Profile split',
    sentenceBankVersion: 'synthetic-v1',
    promptId,
    promptVersion: 1,
    referenceText: 'Synthetic local prompt for split accounting.',
    language,
    voiceCondition,
    repetitionIndex: 1,
    wavBytes: encodePcm16Wav(makeTone(1_200, 0.1), 16_000),
    sampleRateHz: 16_000,
    durationMs: 1_200,
    capture,
    quality,
    acceptedBy: 'manual',
    utteranceId,
  });
}

async function saveSelectedVocabularyTake(
  store: EnrollmentProfileStore,
  input: {
    readonly utteranceId: string;
    readonly promptId: string;
  },
): Promise<void> {
  await store.saveEnrollmentUtterance({
    profileId: 'profile-selected-vocab',
    profileDisplayName: 'Profile selected vocabulary',
    sentenceBankVersion: 'synthetic-v1',
    promptId: input.promptId,
    promptVersion: 1,
    referenceText: 'Please review Project Condor today.',
    language: 'en',
    voiceCondition: 'normal',
    repetitionIndex: 1,
    wavBytes: encodePcm16Wav(makeTone(1_200, 0.1), 16_000),
    sampleRateHz: 16_000,
    durationMs: 1_200,
    capture,
    quality,
    acceptedBy: 'manual',
    customVocabularyEntryIds: ['term-secret'],
    utteranceId: input.utteranceId,
  });
}

async function saveReadinessTake(
  store: EnrollmentProfileStore,
  input: {
    readonly utteranceId: string;
    readonly promptId: string;
    readonly language: 'vi' | 'en' | 'mixed';
    readonly voiceCondition: 'whisper' | 'normal' | 'projected';
    readonly durationMs: number;
  },
): Promise<void> {
  await store.saveEnrollmentUtterance({
    profileId: 'profile-readiness',
    profileDisplayName: 'Profile readiness',
    sentenceBankVersion: 'synthetic-v1',
    promptId: input.promptId,
    promptVersion: 1,
    referenceText: 'Synthetic local prompt for readiness accounting.',
    language: input.language,
    voiceCondition: input.voiceCondition,
    repetitionIndex: 1,
    wavBytes: encodePcm16Wav(makeTone(input.durationMs, 0.1), 16_000),
    sampleRateHz: 16_000,
    durationMs: input.durationMs,
    capture,
    quality,
    acceptedBy: 'manual',
    utteranceId: input.utteranceId,
  });
}

function createVocabularyStoreFixture(): VocabularyStoreSnapshotV1 {
  return {
    schemaVersion: 1,
    revision: 4,
    activeSetIds: ['set-local'],
    updatedAt: '2026-06-23T00:00:00.000Z',
    sets: [
      {
        schemaVersion: 1,
        id: 'set-local',
        displayName: 'Local terms',
        enabled: true,
        revision: 3,
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z',
        source: 'manual',
        entries: [
          {
            id: 'term-secret',
            phrase: 'Project Condor',
            displayForm: 'Project Condor',
            language: 'en',
            spokenAliases: ['Condor'],
            weight: 7,
            category: 'Sensitive project',
            enabled: true,
            exactCase: true,
            promptPriority: 3,
          },
        ],
      },
      {
        schemaVersion: 1,
        id: 'set-inactive',
        displayName: 'Inactive terms',
        enabled: false,
        revision: 1,
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z',
        source: 'manual',
        entries: [
          {
            id: 'term-ignored',
            phrase: 'Ignored term',
            displayForm: 'Ignored term',
            language: 'en',
            spokenAliases: [],
            weight: 5,
            enabled: true,
            exactCase: true,
          },
        ],
      },
    ],
  };
}

function makeTone(durationMs: number, amplitude: number): Float32Array {
  const sampleRateHz = 16_000;
  const sampleCount = Math.round((durationMs / 1_000) * sampleRateHz);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * amplitude;
  }
  return pcm;
}

function makeCtcLogitsForFrames(
  frameCount: number,
  targetTokenIds: readonly number[],
  vocabularySize: number,
  blankId: number,
): Float32Array {
  const logits = new Float32Array(frameCount * vocabularySize);
  logits.fill(-6);
  const symbols: number[] = [];
  for (const tokenId of targetTokenIds) {
    symbols.push(blankId, tokenId);
  }
  symbols.push(blankId);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const symbolIndex = Math.min(
      symbols.length - 1,
      Math.floor((frameIndex * symbols.length) / frameCount),
    );
    const tokenId = symbols[symbolIndex] ?? blankId;
    logits[frameIndex * vocabularySize + tokenId] = 6;
  }
  return logits;
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
}

function jsonBytes(value: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function readBytes(
  backend: ProfileStorageBackend,
  path: readonly string[],
): Promise<number[]> {
  const bytes = await backend.getFile(path);
  return Array.from(new Uint8Array(bytes ?? new ArrayBuffer(0)));
}

async function requiredBytes(
  backend: ProfileStorageBackend,
  path: readonly string[],
): Promise<ArrayBuffer> {
  const bytes = await backend.getFile(path);
  if (bytes === undefined) {
    throw new Error(`Missing test fixture bytes at ${path.join('/')}`);
  }
  return bytes;
}

function jsonFromBytes<T = unknown>(bytes: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function text(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.slice(start, end));
}

class FakeOpfsDirectory implements OpfsDirectoryHandleLike {
  private readonly directories = new Map<string, FakeOpfsDirectory>();
  private readonly files = new Map<string, FakeOpfsFile>();

  async getDirectoryHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsDirectoryHandleLike> {
    const existing = this.directories.get(name);
    if (existing !== undefined) return existing;
    if (options.create !== true) throw notFound();
    const directory = new FakeOpfsDirectory();
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsFileHandleLike> {
    const existing = this.files.get(name);
    if (existing !== undefined) return existing;
    if (options.create !== true) throw notFound();
    const file = new FakeOpfsFile();
    this.files.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name) || this.directories.delete(name)) return;
    throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, OpfsDirectoryHandleLike | OpfsFileHandleLike]> {
    for (const entry of this.directories.entries()) yield entry;
    for (const entry of this.files.entries()) yield entry;
  }
}

class FakeOpfsFile implements OpfsFileHandleLike {
  private bytes = new ArrayBuffer(0);

  async getFile(): Promise<Blob> {
    return new Blob([this.bytes.slice(0)]);
  }

  async createWritable(): Promise<OpfsWritableFileStreamLike> {
    return new FakeOpfsWritableFileStream((bytes) => {
      this.bytes = bytes;
    });
  }
}

class FakeOpfsWritableFileStream implements OpfsWritableFileStreamLike {
  private bytes = new ArrayBuffer(0);

  constructor(private readonly commit: (bytes: ArrayBuffer) => void) {}

  async write(data: BlobPart): Promise<void> {
    if (data instanceof ArrayBuffer) {
      this.bytes = data.slice(0);
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const output = new ArrayBuffer(data.byteLength);
      new Uint8Array(output).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.bytes = output;
      return;
    }
    if (data instanceof Blob) {
      this.bytes = await data.arrayBuffer();
      return;
    }
    this.bytes = new TextEncoder().encode(data).buffer;
  }

  async close(): Promise<void> {
    this.commit(this.bytes.slice(0));
  }
}

function notFound(): DOMException {
  return new DOMException('not found', 'NotFoundError');
}
