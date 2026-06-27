import { describe, expect, it } from 'vitest';
import {
  appMenuDestinations,
  createAppShellLocalStatusView,
  createModelLifecycleErrorSummary,
  createModelLifecycleSummary,
  loadingModelLifecycleSummary,
} from './appShellStatus';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';
import type { InstalledModelRecord, ModelCatalogEntryV1 } from '@speech/model-manager';

describe('app shell local status', () => {
  it('reports a compact ready state without hashes, storage totals, or provider details', () => {
    const status = createAppShellLocalStatusView({
      online: true,
      pwa: createPwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
      modelLifecycle: createModelLifecycleSummary(
        [createCatalogEntry()],
        [createInstalledRecord()],
      ),
    });

    expect(status).toMatchObject({
      label: 'Ready',
      tone: 'ready',
      headline: 'Ready for local work',
      privacyNote: 'Audio, vocabulary, and personal models stay in this browser.',
    });
    expect(status.rows).toContainEqual({ label: 'Network', value: 'Online' });
    expect(status.rows).toContainEqual({ label: 'Offline app', value: 'Ready' });
    expect(status.rows).toContainEqual({ label: 'Model downloads', value: '1 installed' });
    expect(JSON.stringify(status)).not.toMatch(/sha256|webgpu|wasm|opfs|bytes|provider/i);
  });

  it('surfaces required model downloads as setup without exposing model identities', () => {
    const status = createAppShellLocalStatusView({
      online: true,
      pwa: createPwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
      modelLifecycle: createModelLifecycleSummary(
        [createCatalogEntry(), createCatalogEntry({ id: 'candidate-public' })],
        [createInstalledRecord()],
      ),
    });

    expect(status.label).toBe('Setup');
    expect(status.rows).toContainEqual({ label: 'Model downloads', value: '1 required' });
    expect(status.ariaLabel).toContain('1 required');
    expect(JSON.stringify(status)).not.toContain('candidate-public');
  });

  it('prioritizes update, offline, loading, and error states with aggregate copy', () => {
    expect(
      createAppShellLocalStatusView({
        online: true,
        pwa: createPwaSnapshot({ updateAvailable: true }),
        modelLifecycle: loadingModelLifecycleSummary,
      }).label,
    ).toBe('Update');

    expect(
      createAppShellLocalStatusView({
        online: false,
        pwa: createPwaSnapshot({ offlineReady: true, registrationState: 'registered' }),
        modelLifecycle: createModelLifecycleSummary(
          [createCatalogEntry()],
          [createInstalledRecord()],
        ),
      }).label,
    ).toBe('Offline');

    const loading = createAppShellLocalStatusView({
      online: true,
      pwa: createPwaSnapshot(),
      modelLifecycle: loadingModelLifecycleSummary,
    });
    expect(loading.label).toBe('Check');
    expect(loading.rows).toContainEqual({ label: 'Model downloads', value: 'Checking' });

    const errored = createAppShellLocalStatusView({
      online: true,
      pwa: createPwaSnapshot({ registrationState: 'error' }),
      modelLifecycle: createModelLifecycleErrorSummary(),
    });
    expect(errored.label).toBe('Check');
    expect(JSON.stringify(errored)).not.toMatch(/error message|stack|http/i);
  });

  it('keeps the application menu to low-frequency destinations', () => {
    expect(appMenuDestinations.map((destination) => destination.label)).toEqual([
      'Settings',
      'Storage',
      'Privacy',
      'Keyboard shortcuts',
      'Diagnostics',
      'About',
    ]);
    expect(appMenuDestinations.map((destination) => destination.href)).toEqual([
      '/settings',
      '/settings/storage',
      '/settings/privacy',
      '/settings/shortcuts',
      '/settings/diagnostics',
      '/about',
    ]);
  });
});

function createPwaSnapshot(patch: Partial<PwaLifecycleSnapshot> = {}): PwaLifecycleSnapshot {
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

function createCatalogEntry(patch: Partial<ModelCatalogEntryV1> = {}): ModelCatalogEntryV1 {
  return {
    id: 'vietasr-public',
    version: '0.5.0',
    displayName: 'VietASR public model',
    languages: ['vi', 'en'],
    manifestUrl: '/model-packs/public/manifest.json',
    manifestSha256: 'a'.repeat(64),
    license: {
      name: 'Synthetic fixture license',
      redistributionAllowed: true,
    },
    runtime: {
      status: 'available',
      installable: true,
      streamingReady: true,
      notes: ['Synthetic public fixture.'],
    },
    ...patch,
  };
}

function createInstalledRecord(patch: Partial<InstalledModelRecord> = {}): InstalledModelRecord {
  const manifest = {
    schemaVersion: 2,
    id: 'vietasr-public',
    version: '0.5.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: 'Synthetic public manifest.',
    languages: ['vi', 'en'],
    license: {
      name: 'Synthetic fixture license',
      redistributionAllowed: true,
    },
    files: {},
    runtime: {
      architecture: 'rnnt-emformer',
      sampleRateHz: 16000,
      chunkMs: 640,
      providers: ['wasm'],
    },
  } as unknown as InstalledModelRecord['manifest'];

  return {
    schemaVersion: 1,
    modelId: 'vietasr-public',
    activeVersion: '0.5.0',
    manifest,
    files: [],
    requiredStorageBytes: 0,
    backendKind: 'memory',
    installId: 'install-public',
    installedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}
