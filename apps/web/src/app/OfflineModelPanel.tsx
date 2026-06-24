import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activatePwaUpdate,
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
  status: 'idle',
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
    setLifecycle((current) => ({ ...current, status: 'loading', errorMessage: null }));
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

  const models = lifecycle.catalog?.models ?? [];
  const activeByModelId = useMemo(() => {
    const records = new Map<string, InstalledModelRecord>();
    for (const record of lifecycle.installed) {
      records.set(record.modelId, record);
    }
    return records;
  }, [lifecycle.installed]);

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
        <p className="eyebrow">Offline app shell</p>
        <h2 id="offline-model-title">Offline readiness and model lifecycle</h2>
        <p>
          The service worker owns only app-shell caching and update prompts. Model files stay in the
          model-manager backend so app updates do not delete installed model versions.
        </p>
      </div>

      <div className="offline-grid" aria-label="Offline app shell status">
        <StatusCard
          label="Network"
          value={online ? 'Online' : 'Offline'}
          tone={online ? 'good' : 'warn'}
        />
        <StatusCard
          label="Service worker"
          value={formatRegistrationState(pwa)}
          tone={pwa.registrationState === 'error' ? 'error' : 'neutral'}
        />
        <StatusCard
          label="Offline app shell"
          value={pwa.offlineReady ? 'Ready' : 'Preparing'}
          tone={pwa.offlineReady ? 'good' : 'warn'}
        />
        <StatusCard
          label="Model storage"
          value={lifecycle.backendKind ?? 'loading'}
          tone={lifecycle.backendKind === null ? 'warn' : 'neutral'}
        />
      </div>

      {pwa.updateAvailable ? (
        <div className="status-message update-message">
          <span>
            A new app shell is ready. It will not replace a running utterance automatically.
          </span>
          <button type="button" className="secondary" onClick={() => void activatePwaUpdate()}>
            Reload update
          </button>
        </div>
      ) : null}
      {pwa.errorMessage ? <p className="status-message error-message">{pwa.errorMessage}</p> : null}

      <div className="model-lifecycle-heading">
        <h3>Model catalog</h3>
        <p>
          Inspect manifests before downloading large model files. Installation runs in a dedicated
          worker and verifies size, checksum, license, and active-version state before activation.
        </p>
      </div>

      {lifecycle.errorMessage ? (
        <p role="alert" className="status-message error-message">
          {lifecycle.errorMessage}
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
    </section>
  );
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

function StatusCard({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: 'neutral' | 'good' | 'warn' | 'error';
}) {
  return (
    <div className="status-pill" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function formatRegistrationState(snapshot: PwaLifecycleSnapshot): string {
  if (!snapshot.serviceWorkerSupported) return 'Unsupported';
  if (snapshot.registrationScope !== null) return 'Registered';
  return snapshot.registrationState;
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
