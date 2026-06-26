import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  buildTrainingReadinessCoverageReportForProfile,
  type ActiveEnrollmentProfileStateV1,
  type EnrollmentProfileExportPackageV1,
  type EnrollmentProfileSummaryV1,
  type ProfileStorageBackendKind,
} from '@speech/profile-manager';
import type { InstalledModelRecord } from '@speech/model-manager';
import {
  deleteEnrollmentProfile,
  enableEnrollmentProfile,
  exportEnrollmentProfile,
  importEnrollmentProfile,
  loadEnrollmentProfile,
  rollbackEnrollmentProfile,
} from '../workers/profile-store-client';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';
import {
  createModelLifecycleWorker,
  type ManifestInspectionResult,
  type ModelLifecycleModel,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';
import {
  probeRuntimeCapabilities,
  runCapabilityWorkerBenchmark,
  type CapabilityReport,
} from '../capabilities';
import { createDefaultVocabularyStore, loadVocabularyStore } from './vocabulary-storage';
import {
  buildPersonalModelProfileCard,
  defaultPersonalProfileId,
  summarizeActiveVocabulary,
  type ActiveVocabularySummaryV1,
  type PersonalModelCardStatus,
  type PersonalModelProfileCardV1,
} from './personal-models';
import {
  buildPersonalModelCapabilityChecks,
  buildPersonalModelReadinessTasks,
  formatPreflightBytes,
  summarizePersonalModelTrainingCompanion,
  type PersonalModelPreflightCheckV1,
  type PersonalModelPreflightStatus,
  type PersonalModelReadinessTaskV1,
  type PersonalModelTrainingCompanionSummaryV1,
} from './personal-models-preflight';

type PersonalModelsStatus =
  | 'loading'
  | 'ready'
  | 'activating'
  | 'exporting'
  | 'importing'
  | 'deleting'
  | 'error';

interface PersonalModelsUiState {
  readonly status: PersonalModelsStatus;
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly persistentStorageGranted: boolean | null;
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly summary: EnrollmentProfileSummaryV1 | null;
  readonly activeVocabulary: ActiveVocabularySummaryV1;
  readonly message: string;
}

type RuntimeSelfTestStatus = 'idle' | 'checking' | 'ready' | 'error';

interface RuntimeSelfTestUiState {
  readonly status: RuntimeSelfTestStatus;
  readonly result: AsrWorkerRuntimeCheckResult | null;
  readonly message: string;
}

interface PersonalModelsPreflightState {
  readonly capabilityReport: CapabilityReport | null;
  readonly capabilityError: string | null;
  readonly modelStatus: 'loading' | 'ready' | 'error';
  readonly modelBackendKind: string | null;
  readonly models: readonly ModelLifecycleModel[];
  readonly installed: readonly InstalledModelRecord[];
  readonly inspections: Readonly<Record<string, ManifestInspectionResult>>;
  readonly modelError: string | null;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
}

const initialVocabularySummary = summarizeActiveVocabulary(createDefaultVocabularyStore());

const initialPersonalModelsState: PersonalModelsUiState = {
  status: 'loading',
  backendKind: null,
  persistentStorageGranted: null,
  activeState: null,
  summary: null,
  activeVocabulary: initialVocabularySummary,
  message: 'Loading local profile cards and active vocabulary counts…',
};

const initialPreflightState: PersonalModelsPreflightState = {
  capabilityReport: null,
  capabilityError: null,
  modelStatus: 'loading',
  modelBackendKind: null,
  models: [],
  installed: [],
  inspections: {},
  modelError: null,
  runtimeSelfTest: {
    status: 'idle',
    result: null,
    message: 'Runtime self-test has not run yet.',
  },
};

export function PersonalModelsPanel() {
  const [state, setState] = useState<PersonalModelsUiState>(initialPersonalModelsState);
  const [preflight, setPreflight] = useState<PersonalModelsPreflightState>(initialPreflightState);
  const modelLifecycleWorkerRef = useRef<Worker | null>(null);
  const card = useMemo(
    () =>
      buildPersonalModelProfileCard({
        summary: state.summary,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      }),
    [state.activeState, state.activeVocabulary, state.summary],
  );
  const readinessReport = useMemo(
    () =>
      state.summary === null ? null : buildTrainingReadinessCoverageReportForProfile(state.summary),
    [state.summary],
  );
  const capabilityChecks = useMemo(
    () => buildPersonalModelCapabilityChecks(preflight.capabilityReport),
    [preflight.capabilityReport],
  );
  const preferredBaseModelId = state.summary?.profile.baseModel?.id;
  const trainingCompanion = useMemo(
    () =>
      summarizePersonalModelTrainingCompanion({
        models: preflight.models,
        installed: preflight.installed,
        inspections: preflight.inspections,
        ...(preferredBaseModelId === undefined ? {} : { preferredModelId: preferredBaseModelId }),
      }),
    [preflight.inspections, preflight.installed, preflight.models, preferredBaseModelId],
  );
  const readinessTasks = useMemo(
    () => buildPersonalModelReadinessTasks(readinessReport),
    [readinessReport],
  );
  const isBusy =
    state.status === 'loading' ||
    state.status === 'activating' ||
    state.status === 'exporting' ||
    state.status === 'importing' ||
    state.status === 'deleting';

  useEffect(() => {
    let cancelled = false;
    void refreshPersonalModels({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function runCapabilityPreflight() {
      try {
        const report = await probeRuntimeCapabilities(await runCapabilityWorkerBenchmark(5));
        if (cancelled) return;
        setPreflight((current) => ({
          ...current,
          capabilityReport: report,
          capabilityError: null,
        }));
      } catch (error) {
        if (cancelled) return;
        setPreflight((current) => ({
          ...current,
          capabilityError:
            error instanceof Error ? error.message : 'Capability preflight could not run.',
        }));
      }
    }
    void runCapabilityPreflight();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const worker = createModelLifecycleWorker();
    modelLifecycleWorkerRef.current = worker;
    worker.addEventListener('message', handleModelLifecycleMessage);
    worker.addEventListener('error', handleModelLifecycleError);
    worker.postMessage({ type: 'INIT' });

    function handleModelLifecycleMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      setPreflight((current) => reduceModelLifecyclePreflight(current, message));
      if (message.type === 'READY') {
        for (const model of message.catalog.models) {
          if (model.manifestUrl !== undefined) {
            worker.postMessage({ type: 'INSPECT_MODEL', modelId: model.id });
          }
        }
      }
    }

    function handleModelLifecycleError(event: ErrorEvent) {
      setPreflight((current) => ({
        ...current,
        modelStatus: 'error',
        modelError: event.message,
      }));
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleModelLifecycleMessage);
      worker.removeEventListener('error', handleModelLifecycleError);
      worker.terminate();
      if (modelLifecycleWorkerRef.current === worker) {
        modelLifecycleWorkerRef.current = null;
      }
    };
  }, []);

  async function refreshPersonalModels({
    cancelled = () => false,
    nextMessage,
  }: {
    readonly cancelled?: () => boolean;
    readonly nextMessage?: string;
  } = {}) {
    setState((current) => ({
      ...current,
      status: 'loading',
      message: nextMessage ?? 'Refreshing local profile cards and active vocabulary counts…',
    }));
    try {
      const vocabulary = summarizeActiveVocabulary(
        loadVocabularyStore(window.localStorage).snapshot,
      );
      const result = await loadEnrollmentProfile({ profileId: defaultPersonalProfileId });
      if (cancelled()) return;
      setState({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summary: result.summary ?? null,
        activeVocabulary: vocabulary,
        message:
          nextMessage ??
          (result.summary === undefined
            ? 'No personal profile is stored yet. The app will use the generic base-model fallback.'
            : 'Personal model card refreshed from private local profile storage.'),
      });
    } catch (error) {
      if (cancelled()) return;
      setState((current) => ({
        ...current,
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Personal model cards could not load from local profile storage.',
      }));
    }
  }

  async function runRuntimeSelfTest() {
    setPreflight((current) => ({
      ...current,
      runtimeSelfTest: {
        status: 'checking',
        result: current.runtimeSelfTest.result,
        message: 'Running ASR worker provider and adapter smoke self-test…',
      },
    }));
    try {
      const result = await checkAsrWorkerRuntime({
        preferredProvider: 'auto',
        adapterSmokeTest: true,
        timeoutMs: 15_000,
      });
      setPreflight((current) => ({
        ...current,
        runtimeSelfTest: {
          status: 'ready',
          result,
          message: 'Runtime self-test passed inside the ASR worker.',
        },
      }));
    } catch (error) {
      setPreflight((current) => ({
        ...current,
        runtimeSelfTest: {
          status: 'error',
          result: null,
          message: error instanceof Error ? error.message : 'Runtime self-test failed.',
        },
      }));
    }
  }

  async function enableProfile() {
    if (!card.actions.canEnable) return;
    await runLifecycleAction(
      'activating',
      'Enabling this personal profile between utterances…',
      () => enableEnrollmentProfile({ profileId: defaultPersonalProfileId }),
    );
  }

  async function rollbackProfile() {
    await runLifecycleAction('activating', 'Rolling back to the previous active profile…', () =>
      rollbackEnrollmentProfile(),
    );
  }

  async function exportProfile() {
    if (!card.actions.canExport) return;
    setState((current) => ({
      ...current,
      status: 'exporting',
      message: 'Preparing a sensitive local profile export package…',
    }));
    try {
      const result = await exportEnrollmentProfile({
        profileId: defaultPersonalProfileId,
        timeoutMs: 15_000,
      });
      downloadProfilePackage(result.profilePackage);
      await refreshPersonalModels({
        nextMessage:
          'Profile export downloaded locally. Treat it as sensitive voice data outside this browser.',
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Profile export failed.',
      }));
    }
  }

  async function importProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setState((current) => ({
      ...current,
      status: 'importing',
      message: 'Importing and verifying a sensitive local profile package…',
    }));
    try {
      const profilePackage = JSON.parse(await file.text()) as EnrollmentProfileExportPackageV1;
      await importEnrollmentProfile({
        profilePackage,
        overwriteExisting: true,
        timeoutMs: 15_000,
      });
      await refreshPersonalModels({
        nextMessage:
          'Profile import verified checksums and restored local profile files. Review before enabling.',
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Profile import failed.',
      }));
    }
  }

  async function deleteProfile() {
    if (!card.actions.canDelete) return;
    await runLifecycleAction('deleting', 'Deleting stored profile files and active pointers…', () =>
      deleteEnrollmentProfile({ profileId: defaultPersonalProfileId }),
    );
  }

  async function runLifecycleAction(
    status: Extract<PersonalModelsStatus, 'activating' | 'deleting'>,
    message: string,
    action: () => Promise<unknown>,
  ) {
    setState((current) => ({ ...current, status, message }));
    try {
      await action();
      await refreshPersonalModels({
        nextMessage:
          status === 'deleting'
            ? 'Stored profile recordings, derived files, and local active pointers were deleted.'
            : 'Personal profile lifecycle state refreshed from local storage.',
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Personal profile lifecycle action failed.',
      }));
    }
  }

  return (
    <section className="panel personal-models" aria-labelledby="personal-models-title">
      <div className="section-heading">
        <p className="eyebrow">Personal models</p>
        <h2 id="personal-models-title">Profile cards and local lifecycle</h2>
        <p>
          Review local voice profiles, active vocabulary coverage, base-model compatibility, and
          explicit export/import/delete actions from one privacy-first area. Heavy profile work
          remains worker-owned; cards show aggregate status only.
        </p>
      </div>

      <nav className="personal-models-nav" aria-label="Personal Models navigation">
        <a className="button secondary" href="#microphone-title">
          Record enrollment
        </a>
        <a className="button secondary" href="#vocabulary-title">
          Edit vocabulary
        </a>
        <a className="button secondary" href="#runtime-title">
          Train or resume
        </a>
        <a className="button secondary" href="#offline-model-title">
          Base model lifecycle
        </a>
      </nav>

      <div className="personal-models-summary" aria-label="Personal Models summary">
        <StatusPill label="Cards" value="1 local profile slot" />
        <StatusPill label="Profile store" value={formatProfileStoreBackend(state.backendKind)} />
        <StatusPill
          label="Persistent storage"
          value={formatPersistentStorage(state.persistentStorageGranted)}
        />
        <StatusPill
          label="Active vocabulary"
          value={`${card.activeVocabulary.activeEntryCount.toString()} entries`}
        />
      </div>

      <PersonalModelPreflightPanel
        capabilityChecks={capabilityChecks}
        capabilityError={preflight.capabilityError}
        trainingCompanion={trainingCompanion}
        modelStatus={preflight.modelStatus}
        modelBackendKind={preflight.modelBackendKind}
        modelError={preflight.modelError}
        runtimeSelfTest={preflight.runtimeSelfTest}
        readinessTasks={readinessTasks}
        onRunRuntimeSelfTest={() => void runRuntimeSelfTest()}
      />

      <div className="personal-model-card-list" aria-label="Personal model profile cards">
        <PersonalModelProfileCard card={card} />
      </div>

      <div className="hero-actions" aria-label="Personal model profile lifecycle controls">
        <button
          type="button"
          className="secondary"
          onClick={() => void refreshPersonalModels()}
          disabled={isBusy}
        >
          Refresh profile cards
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void enableProfile()}
          disabled={isBusy || !card.actions.canEnable}
        >
          Enable personal profile
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void rollbackProfile()}
          disabled={isBusy || state.activeState?.previousProfileId === undefined}
        >
          Roll back active profile
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void exportProfile()}
          disabled={isBusy || !card.actions.canExport}
        >
          Export sensitive profile package
        </button>
        <label className="secondary file-button">
          Import profile package
          <input
            type="file"
            accept="application/json,.json,.speechprofile"
            onChange={(event) => void importProfile(event)}
            disabled={isBusy}
          />
        </label>
        <button
          type="button"
          className="secondary danger"
          onClick={() => void deleteProfile()}
          disabled={isBusy || !card.actions.canDelete}
        >
          Delete local personal profile
        </button>
      </div>

      <p
        className={state.status === 'error' ? 'status-message error-message' : 'status-message'}
        aria-live="polite"
      >
        {state.message}
      </p>
      <p className="status-message">
        Card privacy: aggregate counts only; no raw audio, transcript text, feature tensors,
        checkpoints, adapter weights, vocabulary terms, or vocabulary entry IDs are displayed.
      </p>
    </section>
  );
}

function PersonalModelPreflightPanel({
  capabilityChecks,
  capabilityError,
  trainingCompanion,
  modelStatus,
  modelBackendKind,
  modelError,
  runtimeSelfTest,
  readinessTasks,
  onRunRuntimeSelfTest,
}: {
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly capabilityError: string | null;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
  readonly modelStatus: PersonalModelsPreflightState['modelStatus'];
  readonly modelBackendKind: string | null;
  readonly modelError: string | null;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly onRunRuntimeSelfTest: () => void;
}) {
  return (
    <section
      className="personal-models-preflight"
      aria-labelledby="personal-models-preflight-title"
    >
      <div className="section-heading compact-heading">
        <p className="eyebrow">Readiness preflight</p>
        <h3 id="personal-models-preflight-title">Browser personal-model readiness</h3>
        <p>
          Independent local checks summarize browser capabilities, base-model companion state,
          storage/quota, runtime self-test, and missing-recording tasks without reading private
          audio, transcripts, feature tensors, checkpoints, adapter weights, or vocabulary terms.
        </p>
      </div>

      <div className="personal-models-summary" aria-label="Personal model readiness summary">
        <StatusPill label="Capabilities" value={summarizeCheckStatuses(capabilityChecks)} />
        <StatusPill label="Model storage" value={modelBackendKind ?? modelStatus} />
        <StatusPill
          label="Training companion"
          value={formatTrainingCompanionStatus(trainingCompanion)}
        />
        <StatusPill
          label="Runtime self-test"
          value={formatRuntimeSelfTestStatus(runtimeSelfTest)}
        />
      </div>

      {capabilityError ? <p className="status-message error-message">{capabilityError}</p> : null}
      {modelError ? <p className="status-message error-message">{modelError}</p> : null}

      <div className="preflight-grid" aria-label="Personal model capability preflight checks">
        <article className="preflight-card">
          <h4>Independent capability checks</h4>
          <ul className="preflight-check-list">
            {capabilityChecks.map((check) => (
              <li key={check.label} data-status={check.status}>
                <strong>{check.label}</strong>
                <span>{formatPreflightStatus(check.status)}</span>
                <p>{check.detail}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="preflight-card" aria-label="Training companion state">
          <h4>Training companion state</h4>
          <dl className="model-card-meta personal-model-card-meta">
            <div>
              <dt>Base model</dt>
              <dd>{trainingCompanion.modelLabel}</dd>
            </div>
            <div>
              <dt>Companion status</dt>
              <dd>{formatTrainingCompanionStatus(trainingCompanion)}</dd>
            </div>
            <div>
              <dt>Companion files</dt>
              <dd>
                {trainingCompanion.installedFileCount.toString()} /{' '}
                {trainingCompanion.requiredFileCount.toString()}
              </dd>
            </div>
            <div>
              <dt>Companion bytes</dt>
              <dd>{formatPreflightBytes(trainingCompanion.requiredStorageBytes)}</dd>
            </div>
          </dl>
          <p className="status-message">{trainingCompanion.detail}</p>
        </article>

        <article className="preflight-card" aria-label="Runtime self-test preflight">
          <h4>Runtime self-test</h4>
          <p>{runtimeSelfTest.message}</p>
          <dl className="model-card-meta personal-model-card-meta">
            <div>
              <dt>Provider</dt>
              <dd>{runtimeSelfTest.result?.provider ?? 'not run'}</dd>
            </div>
            <div>
              <dt>Adapter smoke</dt>
              <dd>{runtimeSelfTest.result?.adapterBenchmark ? 'passed' : 'not run'}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{runtimeSelfTest.result?.warnings.length ?? 0}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="secondary"
            onClick={onRunRuntimeSelfTest}
            disabled={runtimeSelfTest.status === 'checking'}
          >
            {runtimeSelfTest.status === 'checking'
              ? 'Running runtime self-test…'
              : 'Run runtime self-test'}
          </button>
        </article>

        <article className="preflight-card" aria-label="Missing recording tasks">
          <h4>Missing recording tasks</h4>
          <ul className="preflight-check-list">
            {readinessTasks.map((task) => (
              <li
                key={task.label}
                data-status={task.status === 'complete' ? 'ready' : 'action-needed'}
              >
                <strong>{task.label}</strong>
                <span>{task.status}</span>
                <p>{task.detail}</p>
              </li>
            ))}
          </ul>
          <p className="status-message">
            Task privacy: aggregate counts only; no prompt IDs, vocabulary entry IDs, transcript
            text, or private vocabulary terms are shown.
          </p>
        </article>
      </div>
    </section>
  );
}

function PersonalModelProfileCard({ card }: { readonly card: PersonalModelProfileCardV1 }) {
  return (
    <article className="personal-model-card" aria-label={`${card.displayName} profile card`}>
      <div className="personal-model-card-header">
        <div>
          <h3>{card.displayName}</h3>
          <p>{formatCardStatus(card.status)}</p>
        </div>
        <span data-status={card.status}>{card.active ? 'active' : card.status}</span>
      </div>
      <dl className="model-card-meta personal-model-card-meta">
        <div>
          <dt>Stored takes</dt>
          <dd>{card.storage.acceptedUtterances.toString()}</dd>
        </div>
        <div>
          <dt>Accepted duration</dt>
          <dd>{card.storage.acceptedSeconds.toFixed(1)} s</dd>
        </div>
        <div>
          <dt>Stored bytes</dt>
          <dd>{card.storage.storedBytes.toLocaleString()} bytes</dd>
        </div>
        <div>
          <dt>Base model</dt>
          <dd>{formatBaseModel(card)}</dd>
        </div>
        <div>
          <dt>Base dependency</dt>
          <dd>
            {card.baseModel.status === 'exact-bound'
              ? 'exact manifest match required'
              : 'generic fallback'}
          </dd>
        </div>
        <div>
          <dt>Active vocabulary</dt>
          <dd>{`${card.activeVocabulary.activeEntryCount.toString()} enabled entries`}</dd>
        </div>
        <div>
          <dt>Vocabulary revision</dt>
          <dd>{card.activeVocabulary.revision.toString()}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{card.storage.updatedAt ?? 'not stored yet'}</dd>
        </div>
      </dl>
      <p className="status-message">
        {card.status === 'no-profile'
          ? 'Generic fallback is active until you save or import a local profile.'
          : 'This card is backed by private local profile storage and can be exported only by explicit action.'}
      </p>
    </article>
  );
}

function StatusPill({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="status-pill" data-tone="neutral">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function reduceModelLifecyclePreflight(
  current: PersonalModelsPreflightState,
  message: ModelLifecycleResponse,
): PersonalModelsPreflightState {
  switch (message.type) {
    case 'READY':
      return {
        ...current,
        modelStatus: 'ready',
        modelBackendKind: message.backendKind,
        models: message.catalog.models,
        installed: message.installed,
        modelError: null,
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
    case 'INSTALL_COMPLETE':
    case 'DELETE_COMPLETE':
      return current;
    case 'ERROR':
      return {
        ...current,
        modelStatus: 'error',
        modelError: message.message,
      };
  }
}

function summarizeCheckStatuses(checks: readonly PersonalModelPreflightCheckV1[]): string {
  if (checks.some((check) => check.status === 'checking')) return 'checking';
  const actionNeeded = checks.filter((check) => check.status === 'action-needed').length;
  const fallbacks = checks.filter((check) => check.status === 'fallback').length;
  if (actionNeeded > 0) return `${actionNeeded.toString()} actions needed`;
  if (fallbacks > 0) return `${fallbacks.toString()} fallbacks`;
  return 'ready';
}

function formatPreflightStatus(status: PersonalModelPreflightStatus): string {
  switch (status) {
    case 'checking':
      return 'checking';
    case 'ready':
      return 'ready';
    case 'action-needed':
      return 'action needed';
    case 'fallback':
      return 'fallback';
  }
}

function formatTrainingCompanionStatus(companion: PersonalModelTrainingCompanionSummaryV1): string {
  switch (companion.status) {
    case 'checking':
      return 'checking';
    case 'installed':
      return 'installed';
    case 'available-not-installed':
      return 'available, not installed';
    case 'not-declared':
      return 'not declared';
    case 'base-model-missing':
      return 'base model missing';
  }
}

function formatRuntimeSelfTestStatus(runtimeSelfTest: RuntimeSelfTestUiState): string {
  switch (runtimeSelfTest.status) {
    case 'idle':
      return 'not run';
    case 'checking':
      return 'checking';
    case 'ready':
      return 'passed';
    case 'error':
      return 'failed';
  }
}

function formatCardStatus(status: PersonalModelCardStatus): string {
  switch (status) {
    case 'active':
      return 'Enabled locally and applied only at safe utterance boundaries.';
    case 'available':
      return 'Stored locally and ready for review or activation.';
    case 'no-profile':
      return 'No saved personal model yet; use the generic fallback.';
  }
}

function formatBaseModel(card: PersonalModelProfileCardV1): string {
  if (card.baseModel.status === 'generic-fallback') return card.baseModel.label;
  return `${card.baseModel.label} ${card.baseModel.version ?? ''}`.trim();
}

function formatProfileStoreBackend(kind: ProfileStorageBackendKind | null): string {
  if (kind === null) return 'checking';
  return kind === 'opfs' ? 'OPFS' : 'memory fallback';
}

function formatPersistentStorage(value: boolean | null): string {
  if (value === null) return 'checking';
  return value ? 'granted' : 'not granted';
}

function downloadProfilePackage(profilePackage: EnrollmentProfileExportPackageV1): void {
  const blob = new Blob([`${JSON.stringify(profilePackage, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${profilePackage.profileId}.speechprofile.json`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
