export interface PrivacyScreenActionV1 {
  readonly label: string;
  readonly href: string;
  readonly description: string;
  readonly kind: 'export' | 'delete' | 'diagnostics' | 'docs';
}

export interface PrivacyScreenNetworkResultV1 {
  readonly status: 'local-by-default';
  readonly label: string;
  readonly detail: string;
  readonly privacy: {
    readonly telemetryEnabled: false;
    readonly remoteUploadConfigured: false;
    readonly accountRequired: false;
  };
}

export interface PrivacyScreenSummaryV1 {
  readonly statement: string;
  readonly controls: readonly PrivacyScreenActionV1[];
  readonly networkIsolation: PrivacyScreenNetworkResultV1;
  readonly visibleBoundaries: readonly string[];
}

export interface ShortcutGroupV1 {
  readonly title: string;
  readonly shortcuts: readonly ShortcutItemV1[];
}

export interface ShortcutItemV1 {
  readonly keys: readonly string[];
  readonly action: string;
  readonly scope: string;
}

export function buildPrivacyScreenSummary(): PrivacyScreenSummaryV1 {
  return {
    statement: 'Audio, transcripts, training, and personal models stay on this device.',
    controls: [
      {
        label: 'Export a voice model',
        href: '/models',
        description:
          'Open Models, choose a voice model, then export from its row or detail screen.',
        kind: 'export',
      },
      {
        label: 'Delete local speech data',
        href: '/settings/storage?focus=delete-all',
        description: 'Review what will be removed and what remains before deletion.',
        kind: 'delete',
      },
      {
        label: 'Download support bundle',
        href: '/settings/diagnostics',
        description: 'Diagnostics downloads are redacted and do not include audio or transcripts.',
        kind: 'diagnostics',
      },
      {
        label: 'Read privacy documentation',
        href: 'https://github.com/WilsonLe/speech#privacy-and-licensing-baseline',
        description: 'Open the public repository privacy baseline in a new tab.',
        kind: 'docs',
      },
    ],
    networkIsolation: {
      status: 'local-by-default',
      label: 'No telemetry configured',
      detail:
        'The app has no accounts, analytics, sync, crash upload, or remote support endpoint by default. Model downloads and documentation links happen only when you choose them.',
      privacy: {
        telemetryEnabled: false,
        remoteUploadConfigured: false,
        accountRequired: false,
      },
    },
    visibleBoundaries: [
      'Recording starts only after you grant microphone access.',
      'Model import, export, training, diagnostics, and deletion each show their own consequence before action.',
      'Support bundles stay redacted; audio and transcripts are not included.',
    ],
  };
}

export function buildShortcutGroups(): readonly ShortcutGroupV1[] {
  return [
    {
      title: 'Recording',
      shortcuts: [
        {
          keys: ['Space'],
          action: 'Hold to record on Dictate when focus is not inside a form field.',
          scope: 'Dictate',
        },
        {
          keys: ['Release Space'],
          action: 'Stop recording and finalize the current utterance.',
          scope: 'Dictate',
        },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        {
          keys: ['Tab'],
          action: 'Move through visible controls in page order.',
          scope: 'App',
        },
        {
          keys: ['Shift', 'Tab'],
          action: 'Move to the previous visible control.',
          scope: 'App',
        },
        {
          keys: ['Enter'],
          action: 'Open the focused link, button, menu item, disclosure, or dialog action.',
          scope: 'App',
        },
      ],
    },
    {
      title: 'Menus, dialogs, and disclosures',
      shortcuts: [
        {
          keys: ['Escape'],
          action: 'Close an open menu, tooltip, dialog, or local status popover.',
          scope: 'Open overlay',
        },
        {
          keys: ['Arrow Down', 'Arrow Up'],
          action: 'Move between menu items when a menu is open.',
          scope: 'Menu',
        },
        {
          keys: ['Home', 'End'],
          action: 'Jump to the first or last accordion header.',
          scope: 'Accordion',
        },
      ],
    },
    {
      title: 'Workflows',
      shortcuts: [
        {
          keys: ['Enter'],
          action:
            'Use the focused primary action, such as Start recording, Train model, Import, Export, or Delete.',
          scope: 'Workflow screen',
        },
        {
          keys: ['Escape'],
          action: 'Cancel a short confirmation when cancellation is safe.',
          scope: 'Dialog',
        },
      ],
    },
  ];
}
