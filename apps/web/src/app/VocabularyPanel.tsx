import { useEffect, useMemo, useState } from 'react';
import type { VocabularyEntryLanguage, VocabularyEntryV1 } from '@speech/protocol';
import { validateVocabularyStoreSnapshot } from '@speech/context-bias';
import { scheduleCustomVocabularyPrompts } from '@speech/enrollment';
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
  const [newSetName, setNewSetName] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importText, setImportText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Vocabulary is stored only in this browser.');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const result = loadVocabularyStore(window.localStorage);
    setSnapshot(result.snapshot);
    setSelectedSetId(result.snapshot.activeSetIds[0] ?? result.snapshot.sets[0]?.id ?? 'set-work');
    setStatusMessage(result.message);
    setIsLoaded(true);
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

  function deleteSelectedSet() {
    if (selectedSet === undefined) return;
    applyResult(deleteVocabularySet(snapshot, selectedSet.id));
    setDraft(emptyDraft);
  }

  function submitEntry() {
    if (selectedSet === undefined) return;
    const result = upsertVocabularyEntry(snapshot, selectedSet.id, draft);
    applyResult(result);
    if (result.ok) setDraft(emptyDraft);
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
    <section className="panel vocabulary" aria-labelledby="vocabulary-title">
      <div className="section-heading">
        <p className="eyebrow">Vocabulary steering</p>
        <h2 id="vocabulary-title">Local vocabulary sets</h2>
        <p>
          Add names, products, acronyms, and mixed-language terms now. Entries stay in browser
          storage and will be swapped into the decoder at utterance boundaries when tokenizer-aware
          scoring lands.
        </p>
      </div>

      <div className="vocabulary-summary" aria-label="Vocabulary summary">
        <StatusMetric label="Sets" value={snapshot.sets.length.toString()} />
        <StatusMetric label="Active entries" value={activeEntryCount.toString()} />
        <StatusMetric label="Revision" value={snapshot.revision.toString()} />
      </div>

      <div className="vocabulary-layout">
        <article className="vocabulary-card" aria-labelledby="vocabulary-sets-title">
          <h3 id="vocabulary-sets-title">Sets</h3>
          <label htmlFor="vocabulary-set-select">
            Selected set
            <select
              id="vocabulary-set-select"
              value={selectedSet?.id ?? ''}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setSelectedSetId(value);
                setDraft(emptyDraft);
              }}
            >
              {snapshot.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.displayName} ({set.entries.length})
                </option>
              ))}
            </select>
          </label>

          {selectedSet !== undefined ? (
            <label>
              <input
                type="checkbox"
                checked={selectedSet.enabled}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  applyResult(setVocabularySetEnabled(snapshot, selectedSet.id, checked));
                }}
              />
              Enable this set for future utterances
            </label>
          ) : null}

          <div className="inline-form">
            <label htmlFor="new-vocabulary-set-name">
              New set name
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
              Create set
            </button>
          </div>

          <button
            type="button"
            className="secondary danger"
            onClick={deleteSelectedSet}
            disabled={snapshot.sets.length <= 1}
          >
            Delete selected set
          </button>
        </article>

        <article className="vocabulary-card" aria-labelledby="vocabulary-entry-form-title">
          <h3 id="vocabulary-entry-form-title">{draft.id ? 'Edit entry' : 'Add entry'}</h3>
          <div className="vocabulary-form-grid">
            <label htmlFor="vocabulary-phrase">
              Phrase
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
            <label htmlFor="vocabulary-display-form">
              Display form
              <input
                id="vocabulary-display-form"
                value={draft.displayForm}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setDraft((current) => ({ ...current, displayForm: value }));
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
            <label htmlFor="vocabulary-weight">
              Weight
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
          <label htmlFor="vocabulary-aliases">
            Spoken aliases (one per line or comma-separated)
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
          <div className="vocabulary-checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setDraft((current) => ({ ...current, enabled: checked }));
                }}
              />
              Enabled
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
              Preserve exact display casing
            </label>
          </div>
          <div className="vocabulary-actions">
            <button type="button" onClick={submitEntry} disabled={selectedSet === undefined}>
              {draft.id ? 'Update entry' : 'Add entry'}
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(emptyDraft)}>
              Reset form
            </button>
          </div>
        </article>
      </div>

      <article className="vocabulary-card" aria-labelledby="vocabulary-entry-list-title">
        <h3 id="vocabulary-entry-list-title">Entries in {selectedSet?.displayName ?? 'set'}</h3>
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
                    {languageLabels[entry.language]} · weight {entry.weight} ·{' '}
                    {entry.enabled ? 'enabled' : 'disabled'}
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
                    onClick={() =>
                      applyResult(deleteVocabularyEntry(snapshot, selectedSet.id, entry.id))
                    }
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="status-message">No terms yet. Add a name, acronym, or product phrase.</p>
        )}
      </article>

      <article className="vocabulary-card" aria-labelledby="vocabulary-custom-prompts-title">
        <h3 id="vocabulary-custom-prompts-title">Enrollment prompt preview</h3>
        <p>
          High-priority enabled terms are expanded into deterministic Vietnamese, English, or mixed
          prompt templates. Review every generated sentence before recording; terms remain active
          through vocabulary steering even when they are not selected for recording.
        </p>
        {customPromptPreview.prompts.length > 0 ? (
          <div className="vocabulary-entry-list" aria-label="Custom vocabulary prompt preview">
            {customPromptPreview.prompts.map((prompt) => (
              <article className="vocabulary-entry" key={prompt.id}>
                <div>
                  <h4>{prompt.text}</h4>
                  <p>
                    {languageLabels[prompt.customVocabulary.language]} term · prompt language{' '}
                    {prompt.language} · {prompt.customVocabulary.voiceCondition} ·{' '}
                    {prompt.customVocabulary.position}
                  </p>
                  <p>
                    Entry {prompt.customVocabulary.vocabularyEntryId} · review required before
                    recording
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="status-message">
            Add and enable vocabulary entries to preview local enrollment prompts.
          </p>
        )}
        <p className="status-message">
          Selected entries: {customPromptPreview.selectedEntryIds.length}. Skipped entries:{' '}
          {customPromptPreview.skippedEntryIds.length}. {customPromptPreview.warnings[0]}
        </p>
      </article>

      <div className="vocabulary-layout">
        <article className="vocabulary-card" aria-labelledby="vocabulary-export-title">
          <h3 id="vocabulary-export-title">Export</h3>
          <p>
            Exports are explicit local downloads. They may contain sensitive names or project terms.
          </p>
          <div className="vocabulary-actions">
            <button type="button" className="secondary" onClick={exportJson}>
              Export JSON
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
        </article>

        <article className="vocabulary-card" aria-labelledby="vocabulary-import-title">
          <h3 id="vocabulary-import-title">Import</h3>
          <label htmlFor="vocabulary-import-format">
            Import format
            <select
              id="vocabulary-import-format"
              value={importFormat}
              onChange={(event) => {
                setImportFormat(event.currentTarget.value as 'json' | 'csv');
              }}
            >
              <option value="json">JSON store, set, or entries</option>
              <option value="csv">CSV entries for selected set</option>
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
        </article>
      </div>

      <p className="status-message" aria-live="polite">
        {statusMessage}
      </p>
      <p className="status-message" aria-live="polite">
        {storeValidation}
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
    ? 'Vocabulary schema is valid locally; tokenizer checks run during future automaton compilation.'
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
