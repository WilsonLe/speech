import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileExportPackageV1,
  EnrollmentProfileSummaryV1,
  ProfileStorageBackendKind,
} from '@speech/profile-manager';
import {
  deleteEnrollmentProfile,
  enableEnrollmentProfile,
  exportEnrollmentProfile,
  importEnrollmentProfile,
  loadEnrollmentProfile,
  rollbackEnrollmentProfile,
} from '../workers/profile-store-client';
import { createDefaultVocabularyStore, loadVocabularyStore } from './vocabulary-storage';
import {
  buildPersonalModelProfileCard,
  defaultPersonalProfileId,
  summarizeActiveVocabulary,
  type ActiveVocabularySummaryV1,
  type PersonalModelCardStatus,
  type PersonalModelProfileCardV1,
} from './personal-models';

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

export function PersonalModelsPanel() {
  const [state, setState] = useState<PersonalModelsUiState>(initialPersonalModelsState);
  const card = useMemo(
    () =>
      buildPersonalModelProfileCard({
        summary: state.summary,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      }),
    [state.activeState, state.activeVocabulary, state.summary],
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
