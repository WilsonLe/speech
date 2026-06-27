import { describe, expect, it } from 'vitest';
import type { InstalledModelRecord, ModelCatalogEntryV1 } from '@speech/model-manager';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';
import { createOfflineModelSummary, createOfflinePanelStateView } from './offline-state';

describe('offline and update state copy', () => {
  it('treats offline as normal when app and model assets are installed', () => {
    const modelSummary = createOfflineModelSummary({
      status: 'ready',
      models: [catalogEntry()],
      installed: [installedRecord()],
      progress: null,
    });
    const view = createOfflinePanelStateView({
      online: false,
      pwa: pwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
      modelSummary,
    });

    expect(view).toMatchObject({
      headline: 'Offline and ready',
      tone: 'ready',
      blocker: null,
    });
    expect(view.rows).toContainEqual({ label: 'Connection', value: 'Offline' });
    expect(view.rows).toContainEqual({ label: 'Speech model', value: '1 installed' });
    expect(JSON.stringify(view)).not.toMatch(/sha256|opfs|webgpu|wasm|provider|bytes/i);
  });

  it('warns only when required model downloads cannot be fetched', () => {
    const modelSummary = createOfflineModelSummary({
      status: 'ready',
      models: [catalogEntry(), catalogEntry({ id: 'second-public' })],
      installed: [installedRecord()],
      progress: null,
    });
    const view = createOfflinePanelStateView({
      online: false,
      pwa: pwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
      modelSummary,
    });

    expect(view.headline).toBe('Connect to finish setup');
    expect(view.tone).toBe('blocked');
    expect(view.blocker).toBe(
      'Go online, then install the speech model from Dictate or model details.',
    );
    expect(view.rows).toContainEqual({ label: 'Speech model', value: '1 needed' });
  });

  it('redacts raw app-shell errors from the simplified status', () => {
    const view = createOfflinePanelStateView({
      online: true,
      pwa: pwaSnapshot({
        registrationState: 'error',
        errorMessage: 'ServiceWorker failed at /private/cache/sw.js with stack trace',
      }),
      modelSummary: createOfflineModelSummary({
        status: 'ready',
        models: [catalogEntry()],
        installed: [installedRecord()],
        progress: null,
      }),
    });

    expect(view.headline).toBe('Offline status needs attention');
    expect(view.summary).toBe('Open details to retry model setup or review app-shell state.');
    expect(JSON.stringify(view)).not.toMatch(/ServiceWorker|private|cache|stack trace|sw\.js/);
  });

  it('moves update action copy to the app menu instead of a page-level reload button', () => {
    const view = createOfflinePanelStateView({
      online: true,
      pwa: pwaSnapshot({
        offlineReady: true,
        registrationState: 'registered',
        updateAvailable: true,
      }),
      modelSummary: createOfflineModelSummary({
        status: 'ready',
        models: [catalogEntry()],
        installed: [installedRecord()],
        progress: null,
      }),
    });

    expect(view.updateNotice).toBe(
      'An app update is ready in the menu. Install it after recording or training stops.',
    );
    expect(view.rows).toContainEqual({ label: 'Update', value: 'Ready in menu' });
  });

  it('summarizes model setup progress without file keys or model identifiers', () => {
    const view = createOfflinePanelStateView({
      online: true,
      pwa: pwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
      modelSummary: createOfflineModelSummary({
        status: 'installing',
        models: [catalogEntry()],
        installed: [],
        progress: {
          phase: 'downloading-file',
          modelId: 'private-looking-model-id',
          version: '0.5.0',
          fileKey: 'encoder.private.onnx',
        },
      }),
    });

    expect(view.headline).toBe('Model setup in progress');
    expect(view.summary).toBe('Saving the speech model for offline use.');
    expect(JSON.stringify(view)).not.toMatch(/private-looking|encoder\.private|onnx/i);
  });
});

function pwaSnapshot(patch: Partial<PwaLifecycleSnapshot> = {}): PwaLifecycleSnapshot {
  return {
    serviceWorkerSupported: true,
    registrationState: 'idle',
    offlineReady: false,
    updateAvailable: false,
    registrationScope: null,
    errorMessage: null,
    ...patch,
  };
}

function catalogEntry(patch: Partial<ModelCatalogEntryV1> = {}): ModelCatalogEntryV1 {
  return {
    id: 'public-base',
    version: '0.5.0',
    displayName: 'Public base model',
    languages: ['vi', 'en'],
    manifestUrl: '/model-packs/public-base/manifest.json',
    manifestSha256: '0'.repeat(64),
    license: { name: 'Synthetic fixture', redistributionAllowed: true },
    runtime: {
      status: 'available',
      installable: true,
      streamingReady: true,
      notes: ['Synthetic fixture.'],
    },
    ...patch,
  };
}

function installedRecord(): InstalledModelRecord {
  return {
    schemaVersion: 1,
    modelId: 'public-base',
    activeVersion: '0.5.0',
    manifest: {} as InstalledModelRecord['manifest'],
    files: [],
    requiredStorageBytes: 0,
    backendKind: 'memory',
    installId: 'install-public',
    installedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
  };
}
