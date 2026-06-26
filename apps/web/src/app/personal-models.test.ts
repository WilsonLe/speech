import { describe, expect, it } from 'vitest';
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
  buildPersonalModelProfileCard,
  defaultPersonalProfileDisplayName,
  summarizeActiveVocabulary,
} from './personal-models';
import {
  buildPersonalModelCapabilityChecks,
  buildPersonalModelReadinessTasks,
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
      label: 'vietasr-local',
      version: '2026.01',
    });
    expect(card.storage.acceptedUtterances).toBe(2);
    expect(card.storage.storedBytes).toBe(6400);
    expect(card.actions.canEnable).toBe(false);
    expect(card.actions.canExport).toBe(true);
    expect(JSON.stringify(card)).not.toContain('private prompt text');
    expect(JSON.stringify(card)).not.toContain('Secret Launch Name');
  });

  it('builds independent browser capability preflight checks from aggregate capability data', () => {
    const checks = buildPersonalModelCapabilityChecks(createCapabilityReport());

    expect(checks.map((check) => check.label)).toEqual([
      'Secure context',
      'Microphone APIs',
      'AudioWorklet capture',
      'Dedicated workers',
      'Shared memory path',
      'WASM acceleration',
      'WebGPU provider',
      'Persistent storage',
      'Cross-tab training lock',
      'Recovery storage',
    ]);
    expect(checks.every((check) => check.privacy.aggregateOnly)).toBe(true);
    expect(checks.find((check) => check.label === 'Shared memory path')?.status).toBe('fallback');
    expect(checks.find((check) => check.label === 'Cross-tab training lock')?.status).toBe(
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
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    capabilities: {
      secureContext: true,
      mediaDevices: true,
      audioWorklet: true,
      webWorkers: true,
      sharedArrayBuffer: false,
      crossOriginIsolated: false,
      webAssemblySimd: true,
      webAssemblyThreads: false,
      webGpu: false,
      persistentStorage: true,
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
      webLocks: false,
      broadcastChannel: true,
      localStorage: true,
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
