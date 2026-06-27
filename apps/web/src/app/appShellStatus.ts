import type { InstalledModelRecord, ModelCatalogEntryV1 } from '@speech/model-manager';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';

export type AppShellLocalStatusTone = 'ready' | 'attention' | 'offline' | 'checking';

export interface AppShellModelLifecycleSummary {
  readonly status: 'loading' | 'ready' | 'error';
  readonly installableModelCount: number;
  readonly installedModelCount: number;
  readonly requiredDownloadCount: number;
}

export interface AppShellLocalStatusRow {
  readonly label: 'Network' | 'Offline app' | 'Model downloads' | 'Update';
  readonly value: string;
}

export interface AppShellLocalStatusView {
  readonly label: 'Ready' | 'Offline' | 'Setup' | 'Update' | 'Check';
  readonly tone: AppShellLocalStatusTone;
  readonly ariaLabel: string;
  readonly headline: string;
  readonly rows: readonly AppShellLocalStatusRow[];
  readonly privacyNote: string;
}

export interface AppMenuDestination {
  readonly id: 'settings' | 'storage' | 'privacy' | 'shortcuts' | 'diagnostics' | 'about';
  readonly label: string;
  readonly href: `#${string}`;
}

export const appMenuDestinations = [
  {
    id: 'settings',
    label: 'Settings',
    href: '#offline-model-title',
  },
  {
    id: 'storage',
    label: 'Storage',
    href: '#offline-model-title',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    href: '#transcript-privacy-title',
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    href: '#dictate',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    href: '#diagnostics-title',
  },
  {
    id: 'about',
    label: 'About',
    href: '#roadmap-title',
  },
] as const satisfies readonly AppMenuDestination[];

const localPrivacyNote = 'Audio, vocabulary, and personal models stay in this browser.';

export const loadingModelLifecycleSummary: AppShellModelLifecycleSummary = {
  status: 'loading',
  installableModelCount: 0,
  installedModelCount: 0,
  requiredDownloadCount: 0,
};

export function createModelLifecycleSummary(
  models: readonly ModelCatalogEntryV1[],
  installed: readonly InstalledModelRecord[],
): AppShellModelLifecycleSummary {
  const installedIds = new Set(installed.map((record) => record.modelId));
  const installableModels = models.filter(
    (model) => model.runtime.installable && model.manifestUrl !== undefined,
  );

  return {
    status: 'ready',
    installableModelCount: installableModels.length,
    installedModelCount: installableModels.filter((model) => installedIds.has(model.id)).length,
    requiredDownloadCount: installableModels.filter((model) => !installedIds.has(model.id)).length,
  };
}

export function createModelLifecycleErrorSummary(): AppShellModelLifecycleSummary {
  return {
    status: 'error',
    installableModelCount: 0,
    installedModelCount: 0,
    requiredDownloadCount: 0,
  };
}

export function createAppShellLocalStatusView(options: {
  readonly online: boolean;
  readonly pwa: PwaLifecycleSnapshot;
  readonly modelLifecycle: AppShellModelLifecycleSummary;
}): AppShellLocalStatusView {
  const { modelLifecycle, online, pwa } = options;
  const label = getLocalStatusLabel({ modelLifecycle, online, pwa });
  const tone = getLocalStatusTone(label, modelLifecycle, pwa);
  const modelDownloadValue = formatModelDownloadValue(modelLifecycle);
  const rows: AppShellLocalStatusRow[] = [
    { label: 'Network', value: online ? 'Online' : 'Offline' },
    { label: 'Offline app', value: formatOfflineAppValue(pwa) },
    { label: 'Model downloads', value: modelDownloadValue },
    { label: 'Update', value: pwa.updateAvailable ? 'Ready to install' : 'Current' },
  ];

  return {
    label,
    tone,
    ariaLabel: `Local status: ${label.toLowerCase()}. ${modelDownloadValue}.`,
    headline: getLocalStatusHeadline(label),
    rows,
    privacyNote: localPrivacyNote,
  };
}

function getLocalStatusLabel(options: {
  readonly online: boolean;
  readonly pwa: PwaLifecycleSnapshot;
  readonly modelLifecycle: AppShellModelLifecycleSummary;
}): AppShellLocalStatusView['label'] {
  const { modelLifecycle, online, pwa } = options;
  if (pwa.updateAvailable) return 'Update';
  if (pwa.registrationState === 'error' || modelLifecycle.status === 'error') return 'Check';
  if (modelLifecycle.requiredDownloadCount > 0) return 'Setup';
  if (!online) return 'Offline';
  if (pwa.offlineReady) return 'Ready';
  return 'Check';
}

function getLocalStatusTone(
  label: AppShellLocalStatusView['label'],
  modelLifecycle: AppShellModelLifecycleSummary,
  pwa: PwaLifecycleSnapshot,
): AppShellLocalStatusTone {
  if (label === 'Ready') return 'ready';
  if (label === 'Offline') return 'offline';
  if (label === 'Check' || label === 'Setup' || label === 'Update') return 'attention';
  if (modelLifecycle.status === 'loading' || pwa.registrationState === 'registering') {
    return 'checking';
  }
  return 'attention';
}

function getLocalStatusHeadline(label: AppShellLocalStatusView['label']): string {
  switch (label) {
    case 'Ready':
      return 'Ready for local work';
    case 'Offline':
      return 'Offline mode';
    case 'Setup':
      return 'Download needed';
    case 'Update':
      return 'Update ready';
    case 'Check':
      return 'Local status needs attention';
  }
}

function formatOfflineAppValue(snapshot: PwaLifecycleSnapshot): string {
  if (!snapshot.serviceWorkerSupported) return 'Unsupported';
  if (snapshot.registrationState === 'error') return 'Needs attention';
  if (snapshot.offlineReady) return 'Ready';
  if (snapshot.registrationState === 'registered') return 'Preparing';
  return snapshot.registrationState;
}

function formatModelDownloadValue(modelLifecycle: AppShellModelLifecycleSummary): string {
  if (modelLifecycle.status === 'loading') return 'Checking';
  if (modelLifecycle.status === 'error') return 'Needs attention';
  if (modelLifecycle.installableModelCount === 0) return 'No installable model listed';
  if (modelLifecycle.requiredDownloadCount === 0) {
    return `${modelLifecycle.installedModelCount.toString()} installed`;
  }
  return `${modelLifecycle.requiredDownloadCount.toString()} required`;
}
