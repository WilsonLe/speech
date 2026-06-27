import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPwaLifecycleSnapshot,
  subscribePwaLifecycle,
  type PwaLifecycleSnapshot,
} from './pwa-lifecycle';
import {
  createModelLifecycleWorker,
  type ManifestInspectionResult,
  type ModelLifecycleModel,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';
import type {
  InstalledModelRecord,
  ModelCatalogV1,
  ModelInstallProgress,
} from '@speech/model-manager';
import {
  createOfflineModelSummary,
  createOfflinePanelStateView,
  type OfflinePanelStateView,
} from './offline-state';

type LifecycleStatus = 'idle' | 'loading' | 'ready' | 'installing' | 'error';

interface ModelLifecycleState {
  readonly status: LifecycleStatus;
  readonly catalog: ModelCatalogV1 | null;
  readonly backendKind: string | null;
  readonly installed: readonly InstalledModelRecord[];
  readonly inspections: Readonly<Record<string, ManifestInspectionResult>>;
  readonly progress: ModelInstallProgress | null;
  readonly errorMessage: string | null;
}

const initialLifecycleState: ModelLifecycleState = {
  status: 'loading',
  catalog: null,
  backendKind: null,
  installed: [],
  inspections: {},
  progress: null,
  errorMessage: null,
};

export function OfflineModelPanel() {
  const workerRef = useRef<Worker | null>(null);
  const [pwa, setPwa] = useState<PwaLifecycleSnapshot>(() => getPwaLifecycleSnapshot());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lifecycle, setLifecycle] = useState<ModelLifecycleState>(initialLifecycleState);

  useEffect(() => subscribePwaLifecycle(setPwa), []);

  useEffect(() => {
    function handleOnline() {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
    };
  }, []);

  useEffect(() => {
    const worker = createModelLifecycleWorker();
    workerRef.current = worker;
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'INIT' });

    function handleWorkerMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      setLifecycle((current) => reduceLifecycleMessage(current, message));
    }

    function handleWorkerError(event: ErrorEvent) {
      setLifecycle((current) => ({
        ...current,
        status: 'error',
        errorMessage: event.message,
      }));
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const models = useMemo(() => lifecycle.catalog?.models ?? [], [lifecycle.catalog]);
  const activeByModelId = useMemo(() => {
    const records = new Map<string, InstalledModelRecord>();
    for (const record of lifecycle.installed) {
      records.set(record.modelId, record);
    }
    return records;
  }, [lifecycle.installed]);
  const offlineModelSummary = useMemo(
    () =>
      createOfflineModelSummary({
        status: toOfflineModelStatus(lifecycle.status),
        models,
        installed: lifecycle.installed,
        progress: lifecycle.progress,
      }),
    [lifecycle.installed, lifecycle.progress, lifecycle.status, models],
  );
  const offlineView = useMemo(
    () => createOfflinePanelStateView({ online, pwa, modelSummary: offlineModelSummary }),
    [offlineModelSummary, online, pwa],
  );

  function inspectModel(modelId: string) {
    workerRef.current?.postMessage({ type: 'INSPECT_MODEL', modelId });
  }

  function installModel(modelId: string) {
    workerRef.current?.postMessage({ type: 'INSTALL_MODEL', modelId });
    setLifecycle((current) => ({ ...current, status: 'installing', progress: null }));
  }

  function deleteModel(modelId: string) {
    workerRef.current?.postMessage({ type: 'DELETE_ACTIVE_MODEL', modelId });
  }

  return (
    <section className="panel offline-model" aria-labelledby="offline-model-title">
      <div className="section-heading">
        <p className="eyebrow">Local setup</p>
        <h2 id="offline-model-title">Offline and updates</h2>
        <p>Offline is normal after app files and the speech model are installed.</p>
      </div>

      <OfflineStatusSummary view={offlineView} />

      <details className="model-lifecycle-disclosure" open={offlineView.detailsOpen}>
        <summary>Model lifecycle details</summary>
        <div className="model-lifecycle-heading">
          <h3>Model catalog</h3>
          <p>
            Inspect manifests before downloading model files. Installation stays in a worker and
            verifies size, checksum, license, and activation state.
          </p>
        </div>

        {lifecycle.errorMessage ? (
          <p role="alert" className="status-message error-message">
            Model setup needs attention. Retry when online or inspect the model details.
          </p>
        ) : null}
        {lifecycle.progress ? (
          <p className="status-message" aria-live="polite">
            {formatProgress(lifecycle.progress)}
          </p>
        ) : null}

        <div className="model-card-list">
          {models.length === 0 ? <p className="status-message">Loading model catalog…</p> : null}
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              inspection={lifecycle.inspections[model.id]}
              activeRecord={activeByModelId.get(model.id)}
              installing={lifecycle.status === 'installing'}
              online={online}
              onInspect={() => inspectModel(model.id)}
              onInstall={() => installModel(model.id)}
              onDelete={() => deleteModel(model.id)}
            />
          ))}
        </div>
      </details>
    </section>
  );
}

function OfflineStatusSummary({ view }: { readonly view: OfflinePanelStateView }) {
  return (
    <div className="offline-status-summary" data-tone={view.tone} aria-live="polite">
      <div>
        <h3>{view.headline}</h3>
        <p>{view.summary}</p>
      </div>
      <dl aria-label="Offline and update status">
        {view.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.blocker ? (
        <p role="alert" className="status-message error-message">
          {view.blocker}
        </p>
      ) : null}
      {view.updateNotice ? (
        <p className="status-message update-message">{view.updateNotice}</p>
      ) : null}
    </div>
  );
}

function toOfflineModelStatus(
  status: LifecycleStatus,
): 'loading' | 'ready' | 'installing' | 'error' {
  if (status === 'installing' || status === 'ready' || status === 'error') return status;
  return 'loading';
}

function reduceLifecycleMessage(
  current: ModelLifecycleState,
  message: ModelLifecycleResponse,
): ModelLifecycleState {
  switch (message.type) {
    case 'READY':
      return {
        ...current,
        status: 'ready',
        catalog: message.catalog,
        backendKind: message.backendKind,
        installed: message.installed,
        errorMessage: null,
      };
    case 'MANIFEST_READY':
      return {
        ...current,
        inspections: {
          ...current.inspections,
          [message.inspection.modelId]: message.inspection,
        },
      };
    case 'INSTALL_PROGRESS':
      return { ...current, status: 'installing', progress: message.progress };
    case 'INSTALL_COMPLETE':
      return {
        ...current,
        status: 'ready',
        installed: replaceInstalledRecord(current.installed, message.record),
        progress: null,
      };
    case 'DELETE_COMPLETE':
      return {
        ...current,
        status: 'ready',
        installed: current.installed.filter((record) => record.modelId !== message.modelId),
      };
    case 'ERROR':
      return {
        ...current,
        status: 'error',
        progress: null,
        errorMessage: message.message,
      };
  }
}

function ModelCard({
  model,
  inspection,
  activeRecord,
  installing,
  online,
  onInspect,
  onInstall,
  onDelete,
}: {
  readonly model: ModelLifecycleModel;
  readonly inspection: ManifestInspectionResult | undefined;
  readonly activeRecord: InstalledModelRecord | undefined;
  readonly installing: boolean;
  readonly online: boolean;
  readonly onInspect: () => void;
  readonly onInstall: () => void;
  readonly onDelete: () => void;
}) {
  const installed = activeRecord !== undefined;
  const hasManifest = model.manifestUrl !== undefined;
  const installDisabled =
    installing || !online || !model.runtime.installable || !hasManifest || inspection === undefined;
  return (
    <article className="model-card" aria-labelledby={`${model.id}-title`}>
      <div>
        <p className="eyebrow">{model.runtime.status}</p>
        <h4 id={`${model.id}-title`}>{model.displayName}</h4>
        <ul className="model-card-notes">
          {model.runtime.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
      <dl className="model-card-meta" aria-label={`${model.displayName} lifecycle details`}>
        <div>
          <dt>Version</dt>
          <dd>{model.version}</dd>
        </div>
        <div>
          <dt>Languages</dt>
          <dd>{model.languages.join(', ')}</dd>
        </div>
        <div>
          <dt>Streaming ready</dt>
          <dd>{model.runtime.streamingReady ? 'yes' : 'not yet'}</dd>
        </div>
        <div>
          <dt>Install state</dt>
          <dd>
            {!model.runtime.installable
              ? 'not installable'
              : installed
                ? `active ${activeRecord.activeVersion}`
                : 'not installed'}
          </dd>
        </div>
        <div>
          <dt>Manifest</dt>
          <dd>
            {!hasManifest
              ? 'not available'
              : inspection
                ? `${formatBytes(inspection.requiredStorageBytes)} · ${inspection.fileCount.toString()} files`
                : 'not inspected'}
          </dd>
        </div>
        <div>
          <dt>Manifest checksum</dt>
          <dd>{formatManifestChecksumStatus(inspection, hasManifest)}</dd>
        </div>
      </dl>
      <div className="model-card-actions">
        <button type="button" className="secondary" onClick={onInspect} disabled={!hasManifest}>
          {hasManifest ? 'Inspect manifest' : 'Manifest unavailable'}
        </button>
        <button type="button" onClick={onInstall} disabled={installDisabled || installed}>
          {installed ? 'Installed' : 'Install model pack'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onDelete}
          disabled={!installed || installing}
        >
          Delete active model
        </button>
      </div>
    </article>
  );
}

function formatManifestChecksumStatus(
  inspection: ManifestInspectionResult | undefined,
  hasManifest: boolean,
): string {
  if (!hasManifest) return 'not available';
  if (inspection === undefined) return 'pending';
  return inspection.manifestSha256MatchesCatalog ? 'verified' : 'mismatch';
}

function formatProgress(progress: ModelInstallProgress): string {
  const filePart = progress.fileKey ? ` ${progress.fileKey}` : '';
  const bytePart =
    progress.completedBytes === undefined || progress.totalBytes === undefined
      ? ''
      : ` (${formatBytes(progress.completedBytes)} / ${formatBytes(progress.totalBytes)})`;
  return `Model lifecycle: ${progress.phase}${filePart}${bytePart}`;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value.toString()} B`;
}

function replaceInstalledRecord(
  records: readonly InstalledModelRecord[],
  nextRecord: InstalledModelRecord,
): InstalledModelRecord[] {
  return [...records.filter((record) => record.modelId !== nextRecord.modelId), nextRecord];
}
