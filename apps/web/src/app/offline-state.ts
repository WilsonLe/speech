import type {
  InstalledModelRecord,
  ModelCatalogEntryV1,
  ModelInstallProgress,
} from '@speech/model-manager';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';

export type OfflinePanelTone = 'ready' | 'normal' | 'attention' | 'blocked';

export interface OfflineModelSummary {
  readonly status: 'loading' | 'ready' | 'installing' | 'error';
  readonly installableModelCount: number;
  readonly installedModelCount: number;
  readonly requiredDownloadCount: number;
  readonly progress: ModelInstallProgress | null;
}

export interface OfflinePanelRow {
  readonly label: 'Connection' | 'Offline app' | 'Speech model' | 'Update';
  readonly value: string;
}

export interface OfflinePanelStateView {
  readonly headline: string;
  readonly summary: string;
  readonly tone: OfflinePanelTone;
  readonly rows: readonly OfflinePanelRow[];
  readonly blocker: string | null;
  readonly updateNotice: string | null;
  readonly detailsOpen: boolean;
}

export function createOfflineModelSummary(options: {
  readonly status: OfflineModelSummary['status'];
  readonly models: readonly ModelCatalogEntryV1[];
  readonly installed: readonly InstalledModelRecord[];
  readonly progress: ModelInstallProgress | null;
}): OfflineModelSummary {
  const installedIds = new Set(options.installed.map((record) => record.modelId));
  const installableModels = options.models.filter(
    (model) => model.runtime.installable && model.manifestUrl !== undefined,
  );
  return {
    status: options.status,
    installableModelCount: installableModels.length,
    installedModelCount: installableModels.filter((model) => installedIds.has(model.id)).length,
    requiredDownloadCount: installableModels.filter((model) => !installedIds.has(model.id)).length,
    progress: options.progress,
  };
}

export function createOfflinePanelStateView(options: {
  readonly online: boolean;
  readonly pwa: PwaLifecycleSnapshot;
  readonly modelSummary: OfflineModelSummary;
}): OfflinePanelStateView {
  const { modelSummary, online, pwa } = options;
  const blockedByDownload = !online && modelSummary.requiredDownloadCount > 0;
  const hasError = pwa.registrationState === 'error' || modelSummary.status === 'error';
  const detailsOpen = hasError || modelSummary.status === 'installing';

  if (blockedByDownload) {
    return buildView({
      headline: 'Connect to finish setup',
      summary: 'The app shell is local, but the required speech model still needs a download.',
      tone: 'blocked',
      blocker: 'Go online, then install the speech model from Dictate or model details.',
      updateNotice: formatUpdateNotice(pwa.updateAvailable),
      rows: buildRows({ online, pwa, modelSummary }),
      detailsOpen: true,
    });
  }

  if (modelSummary.status === 'installing') {
    return buildView({
      headline: 'Model setup in progress',
      summary: formatProgressSummary(modelSummary.progress),
      tone: 'attention',
      blocker: null,
      updateNotice: formatUpdateNotice(pwa.updateAvailable),
      rows: buildRows({ online, pwa, modelSummary }),
      detailsOpen,
    });
  }

  if (hasError) {
    return buildView({
      headline: 'Offline status needs attention',
      summary: 'Open details to retry model setup or review app-shell state.',
      tone: 'attention',
      blocker: 'Retry when online if a required asset cannot be fetched.',
      updateNotice: formatUpdateNotice(pwa.updateAvailable),
      rows: buildRows({ online, pwa, modelSummary }),
      detailsOpen,
    });
  }

  if (!online && pwa.offlineReady && modelSummary.requiredDownloadCount === 0) {
    return buildView({
      headline: 'Offline and ready',
      summary: 'Installed app and speech-model files can run without the network.',
      tone: 'ready',
      blocker: null,
      updateNotice: formatUpdateNotice(pwa.updateAvailable),
      rows: buildRows({ online, pwa, modelSummary }),
      detailsOpen,
    });
  }

  if (pwa.offlineReady && modelSummary.requiredDownloadCount === 0) {
    return buildView({
      headline: 'Offline ready',
      summary: 'The app shell and installed speech model are ready for local use.',
      tone: 'ready',
      blocker: null,
      updateNotice: formatUpdateNotice(pwa.updateAvailable),
      rows: buildRows({ online, pwa, modelSummary }),
      detailsOpen,
    });
  }

  return buildView({
    headline: 'Checking local setup',
    summary: 'The app is checking offline app files and speech-model downloads.',
    tone: 'normal',
    blocker: null,
    updateNotice: formatUpdateNotice(pwa.updateAvailable),
    rows: buildRows({ online, pwa, modelSummary }),
    detailsOpen,
  });
}

function buildView(view: OfflinePanelStateView): OfflinePanelStateView {
  return view;
}

function buildRows(options: {
  readonly online: boolean;
  readonly pwa: PwaLifecycleSnapshot;
  readonly modelSummary: OfflineModelSummary;
}): readonly OfflinePanelRow[] {
  const { modelSummary, online, pwa } = options;
  return [
    { label: 'Connection', value: online ? 'Online' : 'Offline' },
    { label: 'Offline app', value: formatOfflineAppValue(pwa) },
    { label: 'Speech model', value: formatSpeechModelValue(modelSummary) },
    { label: 'Update', value: pwa.updateAvailable ? 'Ready in menu' : 'Current' },
  ];
}

function formatOfflineAppValue(snapshot: PwaLifecycleSnapshot): string {
  if (!snapshot.serviceWorkerSupported) return 'Unsupported';
  if (snapshot.registrationState === 'error') return 'Needs attention';
  if (snapshot.offlineReady) return 'Ready';
  if (snapshot.registrationState === 'registered') return 'Preparing';
  return snapshot.registrationState;
}

function formatSpeechModelValue(summary: OfflineModelSummary): string {
  if (summary.status === 'loading') return 'Checking';
  if (summary.status === 'error') return 'Needs attention';
  if (summary.status === 'installing') return 'Installing';
  if (summary.requiredDownloadCount === 0)
    return `${summary.installedModelCount.toString()} installed`;
  return `${summary.requiredDownloadCount.toString()} needed`;
}

function formatUpdateNotice(updateAvailable: boolean): string | null {
  return updateAvailable
    ? 'An app update is ready in the menu. Install it after recording or training stops.'
    : null;
}

function formatProgressSummary(progress: ModelInstallProgress | null): string {
  if (progress === null) return 'Preparing model setup.';
  switch (progress.phase) {
    case 'validating-manifest':
    case 'requesting-persistence':
      return 'Checking model setup.';
    case 'downloading-file':
    case 'writing-temporary-file':
      return 'Saving the speech model for offline use.';
    case 'hashing-file':
    case 'verifying-temporary-file':
    case 'verifying-active-version':
      return 'Verifying the speech model.';
    case 'copying-active-version':
    case 'activating-version':
      return 'Activating the speech model.';
    case 'cleaning-temporary-version':
      return 'Removing a partial download.';
  }
}
