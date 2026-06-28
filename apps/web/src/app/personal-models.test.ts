import { describe, expect, it } from 'vitest';
import type { PersonalModelActivationDecisionV1 } from '@speech/personalization';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileSummaryV1,
} from '@speech/profile-manager';
import type { InstalledModelRecord } from '@speech/model-manager';
import type { TrainingReadinessCoverageReportV1 } from '@speech/enrollment';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';
import type { CapabilityReport } from '../capabilities';
import type {
  ManifestInspectionResult,
  ModelLifecycleModel,
} from '../workers/model-lifecycle-client';
import {
  buildPersonalModelActivationReviewCard,
  buildPersonalModelDetailSummary,
  buildPersonalModelListRow,
  buildPersonalModelProfileCard,
  buildPersonalModelResultView,
  defaultPersonalProfileDisplayName,
  summarizeActiveVocabulary,
} from './personal-models';
import {
  buildPersonalModelCapabilityChecks,
  buildPersonalModelReadinessTasks,
  buildPersonalModelTrainingReadinessView,
  summarizePersonalModelTrainingCompanion,
} from './personal-models-preflight';

describe('personal model card summaries', () => {
  it('summarizes active vocabulary without exposing terms or entry ids', () => {
    const summary = summarizeActiveVocabulary(createVocabularySnapshot());

    expect(summary.activeSetCount).toBe(1);
    expect(summary.activeEntryCount).toBe(1);
    expect(summary.enabledEntryCount).toBe(2);
    expect(summary.totalEntryCount).toBe(3);
    expect(summary.privacy.containsVocabularyTerms).toBe(false);
    expect(summary.privacy.containsVocabularyEntryIds).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('Secret Launch Name');
    expect(JSON.stringify(summary)).not.toContain('term-secret');
  });

  it('builds a generic fallback card when no local profile is stored', () => {
    const card = buildPersonalModelProfileCard({
      summary: null,
      activeState: null,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });

    expect(card.displayName).toBe(defaultPersonalProfileDisplayName);
    expect(card.status).toBe('no-profile');
    expect(card.baseModel.status).toBe('generic-fallback');
    expect(card.actions.canImport).toBe(true);
    expect(card.actions.canExport).toBe(false);
    expect(card.privacy.containsRawAudio).toBe(false);
    expect(card.privacy.containsPrivateVocabularyTerms).toBe(false);
  });

  it('builds an active exact-bound profile card without transcript text or raw vocabulary terms', () => {
    const profileSummary = createProfileSummary();
    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const card = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });

    expect(card.status).toBe('active');
    expect(card.active).toBe(true);
    expect(card.baseModel).toEqual({
      status: 'exact-bound',
      label: 'Exact speech model',
      version: '2026.01',
    });
    expect(card.storage.acceptedUtterances).toBe(2);
    expect(card.storage.storedBytes).toBe(6400);
    expect(card.actions.canEnable).toBe(false);
    expect(card.actions.canExport).toBe(true);
    expect(JSON.stringify(card)).not.toContain('private prompt text');
    expect(JSON.stringify(card)).not.toContain('Secret Launch Name');
    expect(JSON.stringify(card)).not.toContain('vietasr-local');
  });

  it('builds compact list row labels without exposing model ids, hashes, paths, or terms', () => {
    const profileSummary = createProfileSummary();
    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const activeRow = buildPersonalModelListRow(
      buildPersonalModelProfileCard({
        summary: profileSummary,
        activeState,
        activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
      }),
    );
    expect(activeRow).toMatchObject({
      activeLabel: 'Active',
      statusLabel: 'Ready',
      primaryAction: 'use-model',
      primaryActionLabel: 'Using model',
      primaryActionDisabled: true,
    });

    const fallbackRow = buildPersonalModelListRow(
      buildPersonalModelProfileCard({
        summary: null,
        activeState: null,
        activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
      }),
    );
    expect(fallbackRow).toMatchObject({
      activeLabel: 'Generic',
      statusLabel: 'Recording needed',
      primaryAction: 'continue-recording',
      primaryActionLabel: 'Continue recording',
      primaryActionDisabled: false,
    });
    expect(activeRow.privacy.containsModelIds).toBe(false);
    expect(activeRow.privacy.containsHashes).toBe(false);
    expect(activeRow.privacy.containsStoragePaths).toBe(false);
    expect(JSON.stringify(activeRow)).not.toContain(profileSummary.profile.id);
    expect(JSON.stringify(activeRow)).not.toContain('manifest-sha');
    expect(JSON.stringify(activeRow)).not.toContain('Secret Launch Name');
  });

  it('builds model detail summaries with one next action and aggregate-only privacy', () => {
    const profileSummary = createProfileSummary();
    const inactiveState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: 'generic-fallback',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const inactiveCard = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState: inactiveState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });
    const inactiveDetail = buildPersonalModelDetailSummary({
      card: inactiveCard,
      row: buildPersonalModelListRow(inactiveCard),
    });
    expect(inactiveDetail).toMatchObject({
      displayName: 'Local enrollment profile',
      statusLabel: 'Draft',
      primaryAction: 'use-model',
      primaryActionLabel: 'Use model',
      primaryActionDisabled: false,
      lastUpdatedIso: '2026-01-02T00:00:00.000Z',
    });

    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const activeCard = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });
    const activeDetail = buildPersonalModelDetailSummary({
      card: activeCard,
      row: buildPersonalModelListRow(activeCard),
    });
    expect(activeDetail.primaryAction).toBe('deactivate');
    expect(activeDetail.statusLabel).toBe('Active');

    const fallbackCard = buildPersonalModelProfileCard({
      summary: null,
      activeState: null,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });
    const fallbackDetail = buildPersonalModelDetailSummary({
      card: fallbackCard,
      row: buildPersonalModelListRow(fallbackCard),
    });
    expect(fallbackDetail).toMatchObject({
      statusLabel: 'Generic fallback',
      primaryAction: 'continue-recording',
      lastUpdatedIso: null,
    });
    expect(inactiveDetail.privacy.containsModelIds).toBe(false);
    expect(JSON.stringify([inactiveDetail, activeDetail, fallbackDetail])).not.toContain(
      profileSummary.profile.id,
    );
    expect(JSON.stringify([inactiveDetail, activeDetail, fallbackDetail])).not.toContain(
      'manifest-sha',
    );
  });

  it('builds activation review cards without exposing profile ids or private terms', () => {
    const profileSummary = createProfileSummary();
    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: 'previous-profile',
      previousProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const card = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });

    const awaiting = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: null,
    });
    expect(awaiting.status).toBe('awaiting-evaluation');
    expect(awaiting.activationAllowed).toBe(false);
    expect(awaiting.rollback.previousProfileAvailable).toBe(true);

    const automatic = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: createActivationDecision({ status: 'automatic-activation-allowed' }),
    });
    expect(automatic.status).toBe('automatic-ready');
    expect(automatic.activationAllowed).toBe(true);
    expect(automatic.comparison.personalHeldoutCases).toBe(4);
    expect(automatic.comparison.candidateAdapterSizeBytes).toBe(4096);

    const override = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: createActivationDecision({
        status: 'advanced-override-required',
        activationAllowed: false,
        automaticActivationAllowed: false,
        advancedOverrideAvailable: true,
        advancedOverrideRequired: true,
        softGatePassed: false,
      }),
    });
    expect(override.status).toBe('advanced-override-required');
    expect(override.advancedOverrideAvailable).toBe(true);

    const blocked = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: createActivationDecision({
        status: 'blocked-by-hard-gates',
        activationAllowed: false,
        automaticActivationAllowed: false,
        hardGatePassed: false,
      }),
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.hardGatePassed).toBe(false);
    expect(JSON.stringify([awaiting, automatic, override, blocked])).not.toContain(
      profileSummary.profile.id,
    );
    expect(JSON.stringify([awaiting, automatic, override, blocked])).not.toContain(
      'Secret Launch Name',
    );
  });

  it('builds outcome-first candidate result views with grouped metrics and gate summaries', () => {
    const profileSummary = createProfileSummary();
    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: 'previous-profile',
      previousProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const card = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });
    const readyReview = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: createActivationDecision({ status: 'automatic-activation-allowed' }),
    });

    const ready = buildPersonalModelResultView({
      review: readyReview,
      recordingHref: '/models/local/enroll',
      trainingHref: '/models/local/train',
    });

    expect(ready).toMatchObject({
      status: 'ready',
      title: 'Ready to use',
      primaryAction: { kind: 'use-model', label: 'Use model', disabled: false },
    });
    expect(ready.metricGroups.map((group) => group.title)).toEqual([
      'Personal speech',
      'Languages',
      'Voice levels',
      'Vocabulary',
      'General speech',
      'Performance',
    ]);
    expect(ready.gateGroups.hard.every((gate) => gate.severity === 'hard')).toBe(true);
    expect(ready.gateGroups.advisory.every((gate) => gate.severity === 'advisory')).toBe(true);
    expect(ready.rollback.previousProfileAvailable).toBe(true);
    expect(JSON.stringify(ready)).not.toContain(profileSummary.profile.id);
    expect(JSON.stringify(ready)).not.toContain('Secret Launch Name');
    expect(JSON.stringify(ready)).not.toContain('sha256');

    const blockedReview = buildPersonalModelActivationReviewCard({
      profileCard: card,
      activeState,
      activationDecision: createActivationDecision({
        status: 'blocked-by-hard-gates',
        activationAllowed: false,
        automaticActivationAllowed: false,
        hardGatePassed: false,
      }),
    });
    const blocked = buildPersonalModelResultView({
      review: blockedReview,
      recordingHref: '/models/local/enroll',
      trainingHref: '/models/local/train',
    });
    expect(blocked).toMatchObject({
      status: 'blocked',
      title: 'More recordings needed',
      primaryAction: { kind: 'record-more', label: 'Record more', href: '/models/local/enroll' },
    });

    const awaiting = buildPersonalModelResultView({
      review: buildPersonalModelActivationReviewCard({
        profileCard: card,
        activeState,
        activationDecision: null,
      }),
      recordingHref: '/models/local/enroll',
      trainingHref: '/models/local/train',
    });
    expect(awaiting).toMatchObject({
      status: 'not-ready',
      primaryAction: { kind: 'train-model', href: '/models/local/train' },
    });
  });

  it('builds independent browser capability preflight checks from aggregate capability data', () => {
    const checks = buildPersonalModelCapabilityChecks(createCapabilityReport());

    expect(checks.map((check) => check.label)).toEqual([
      'Secure context',
      'Microphone APIs',
      'AudioWorklet capture',
      'Background work',
      'Fast data path',
      'Local processing support',
      'Advanced processing mode',
      'Persistent storage',
      'One trainer at a time',
      'Recovery storage',
    ]);
    expect(checks.every((check) => check.privacy.aggregateOnly)).toBe(true);
    expect(checks.find((check) => check.label === 'Fast data path')?.status).toBe('fallback');
    expect(checks.find((check) => check.label === 'One trainer at a time')?.status).toBe(
      'fallback',
    );
    expect(JSON.stringify(checks)).not.toContain('Secret Launch Name');
  });

  it('summarizes training companion state without exposing private profile data', () => {
    const companion = summarizePersonalModelTrainingCompanion({
      models: [createLifecycleModel()],
      installed: [],
      inspections: {
        'vietasr-local': createManifestInspection({ trainingCompanionFileCount: 3 }),
      },
      preferredModelId: 'vietasr-local',
    });

    expect(companion.status).toBe('base-model-missing');
    expect(companion.requiredFileCount).toBe(3);
    expect(companion.requiredStorageBytes).toBe(12_288);
    expect(companion.privacy.containsRawAudio).toBe(false);
    expect(JSON.stringify(companion)).not.toContain('local-enrollment-profile');
    expect(JSON.stringify(companion)).not.toContain('vietasr-local');
  });

  it('reports installed training companions from active model records', () => {
    const companion = summarizePersonalModelTrainingCompanion({
      models: [createLifecycleModel()],
      installed: [createInstalledModelRecord()],
      inspections: {},
      preferredModelId: 'vietasr-local',
    });

    expect(companion.status).toBe('installed');
    expect(companion.installedFileCount).toBe(2);
    expect(companion.requiredStorageBytes).toBe(1024);
    expect(JSON.stringify(companion)).not.toContain('vietasr-local');
  });

  it('summarizes missing recording tasks with redacted requirement labels', () => {
    const tasks = buildPersonalModelReadinessTasks(createReadinessReport());

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      label: 'Accepted utterances',
      status: 'missing',
      actual: 2,
      required: 24,
      missing: 22,
    });
    expect(tasks.every((task) => task.privacy.exposesRawPromptIds === false)).toBe(true);
    expect(JSON.stringify(tasks)).not.toContain('prompt-secret');
    expect(JSON.stringify(tasks)).not.toContain('term-secret');
  });

  it('builds a blocker-first training readiness view when recordings are missing', () => {
    const report = createReadinessReport();
    const card = buildPersonalModelProfileCard({
      summary: createProfileSummary(),
      activeState: null,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });
    const view = buildPersonalModelTrainingReadinessView({
      card,
      readinessReport: report,
      readinessTasks: buildPersonalModelReadinessTasks(report),
      capabilityChecks: buildPersonalModelCapabilityChecks(createCapabilityReport()),
      trainingCompanion: summarizePersonalModelTrainingCompanion({
        models: [createLifecycleModel()],
        installed: [createInstalledModelRecord()],
        inspections: {},
        preferredModelId: 'vietasr-local',
      }),
      recordingHref: '/models/local-enrollment-profile/enroll',
      trainingHref: '/models/local-enrollment-profile/train',
    });

    expect(view.status).toBe('blocked');
    expect(view.title).toBe('Continue recording');
    expect(view.primaryAction).toMatchObject({
      kind: 'continue-recording',
      label: 'Continue recording',
      disabled: false,
    });
    expect(view.blockers[0]).toMatchObject({
      id: 'recordings',
      label: 'More recordings needed',
    });
    expect(view.recording.acceptedCount).toBe(2);
    expect(view.storage).toMatchObject({ requiredFreeBytes: 0, label: '0 B needed' });
    expect(view.privacy.aggregateOnly).toBe(true);
    expect(JSON.stringify(view)).not.toContain('prompt-secret');
    expect(JSON.stringify(view)).not.toContain('vietasr-local');
  });

  it('marks readiness ready only when recordings, browser support, and support files pass', () => {
    const report = createReadyReadinessReport();
    const view = buildPersonalModelTrainingReadinessView({
      card: buildPersonalModelProfileCard({
        summary: createProfileSummary(),
        activeState: null,
        activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
      }),
      readinessReport: report,
      readinessTasks: buildPersonalModelReadinessTasks(report),
      capabilityChecks: buildPersonalModelCapabilityChecks(createFullySupportedCapabilityReport()),
      trainingCompanion: summarizePersonalModelTrainingCompanion({
        models: [createLifecycleModel()],
        installed: [createInstalledModelRecord()],
        inspections: {},
        preferredModelId: 'vietasr-local',
      }),
      recordingHref: '/models/local-enrollment-profile/enroll',
      trainingHref: '/models/local-enrollment-profile/train',
    });

    expect(view).toMatchObject({
      status: 'ready',
      title: 'Ready to train',
      primaryAction: { kind: 'train', label: 'Train model', disabled: false },
      browserSupport: { label: 'Ready', status: 'ready' },
      trainingSupport: { label: 'Ready', status: 'ready' },
    });
    expect(view.blockers).toHaveLength(0);
    expect(view.details.passedCheckCount).toBeGreaterThan(0);
  });

  it('keeps browser and training-support gates visible without exposing raw model ids', () => {
    const report = createReadyReadinessReport();
    const capabilityReport = createFullySupportedCapabilityReport({ persistentStorage: false });
    const view = buildPersonalModelTrainingReadinessView({
      card: buildPersonalModelProfileCard({
        summary: createProfileSummary(),
        activeState: null,
        activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
      }),
      readinessReport: report,
      readinessTasks: buildPersonalModelReadinessTasks(report),
      capabilityChecks: buildPersonalModelCapabilityChecks(capabilityReport),
      trainingCompanion: summarizePersonalModelTrainingCompanion({
        models: [createLifecycleModel()],
        installed: [],
        inspections: {
          'vietasr-local': createManifestInspection({ trainingCompanionFileCount: 2 }),
        },
        preferredModelId: 'vietasr-local',
      }),
      recordingHref: '/models/local-enrollment-profile/enroll',
      trainingHref: '/models/local-enrollment-profile/train',
    });

    expect(view.status).toBe('blocked');
    expect(view.primaryAction).toMatchObject({ kind: 'train', disabled: true });
    expect(view.blockers.map((blocker) => blocker.id)).toEqual([
      'training-support',
      'browser-support',
    ]);
    expect(view.browserSupport.label).toBe('Needs attention');
    expect(view.trainingSupport.label).toBe('Speech model required');
    expect(view.storage.label).toBe('Install the speech model first');
    expect(JSON.stringify(view)).not.toContain('vietasr-local');
    expect(JSON.stringify(view)).not.toContain('manifest-sha');
  });
});

function createVocabularySnapshot(): VocabularyStoreSnapshotV1 {
  return {
    schemaVersion: 1,
    revision: 7,
    activeSetIds: ['set-private'],
    updatedAt: '2026-01-01T00:00:00.000Z',
    sets: [
      {
        schemaVersion: 1,
        id: 'set-private',
        displayName: 'Private Work Terms',
        enabled: true,
        revision: 3,
        entries: [
          {
            id: 'term-secret',
            phrase: 'Secret Launch Name',
            displayForm: 'Secret Launch Name',
            language: 'en',
            spokenAliases: ['secret launch'],
            weight: 7,
            enabled: true,
            exactCase: true,
          },
          {
            id: 'term-disabled',
            phrase: 'Disabled Secret',
            displayForm: 'Disabled Secret',
            language: 'en',
            spokenAliases: [],
            weight: 4,
            enabled: false,
            exactCase: false,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'manual',
      },
      {
        schemaVersion: 1,
        id: 'set-inactive',
        displayName: 'Inactive Terms',
        enabled: false,
        revision: 1,
        entries: [
          {
            id: 'term-inactive',
            phrase: 'Inactive Secret',
            displayForm: 'Inactive Secret',
            language: 'en',
            spokenAliases: [],
            weight: 4,
            enabled: true,
            exactCase: false,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'manual',
      },
    ],
  };
}

function createCapabilityReport(): CapabilityReport {
  return createFullySupportedCapabilityReport({
    sharedArrayBuffer: false,
    crossOriginIsolated: false,
    webGpu: false,
    webLocks: false,
    webAssemblyThreads: false,
  });
}

function createFullySupportedCapabilityReport(
  overrides: Partial<CapabilityReport['capabilities']> &
    Partial<CapabilityReport['browserTraining']> = {},
): CapabilityReport {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    capabilities: {
      secureContext: overrides.secureContext ?? true,
      mediaDevices: overrides.mediaDevices ?? true,
      audioWorklet: overrides.audioWorklet ?? true,
      webWorkers: overrides.webWorkers ?? true,
      sharedArrayBuffer: overrides.sharedArrayBuffer ?? true,
      crossOriginIsolated: overrides.crossOriginIsolated ?? true,
      webAssemblySimd: overrides.webAssemblySimd ?? true,
      webAssemblyThreads: overrides.webAssemblyThreads ?? true,
      webGpu: overrides.webGpu ?? true,
      persistentStorage: overrides.persistentStorage ?? true,
      selectedTier: 'C',
    },
    recommendedProvider: 'wasm',
    storage: {
      persisted: true,
      persistenceRequestAvailable: true,
      quotaBytes: 1024 * 1024,
      usageBytes: 2048,
    },
    webGpu: { adapterAvailable: false, deviceAvailable: false },
    workerBenchmark: {
      supported: true,
      iterations: 5,
      medianRoundTripMs: 1.25,
      minRoundTripMs: 1,
      maxRoundTripMs: 2,
    },
    browserTraining: {
      webLocks: overrides.webLocks ?? true,
      broadcastChannel: overrides.broadcastChannel ?? true,
      localStorage: overrides.localStorage ?? true,
    },
    warnings: [],
  };
}

function createLifecycleModel(): ModelLifecycleModel {
  return {
    id: 'vietasr-local',
    version: '2026.01',
    displayName: 'VietASR local public model',
    languages: ['vi'],
    manifestUrl: '/model-packs/local/manifest.json',
    manifestSha256: 'manifest-sha',
    license: {
      spdx: 'Apache-2.0',
      name: 'Apache-2.0',
      redistributionAllowed: true,
    },
    runtime: {
      status: 'candidate',
      installable: true,
      streamingReady: true,
      notes: [],
    },
  };
}

function createManifestInspection(
  overrides: Partial<ManifestInspectionResult> = {},
): ManifestInspectionResult {
  return {
    modelId: 'vietasr-local',
    version: '2026.01',
    requiredStorageBytes: 4096,
    trainingCompanionRequiredStorageBytes: 12_288,
    manifestSha256: 'manifest-sha',
    manifestSha256MatchesCatalog: true,
    streamingReady: true,
    fileCount: 5,
    inferenceFileCount: 5,
    trainingCompanionFileCount: 0,
    ...overrides,
  };
}

function createGraphContract(fileKey: string) {
  return {
    fileKey,
    inputs: [
      {
        name: `${fileKey}_input`,
        dataType: 'float32' as const,
        shape: ['N', 1],
        description: 'synthetic input',
      },
    ],
    outputs: [
      {
        name: `${fileKey}_output`,
        dataType: 'float32' as const,
        shape: ['N', 1],
        description: 'synthetic output',
      },
    ],
  };
}

function createInstalledModelRecord(): InstalledModelRecord {
  return {
    schemaVersion: 1,
    modelId: 'vietasr-local',
    activeVersion: '2026.01',
    manifest: {
      schemaVersion: 2,
      id: 'vietasr-local',
      version: '2026.01',
      displayName: 'VietASR local public model',
      languages: ['vi'],
      supportedLanguageModes: ['vi'],
      architecture: 'rnnt',
      license: { spdx: 'Apache-2.0', name: 'Apache-2.0', redistributionAllowed: true },
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
      tokenizer: {
        type: 'sentencepiece',
        vocabularySize: 16,
        byteFallback: false,
        blankId: 0,
        unkId: 1,
        bosId: 2,
        eosId: 3,
        wordBoundaryMarker: '▁',
      },
      streaming: {
        chunkFrames: 16,
        chunkShiftFrames: 16,
        rightContextFrames: 0,
        maxSymbolsPerFrame: 4,
      },
      contextBiasing: {
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
      },
      files: {},
      graphs: {
        encoder: createGraphContract('encoder'),
        predictor: createGraphContract('predictor'),
        joiner: createGraphContract('joiner'),
      },
      recommended: { webgpu: false, wasmThreads: 1, expectedMemoryMb: 16 },
    },
    files: [],
    requiredStorageBytes: 0,
    backendKind: 'opfs',
    installId: 'install-public',
    installedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
    trainingCompanion: {
      contractVersion: 1,
      files: [
        {
          fileKey: 'training-model',
          sha256: 'sha-training',
          sizeBytes: 512,
          mediaType: 'application/json',
        },
        {
          fileKey: 'anchor-pack',
          sha256: 'sha-anchor',
          sizeBytes: 512,
          mediaType: 'application/json',
        },
      ],
      requiredStorageBytes: 1024,
      installId: 'companion-public',
      installedAt: '2026-01-01T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createReadinessReport(): TrainingReadinessCoverageReportV1 {
  return {
    schemaVersion: 1,
    status: 'needs-more-data',
    automaticTrainingAllowed: false,
    policy: {
      schemaVersion: 1,
      policyId: 'readiness-test',
      displayName: 'Readiness test',
      minAcceptedUtterances: 24,
      minTotalDurationSeconds: 120,
      minUniquePromptIdentities: 12,
      languageTargets: [],
      voiceConditionTargets: [],
      vocabulary: { minCoveredEntries: 0, requiredEntryCount: 0 },
    },
    totals: {
      acceptedUtterances: 2,
      totalDurationSeconds: 6.5,
      uniquePromptIdentities: 2,
      qualityStatusCounts: { pass: 2 },
    },
    languageCoverage: [],
    voiceConditionCoverage: [],
    promptCoverage: {
      uniquePromptIdentities: 2,
      minUniquePromptIdentities: 12,
      missingPromptIdentities: 10,
      promptIdentities: [
        {
          label: 'prompt 1',
          utterances: 1,
          durationSeconds: 3,
          languages: ['en'],
          voiceConditions: ['normal'],
        },
      ],
    },
    vocabularyCoverage: {
      coveredEntryCount: 0,
      targetedEntryCount: 0,
      minCoveredEntries: 0,
      missingCoveredEntries: 0,
      entries: [],
    },
    requirements: [],
    missingRequirements: [
      {
        code: 'accepted-utterances',
        status: 'missing',
        label: 'Accepted utterances',
        actual: 2,
        required: 24,
        missing: 22,
      },
      {
        code: 'unique-prompt-identities',
        status: 'missing',
        label: 'Unique prompt identities',
        actual: 2,
        required: 12,
        missing: 10,
      },
    ],
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      containsPrivateVocabularyTerms: false,
      exposesRawPromptIds: false,
      exposesRawVocabularyEntryIds: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}

function createReadyReadinessReport(): TrainingReadinessCoverageReportV1 {
  const report = createReadinessReport();
  return {
    ...report,
    status: 'ready',
    automaticTrainingAllowed: true,
    totals: {
      acceptedUtterances: 24,
      totalDurationSeconds: 125,
      uniquePromptIdentities: 12,
      qualityStatusCounts: { pass: 24 },
    },
    promptCoverage: {
      ...report.promptCoverage,
      uniquePromptIdentities: 12,
      missingPromptIdentities: 0,
    },
    requirements: [
      {
        code: 'accepted-utterances',
        status: 'pass',
        label: 'Accepted utterances',
        actual: 24,
        required: 24,
        missing: 0,
      },
    ],
    missingRequirements: [],
  };
}

function createActivationDecision(
  overrides: Partial<PersonalModelActivationDecisionV1> = {},
): PersonalModelActivationDecisionV1 {
  return {
    schemaVersion: 1,
    decisionType: 'personal-model-activation-decision',
    generatedAt: '2026-01-01T00:00:00.000Z',
    status: 'automatic-activation-allowed',
    activationAllowed: true,
    automaticActivationAllowed: true,
    advancedOverrideAvailable: false,
    advancedOverrideRequired: false,
    advancedOverrideAccepted: false,
    hardGatePassed: true,
    softGatePassed: true,
    comparison: {
      evaluationId: 'eval-redacted',
      profileFingerprint: 'redacted-fnv1a32:12345678',
      candidateAdapterSizeBytes: 4096,
      candidateAdapterSha256: 'a'.repeat(64),
      personalHeldout: {
        caseCount: 4,
        selectedVocabularyEntryCount: 2,
        selectedVocabularyCaseCount: 2,
        candidateVsGenericWerRelativeImprovement: 0.25,
        candidateVsGenericCerRelativeImprovement: 0.2,
        candidateVsGenericCustomTermRecallDelta: 0.3,
        candidateVsP1WerDelta: 0.01,
      },
      anchor: {
        caseCount: 3,
        candidateVsGenericWerDelta: 0,
        candidateVsGenericCerDelta: 0,
        candidateVsGenericFalseInsertionPer100Delta: 0,
      },
      overall: {
        caseCount: 7,
        rtfOverheadRatioVsP1: 0.05,
        candidateVsGenericFalseInsertionPer100Delta: 0,
      },
    },
    gates: [],
    hardGates: [],
    softGates: [],
    reasons: [],
    actions: {
      activationSwap: 'utterance-boundary',
      retainPreviousAdapter: true,
      rollbackAvailable: true,
      genericFallbackAvailable: true,
      overrideRequiresExplicitAdvancedAction: true,
    },
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
      networkUpload: false,
      localOnly: true,
    },
    ...overrides,
  };
}

function createProfileSummary(): EnrollmentProfileSummaryV1 {
  return {
    profile: {
      schemaVersion: 1,
      id: 'local-enrollment-profile',
      displayName: 'Local enrollment profile',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      baseModel: {
        id: 'vietasr-local',
        version: '2026.01',
        manifestSha256: 'manifest-sha',
        graphContractSha256: 'graph-sha',
      },
      enrollment: {
        acceptedUtterances: 2,
        acceptedSeconds: 6.5,
        languageCounts: { vi: 1, en: 1, mixed: 0 },
        voiceConditionCounts: { whisper: 0, normal: 2, projected: 0 },
        sentenceBankVersion: 'synthetic-v1',
      },
      privacy: {
        containsRawAudio: true,
        exportEncrypted: false,
        localOnly: true,
      },
    },
    utterances: [],
    checksums: {
      schemaVersion: 1,
      profileId: 'local-enrollment-profile',
      updatedAt: '2026-01-02T00:00:00.000Z',
      files: {
        'profiles/local-enrollment-profile/profile.json': { sha256: 'profile', sizeBytes: 1400 },
        'profiles/local-enrollment-profile/recordings/take-1.wav': {
          sha256: 'audio-1',
          sizeBytes: 5000,
        },
      },
    },
  };
}
