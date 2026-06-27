import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { MenuButton, type MenuButtonItem } from '@speech/ui';
import {
  buildTrainingReadinessCoverageReportForProfile,
  type ActiveEnrollmentProfileStateV1,
  type EnrollmentProfileExportPackageV1,
  type EnrollmentProfileImportMode,
  type EnrollmentProfileImportResultV1,
  type EnrollmentProfileSummaryV1,
  type ProfileStorageBackendKind,
} from '@speech/profile-manager';
import type { InstalledModelRecord } from '@speech/model-manager';
import {
  deactivateEnrollmentProfile,
  deleteEnrollmentProfile,
  enableEnrollmentProfile,
  exportEnrollmentProfile,
  importEnrollmentProfile,
  listEnrollmentProfiles,
  renameEnrollmentProfile,
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
  buildPersonalModelActivationReviewCard,
  buildPersonalModelListRow,
  buildPersonalModelProfileCard,
  summarizeActiveVocabulary,
  type ActiveVocabularySummaryV1,
  type PersonalModelActivationReviewCardV1,
  type PersonalModelListRowV1,
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
  readonly summaries: readonly EnrollmentProfileSummaryV1[];
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
  summaries: [],
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
  const [importMode, setImportMode] = useState<EnrollmentProfileImportMode>('dedupe');
  const modelLifecycleWorkerRef = useRef<Worker | null>(null);
  const primarySummary = useMemo(
    () =>
      state.summaries.find(
        (summary) => summary.profile.id === state.activeState?.activeProfileId,
      ) ??
      state.summaries[0] ??
      null,
    [state.activeState?.activeProfileId, state.summaries],
  );
  const cardRows = useMemo(() => {
    if (state.summaries.length === 0) {
      const card = buildPersonalModelProfileCard({
        summary: null,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      });
      return [
        {
          profileId: null,
          summary: null,
          card,
          row: buildPersonalModelListRow(card),
        },
      ];
    }
    return state.summaries.map((summary) => {
      const card = buildPersonalModelProfileCard({
        summary,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      });
      return {
        profileId: summary.profile.id,
        summary,
        card,
        row: buildPersonalModelListRow(card),
      };
    });
  }, [state.activeState, state.activeVocabulary, state.summaries]);
  const primaryCard = buildPersonalModelProfileCard({
    summary: primarySummary,
    activeState: state.activeState,
    activeVocabulary: state.activeVocabulary,
  });
  const activationReview = useMemo(
    () =>
      buildPersonalModelActivationReviewCard({
        profileCard: primaryCard,
        activeState: state.activeState,
        activationDecision: null,
      }),
    [primaryCard, state.activeState],
  );
  const readinessReport = useMemo(
    () =>
      primarySummary === null
        ? null
        : buildTrainingReadinessCoverageReportForProfile(primarySummary),
    [primarySummary],
  );
  const capabilityChecks = useMemo(
    () => buildPersonalModelCapabilityChecks(preflight.capabilityReport),
    [preflight.capabilityReport],
  );
  const preferredBaseModelId = primarySummary?.profile.baseModel?.id;
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
      const result = await listEnrollmentProfiles();
      if (cancelled()) return;
      setState({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summaries: result.summaries,
        activeVocabulary: vocabulary,
        message:
          nextMessage ??
          (result.summaries.length === 0
            ? 'No personal profile is stored yet. The app will use the generic base-model fallback.'
            : `Loaded ${result.summaries.length.toString()} local personal profile card${
                result.summaries.length === 1 ? '' : 's'
              } from private storage.`),
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

  async function enableProfile(profileId: string) {
    await runLifecycleAction(
      'activating',
      'Enabling this personal profile between utterances…',
      () => enableEnrollmentProfile({ profileId }),
    );
  }

  async function deactivateProfile(profileId: string) {
    if (!window.confirm('Deactivate this voice model and use the generic fallback instead?')) {
      return;
    }
    await runLifecycleAction(
      'activating',
      'Deactivating this voice model at the next boundary…',
      () => deactivateEnrollmentProfile({ profileId }),
    );
  }

  async function rollbackProfile() {
    if (!window.confirm('Roll back to the previously active voice model?')) {
      return;
    }
    await runLifecycleAction('activating', 'Rolling back to the previous active profile…', () =>
      rollbackEnrollmentProfile(),
    );
  }

  async function exportProfile(profileId: string) {
    setState((current) => ({
      ...current,
      status: 'exporting',
      message: 'Preparing a sensitive local profile export package…',
    }));
    try {
      const result = await exportEnrollmentProfile({
        profileId,
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
      const result = await importEnrollmentProfile({
        profilePackage,
        mode: importMode,
        overwriteExisting: importMode === 'replace',
        timeoutMs: 15_000,
      });
      await refreshPersonalModels({
        nextMessage: formatImportResultMessage(result.importResult),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Profile import failed.',
      }));
    }
  }

  async function duplicateProfile(profileId: string, displayName: string) {
    setState((current) => ({
      ...current,
      status: 'importing',
      message:
        'Duplicating this local profile without exporting private files outside the browser…',
    }));
    try {
      const exportResult = await exportEnrollmentProfile({ profileId, timeoutMs: 15_000 });
      const result = await importEnrollmentProfile({
        profilePackage: exportResult.profilePackage,
        mode: 'import-as-new',
        targetDisplayName: `${displayName} copy`,
        timeoutMs: 15_000,
      });
      await refreshPersonalModels({
        nextMessage: formatImportResultMessage(result.importResult),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Profile duplicate failed.',
      }));
    }
  }

  async function renameProfile(profileId: string, currentDisplayName: string) {
    const displayName = window.prompt('Rename this voice model', currentDisplayName)?.trim();
    if (
      displayName === undefined ||
      displayName.length === 0 ||
      displayName === currentDisplayName
    ) {
      return;
    }
    setState((current) => ({
      ...current,
      status: 'loading',
      message: 'Renaming local personal profile card…',
    }));
    try {
      await renameEnrollmentProfile({ profileId, displayName, timeoutMs: 15_000 });
      await refreshPersonalModels({
        nextMessage: 'Personal profile display name updated locally.',
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Profile rename failed.',
      }));
    }
  }

  async function deleteProfile(profileId: string, displayName: string) {
    if (
      !window.confirm(
        `Delete ${displayName}? Recordings, features, checkpoints, and adapter files for this model will be removed from this device.`,
      )
    ) {
      return;
    }
    await runLifecycleAction('deleting', 'Deleting stored profile files and active pointers…', () =>
      deleteEnrollmentProfile({ profileId }),
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
    <section className="panel personal-models" id="models" aria-labelledby="personal-models-title">
      <div className="section-heading">
        <p className="eyebrow">Personal models</p>
        <h2 id="personal-models-title">Voice models</h2>
        <p>
          Choose the active local model, continue recording or training, and keep import/export
          actions private on this device.
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
        <StatusPill
          label="Cards"
          value={`${state.summaries.length.toString()} local profile${
            state.summaries.length === 1 ? '' : 's'
          }`}
        />
        <StatusPill label="Profile store" value={formatProfileStoreBackend(state.backendKind)} />
        <StatusPill
          label="Persistent storage"
          value={formatPersistentStorage(state.persistentStorageGranted)}
        />
        <StatusPill
          label="Active vocabulary"
          value={`${primaryCard.activeVocabulary.activeEntryCount.toString()} entries`}
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

      <PersonalModelActivationReviewPanel review={activationReview} />

      <section className="model-list-panel" aria-labelledby="voice-models-list-title">
        <div className="model-list-header">
          <div>
            <p className="eyebrow">Voice models</p>
            <h3 id="voice-models-list-title">Models</h3>
          </div>
          <div className="model-list-toolbar" aria-label="Model list actions">
            <a className="button secondary" href="#microphone-title">
              New
            </a>
            <label className="secondary file-button">
              Import
              <input
                type="file"
                accept="application/json,.json,.speechprofile"
                onChange={(event) => void importProfile(event)}
                disabled={isBusy}
              />
            </label>
          </div>
        </div>

        <div className="model-import-options" aria-label="Model import options">
          <label className="select-field compact-select">
            <span>Import behavior</span>
            <select
              value={importMode}
              onChange={(event) =>
                setImportMode(event.currentTarget.value as EnrollmentProfileImportMode)
              }
              disabled={isBusy}
            >
              <option value="dedupe">Dedupe</option>
              <option value="import-as-new">Import as new</option>
              <option value="replace">Replace match</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => void refreshPersonalModels()}
            disabled={isBusy}
          >
            Refresh
          </button>
        </div>

        <div className="model-list" role="list" aria-label="Personal voice model rows">
          {cardRows.map((row) => (
            <article
              className="model-list-row"
              role="listitem"
              key={row.profileId ?? 'generic-fallback'}
            >
              <div className="model-list-main">
                <h4>{row.row.displayName}</h4>
                <div className="model-list-status" aria-label={`${row.row.displayName} status`}>
                  <span className={row.card.active ? 'status-chip success' : 'status-chip'}>
                    {row.row.activeLabel}
                  </span>
                  <span className="status-chip">{row.row.statusLabel}</span>
                </div>
              </div>
              <div className="model-list-meta" aria-label={`${row.row.displayName} summary`}>
                <span>{row.card.storage.acceptedUtterances.toString()} recordings</span>
                <span>{formatDurationSeconds(row.card.storage.acceptedSeconds)}</span>
                <span>{row.card.activeVocabulary.activeEntryCount.toString()} vocabulary</span>
              </div>
              <div className="model-list-actions">
                <ModelRowPrimaryAction
                  row={row}
                  isBusy={isBusy}
                  onEnable={() =>
                    row.profileId === null ? undefined : void enableProfile(row.profileId)
                  }
                />
                {row.profileId === null ? null : (
                  <MenuButton
                    label="More"
                    menuLabel={`${row.row.displayName} model actions`}
                    buttonSize="sm"
                    items={createModelRowMenuItems({
                      profileId: row.profileId,
                      displayName: row.row.displayName,
                      active: row.card.active,
                      canExport: row.card.actions.canExport,
                      canDelete: row.card.actions.canDelete,
                      isBusy,
                      previousProfileAvailable: state.activeState?.previousProfileId !== undefined,
                      onRename: () => void renameProfile(row.profileId, row.row.displayName),
                      onDuplicate: () => void duplicateProfile(row.profileId, row.row.displayName),
                      onExport: () => void exportProfile(row.profileId),
                      onDeactivate: () => void deactivateProfile(row.profileId),
                      onRollback: () => void rollbackProfile(),
                      onDelete: () => void deleteProfile(row.profileId, row.row.displayName),
                    })}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

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

function ModelRowPrimaryAction({
  row,
  isBusy,
  onEnable,
}: {
  readonly row: {
    readonly profileId: string | null;
    readonly card: PersonalModelProfileCardV1;
    readonly row: PersonalModelListRowV1;
  };
  readonly isBusy: boolean;
  readonly onEnable: () => void | undefined;
}) {
  if (row.row.primaryAction === 'continue-recording') {
    return (
      <a className="button secondary" href="#microphone-title">
        {row.row.primaryActionLabel}
      </a>
    );
  }
  if (row.row.primaryAction === 'use-model') {
    return (
      <button
        type="button"
        className="secondary"
        onClick={onEnable}
        disabled={isBusy || row.row.primaryActionDisabled || !row.card.actions.canEnable}
      >
        {row.row.primaryActionLabel}
      </button>
    );
  }
  return (
    <button type="button" className="secondary" disabled>
      {row.row.primaryActionLabel}
    </button>
  );
}

function createModelRowMenuItems({
  profileId,
  displayName,
  active,
  canExport,
  canDelete,
  isBusy,
  previousProfileAvailable,
  onRename,
  onDuplicate,
  onExport,
  onDeactivate,
  onRollback,
  onDelete,
}: {
  readonly profileId: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly canExport: boolean;
  readonly canDelete: boolean;
  readonly isBusy: boolean;
  readonly previousProfileAvailable: boolean;
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
  readonly onDeactivate: () => void;
  readonly onRollback: () => void;
  readonly onDelete: () => void;
}): readonly MenuButtonItem[] {
  return [
    { id: `${profileId}-rename`, label: 'Rename…', disabled: isBusy, onSelect: onRename },
    { id: `${profileId}-duplicate`, label: 'Duplicate…', disabled: isBusy, onSelect: onDuplicate },
    {
      id: `${profileId}-export`,
      label: 'Export…',
      disabled: isBusy || !canExport,
      onSelect: onExport,
    },
    {
      id: `${profileId}-deactivate`,
      label: active ? 'Deactivate…' : 'Deactivate',
      disabled: isBusy || !active,
      onSelect: onDeactivate,
    },
    {
      id: `${profileId}-rollback`,
      label: 'Roll back…',
      disabled: isBusy || !active || !previousProfileAvailable,
      onSelect: onRollback,
    },
    {
      id: `${profileId}-delete`,
      label: `Delete ${displayName}…`,
      disabled: isBusy || !canDelete,
      destructive: true,
      onSelect: onDelete,
    },
  ];
}

function PersonalModelActivationReviewPanel({
  review,
}: {
  readonly review: PersonalModelActivationReviewCardV1;
}) {
  return (
    <section className="activation-review-card" aria-labelledby="activation-review-title">
      <div className="section-heading compact-heading">
        <p className="eyebrow">Activation review</p>
        <h3 id="activation-review-title">Comparison gates and rollback</h3>
        <p>
          Aggregate personal/anchor evaluation decides whether a candidate adapter can activate
          automatically, needs explicit advanced override, or must stay blocked while the generic or
          previous adapter remains available.
        </p>
      </div>
      <div className="personal-models-summary" aria-label="Activation gate summary">
        <StatusPill label="Gate status" value={formatActivationReviewStatus(review)} />
        <StatusPill
          label="Activation"
          value={review.activationAllowed ? 'allowed at boundary' : 'not allowed'}
        />
        <StatusPill
          label="Advanced override"
          value={review.advancedOverrideAvailable ? 'available for soft gates' : 'not available'}
        />
        <StatusPill
          label="Rollback"
          value={
            review.rollback.previousProfileAvailable ? 'previous retained' : 'generic fallback'
          }
        />
      </div>
      <dl className="model-card-meta personal-model-card-meta activation-review-meta">
        <div>
          <dt>Personal held-out cases</dt>
          <dd>{review.comparison.personalHeldoutCases.toString()}</dd>
        </div>
        <div>
          <dt>Anchor cases</dt>
          <dd>{review.comparison.anchorCases.toString()}</dd>
        </div>
        <div>
          <dt>Selected vocabulary</dt>
          <dd>{review.comparison.selectedVocabularyEntryCount.toString()} entries</dd>
        </div>
        <div>
          <dt>Personal WER improvement</dt>
          <dd>
            {formatNullablePercent(review.comparison.candidateVsGenericWerRelativeImprovement)}
          </dd>
        </div>
        <div>
          <dt>P1 WER delta</dt>
          <dd>{formatNullableNumber(review.comparison.candidateVsP1WerDelta)}</dd>
        </div>
        <div>
          <dt>Anchor WER delta</dt>
          <dd>{formatNullableNumber(review.comparison.anchorWerDelta)}</dd>
        </div>
        <div>
          <dt>RTF overhead vs P1</dt>
          <dd>{formatNullablePercent(review.comparison.rtfOverheadRatioVsP1)}</dd>
        </div>
        <div>
          <dt>Adapter size</dt>
          <dd>{formatNullableBytes(review.comparison.candidateAdapterSizeBytes)}</dd>
        </div>
      </dl>
      <p className="status-message">
        <strong>{review.title}.</strong> {review.detail}
      </p>
      <p className="status-message">
        Activation privacy: aggregate metrics only; no raw audio, transcript text, case IDs, feature
        tensors, checkpoints, adapter weights, raw profile IDs, vocabulary terms, or vocabulary
        entry IDs are displayed.
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

function formatImportResultMessage(result: EnrollmentProfileImportResultV1): string {
  switch (result.operation) {
    case 'deduped-existing':
      return 'Profile import matched an existing local profile, so no duplicate files were written.';
    case 'imported-new':
      return result.nameCollisionResolved
        ? 'Profile import verified checksums, created a new local profile, and resolved a display-name collision.'
        : 'Profile import verified checksums and created a new local profile. Review before enabling.';
    case 'replaced-existing':
      return 'Profile import verified checksums and replaced the matching local profile.';
  }
}

function formatActivationReviewStatus(review: PersonalModelActivationReviewCardV1): string {
  switch (review.status) {
    case 'generic-fallback':
      return 'generic fallback';
    case 'awaiting-evaluation':
      return 'awaiting evaluation';
    case 'automatic-ready':
      return 'automatic ready';
    case 'advanced-override-required':
      return 'override required';
    case 'advanced-override-accepted':
      return 'override accepted';
    case 'blocked':
      return 'blocked';
  }
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'not evaluated' : value.toFixed(6);
}

function formatNullablePercent(value: number | null): string {
  return value === null ? 'not evaluated' : `${(value * 100).toFixed(2)}%`;
}

function formatNullableBytes(value: number | null): string {
  return value === null ? 'not evaluated' : formatPreflightBytes(value);
}

function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes.toString()} min ${remainder.toString()} s`;
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
