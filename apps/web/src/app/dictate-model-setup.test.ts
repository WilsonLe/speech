import { describe, expect, it } from 'vitest';
import type { InstalledModelRecord, ModelCatalogV1 } from '@speech/model-manager';
import type { SpeechModelManifest } from '@speech/protocol';
import {
  formatDictateSetupProgress,
  formatDictateSetupSize,
  formatDictateSetupVersion,
  initialDictateModelSetupState,
  isDictateModelReady,
  needsDictateModelInspection,
  reduceDictateModelSetupMessage,
  startDictateModelInspection,
  startDictateModelInstall,
} from './dictate-model-setup';
import type { ManifestInspectionResult } from '../workers/model-lifecycle-client';

const catalog = {
  schemaVersion: 1,
  models: [
    {
      id: 'base-vi',
      version: '2026-06-public',
      displayName: 'Vietnamese base model',
      languages: ['vi'],
      manifestUrl: '/model-packs/base-vi/manifest.json',
      manifestSha256: '0'.repeat(64),
      license: { name: 'Apache-2.0', spdx: 'Apache-2.0', redistributionAllowed: true },
      runtime: {
        status: 'candidate',
        installable: true,
        streamingReady: true,
        notes: ['Synthetic public setup fixture.'],
      },
    },
    {
      id: 'blocked-research',
      version: 'review',
      displayName: 'Blocked research model',
      languages: ['vi'],
      license: { name: 'Other', redistributionAllowed: false },
      runtime: { status: 'blocked', installable: false, streamingReady: false, notes: [] },
    },
  ],
  note: 'test catalog',
} satisfies ModelCatalogV1;

const inspection: ManifestInspectionResult = {
  modelId: 'base-vi',
  version: '2026-06-public',
  requiredStorageBytes: 73_514_778,
  trainingCompanionRequiredStorageBytes: 0,
  manifestSha256: '0'.repeat(64),
  manifestSha256MatchesCatalog: true,
  streamingReady: true,
  fileCount: 5,
  inferenceFileCount: 5,
  trainingCompanionFileCount: 0,
};

describe('Dictate model setup state', () => {
  it('selects the first installable model and requests manifest inspection when no model is active', () => {
    const next = reduceDictateModelSetupMessage(initialDictateModelSetupState, {
      type: 'READY',
      catalog,
      backendKind: 'opfs',
      installed: [],
    });

    expect(next.status).toBe('setup-required');
    expect(next.setupModel?.id).toBe('base-vi');
    expect(needsDictateModelInspection(next)).toBe(true);
    expect(formatDictateSetupVersion(next.setupModel)).toBe('Version 2026-06-public');
    expect(formatDictateSetupSize(next.inspection)).toBe('Checking download size');
  });

  it('surfaces exact download size from the inspected manifest', () => {
    const required = reduceDictateModelSetupMessage(initialDictateModelSetupState, {
      type: 'READY',
      catalog,
      backendKind: 'opfs',
      installed: [],
    });
    const inspected = reduceDictateModelSetupMessage(required, {
      type: 'MANIFEST_READY',
      inspection,
    });

    expect(inspected.status).toBe('setup-required');
    expect(needsDictateModelInspection(inspected)).toBe(false);
    expect(formatDictateSetupSize(inspected.inspection)).toBe('70.1 MiB download');
  });

  it('formats user-facing setup progress without exposing file keys or hashes', () => {
    expect(
      formatDictateSetupProgress({
        phase: 'downloading-file',
        modelId: 'base-vi',
        version: '2026-06-public',
        fileKey: 'encoder',
        completedFiles: 0,
        totalFiles: 5,
        completedBytes: 1024,
        totalBytes: 2048,
      }),
    ).toBe('Downloading model · file 1 of 5 · 1.0 KiB of 2.0 KiB');
    expect(formatDictateSetupProgress({ phase: 'verifying-active-version' })).toBe(
      'Verifying model',
    );
    expect(formatDictateSetupProgress({ phase: 'cleaning-temporary-version' })).toBe(
      'Removing partial download',
    );
  });

  it('tracks install retry state and transitions to ready after installation completes', () => {
    const required = reduceDictateModelSetupMessage(initialDictateModelSetupState, {
      type: 'READY',
      catalog,
      backendKind: 'opfs',
      installed: [],
    });
    const installing = startDictateModelInstall(required);
    const errored = reduceDictateModelSetupMessage(installing, {
      type: 'ERROR',
      message: 'Network failed while downloading the model.',
      recoverable: true,
    });

    expect(errored.status).toBe('error');
    expect(errored.retryAction).toBe('install');

    const retrying = startDictateModelInstall(errored);
    const ready = reduceDictateModelSetupMessage(retrying, {
      type: 'INSTALL_COMPLETE',
      record: makeInstalledRecord(),
    });

    expect(isDictateModelReady(ready)).toBe(true);
    expect(ready.errorMessage).toBeNull();
    expect(ready.installedModelIds).toEqual(['base-vi']);
  });

  it('keeps Dictate setup-required when lifecycle messages affect a non-setup model', () => {
    const required = reduceDictateModelSetupMessage(initialDictateModelSetupState, {
      type: 'READY',
      catalog,
      backendKind: 'opfs',
      installed: [],
    });

    const afterOtherInstall = reduceDictateModelSetupMessage(required, {
      type: 'INSTALL_COMPLETE',
      record: makeInstalledRecord('other-base'),
    });
    expect(afterOtherInstall.status).toBe('setup-required');
    expect(afterOtherInstall.installedModelIds).toEqual(['other-base']);

    const ready = reduceDictateModelSetupMessage(afterOtherInstall, {
      type: 'INSTALL_COMPLETE',
      record: makeInstalledRecord('base-vi'),
    });
    expect(ready.status).toBe('ready');

    const afterSetupDelete = reduceDictateModelSetupMessage(ready, {
      type: 'DELETE_COMPLETE',
      modelId: 'base-vi',
    });
    expect(afterSetupDelete.status).toBe('setup-required');
    expect(afterSetupDelete.installedModelIds).toEqual(['other-base']);
  });

  it('uses inspect retry state for catalog or manifest errors', () => {
    const required = reduceDictateModelSetupMessage(initialDictateModelSetupState, {
      type: 'READY',
      catalog,
      backendKind: 'opfs',
      installed: [],
    });
    const inspecting = startDictateModelInspection(required);
    const errored = reduceDictateModelSetupMessage(inspecting, {
      type: 'ERROR',
      message: 'Fetching model manifest failed.',
      recoverable: true,
    });

    expect(errored.status).toBe('error');
    expect(errored.retryAction).toBe('inspect');
  });
});

function makeInstalledRecord(modelId = 'base-vi'): InstalledModelRecord {
  const manifest: SpeechModelManifest = {
    schemaVersion: 2,
    id: modelId,
    version: '2026-06-public',
    displayName: 'Vietnamese base model',
    languages: ['vi'],
    supportedLanguageModes: ['vi'],
    architecture: 'rnnt',
    license: { name: 'Apache-2.0', redistributionAllowed: true },
    sampleRateHz: 16_000,
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
      vocabularySize: 8,
      byteFallback: false,
      blankId: 0,
      unkId: 1,
      bosId: 2,
      eosId: 2,
      wordBoundaryMarker: '▁',
    },
    streaming: {
      chunkFrames: 64,
      chunkShiftFrames: 64,
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
      encoder: { fileKey: 'encoder', inputs: [], outputs: [] },
      predictor: { fileKey: 'predictor', inputs: [], outputs: [] },
      joiner: { fileKey: 'joiner', inputs: [], outputs: [] },
    },
    recommended: { webgpu: false, wasmThreads: 1, expectedMemoryMb: 64 },
  };
  return {
    schemaVersion: 1,
    modelId,
    activeVersion: '2026-06-public',
    manifest,
    files: [],
    requiredStorageBytes: 73_514_778,
    backendKind: 'opfs',
    installId: 'setup-test',
    installedAt: '2026-06-27T00:00:00.000Z',
    activatedAt: '2026-06-27T00:00:00.000Z',
  };
}
