import type { InstalledModelRecord, ModelInstallProgress } from '@speech/model-manager';
import type {
  ManifestInspectionResult,
  ModelLifecycleModel,
  ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';

export type DictateModelSetupStatus =
  | 'checking'
  | 'ready'
  | 'setup-required'
  | 'installing'
  | 'error';

export interface DictateModelSetupState {
  readonly status: DictateModelSetupStatus;
  readonly setupModel: ModelLifecycleModel | null;
  readonly installedModelIds: readonly string[];
  readonly inspection: ManifestInspectionResult | null;
  readonly progress: ModelInstallProgress | null;
  readonly errorMessage: string | null;
  readonly retryAction: 'inspect' | 'install' | null;
}

export const initialDictateModelSetupState: DictateModelSetupState = {
  status: 'checking',
  setupModel: null,
  installedModelIds: [],
  inspection: null,
  progress: null,
  errorMessage: null,
  retryAction: null,
};

export function reduceDictateModelSetupMessage(
  current: DictateModelSetupState,
  message: ModelLifecycleResponse,
): DictateModelSetupState {
  switch (message.type) {
    case 'READY': {
      const setupModel = selectInstallableSetupModel(message.catalog.models);
      const installedModelIds = message.installed.map((record) => record.modelId).sort();
      if (setupModel === null) {
        return {
          ...current,
          status: 'error',
          setupModel: null,
          installedModelIds,
          inspection: null,
          progress: null,
          errorMessage: 'No installable speech model is available for this browser build.',
          retryAction: 'inspect',
        };
      }

      const ready = hasInstalledModel(message.installed, setupModel.id);
      return {
        status: ready ? 'ready' : 'setup-required',
        setupModel,
        installedModelIds,
        inspection: current.inspection?.modelId === setupModel.id ? current.inspection : null,
        progress: null,
        errorMessage: null,
        retryAction: null,
      };
    }
    case 'MANIFEST_READY': {
      if (current.setupModel !== null && message.inspection.modelId !== current.setupModel.id) {
        return current;
      }
      return {
        ...current,
        status: current.status === 'installing' ? 'installing' : 'setup-required',
        inspection: message.inspection,
        errorMessage: null,
        retryAction: null,
      };
    }
    case 'INSTALL_PROGRESS':
      return {
        ...current,
        status: 'installing',
        progress: message.progress,
        errorMessage: null,
        retryAction: null,
      };
    case 'INSTALL_COMPLETE': {
      const installedModelIds = uniqueSorted([
        ...current.installedModelIds,
        message.record.modelId,
      ]);
      return {
        ...current,
        status: setupModelIsInstalled(current.setupModel, installedModelIds)
          ? 'ready'
          : 'setup-required',
        installedModelIds,
        setupModel: current.setupModel ?? null,
        inspection: null,
        progress: null,
        errorMessage: null,
        retryAction: null,
      };
    }
    case 'DELETE_COMPLETE': {
      const installedModelIds = current.installedModelIds.filter(
        (modelId) => modelId !== message.modelId,
      );
      return {
        ...current,
        status: setupModelIsInstalled(current.setupModel, installedModelIds)
          ? 'ready'
          : 'setup-required',
        installedModelIds,
        progress: null,
      };
    }
    case 'ERROR':
      return {
        ...current,
        status: 'error',
        progress: null,
        errorMessage: message.message,
        retryAction: current.status === 'installing' ? 'install' : 'inspect',
      };
  }
}

export function startDictateModelInstall(current: DictateModelSetupState): DictateModelSetupState {
  return {
    ...current,
    status: 'installing',
    progress: null,
    errorMessage: null,
    retryAction: null,
  };
}

export function startDictateModelInspection(
  current: DictateModelSetupState,
): DictateModelSetupState {
  return {
    ...current,
    status: current.setupModel === null ? 'checking' : 'setup-required',
    progress: null,
    errorMessage: null,
    retryAction: null,
  };
}

export function isDictateModelReady(state: DictateModelSetupState): boolean {
  return state.status === 'ready';
}

export function needsDictateModelInspection(state: DictateModelSetupState): boolean {
  return (
    state.status === 'setup-required' &&
    state.setupModel !== null &&
    state.setupModel.manifestUrl !== undefined &&
    state.inspection === null
  );
}

export function formatDictateSetupVersion(model: ModelLifecycleModel | null): string {
  return model === null ? 'Version pending' : `Version ${model.version}`;
}

export function formatDictateSetupSize(inspection: ManifestInspectionResult | null): string {
  return inspection === null
    ? 'Checking download size'
    : `${formatBytes(inspection.requiredStorageBytes)} download`;
}

export function formatDictateSetupProgress(progress: ModelInstallProgress | null): string {
  if (progress === null) return 'Preparing model setup';
  const phase = formatProgressPhase(progress.phase);
  const filePart =
    progress.completedFiles === undefined || progress.totalFiles === undefined
      ? ''
      : ` · file ${(progress.completedFiles + 1).toString()} of ${progress.totalFiles.toString()}`;
  const bytePart =
    progress.completedBytes === undefined || progress.totalBytes === undefined
      ? ''
      : ` · ${formatBytes(progress.completedBytes)} of ${formatBytes(progress.totalBytes)}`;
  return `${phase}${filePart}${bytePart}`;
}

export function formatProgressPhase(phase: ModelInstallProgress['phase']): string {
  switch (phase) {
    case 'validating-manifest':
      return 'Checking model details';
    case 'requesting-persistence':
      return 'Requesting device storage';
    case 'downloading-file':
      return 'Downloading model';
    case 'hashing-file':
    case 'verifying-temporary-file':
    case 'verifying-active-version':
      return 'Verifying model';
    case 'writing-temporary-file':
      return 'Saving download';
    case 'copying-active-version':
      return 'Activating model';
    case 'activating-version':
      return 'Ready to dictate';
    case 'cleaning-temporary-version':
      return 'Removing partial download';
  }
}

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value.toString()} B`;
}

function selectInstallableSetupModel(
  models: readonly ModelLifecycleModel[],
): ModelLifecycleModel | null {
  return (
    models.find((model) => model.runtime.installable && model.manifestUrl !== undefined) ?? null
  );
}

function hasInstalledModel(records: readonly InstalledModelRecord[], modelId: string): boolean {
  return records.some((record) => record.modelId === modelId);
}

function setupModelIsInstalled(
  setupModel: ModelLifecycleModel | null,
  installedModelIds: readonly string[],
): boolean {
  return setupModel !== null && installedModelIds.includes(setupModel.id);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
