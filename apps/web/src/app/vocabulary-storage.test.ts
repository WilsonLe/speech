import { describe, expect, it } from 'vitest';

import {
  createDefaultVocabularyStore,
  createVocabularySet,
  deleteVocabularyEntry,
  deleteVocabularySet,
  importVocabularyCsv,
  importVocabularyJson,
  loadVocabularyStore,
  saveVocabularyStore,
  serializeVocabularyCsv,
  serializeVocabularyJson,
  setVocabularySetEnabled,
  toggleVocabularyEntry,
  upsertVocabularyEntry,
  vocabularyStorageKey,
} from './vocabulary-storage';

const now = '2026-06-23T00:00:00.000Z';

describe('vocabulary storage helpers', () => {
  it('creates, saves, and loads a default local store', () => {
    const storage = new MemoryStorage();
    const initial = loadVocabularyStore(storage, now);

    expect(initial.snapshot.sets).toHaveLength(1);
    expect(initial.snapshot.activeSetIds).toEqual(['set-work']);

    saveVocabularyStore(storage, initial.snapshot);
    expect(storage.getItem(vocabularyStorageKey)).toContain('set-work');
    expect(loadVocabularyStore(storage, now).snapshot).toEqual(initial.snapshot);
  });

  it('creates, disables, and deletes vocabulary sets', () => {
    const snapshot = createDefaultVocabularyStore(now);
    const created = createVocabularySet(snapshot, ' Project Alpha ', now);

    expect(created.ok).toBe(true);
    expect(created.snapshot?.sets.map((set) => set.displayName)).toContain('Project Alpha');

    const projectSetId = created.snapshot?.sets.find(
      (set) => set.displayName === 'Project Alpha',
    )?.id;
    expect(projectSetId).toBe('set-project-alpha');

    const disabled = setVocabularySetEnabled(created.snapshot!, projectSetId!, false, now);
    expect(disabled.snapshot?.activeSetIds).not.toContain(projectSetId);

    const deleted = deleteVocabularySet(disabled.snapshot!, projectSetId!, now);
    expect(deleted.ok).toBe(true);
    expect(deleted.snapshot?.sets).toHaveLength(1);
  });

  it('adds, updates, toggles, and deletes entries with validation', () => {
    const snapshot = createDefaultVocabularyStore(now);
    const added = upsertVocabularyEntry(
      snapshot,
      'set-work',
      {
        phrase: '  Pangea   Chat ',
        displayForm: 'Pangea Chat',
        language: 'mixed',
        spokenAliasesText: 'pangea\nPangea dashboard',
        weight: 6,
        category: 'Products',
        enabled: true,
        exactCase: true,
        promptPriority: '9',
      },
      now,
    );

    expect(added.ok).toBe(true);
    const entry = added.snapshot?.sets[0]?.entries[0];
    expect(entry).toMatchObject({
      id: 'term-pangea-chat',
      phrase: 'Pangea Chat',
      spokenAliases: ['pangea', 'Pangea dashboard'],
      promptPriority: 9,
    });

    const updated = upsertVocabularyEntry(
      added.snapshot!,
      'set-work',
      {
        id: entry!.id,
        phrase: 'Pangea Chat',
        displayForm: 'Pangea Chat',
        language: 'mixed',
        spokenAliasesText: '',
        weight: 7,
        category: '',
        enabled: true,
        exactCase: true,
        promptPriority: '',
      },
      now,
    );
    expect(updated.snapshot?.sets[0]?.entries[0]?.weight).toBe(7);

    const disabled = toggleVocabularyEntry(updated.snapshot!, 'set-work', entry!.id, false, now);
    expect(disabled.snapshot?.sets[0]?.entries[0]?.enabled).toBe(false);

    const deleted = deleteVocabularyEntry(disabled.snapshot!, 'set-work', entry!.id, now);
    expect(deleted.snapshot?.sets[0]?.entries).toHaveLength(0);
  });

  it('rejects duplicate phrase imports through schema validation', () => {
    const snapshot = createDefaultVocabularyStore(now);
    const first = upsertVocabularyEntry(
      snapshot,
      'set-work',
      {
        phrase: 'Wilson',
        displayForm: 'Wilson',
        language: 'en',
        spokenAliasesText: '',
        weight: 5,
        category: '',
        enabled: true,
        exactCase: true,
        promptPriority: '',
      },
      now,
    );
    const duplicate = upsertVocabularyEntry(
      first.snapshot!,
      'set-work',
      {
        phrase: 'wilson',
        displayForm: 'Wilson',
        language: 'en',
        spokenAliasesText: '',
        weight: 5,
        category: '',
        enabled: true,
        exactCase: true,
        promptPriority: '',
      },
      now,
    );

    expect(duplicate.ok).toBe(false);
    expect(duplicate.message).toMatch(/duplicates entry/iu);
  });

  it('exports and imports JSON stores and entry arrays', () => {
    const snapshot = createDefaultVocabularyStore(now);
    const added = upsertVocabularyEntry(
      snapshot,
      'set-work',
      {
        phrase: 'Minh',
        displayForm: 'Minh',
        language: 'vi',
        spokenAliasesText: '',
        weight: 5,
        category: 'Contacts',
        enabled: true,
        exactCase: true,
        promptPriority: '',
      },
      now,
    );
    const json = serializeVocabularyJson(added.snapshot!);
    const importedStore = importVocabularyJson(
      json,
      createDefaultVocabularyStore(now),
      'set-work',
      now,
    );
    expect(importedStore.ok).toBe(true);
    expect(importedStore.importedEntries).toBe(1);

    const importedEntries = importVocabularyJson(
      JSON.stringify([
        { phrase: 'Dashboard', displayForm: 'Dashboard', language: 'en', weight: 4 },
      ]),
      createDefaultVocabularyStore(now),
      'set-work',
      now,
    );
    expect(importedEntries.ok).toBe(true);
    expect(importedEntries.snapshot?.sets[0]?.entries[0]).toMatchObject({
      phrase: 'Dashboard',
      displayForm: 'Dashboard',
      language: 'en',
    });
  });

  it('round-trips entries through CSV', () => {
    const snapshot = createDefaultVocabularyStore(now);
    const added = upsertVocabularyEntry(
      snapshot,
      'set-work',
      {
        phrase: 'Project Alpha',
        displayForm: 'Project Alpha',
        language: 'mixed',
        spokenAliasesText: 'Alpha dashboard',
        weight: 8,
        category: 'Work',
        enabled: true,
        exactCase: true,
        promptPriority: '2',
      },
      now,
    );
    const csv = serializeVocabularyCsv(added.snapshot!.sets[0]!);
    const imported = importVocabularyCsv(csv, createDefaultVocabularyStore(now), 'set-work', now);

    expect(csv).toContain('spokenAliases');
    expect(imported.ok).toBe(true);
    expect(imported.snapshot?.sets[0]?.entries[0]).toMatchObject({
      phrase: 'Project Alpha',
      spokenAliases: ['Alpha dashboard'],
      promptPriority: 2,
    });
  });
});

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
