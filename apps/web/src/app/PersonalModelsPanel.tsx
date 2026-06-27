import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Accordion, MenuButton, type MenuButtonItem } from '@speech/ui';
import type { TrainingReadinessCoverageReportV1 } from '@speech/enrollment';
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
import { formatModelReasonMessage, getModelReasonCopy } from '../content/reasonCodes';
import {
  buildPersonalModelActivationReviewCard,
  buildPersonalModelDetailSummary,
  buildPersonalModelListRow,
  buildPersonalModelProfileCard,
  summarizeActiveVocabulary,
  type ActiveVocabularySummaryV1,
  type PersonalModelActivationReviewCardV1,
  type PersonalModelDetailSummaryV1,
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
  message: formatModelReasonMessage('model-profiles-loading'),
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
    message: getModelReasonCopy('model-runtime-check-idle').message,
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
  const primaryRow = useMemo(() => buildPersonalModelListRow(primaryCard), [primaryCard]);
  const detailSummary = useMemo(
    () => buildPersonalModelDetailSummary({ card: primaryCard, row: primaryRow }),
    [primaryCard, primaryRow],
  );
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
  const detailBlockers = useMemo(
    () =>
      buildModelDetailBlockers({
        activationReview,
        capabilityChecks,
        readinessTasks,
        trainingCompanion,
      }),
    [activationReview, capabilityChecks, readinessTasks, trainingCompanion],
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
      } catch {
        if (cancelled) return;
        setPreflight((current) => ({
          ...current,
          capabilityError: formatModelReasonMessage('model-capability-check-failed'),
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

    function handleModelLifecycleError(_event: ErrorEvent) {
      setPreflight((current) => ({
        ...current,
        modelStatus: 'error',
        modelError: formatModelReasonMessage('model-companion-check-failed'),
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
      message: nextMessage ?? formatModelReasonMessage('model-profile-refresh-started'),
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
            ? formatModelReasonMessage('model-profiles-empty')
            : formatModelReasonMessage('model-profiles-loaded')),
      });
    } catch {
      if (cancelled()) return;
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-profiles-load-failed'),
      }));
    }
  }

  async function runRuntimeSelfTest() {
    setPreflight((current) => ({
      ...current,
      runtimeSelfTest: {
        status: 'checking',
        result: current.runtimeSelfTest.result,
        message: formatModelReasonMessage('model-runtime-check-started'),
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
          message: formatModelReasonMessage('model-runtime-check-passed'),
        },
      }));
    } catch {
      setPreflight((current) => ({
        ...current,
        runtimeSelfTest: {
          status: 'error',
          result: null,
          message: formatModelReasonMessage('model-runtime-check-failed'),
        },
      }));
    }
  }

  async function enableProfile(profileId: string) {
    await runLifecycleAction('activating', formatModelReasonMessage('model-enable-started'), () =>
      enableEnrollmentProfile({ profileId }),
    );
  }

  async function deactivateProfile(profileId: string) {
    if (!window.confirm('Deactivate this voice model and use the generic fallback instead?')) {
      return;
    }
    await runLifecycleAction(
      'activating',
      formatModelReasonMessage('model-deactivate-started'),
      () => deactivateEnrollmentProfile({ profileId }),
    );
  }

  async function rollbackProfile() {
    if (!window.confirm('Roll back to the previously active voice model?')) {
      return;
    }
    await runLifecycleAction('activating', formatModelReasonMessage('model-rollback-started'), () =>
      rollbackEnrollmentProfile(),
    );
  }

  async function exportProfile(profileId: string) {
    setState((current) => ({
      ...current,
      status: 'exporting',
      message: formatModelReasonMessage('model-export-started'),
    }));
    try {
      const result = await exportEnrollmentProfile({
        profileId,
        timeoutMs: 15_000,
      });
      downloadProfilePackage(result.profilePackage);
      await refreshPersonalModels({
        nextMessage: formatModelReasonMessage('model-export-complete'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-export-failed'),
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
      message: formatModelReasonMessage('model-import-started'),
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
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-import-failed'),
      }));
    }
  }

  async function duplicateProfile(profileId: string, displayName: string) {
    setState((current) => ({
      ...current,
      status: 'importing',
      message: formatModelReasonMessage('model-duplicate-started'),
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
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-duplicate-failed'),
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
      message: formatModelReasonMessage('model-rename-started'),
    }));
    try {
      await renameEnrollmentProfile({ profileId, displayName, timeoutMs: 15_000 });
      await refreshPersonalModels({
        nextMessage: formatModelReasonMessage('model-rename-complete'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-rename-failed'),
      }));
    }
  }

  async function deleteProfile(profileId: string, displayName: string) {
    if (
      !window.confirm(
        `Delete ${displayName}? Recordings, training data, and local model files for this voice model will be removed from this device.`,
      )
    ) {
      return;
    }
    await runLifecycleAction('deleting', formatModelReasonMessage('model-delete-started'), () =>
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
            ? formatModelReasonMessage('model-delete-complete')
            : formatModelReasonMessage('model-lifecycle-refreshed'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-lifecycle-failed'),
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
          Speech model lifecycle
        </a>
      </nav>

      <div className="personal-models-summary" aria-label="Personal Models summary">
        <StatusPill
          label="Voice models"
          value={`${state.summaries.length.toString()} local voice model${
            state.summaries.length === 1 ? '' : 's'
          }`}
        />
        <StatusPill label="Storage" value={formatProfileStoreBackend(state.backendKind)} />
        <StatusPill
          label="Persistent storage"
          value={formatPersistentStorage(state.persistentStorageGranted)}
        />
        <StatusPill
          label="Active vocabulary"
          value={`${primaryCard.activeVocabulary.activeEntryCount.toString()} words`}
        />
      </div>

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

      <PersonalModelDetailPanel
        activeState={state.activeState}
        backendKind={state.backendKind}
        capabilityChecks={capabilityChecks}
        capabilityError={preflight.capabilityError}
        card={primaryCard}
        detailBlockers={detailBlockers}
        detailSummary={detailSummary}
        isBusy={isBusy}
        modelBackendKind={preflight.modelBackendKind}
        modelError={preflight.modelError}
        modelStatus={preflight.modelStatus}
        onDeactivate={() =>
          primarySummary === null ? undefined : void deactivateProfile(primarySummary.profile.id)
        }
        onEnable={() =>
          primarySummary === null ? undefined : void enableProfile(primarySummary.profile.id)
        }
        onRunRuntimeSelfTest={() => void runRuntimeSelfTest()}
        persistentStorageGranted={state.persistentStorageGranted}
        readinessReport={readinessReport}
        readinessTasks={readinessTasks}
        review={activationReview}
        runtimeSelfTest={preflight.runtimeSelfTest}
        trainingCompanion={trainingCompanion}
      />

      <p
        className={state.status === 'error' ? 'status-message error-message' : 'status-message'}
        aria-live="polite"
      >
        {state.message}
      </p>
      <p className="status-message">
        Models privacy: aggregate counts only; no raw audio, transcript text, training data, model
        files, vocabulary terms, or vocabulary item identifiers are displayed.
      </p>
    </section>
  );
}

interface ModelDetailBlocker {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: 'blocker' | 'warning';
}

function PersonalModelDetailPanel({
  activeState,
  backendKind,
  capabilityChecks,
  capabilityError,
  card,
  detailBlockers,
  detailSummary,
  isBusy,
  modelBackendKind,
  modelError,
  modelStatus,
  onDeactivate,
  onEnable,
  onRunRuntimeSelfTest,
  persistentStorageGranted,
  readinessReport,
  readinessTasks,
  review,
  runtimeSelfTest,
  trainingCompanion,
}: {
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly capabilityError: string | null;
  readonly card: PersonalModelProfileCardV1;
  readonly detailBlockers: readonly ModelDetailBlocker[];
  readonly detailSummary: PersonalModelDetailSummaryV1;
  readonly isBusy: boolean;
  readonly modelBackendKind: string | null;
  readonly modelError: string | null;
  readonly modelStatus: PersonalModelsPreflightState['modelStatus'];
  readonly onDeactivate: () => void | undefined;
  readonly onEnable: () => void | undefined;
  readonly onRunRuntimeSelfTest: () => void;
  readonly persistentStorageGranted: boolean | null;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly review: PersonalModelActivationReviewCardV1;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <section className="model-detail-panel" aria-labelledby="model-detail-title">
      <div className="model-detail-summary">
        <div className="model-detail-summary__copy">
          <p className="eyebrow">Model detail</p>
          <h3 id="model-detail-title">{detailSummary.displayName}</h3>
          <p>{detailSummary.nextActionSentence}</p>
          <dl className="model-detail-summary__meta" aria-label="Selected model summary">
            <div>
              <dt>Status</dt>
              <dd>{detailSummary.statusLabel}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateLabel(detailSummary.lastUpdatedIso)}</dd>
            </div>
          </dl>
        </div>
        <ModelDetailPrimaryAction
          detailSummary={detailSummary}
          isBusy={isBusy}
          onDeactivate={onDeactivate}
          onEnable={onEnable}
        />
      </div>

      {detailBlockers.length === 0 ? null : (
        <div className="model-detail-blockers" aria-label="Model blockers and incompatibilities">
          {detailBlockers.map((blocker) => (
            <article data-tone={blocker.tone} key={blocker.id}>
              <strong>{blocker.label}</strong>
              <p>{blocker.detail}</p>
            </article>
          ))}
        </div>
      )}

      <Accordion
        aria-label="Model detail sections"
        className="model-detail-accordion"
        headingLevel={4}
        items={[
          {
            id: 'recording-coverage',
            title: 'Recording coverage',
            children: (
              <ModelDetailRecordingCoverage
                card={card}
                readinessReport={readinessReport}
                readinessTasks={readinessTasks}
              />
            ),
          },
          {
            id: 'quality-results',
            title: 'Quality results',
            children: <PersonalModelActivationReviewPanel review={review} />,
          },
          {
            id: 'compatibility',
            title: 'Compatibility',
            children: (
              <ModelDetailCompatibilitySection
                capabilityChecks={capabilityChecks}
                capabilityError={capabilityError}
                modelError={modelError}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
          {
            id: 'storage',
            title: 'Storage',
            children: (
              <ModelDetailStorageSection
                backendKind={backendKind}
                card={card}
                persistentStorageGranted={persistentStorageGranted}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
          {
            id: 'technical-details',
            title: 'Technical details',
            children: (
              <ModelDetailTechnicalSection
                activeState={activeState}
                card={card}
                modelBackendKind={modelBackendKind}
                modelStatus={modelStatus}
                onRunRuntimeSelfTest={onRunRuntimeSelfTest}
                runtimeSelfTest={runtimeSelfTest}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function ModelDetailPrimaryAction({
  detailSummary,
  isBusy,
  onDeactivate,
  onEnable,
}: {
  readonly detailSummary: PersonalModelDetailSummaryV1;
  readonly isBusy: boolean;
  readonly onDeactivate: () => void | undefined;
  readonly onEnable: () => void | undefined;
}) {
  if (detailSummary.primaryAction === 'continue-recording') {
    return (
      <a className="button" href="#microphone-title">
        {detailSummary.primaryActionLabel}
      </a>
    );
  }

  if (detailSummary.primaryAction === 'use-model') {
    return (
      <button
        type="button"
        onClick={onEnable}
        disabled={isBusy || detailSummary.primaryActionDisabled}
      >
        {detailSummary.primaryActionLabel}
      </button>
    );
  }

  if (detailSummary.primaryAction === 'deactivate') {
    return (
      <button type="button" className="secondary" onClick={onDeactivate} disabled={isBusy}>
        {detailSummary.primaryActionLabel}
      </button>
    );
  }

  return (
    <button type="button" className="secondary" disabled>
      {detailSummary.primaryActionLabel}
    </button>
  );
}

function ModelDetailRecordingCoverage({
  card,
  readinessReport,
  readinessTasks,
}: {
  readonly card: PersonalModelProfileCardV1;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Accepted recordings</dt>
          <dd>{card.storage.acceptedUtterances.toString()}</dd>
        </div>
        <div>
          <dt>Active speech</dt>
          <dd>{formatDurationSeconds(card.storage.acceptedSeconds)}</dd>
        </div>
        <div>
          <dt>Prompt coverage</dt>
          <dd>{formatPromptCoverage(readinessReport)}</dd>
        </div>
        <div>
          <dt>Vocabulary coverage</dt>
          <dd>{formatVocabularyCoverage(readinessReport)}</dd>
        </div>
      </dl>
      <ul className="model-detail-task-list" aria-label="Recording coverage tasks">
        {readinessTasks.map((task) => (
          <li key={task.label} data-status={task.status}>
            <strong>{task.label}</strong>
            <span>
              {task.status === 'complete' ? 'Complete' : `${task.missing.toString()} missing`}
            </span>
            <p>{task.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelDetailCompatibilitySection({
  capabilityChecks,
  capabilityError,
  modelError,
  trainingCompanion,
}: {
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly capabilityError: string | null;
  readonly modelError: string | null;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      {capabilityError ? <p className="status-message error-message">{capabilityError}</p> : null}
      {modelError ? <p className="status-message error-message">{modelError}</p> : null}
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Speech model</dt>
          <dd>{trainingCompanion.modelLabel}</dd>
        </div>
        <div>
          <dt>Training support files</dt>
          <dd>{formatTrainingCompanionStatus(trainingCompanion)}</dd>
        </div>
        <div>
          <dt>Required files</dt>
          <dd>{trainingCompanion.requiredFileCount.toString()}</dd>
        </div>
        <div>
          <dt>Required storage</dt>
          <dd>{formatPreflightBytes(trainingCompanion.requiredStorageBytes)}</dd>
        </div>
      </dl>
      <ul className="preflight-check-list" aria-label="Compatibility checks">
        {capabilityChecks.map((check) => (
          <li key={check.label} data-status={check.status}>
            <strong>{check.label}</strong>
            <span>{formatPreflightStatus(check.status)}</span>
            <p>{check.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelDetailStorageSection({
  backendKind,
  card,
  persistentStorageGranted,
  trainingCompanion,
}: {
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly card: PersonalModelProfileCardV1;
  readonly persistentStorageGranted: boolean | null;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Recordings and profile</dt>
          <dd>{formatNullableBytes(card.storage.storedBytes)}</dd>
        </div>
        <div>
          <dt>Training support files</dt>
          <dd>{formatPreflightBytes(trainingCompanion.requiredStorageBytes)}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{formatProfileStoreBackend(backendKind)}</dd>
        </div>
        <div>
          <dt>Persistent storage</dt>
          <dd>{formatPersistentStorage(persistentStorageGranted)}</dd>
        </div>
      </dl>
      <p className="status-message">
        Storage details remain local. Delete and export actions stay in each model row menu so
        destructive consequences remain explicit.
      </p>
    </div>
  );
}

function ModelDetailTechnicalSection({
  activeState,
  card,
  modelBackendKind,
  modelStatus,
  onRunRuntimeSelfTest,
  runtimeSelfTest,
  trainingCompanion,
}: {
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly card: PersonalModelProfileCardV1;
  readonly modelBackendKind: string | null;
  readonly modelStatus: PersonalModelsPreflightState['modelStatus'];
  readonly onRunRuntimeSelfTest: () => void;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Speech model binding</dt>
          <dd>
            {card.baseModel.status === 'exact-bound' ? 'exact match retained' : 'generic fallback'}
          </dd>
        </div>
        <div>
          <dt>Speech model version</dt>
          <dd>{card.baseModel.version ?? 'not bound'}</dd>
        </div>
        <div>
          <dt>Model storage</dt>
          <dd>{modelBackendKind ?? modelStatus}</dd>
        </div>
        <div>
          <dt>Runtime self-test</dt>
          <dd>{formatRuntimeSelfTestStatus(runtimeSelfTest)}</dd>
        </div>
        <div>
          <dt>Training support status</dt>
          <dd>{formatTrainingCompanionStatus(trainingCompanion)}</dd>
        </div>
        <div>
          <dt>Rollback state</dt>
          <dd>
            {activeState?.previousProfileId === undefined
              ? 'generic fallback'
              : 'previous retained'}
          </dd>
        </div>
      </dl>
      <button type="button" className="secondary" onClick={onRunRuntimeSelfTest}>
        Run runtime self-test
      </button>
      <p className="status-message">
        Technical details stay aggregate-only here. Diagnostics exports retain exact reproducible
        metrics with existing privacy filtering.
      </p>
    </div>
  );
}

function buildModelDetailBlockers({
  activationReview,
  capabilityChecks,
  readinessTasks,
  trainingCompanion,
}: {
  readonly activationReview: PersonalModelActivationReviewCardV1;
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}): readonly ModelDetailBlocker[] {
  const blockers: ModelDetailBlocker[] = [];
  if (activationReview.status === 'blocked') {
    blockers.push({
      id: 'activation-blocked',
      label: 'Activation blocked',
      detail: activationReview.detail,
      tone: 'blocker',
    });
  }

  const missingReadiness = readinessTasks.find((task) => task.status === 'missing');
  if (missingReadiness !== undefined) {
    blockers.push({
      id: 'recording-coverage-needed',
      label: 'Recording coverage needed',
      detail: missingReadiness.detail,
      tone: 'warning',
    });
  }

  if (trainingCompanion.status === 'base-model-missing') {
    blockers.push({
      id: 'base-model-missing',
      label: 'Speech model required',
      detail: trainingCompanion.detail,
      tone: 'blocker',
    });
  }

  const actionNeededCheck = capabilityChecks.find((check) => check.status === 'action-needed');
  if (actionNeededCheck !== undefined) {
    blockers.push({
      id: 'capability-action-needed',
      label: actionNeededCheck.label,
      detail: actionNeededCheck.detail,
      tone: 'warning',
    });
  }

  return blockers.slice(0, 4);
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
        <p className="eyebrow">Quality review</p>
        <h3 id="activation-review-title">Quality checks and rollback</h3>
        <p>
          Aggregate personal and general speech checks decide whether this voice model can activate
          automatically, needs explicit review, or must stay blocked while the generic or previous
          model remains available.
        </p>
      </div>
      <div className="personal-models-summary" aria-label="Quality check summary">
        <StatusPill label="Check status" value={formatActivationReviewStatus(review)} />
        <StatusPill
          label="Activation"
          value={review.activationAllowed ? 'allowed at boundary' : 'not allowed'}
        />
        <StatusPill
          label="Advanced override"
          value={
            review.advancedOverrideAvailable ? 'available for advisory checks' : 'not available'
          }
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
          <dt>Personal review cases</dt>
          <dd>{review.comparison.personalHeldoutCases.toString()}</dd>
        </div>
        <div>
          <dt>General speech cases</dt>
          <dd>{review.comparison.anchorCases.toString()}</dd>
        </div>
        <div>
          <dt>Selected vocabulary</dt>
          <dd>{review.comparison.selectedVocabularyEntryCount.toString()} words</dd>
        </div>
        <div>
          <dt>Personal speech improvement</dt>
          <dd>{formatSignedPercent(review.comparison.candidateVsGenericWerRelativeImprovement)}</dd>
        </div>
        <div>
          <dt>Baseline difference</dt>
          <dd>{formatSignedPercent(review.comparison.candidateVsP1WerDelta)}</dd>
        </div>
        <div>
          <dt>General speech difference</dt>
          <dd>{formatSignedPercent(review.comparison.anchorWerDelta)}</dd>
        </div>
        <div>
          <dt>Speed overhead</dt>
          <dd>{formatNullablePercent(review.comparison.rtfOverheadRatioVsP1)}</dd>
        </div>
        <div>
          <dt>Model file size</dt>
          <dd>{formatNullableBytes(review.comparison.candidateAdapterSizeBytes)}</dd>
        </div>
      </dl>
      <p className="status-message">
        <strong>{review.title}.</strong> {review.detail}
      </p>
      <p className="status-message">
        Activation privacy: aggregate metrics only; no raw audio, transcript text, case identifiers,
        training data, model files, profile identifiers, vocabulary terms, or vocabulary item
        identifiers are displayed.
      </p>
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
        modelError: formatModelReasonMessage('model-companion-check-failed'),
      };
  }
}

function formatImportResultMessage(result: EnrollmentProfileImportResultV1): string {
  switch (result.operation) {
    case 'deduped-existing':
      return formatModelReasonMessage('model-import-deduped-existing');
    case 'imported-new':
      return result.nameCollisionResolved
        ? formatModelReasonMessage('model-imported-name-collision')
        : formatModelReasonMessage('model-imported-new');
    case 'replaced-existing':
      return formatModelReasonMessage('model-replaced-existing');
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

function formatSignedPercent(value: number | null): string {
  if (value === null) return 'not evaluated';
  const percent = value * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
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
      return 'speech model required';
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

function formatDateLabel(iso: string | null): string {
  if (iso === null) return 'No updates yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Updated locally';
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPromptCoverage(report: TrainingReadinessCoverageReportV1 | null): string {
  if (report === null) return 'No saved prompts yet';
  return `${report.totals.uniquePromptIdentities.toLocaleString('en')} unique prompts`;
}

function formatVocabularyCoverage(report: TrainingReadinessCoverageReportV1 | null): string {
  if (report === null) return 'No selected words';
  return `${report.vocabularyCoverage.coveredEntryCount.toLocaleString('en')} of ${report.vocabularyCoverage.targetedEntryCount.toLocaleString('en')} selected words`;
}

function formatProfileStoreBackend(kind: ProfileStorageBackendKind | null): string {
  if (kind === null) return 'checking';
  return kind === 'opfs' ? 'device storage' : 'temporary storage';
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
