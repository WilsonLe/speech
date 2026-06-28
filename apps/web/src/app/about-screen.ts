import type { PwaLifecycleSnapshot } from './pwa-lifecycle';

export interface AboutLinkV1 {
  readonly label: string;
  readonly href: string;
}

export interface AboutSectionV1 {
  readonly title: string;
  readonly rows: readonly AboutRowV1[];
}

export interface AboutRowV1 {
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}

export interface AboutScreenModelV1 {
  readonly title: 'About';
  readonly version: string;
  readonly sourceRepository: AboutLinkV1;
  readonly codeLicense: AboutLinkV1;
  readonly modelProvenance: readonly AboutLinkV1[];
  readonly acknowledgements: readonly string[];
  readonly updateState: AboutUpdateStateV1;
  readonly sections: readonly AboutSectionV1[];
}

export interface AboutUpdateStateV1 {
  readonly label: string;
  readonly actionLabel: string | null;
  readonly detail: string;
}

export interface BuildAboutScreenOptions {
  readonly appVersion: string;
  readonly pwa: PwaLifecycleSnapshot;
}

export const speechSourceRepository = 'https://github.com/WilsonLe/speech';

export function buildAboutScreenModel(options: BuildAboutScreenOptions): AboutScreenModelV1 {
  const updateState = buildUpdateState(options.pwa);
  const sourceRepository = {
    label: 'WilsonLe/speech',
    href: speechSourceRepository,
  } as const;
  const codeLicense = {
    label: 'Apache-2.0',
    href: `${speechSourceRepository}/blob/main/LICENSE`,
  } as const;
  const modelProvenance = [
    {
      label: 'Model licenses and provenance',
      href: `${speechSourceRepository}/blob/main/MODEL_LICENSES.md`,
    },
    {
      label: 'Third-party notices',
      href: `${speechSourceRepository}/blob/main/THIRD_PARTY_NOTICES.md`,
    },
    {
      label: 'Privacy baseline',
      href: `${speechSourceRepository}/blob/main/README.md#privacy-and-local-data`,
    },
  ] as const;

  return {
    title: 'About',
    version: options.appVersion,
    sourceRepository,
    codeLicense,
    modelProvenance,
    acknowledgements: [
      'React and Vite for the local web app shell.',
      'Workbox for offline application delivery.',
      'ONNX Runtime Web for browser inference.',
      'Playwright for release verification.',
      'Synthetic fixtures used for tests and benchmarks.',
    ],
    updateState,
    sections: [
      {
        title: 'Application',
        rows: [
          { label: 'Version', value: options.appVersion },
          { label: 'Source', value: sourceRepository.label, href: sourceRepository.href },
          { label: 'Code license', value: codeLicense.label, href: codeLicense.href },
        ],
      },
      {
        title: 'Models and notices',
        rows: modelProvenance.map((link) => ({
          label: link.label,
          value: 'Open',
          href: link.href,
        })),
      },
      {
        title: 'Update state',
        rows: [
          { label: 'Status', value: updateState.label },
          { label: 'Details', value: updateState.detail },
        ],
      },
    ],
  };
}

export function buildUpdateState(pwa: PwaLifecycleSnapshot): AboutUpdateStateV1 {
  if (!pwa.serviceWorkerSupported) {
    return {
      label: 'Manual refresh',
      actionLabel: null,
      detail: 'This browser does not support the app update worker.',
    };
  }
  if (pwa.registrationState === 'error') {
    return {
      label: 'Needs reload',
      actionLabel: 'Reload app',
      detail: 'The update worker reported a local registration problem.',
    };
  }
  if (pwa.updateAvailable) {
    return {
      label: 'Update available',
      actionLabel: 'Update now',
      detail: 'A new app shell can be activated after active recording or training work is safe.',
    };
  }
  if (pwa.offlineReady) {
    return {
      label: 'Current',
      actionLabel: null,
      detail: 'Offline app files are ready on this device.',
    };
  }
  return {
    label: 'Preparing offline support',
    actionLabel: null,
    detail: 'The app is registering local offline files.',
  };
}
