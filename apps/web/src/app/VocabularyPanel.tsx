import { useEffect, useMemo, useState } from 'react';
import { MenuButton, type MenuButtonItem } from '@speech/ui';
import type { VocabularyEntryLanguage, VocabularyEntryV1 } from '@speech/protocol';
import { validateVocabularyStoreSnapshot } from '@speech/context-bias';
import { scheduleCustomVocabularyPrompts } from '@speech/enrollment';
import { getVocabularyOperationReasonCopy } from '../content/reasonCodes';
import {
  createDefaultVocabularyStore,
  createVocabularySet,
  deleteVocabularyEntry,
  deleteVocabularySet,
  formatVocabularyErrors,
  importVocabularyCsv,
  importVocabularyJson,
  loadVocabularyStore,
  saveVocabularyStore,
  serializeVocabularyCsv,
  serializeVocabularyJson,
  setVocabularySetEnabled,
  toggleVocabularyEntry,
  upsertVocabularyEntry,
  type VocabularyEntryDraft,
} from './vocabulary-storage';

const languageLabels: Record<VocabularyEntryLanguage, string> = {
  vi: 'Vietnamese',
  en: 'English',
  mixed: 'Mixed/code-switch',
  auto: 'Auto',
};

const emptyDraft: VocabularyEntryDraft = {
  phrase: '',
  displayForm: '',
  language: 'auto',
  spokenAliasesText: '',
  weight: 5,
  category: '',
  enabled: true,
  exactCase: true,
  promptPriority: '',
};

export function VocabularyPanel() {
  const [snapshot, setSnapshot] = useState(() => createDefaultVocabularyStore());
  const [selectedSetId, setSelectedSetId] = useState('set-work');
  const [draft, setDraft] = useState<VocabularyEntryDraft>(emptyDraft);
  const [displayFormOpen, setDisplayFormOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [setSearch, setSetSearch] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importText, setImportText] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [pendingRecordingRevision, setPendingRecordingRevision] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('Vocabulary is stored only in this browser.');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      const result = loadVocabularyStore(window.localStorage);
      setSnapshot(result.snapshot);
      setSelectedSetId(
        result.snapshot.activeSetIds[0] ?? result.snapshot.sets[0]?.id ?? 'set-work',
      );
      setStatusMessage(result.message);
      setIsLoaded(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoaded) saveVocabularyStore(window.localStorage, snapshot);
  }, [isLoaded, snapshot]);

  const selectedSet = useMemo(
    () => snapshot.sets.find((set) => set.id === selectedSetId) ?? snapshot.sets[0],
    [selectedSetId, snapshot.sets],
  );
  const activeEntryCount = snapshot.sets.reduce(
    (count, set) => count + (set.enabled ? set.entries.filter((entry) => entry.enabled).length : 0),
    0,
  );
  const enabledSetCount = snapshot.sets.filter((set) => set.enabled).length;
  const filteredSets = useMemo(() => {
    const query = setSearch.trim().toLocaleLowerCase();
    if (query.length === 0) return snapshot.sets;

    return snapshot.sets.filter((set) => set.displayName.toLocaleLowerCase().includes(query));
  }, [setSearch, snapshot.sets]);
  const storeValidation = useMemo(() => validateStoreMessage(snapshot), [snapshot]);
  const customPromptPreview = useMemo(
    () =>
      scheduleCustomVocabularyPrompts({
        entries: selectedSet?.entries ?? [],
        maxEntries: 3,
        maxPromptsPerEntry: 3,
      }),
    [selectedSet?.entries],
  );

  function applyResult(result: {
    readonly ok: boolean;
    readonly snapshot?: typeof snapshot;
    readonly message: string;
  }) {
    if (result.snapshot !== undefined) {
      setSnapshot(result.snapshot);
      if (!result.snapshot.sets.some((set) => set.id === selectedSetId)) {
        setSelectedSetId(
          result.snapshot.activeSetIds[0] ?? result.snapshot.sets[0]?.id ?? 'set-work',
        );
      }
      if (result.snapshot.revision !== snapshot.revision) {
        setPendingRecordingRevision(result.snapshot.revision);
      }
    }
    setStatusMessage(result.message);
  }

  function createSet() {
    const result = createVocabularySet(snapshot, newSetName);
    applyResult(result);
    if (result.ok && result.snapshot !== undefined) {
      const created = result.snapshot.sets.at(-1);
      if (created !== undefined) setSelectedSetId(created.id);
      setNewSetName('');
    }
  }

  function submitEntry() {
    if (selectedSet === undefined) return;
    const result = upsertVocabularyEntry(snapshot, selectedSet.id, draft);
    applyResult(result);
    if (result.ok) {
      setDraft(emptyDraft);
      setDisplayFormOpen(false);
    }
  }

  function editEntry(entry: VocabularyEntryV1) {
    setDraft({
      id: entry.id,
      phrase: entry.phrase,
      displayForm: entry.displayForm,
      language: entry.language,
      spokenAliasesText: entry.spokenAliases.join('\n'),
      weight: entry.weight,
      category: entry.category ?? '',
      enabled: entry.enabled,
      exactCase: entry.exactCase,
      promptPriority: entry.promptPriority?.toString() ?? '',
    });
    setDisplayFormOpen(entry.displayForm !== entry.phrase);
    setStatusMessage(`Editing vocabulary entry “${entry.displayForm}”.`);
  }

  function exportJson() {
    downloadTextFile(
      'speech-vocabulary.json',
      serializeVocabularyJson(snapshot),
      'application/json;charset=utf-8',
    );
    setStatusMessage(
      'Exported local vocabulary JSON. Keep this file private if it contains names or sensitive terms.',
    );
  }

  function exportCsv() {
    if (selectedSet === undefined) return;
    downloadTextFile(
      `speech-vocabulary-${selectedSet.id}.csv`,
      serializeVocabularyCsv(selectedSet),
      'text/csv;charset=utf-8',
    );
    setStatusMessage('Exported selected vocabulary set as CSV.');
  }

  const screenMenuItems: readonly MenuButtonItem[] = [
    {
      id: 'open-import-export',
      label: 'Import or export…',
      onSelect: () => setManagementOpen(true),
    },
    {
      id: 'export-all-json',
      label: 'Export all JSON',
      onSelect: exportJson,
    },
    {
      id: 'export-selected-csv',
      label: 'Export selected CSV',
      disabled: selectedSet === undefined,
      onSelect: exportCsv,
    },
  ];

  function openSet(setId: string) {
    setSelectedSetId(setId);
    setDraft(emptyDraft);
    setDisplayFormOpen(false);
  }

  function resetEntryDraft() {
    setDraft(emptyDraft);
    setDisplayFormOpen(false);
  }

  function confirmDeleteSet(setId: string, displayName: string, entryCount: number) {
    const confirmed = window.confirm(
      `Delete “${displayName}”? ${entryCount.toString()} words will stop applying to future recordings and local enrollment prompts. Exports made later will not include this set.`,
    );
    if (!confirmed) return;
    applyResult(deleteVocabularySet(snapshot, setId));
    resetEntryDraft();
  }

  function confirmDeleteEntry(entry: VocabularyEntryV1) {
    if (selectedSet === undefined) return;
    const confirmed = window.confirm(
      `Delete “${entry.displayForm}”? It will stop applying to future recordings and local enrollment prompts.`,
    );
    if (!confirmed) return;
    applyResult(deleteVocabularyEntry(snapshot, selectedSet.id, entry.id));
    if (draft.id === entry.id) resetEntryDraft();
  }

  function importVocabulary() {
    if (selectedSet === undefined) return;
    const result =
      importFormat === 'json'
        ? importVocabularyJson(importText, snapshot, selectedSet.id)
        : importVocabularyCsv(importText, snapshot, selectedSet.id);
    applyResult(result);
    if (result.ok) setImportText('');
  }

  return (
    <section className="panel vocabulary" id="vocabulary" aria-labelledby="vocabulary-title">
      <div className="section-heading vocabulary-heading">
        <div>
          <p className="eyebrow">Vocabulary</p>
          <h2 id="vocabulary-title">Vocabulary sets</h2>
          <p>Words the recognizer should favour stay on this device.</p>
        </div>
        <MenuButton
          buttonSize="sm"
          buttonVariant="secondary"
          items={screenMenuItems}
          label="More"
          menuLabel="Vocabulary screen actions"
        />
      </div>

      <div className="vocabulary-summary" aria-label="Vocabulary summary">
        <StatusMetric label="Sets" value={snapshot.sets.length.toString()} />
        <StatusMetric label="On" value={enabledSetCount.toString()} />
        <StatusMetric label="Words" value={activeEntryCount.toString()} />
      </div>

      {pendingRecordingRevision === null ? null : (
        <p className="status-message vocabulary-boundary" aria-live="polite">
          Applies next recording.
        </p>
      )}

      <article
        className="vocabulary-card vocabulary-set-browser"
        aria-labelledby="vocabulary-sets-title"
      >
        <div className="vocabulary-set-browser__header">
          <h3 id="vocabulary-sets-title">Sets</h3>
          <div className="inline-form vocabulary-new-set">
            <label htmlFor="new-vocabulary-set-name">
              New set
              <input
                id="new-vocabulary-set-name"
                value={newSetName}
                onChange={(event) => {
                  setNewSetName(event.currentTarget.value);
                }}
                placeholder="Contacts"
              />
            </label>
            <button type="button" className="secondary" onClick={createSet}>
              New set
            </button>
          </div>
        </div>

        <label className="vocabulary-search" htmlFor="vocabulary-set-search">
          Search
          <input
            id="vocabulary-set-search"
            value={setSearch}
            onChange={(event) => setSetSearch(event.currentTarget.value)}
            placeholder="Find a set"
          />
        </label>

        {filteredSets.length > 0 ? (
          <div className="vocabulary-set-list" aria-label="Vocabulary sets">
            {filteredSets.map((set) => {
              const isSelected = set.id === selectedSet?.id;
              const enabledEntries = set.entries.filter((entry) => entry.enabled).length;
              const rowMenuItems: readonly MenuButtonItem[] = [
                { id: `open-${set.id}`, label: 'Open', onSelect: () => openSet(set.id) },
                {
                  id: `toggle-${set.id}`,
                  label: set.enabled ? 'Turn off' : 'Turn on',
                  onSelect: () =>
                    applyResult(setVocabularySetEnabled(snapshot, set.id, !set.enabled)),
                },
                {
                  id: `export-${set.id}`,
                  label: 'Export CSV',
                  onSelect: () => {
                    downloadTextFile(
                      `speech-vocabulary-${set.id}.csv`,
                      serializeVocabularyCsv(set),
                      'text/csv;charset=utf-8',
                    );
                    setStatusMessage('Exported selected vocabulary set as CSV.');
                  },
                },
                {
                  id: `delete-${set.id}`,
                  label: 'Delete…',
                  destructive: true,
                  disabled: snapshot.sets.length <= 1,
                  onSelect: () => confirmDeleteSet(set.id, set.displayName, set.entries.length),
                },
              ];

              return (
                <div
                  className="vocabulary-set-row"
                  data-selected={isSelected ? 'true' : undefined}
                  key={set.id}
                >
                  <button
                    type="button"
                    className="vocabulary-set-row__open"
                    onClick={() => openSet(set.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`Open ${set.displayName}`}
                  >
                    <span className="vocabulary-set-row__name">{set.displayName}</span>
                    <span className="vocabulary-set-row__meta">
                      {set.enabled ? 'On' : 'Off'} · {set.entries.length} words · {enabledEntries}{' '}
                      active
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary vocabulary-set-row__toggle"
                    onClick={() =>
                      applyResult(setVocabularySetEnabled(snapshot, set.id, !set.enabled))
                    }
                    aria-label={`${set.enabled ? 'Turn off' : 'Turn on'} ${set.displayName}`}
                  >
                    {set.enabled ? 'On' : 'Off'}
                  </button>
                  <MenuButton
                    buttonSize="sm"
                    buttonVariant="ghost"
                    items={rowMenuItems}
                    label="More"
                    menuLabel={`Actions for ${set.displayName}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vocabulary-empty">
            <p>No sets match this search.</p>
            <button type="button" className="secondary" onClick={() => setSetSearch('')}>
              Clear search
            </button>
          </div>
        )}
      </article>

      <div className="vocabulary-layout vocabulary-editor-layout">
        <article
          className="vocabulary-card vocabulary-selected-set"
          aria-labelledby="vocabulary-selected-title"
        >
          <h3 id="vocabulary-selected-title">{selectedSet?.displayName ?? 'Selected set'}</h3>
          {selectedSet !== undefined ? (
            <>
              <p>
                {selectedSet.entries.length} words · {selectedSet.enabled ? 'On' : 'Off'}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={selectedSet.enabled}
                  onChange={(event) => {
                    const { checked } = event.currentTarget;
                    applyResult(setVocabularySetEnabled(snapshot, selectedSet.id, checked));
                  }}
                />
                Use for next recordings
              </label>
            </>
          ) : (
            <p>Select a vocabulary set to edit its words.</p>
          )}
        </article>

        <article
          className="vocabulary-card vocabulary-entry-editor"
          aria-labelledby="vocabulary-entry-form-title"
        >
          <div className="vocabulary-entry-editor__heading">
            <div>
              <h3 id="vocabulary-entry-form-title">{draft.id ? 'Edit word' : 'Add word'}</h3>
              <p>Basic fields are enough for most names, acronyms, and project phrases.</p>
            </div>
            <span className="status-pill" data-tone="neutral">
              Saved after {draft.id ? 'update' : 'add'}
            </span>
          </div>

          <div className="vocabulary-form-grid vocabulary-form-grid--basic">
            <label htmlFor="vocabulary-phrase">
              Term
              <input
                id="vocabulary-phrase"
                value={draft.phrase}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setDraft((current) => ({ ...current, phrase: value }));
                }}
                placeholder="Pangea Chat"
              />
            </label>
            <label htmlFor="vocabulary-language">
              Language
              <select
                id="vocabulary-language"
                value={draft.language}
                onChange={(event) => {
                  const value = event.currentTarget.value as VocabularyEntryLanguage;
                  setDraft((current) => ({
                    ...current,
                    language: value,
                  }));
                }}
              >
                <option value="auto">Auto</option>
                <option value="vi">Vietnamese</option>
                <option value="en">English</option>
                <option value="mixed">Mixed/code-switch</option>
              </select>
            </label>
          </div>

          <label htmlFor="vocabulary-aliases">
            Spoken variants
            <textarea
              id="vocabulary-aliases"
              value={draft.spokenAliasesText}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setDraft((current) => ({
                  ...current,
                  spokenAliasesText: value,
                }));
              }}
              placeholder="pangea dashboard"
            />
          </label>

          {displayFormOpen ? (
            <div className="vocabulary-display-row">
              <label htmlFor="vocabulary-display-form">
                Display as
                <input
                  id="vocabulary-display-form"
                  value={draft.displayForm}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setDraft((current) => ({ ...current, displayForm: value }));
                  }}
                  placeholder={draft.phrase || 'Pangea Chat'}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDraft((current) => ({ ...current, displayForm: '' }));
                  setDisplayFormOpen(false);
                }}
              >
                Use term text
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="secondary vocabulary-inline-action"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  displayForm: current.displayForm || current.phrase,
                }));
                setDisplayFormOpen(true);
              }}
            >
              Add display text
            </button>
          )}

          <details className="vocabulary-advanced-editor">
            <summary>Advanced</summary>
            <div className="vocabulary-advanced-content">
              <p className="status-message">
                Optional controls for stronger vocabulary biasing, enrollment prompts, and local
                diagnostics.
              </p>
              <div className="vocabulary-form-grid">
                <label htmlFor="vocabulary-weight">
                  Steering strength
                  <input
                    id="vocabulary-weight"
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={draft.weight}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setDraft((current) => ({ ...current, weight: Number(value) }));
                    }}
                  />
                </label>
                <label htmlFor="vocabulary-category">
                  Category
                  <input
                    id="vocabulary-category"
                    value={draft.category}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setDraft((current) => ({ ...current, category: value }));
                    }}
                    placeholder="Work"
                  />
                </label>
                <label htmlFor="vocabulary-priority">
                  Prompt priority
                  <input
                    id="vocabulary-priority"
                    type="number"
                    min="0"
                    value={draft.promptPriority}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setDraft((current) => ({ ...current, promptPriority: value }));
                    }}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <div className="vocabulary-checkbox-row vocabulary-checkbox-row--advanced">
                <label>
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => {
                      const { checked } = event.currentTarget;
                      setDraft((current) => ({ ...current, enabled: checked }));
                    }}
                  />
                  Include this word in recordings and enrollment prompts
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.exactCase}
                    onChange={(event) => {
                      const { checked } = event.currentTarget;
                      setDraft((current) => ({ ...current, exactCase: checked }));
                    }}
                  />
                  Match display casing exactly
                </label>
              </div>
              <section
                className="vocabulary-advanced-panel"
                aria-labelledby="vocabulary-prompt-preview-title"
              >
                <h4 id="vocabulary-prompt-preview-title">Enrollment prompt preview</h4>
                {customPromptPreview.prompts.length > 0 ? (
                  <div
                    className="vocabulary-entry-list"
                    aria-label="Custom vocabulary prompt preview"
                  >
                    {customPromptPreview.prompts.map((prompt) => (
                      <article
                        className="vocabulary-entry vocabulary-entry--compact"
                        key={prompt.id}
                      >
                        <div>
                          <h5>{prompt.text}</h5>
                          <p>
                            {languageLabels[prompt.customVocabulary.language]} word · prompt
                            language {prompt.language} · {prompt.customVocabulary.voiceCondition} ·{' '}
                            {prompt.customVocabulary.position}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="status-message">
                    Add enabled words to preview local enrollment prompts.
                  </p>
                )}
                <p className="status-message">
                  Selected words: {customPromptPreview.selectedEntryIds.length}. Skipped words:{' '}
                  {customPromptPreview.skippedEntryIds.length}. {customPromptPreview.warnings[0]}
                </p>
              </section>
              <section
                className="vocabulary-advanced-panel"
                aria-labelledby="vocabulary-diagnostics-title"
              >
                <h4 id="vocabulary-diagnostics-title">Diagnostics</h4>
                <p className="status-message">{storeValidation}</p>
                <p className="status-message">
                  Token checks run locally when the recognizer prepares vocabulary for a recording.
                </p>
              </section>
            </div>
          </details>

          <div className="vocabulary-actions">
            <button type="button" onClick={submitEntry} disabled={selectedSet === undefined}>
              {draft.id ? 'Update word' : 'Add word'}
            </button>
            <button type="button" className="secondary" onClick={resetEntryDraft}>
              Reset form
            </button>
          </div>
        </article>
      </div>

      <article className="vocabulary-card" aria-labelledby="vocabulary-entry-list-title">
        <h3 id="vocabulary-entry-list-title">Words in {selectedSet?.displayName ?? 'set'}</h3>
        {selectedSet !== undefined && selectedSet.entries.length > 0 ? (
          <div className="vocabulary-entry-list">
            {selectedSet.entries.map((entry) => (
              <article
                className="vocabulary-entry"
                key={entry.id}
                aria-label={`Vocabulary entry ${entry.displayForm}`}
              >
                <div>
                  <h4>{entry.displayForm}</h4>
                  <p>
                    {languageLabels[entry.language]} · {entry.enabled ? 'On' : 'Off'}
                  </p>
                  <p>
                    {entry.spokenAliases.length > 0
                      ? `Aliases: ${entry.spokenAliases.join(', ')}`
                      : 'No aliases'}
                  </p>
                </div>
                <div className="vocabulary-entry-actions">
                  <button type="button" className="secondary" onClick={() => editEntry(entry)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      applyResult(
                        toggleVocabularyEntry(snapshot, selectedSet.id, entry.id, !entry.enabled),
                      )
                    }
                  >
                    {entry.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => confirmDeleteEntry(entry)}
                  >
                    Delete…
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="status-message">No terms yet. Add a name, acronym, or product phrase.</p>
        )}
      </article>

      <details
        className="vocabulary-card vocabulary-details"
        open={managementOpen}
        onToggle={(event) => setManagementOpen(event.currentTarget.open)}
      >
        <summary>Import and export</summary>
        <div className="vocabulary-layout">
          <section aria-labelledby="vocabulary-export-title">
            <h3 id="vocabulary-export-title">Export</h3>
            <p>Downloads may contain sensitive names or project terms.</p>
            <div className="vocabulary-actions">
              <button type="button" className="secondary" onClick={exportJson}>
                Export all JSON
              </button>
              <button
                type="button"
                className="secondary"
                onClick={exportCsv}
                disabled={selectedSet === undefined}
              >
                Export selected CSV
              </button>
            </div>
          </section>

          <section aria-labelledby="vocabulary-import-title">
            <h3 id="vocabulary-import-title">Import</h3>
            <label htmlFor="vocabulary-import-format">
              Format
              <select
                id="vocabulary-import-format"
                value={importFormat}
                onChange={(event) => {
                  setImportFormat(event.currentTarget.value as 'json' | 'csv');
                }}
              >
                <option value="json">JSON store, set, or words</option>
                <option value="csv">CSV words for selected set</option>
              </select>
            </label>
            <label htmlFor="vocabulary-import-text">
              Paste import data
              <textarea
                id="vocabulary-import-text"
                value={importText}
                onChange={(event) => {
                  setImportText(event.currentTarget.value);
                }}
                placeholder={
                  importFormat === 'json'
                    ? '[{"phrase":"Wilson","displayForm":"Wilson","language":"en","weight":5}]'
                    : 'id,phrase,displayForm,language,spokenAliases,weight,category,enabled,exactCase,promptPriority'
                }
              />
            </label>
            <button
              type="button"
              onClick={importVocabulary}
              disabled={importText.trim().length === 0 || selectedSet === undefined}
            >
              Import locally
            </button>
          </section>
        </div>
      </details>

      <p className="status-message" aria-live="polite">
        {statusMessage}
      </p>
    </section>
  );
}

function StatusMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="status-pill" data-tone="neutral">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function validateStoreMessage(snapshot: ReturnType<typeof createDefaultVocabularyStore>): string {
  const validation = validateVocabularyStoreSnapshot(snapshot);
  return validation.ok
    ? getVocabularyOperationReasonCopy('vocabulary-validation-ok').message
    : formatVocabularyErrors(validation.errors);
}

function downloadTextFile(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
