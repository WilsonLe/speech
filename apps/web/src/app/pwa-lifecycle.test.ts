import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importLifecycle() {
  vi.resetModules();
  vi.stubGlobal('navigator', { serviceWorker: {} });
  return import('./pwa-lifecycle');
}

describe('PWA lifecycle update activation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('navigator', { serviceWorker: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not reload when an update is discovered until activation is explicit', async () => {
    const lifecycle = await importLifecycle();
    const reloadCalls: boolean[] = [];
    const callbacks: { needRefresh: (() => void) | undefined } = { needRefresh: undefined };

    lifecycle.initPwaLifecycle((options) => {
      callbacks.needRefresh = options.onNeedRefresh;
      options.onRegisteredSW?.('/sw.js', {
        scope: 'https://speech.test/',
      } as ServiceWorkerRegistration);
      return async (reloadPage = false) => {
        reloadCalls.push(reloadPage);
      };
    });

    expect(lifecycle.getPwaLifecycleSnapshot()).toMatchObject({
      registrationState: 'registered',
      registrationScope: 'https://speech.test/',
      updateAvailable: false,
    });

    if (callbacks.needRefresh === undefined) {
      throw new Error('expected update refresh callback to be registered');
    }
    callbacks.needRefresh();

    expect(lifecycle.getPwaLifecycleSnapshot()).toMatchObject({
      registrationState: 'registered',
      updateAvailable: true,
    });
    expect(reloadCalls).toEqual([]);

    await lifecycle.activatePwaUpdate();

    expect(reloadCalls).toEqual([true]);
  });

  it('does nothing when activation is requested before service-worker registration', async () => {
    const lifecycle = await importLifecycle();

    await expect(lifecycle.activatePwaUpdate()).resolves.toBeUndefined();
  });
});
