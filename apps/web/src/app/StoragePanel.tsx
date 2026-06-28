import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InstalledModelRecord, ModelCatalogV1 } from '@speech/model-manager';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileSummaryV1,
  ProfileTrainingDataStorageSummaryV1,
} from '@speech/profile-manager';
import { clearBrowserTrainingRecovery } from '../workers/browser-training-client';
import {
  createModelLifecycleWorker,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';
import {
  deleteEnrollmentProfile,
  deleteEnrollmentProfileTrainingData,
  getTrainingDataStorageSummary,
  listEnrollmentProfiles,
} from '../workers/profile-store-client';
import { getCreateModelDraftStorageKey } from './create-model-flow';
import {
  createBaseModelTargets,
  createPersonalModelTargets,
  createStorageManagementSummary,
  formatStorageBytes,
  getStorageConfirmationCopy,
  type StorageBaseModelTarget,
  type StorageDeletionKind,
  type StoragePersonalModelTarget,
  type StorageQuotaEstimate,
} from './storage-management';
import { vocabularyStorageKey } from './vocabulary-storage';

interface StorageRouteState {
  readonly modelStatus: 'loading' | 'ready' | 'error';
  readonly catalog: ModelCatalogV1 | null;
  readonly installedModels: readonly InstalledModelRecord[];
  readonly profiles: readonly EnrollmentProfileSummaryV1[];
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly trainingDataStorage: ProfileTrainingDataStorageSummaryV1 | null;
  readonly quota?: StorageQuotaEstimate;
  readonly message: string | null;
  readonly error: string | null;
}

type PendingModelDelete = {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
};

type DeletionTarget =
  | { readonly kind: 'training-data' }
  | { readonly kind: 'personal-model'; readonly profile: StoragePersonalModelTarget }
  | { readonly kind: 'base-model'; readonly model: StorageBaseModelTarget }
  | { readonly kind: 'all-local-data' };

const initialStorageRouteState: StorageRouteState = {
  modelStatus: 'loading',
  catalog: null,
  installedModels: [],
  profiles: [],
  activeState: null,
  trainingDataStorage: null,
  message: null,
  error: null,
};

export function StoragePanel() {
  const workerRef = useRef<Worker | null>(null);
  const pendingModelDeletesRef = useRef(new Map<string, PendingModelDelete>());
  const [state, setState] = useState<StorageRouteState>(initialStorageRouteState);
  const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshQuota = useCallback(async () => {
    if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) {
      setState((current) => omitQuota(current));
      return;
    }
    try {
      const estimate = await navigator.storage.estimate();
      setState((current) => ({
        ...current,
        quota: {
          ...(estimate.usage === undefined ? {} : { usage: estimate.usage }),
          ...(estimate.quota === undefined ? {} : { quota: estimate.quota }),
        },
      }));
    } catch {
      setState((current) => omitQuota(current));
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const [result, storage] = await Promise.all([
        listEnrollmentProfiles(),
        getTrainingDataStorageSummary(),
      ]);
      setState((current) => ({
        ...current,
        profiles: result.summaries,
        activeState: result.activeState,
        trainingDataStorage: storage.summary,
        error: null,
      }));
    } catch {
      setState((current) => ({
        ...current,
        error: 'Storage details need attention. Try again from this screen.',
      }));
    }
  }, []);

  useEffect(() => {
    const worker = createModelLifecycleWorker();
    const pendingModelDeletes = pendingModelDeletesRef.current;
    workerRef.current = worker;
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'INIT' });
    queueMicrotask(() => {
      void refreshProfiles();
      void refreshQuota();
    });

    function handleWorkerMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      setState((current) => reduceModelLifecycleState(current, message));
      if (message.type === 'DELETE_COMPLETE') {
        const pending = pendingModelDeletes.get(message.modelId);
        if (pending !== undefined) {
          pendingModelDeletes.delete(message.modelId);
          pending.resolve();
        }
        void refreshQuota();
      }
      if (message.type === 'ERROR') {
        for (const pending of pendingModelDeletes.values()) {
          pending.reject(new Error(message.message));
        }
        pendingModelDeletes.clear();
      }
    }

    function handleWorkerError(event: ErrorEvent) {
      const error = new Error(event.message);
      setState((current) => ({
        ...current,
        modelStatus: 'error',
        error: 'Storage details need attention. Try again from this screen.',
      }));
      for (const pending of pendingModelDeletes.values()) {
        pending.reject(error);
      }
      pendingModelDeletes.clear();
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
      workerRef.current = null;
      pendingModelDeletes.clear();
    };
  }, [refreshProfiles, refreshQuota]);

  const vocabularyBytes = estimateLocalStorageBytes(vocabularyStorageKey);
  const browserTrainingRecoveryBytes = estimateLocalStorageBytes(
    'speech:browser-training-recovery:v1',
  );
  const storageSummary = useMemo(
    () =>
      createStorageManagementSummary({
        installedModels: state.installedModels,
        profiles: state.profiles,
        ...(state.quota === undefined ? {} : { quota: state.quota }),
        vocabularyBytes,
        browserTrainingRecoveryBytes,
        profileTrainingJobBytes: state.trainingDataStorage?.trainingJobBytes ?? 0,
        profileTrainingJobCount: state.trainingDataStorage?.trainingJobCount ?? 0,
      }),
    [
      browserTrainingRecoveryBytes,
      state.installedModels,
      state.profiles,
      state.quota,
      state.trainingDataStorage?.trainingJobBytes,
      state.trainingDataStorage?.trainingJobCount,
      vocabularyBytes,
    ],
  );
  const personalTargets = useMemo(
    () => createPersonalModelTargets(state.profiles, state.activeState?.activeProfileId),
    [state.activeState?.activeProfileId, state.profiles],
  );
  const baseTargets = useMemo(
    () => createBaseModelTargets(state.installedModels),
    [state.installedModels],
  );

  async function deleteBaseModel(modelId: string): Promise<void> {
    const worker = workerRef.current;
    if (worker === null) throw new Error('Storage worker is not ready.');
    await new Promise<void>((resolve, reject) => {
      pendingModelDeletesRef.current.set(modelId, { resolve, reject });
      worker.postMessage({ type: 'DELETE_ACTIVE_MODEL', modelId });
    });
  }

  async function performDeletion(target: DeletionTarget): Promise<void> {
    setBusy(true);
    setState((current) => ({ ...current, message: null, error: null }));
    try {
      if (target.kind === 'training-data') {
        clearBrowserTrainingRecovery();
        await Promise.all(
          state.profiles.map((profile) =>
            deleteEnrollmentProfileTrainingData({ profileId: profile.profile.id }),
          ),
        );
        await refreshProfiles();
        setState((current) => ({ ...current, message: 'Training data deleted.' }));
      } else if (target.kind === 'personal-model') {
        await deleteEnrollmentProfile({ profileId: target.profile.profileId });
        await refreshProfiles();
        setState((current) => ({ ...current, message: 'Voice model deleted.' }));
      } else if (target.kind === 'base-model') {
        await deleteBaseModel(target.model.modelId);
        setState((current) => ({ ...current, message: 'Speech model removed.' }));
      } else {
        clearBrowserTrainingRecovery();
        removeLocalSpeechStorage();
        for (const profile of state.profiles) {
          await deleteEnrollmentProfile({ profileId: profile.profile.id });
        }
        for (const model of state.installedModels) {
          await deleteBaseModel(model.modelId);
        }
        await refreshProfiles();
        setState((current) => ({ ...current, message: 'Local speech data deleted.' }));
      }
      await refreshQuota();
      setDeletionTarget(null);
    } catch {
      setState((current) => ({
        ...current,
        error: 'Deletion could not finish. Review the retained data and try again.',
      }));
    } finally {
      setBusy(false);
    }
  }

  if (deletionTarget !== null) {
    return (
      <StorageConfirmationScreen
        target={deletionTarget}
        busy={busy}
        onBack={() => setDeletionTarget(null)}
        onConfirm={() => void performDeletion(deletionTarget)}
      />
    );
  }

  return (
    <section className="settings-screen storage-screen panel" aria-labelledby="storage-title">
      <div className="section-heading settings-screen__heading">
        <p className="eyebrow">Settings</p>
        <h2 id="storage-title">Storage</h2>
        <p>Manage local speech data stored in this browser.</p>
      </div>

      {state.error ? (
        <p role="alert" className="status-message error-message">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="status-message success-message">
          {state.message}
        </p>
      ) : null}

      <div className="storage-summary-grid" aria-label="Storage summary">
        {storageSummary.rows.map((row) => (
          <article className="storage-summary-card" key={row.label}>
            <h3>{row.label}</h3>
            <p className="storage-summary-card__value">{row.value}</p>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>

      <section className="storage-management-section" aria-labelledby="storage-management-title">
        <div className="storage-section-header">
          <div>
            <p className="eyebrow">Manage data</p>
            <h3 id="storage-management-title">Deletion screens</h3>
          </div>
          <button
            type="button"
            className="danger"
            onClick={() => setDeletionTarget({ kind: 'all-local-data' })}
          >
            Delete all local speech data
          </button>
        </div>
        <div className="storage-action-grid">
          <article className="storage-action-card">
            <h4>Training data</h4>
            <p>Delete saved training work files while keeping voice models and recordings.</p>
            <button type="button" onClick={() => setDeletionTarget({ kind: 'training-data' })}>
              Delete training data
            </button>
          </article>
          <StoragePersonalModelsList
            models={personalTargets}
            onDelete={(profile) => setDeletionTarget({ kind: 'personal-model', profile })}
          />
          <StorageBaseModelsList
            models={baseTargets}
            loading={state.modelStatus === 'loading'}
            onDelete={(model) => setDeletionTarget({ kind: 'base-model', model })}
          />
        </div>
      </section>
    </section>
  );
}

function StoragePersonalModelsList({
  models,
  onDelete,
}: {
  readonly models: readonly StoragePersonalModelTarget[];
  readonly onDelete: (model: StoragePersonalModelTarget) => void;
}) {
  return (
    <article className="storage-action-card storage-list-card">
      <h4>Voice models</h4>
      {models.length === 0 ? <p>No voice models are stored on this device.</p> : null}
      <ul className="storage-target-list">
        {models.map((model) => (
          <li key={model.profileId}>
            <div>
              <strong>{model.displayName}</strong>
              <span>
                {model.active ? 'Active · ' : ''}
                {model.recordingCount.toString()} recordings · {formatStorageBytes(model.sizeBytes)}
              </span>
            </div>
            <button type="button" className="secondary" onClick={() => onDelete(model)}>
              Delete…
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function StorageBaseModelsList({
  models,
  loading,
  onDelete,
}: {
  readonly models: readonly StorageBaseModelTarget[];
  readonly loading: boolean;
  readonly onDelete: (model: StorageBaseModelTarget) => void;
}) {
  return (
    <article className="storage-action-card storage-list-card">
      <h4>Speech model downloads</h4>
      {models.length === 0 ? (
        <p>
          {loading
            ? 'Loading installed speech models…'
            : 'No speech model downloads are installed.'}
        </p>
      ) : null}
      <ul className="storage-target-list">
        {models.map((model) => (
          <li key={model.modelId}>
            <div>
              <strong>{model.displayName}</strong>
              <span>
                Version {model.version} · {formatStorageBytes(model.sizeBytes)}
              </span>
            </div>
            <button type="button" className="secondary" onClick={() => onDelete(model)}>
              Remove…
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function StorageConfirmationScreen({
  target,
  busy,
  onBack,
  onConfirm,
}: {
  readonly target: DeletionTarget;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
}) {
  const copy = getStorageConfirmationCopy(getDeletionKind(target), getDeletionTargetName(target));
  return (
    <section
      className="settings-screen storage-confirmation-screen panel"
      aria-labelledby="storage-delete-title"
    >
      <button type="button" className="back-link" onClick={onBack}>
        ← Storage
      </button>
      <div className="section-heading settings-screen__heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="storage-delete-title">{copy.title}</h2>
        <p>{copy.warning}</p>
      </div>
      <div className="storage-confirmation-grid">
        <section aria-labelledby="storage-removes-title" className="storage-confirmation-card">
          <h3 id="storage-removes-title">Removes</h3>
          <ul>
            {copy.removes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="storage-retains-title" className="storage-confirmation-card">
          <h3 id="storage-retains-title">Retains</h3>
          <ul>
            {copy.retains.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
      <div className="storage-confirmation-actions">
        <button type="button" className="secondary" onClick={onBack} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : copy.confirmLabel}
        </button>
      </div>
    </section>
  );
}

function omitQuota(state: StorageRouteState): StorageRouteState {
  const { quota: _quota, ...withoutQuota } = state;
  return withoutQuota;
}

function reduceModelLifecycleState(
  current: StorageRouteState,
  message: ModelLifecycleResponse,
): StorageRouteState {
  switch (message.type) {
    case 'READY':
      return {
        ...current,
        modelStatus: 'ready',
        catalog: message.catalog,
        installedModels: message.installed,
        error: null,
      };
    case 'INSTALL_COMPLETE':
      return {
        ...current,
        modelStatus: 'ready',
        installedModels: [
          ...current.installedModels.filter((model) => model.modelId !== message.record.modelId),
          message.record,
        ],
      };
    case 'DELETE_COMPLETE':
      return {
        ...current,
        modelStatus: 'ready',
        installedModels: current.installedModels.filter(
          (model) => model.modelId !== message.modelId,
        ),
      };
    case 'ERROR':
      return {
        ...current,
        modelStatus: 'error',
        error: 'Storage details need attention. Try again from this screen.',
      };
    default:
      return current;
  }
}

function getDeletionKind(target: DeletionTarget): StorageDeletionKind {
  return target.kind;
}

function getDeletionTargetName(target: DeletionTarget): string | undefined {
  if (target.kind === 'personal-model') return target.profile.displayName;
  if (target.kind === 'base-model') return `${target.model.displayName} ${target.model.version}`;
  return undefined;
}

function estimateLocalStorageBytes(key: string): number {
  if (typeof window === 'undefined') return 0;
  const value = window.localStorage.getItem(key);
  return value === null ? 0 : new Blob([value]).size;
}

function removeLocalSpeechStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(vocabularyStorageKey);
  window.localStorage.removeItem(getCreateModelDraftStorageKey());
}
