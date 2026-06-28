import { describe, expect, it } from 'vitest';
import type { CapabilityReport } from '../capabilities';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';
import {
  buildDiagnosticsScreenSummary,
  buildSupportBundlePayload,
  createEmptyModelDiagnosticsSummary,
  createEmptyProfileDiagnosticsSummary,
  createVocabularyDiagnosticsSummary,
} from './diagnostics-screen';

const generatedAt = '2026-06-27T12:00:00.000Z';

const pwa: PwaLifecycleSnapshot = {
  serviceWorkerSupported: true,
  registrationState: 'registered',
  offlineReady: true,
  updateAvailable: false,
  registrationScope: 'https://example.test/',
  errorMessage: null,
};

const capabilityReport: CapabilityReport = {
  generatedAt,
  recommendedProvider: 'wasm',
  storage: {
    quotaBytes: 10 * 1024 * 1024,
    usageBytes: 1024,
    persisted: true,
    persistenceRequestAvailable: true,
  },
  webGpu: {
    adapterAvailable: false,
    deviceAvailable: false,
  },
  workerBenchmark: {
    supported: true,
    iterations: 3,
    medianRoundTripMs: 1.2,
    minRoundTripMs: 1.1,
    maxRoundTripMs: 1.4,
  },
  browserTraining: {
    webLocks: true,
    broadcastChannel: true,
    localStorage: true,
  },
  capabilities: {
    secureContext: true,
    crossOriginIsolated: true,
    sharedArrayBuffer: true,
    audioWorklet: true,
    webWorkers: true,
    webAssemblySimd: true,
    webAssemblyThreads: true,
    webGpu: false,
    mediaDevices: true,
    persistentStorage: true,
    selectedTier: 'B',
  },
  warnings: [
    'Recoverable warning for profile-demo at /tmp/private/path with deadbeefdeadbeefdeadbeefdeadbeef'.repeat(
      2,
    ),
  ],
};

describe('diagnostics-screen helpers', () => {
  it('builds all required aggregate sections without private payloads', () => {
    const summary = buildDiagnosticsScreenSummary({
      generatedAt,
      capabilityReport,
      pwa,
      modelSummary: {
        status: 'ready',
        installedModelCount: 1,
        installableModelCount: 2,
        backendKind: 'opfs',
      },
      profileSummary: {
        status: 'ready',
        profileCount: 2,
        acceptedRecordingCount: 24,
        trainingJobBytes: 4096,
        browserTrainingRecoveryBytes: 128,
      },
      vocabularySummary: {
        status: 'ready',
        setCount: 3,
        enabledSetCount: 2,
        wordCount: 42,
      },
    });

    expect(summary.sections.map((section) => section.id)).toEqual([
      'browser-capabilities',
      'audio',
      'inference',
      'model-tokenizer',
      'vocabulary',
      'enrollment-training',
      'storage',
      'recent-errors',
    ]);
    expect(summary.privacy).toMatchObject({
      aggregateOnly: true,
      containsAudio: false,
      containsTranscriptText: false,
      containsVocabularyTerms: false,
      containsProfileIds: false,
      containsStoragePaths: false,
      networkUpload: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(/profile-demo|\/tmp\/private|deadbeef/i);
  });

  it('summarizes vocabulary stores without exposing words', () => {
    const summary = createVocabularyDiagnosticsSummary({
      schemaVersion: 1,
      revision: 7,
      activeSetIds: ['work'],
      updatedAt: generatedAt,
      sets: [
        {
          schemaVersion: 1,
          id: 'work',
          displayName: 'Work',
          enabled: true,
          revision: 1,
          entries: [
            {
              id: 'term-1',
              phrase: 'private term',
              displayForm: 'private term',
              language: 'en',
              weight: 5,
              spokenAliases: [],
              category: 'test',
              enabled: true,
              exactCase: false,
              promptPriority: 1,
            },
          ],
          createdAt: generatedAt,
          updatedAt: generatedAt,
          source: 'manual',
        },
      ],
    });

    expect(summary).toEqual({ status: 'ready', setCount: 1, enabledSetCount: 1, wordCount: 1 });
    expect(JSON.stringify(summary)).not.toContain('private term');
  });

  it('creates a redacted support bundle payload shape for copy/download previews', () => {
    const summary = buildDiagnosticsScreenSummary({
      generatedAt,
      capabilityReport: null,
      pwa,
      modelSummary: createEmptyModelDiagnosticsSummary(),
      profileSummary: createEmptyProfileDiagnosticsSummary(),
      vocabularySummary: createVocabularyDiagnosticsSummary(null),
    });
    const bundle = buildSupportBundlePayload(summary);

    expect(bundle).toMatchObject({
      schemaVersion: 1,
      reportType: 'speech-support-bundle',
      generatedAt,
      privacy: summary.privacy,
    });
    expect(JSON.stringify(bundle)).toContain('No audio, transcript text, vocabulary terms');
  });
});
