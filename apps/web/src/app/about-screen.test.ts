import { describe, expect, it } from 'vitest';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';
import { buildAboutScreenModel, buildUpdateState, speechSourceRepository } from './about-screen';

const basePwa: PwaLifecycleSnapshot = {
  serviceWorkerSupported: true,
  registrationState: 'registered',
  offlineReady: true,
  updateAvailable: false,
  registrationScope: 'https://example.test/',
  errorMessage: null,
};

describe('about-screen helpers', () => {
  it('builds source, license, provenance, acknowledgements, and update state without marketing copy', () => {
    const model = buildAboutScreenModel({ appVersion: '0.5.0', pwa: basePwa });

    expect(model.version).toBe('0.5.0');
    expect(model.sourceRepository).toEqual({
      label: 'WilsonLe/speech',
      href: speechSourceRepository,
    });
    expect(model.codeLicense.label).toBe('Apache-2.0');
    expect(model.modelProvenance.map((link) => link.label)).toEqual([
      'Model licenses and provenance',
      'Third-party notices',
      'Privacy baseline',
    ]);
    expect(model.acknowledgements).toEqual(
      expect.arrayContaining([
        'React and Vite for the local web app shell.',
        'Workbox for offline application delivery.',
        'ONNX Runtime Web for browser inference.',
      ]),
    );
    expect(JSON.stringify(model)).not.toMatch(/best|fastest|powered by ai|revolutionary/i);
  });

  it('summarizes service-worker update states accurately', () => {
    expect(buildUpdateState(basePwa)).toMatchObject({
      label: 'Current',
      actionLabel: null,
    });
    expect(buildUpdateState({ ...basePwa, updateAvailable: true })).toMatchObject({
      label: 'Update available',
      actionLabel: 'Update now',
    });
    expect(
      buildUpdateState({
        ...basePwa,
        serviceWorkerSupported: false,
        offlineReady: false,
        registrationState: 'unsupported',
      }),
    ).toMatchObject({
      label: 'Manual refresh',
      actionLabel: null,
    });
  });
});
