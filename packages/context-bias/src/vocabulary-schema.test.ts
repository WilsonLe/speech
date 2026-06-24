import { describe, expect, it } from 'vitest';

import type { SpeechModelManifestV2, VocabularyEntryV1, VocabularySetV1 } from '@speech/protocol';

import {
  canonicalizeVocabularyText,
  normalizeVocabularyText,
  validateVocabularyEntry,
  validateVocabularySet,
  validateVocabularyStoreSnapshot,
} from './vocabulary-schema';

const now = '2026-06-23T00:00:00.000Z';
const contextBiasing = {
  supported: true,
  algorithm: 'token-trie',
  supportedEntryLanguages: ['vi', 'en', 'mixed', 'auto'],
  maxActiveEntries: 2,
  maxPhraseTokens: 8,
  maxAliasesPerEntry: 2,
  maxAliasTokens: 6,
  defaultWeight: 5,
  maxCumulativeBonus: 8,
  weightRange: { min: 0, max: 10 },
  presets: { light: 2, normal: 5, strong: 8 },
  scoring: { prefixBonus: 1, completionBonus: 4, mismatchPenalty: 1 },
  wordBoundary: { mode: 'unicode-word', requireForSingleToken: true },
  revisionSwap: 'utterance-boundary',
  diagnostics: { emitMatchedVocabularyIds: true, emitScoreBreakdown: true },
} satisfies SpeechModelManifestV2['contextBiasing'];

const unsupportedContextBiasing = {
  ...contextBiasing,
  supported: false,
  supportedEntryLanguages: [],
  maxActiveEntries: 0,
  maxPhraseTokens: 0,
  maxAliasesPerEntry: 0,
  maxAliasTokens: 0,
  defaultWeight: 0,
  maxCumulativeBonus: 0,
  weightRange: { min: 0, max: 0 },
  presets: { light: 0, normal: 0, strong: 0 },
  scoring: { prefixBonus: 0, completionBonus: 0, mismatchPenalty: 0 },
  diagnostics: { emitMatchedVocabularyIds: false, emitScoreBreakdown: false },
} satisfies SpeechModelManifestV2['contextBiasing'];

describe('vocabulary schema validation', () => {
  it('normalizes vocabulary text to NFC and collapses whitespace', () => {
    expect(normalizeVocabularyText('  cafe\u0301   deploy  ')).toBe('café deploy');
    expect(canonicalizeVocabularyText('  Nguyễn   Văn  A ')).toBe('nguyễn văn a');
  });

  it('accepts and normalizes a valid vocabulary entry', () => {
    const result = validateVocabularyEntry(
      {
        id: 'term:nguyen-van-a',
        phrase: '  Nguye\u0302̃n   Va\u0306n A ',
        displayForm: 'Nguyễn Văn A',
        language: 'vi',
        spokenAliases: [' anh A ', 'Nguyen Van A'],
        weight: 7,
        category: 'Contacts',
        enabled: true,
        exactCase: true,
        promptPriority: 10,
        pronunciationRecordingIds: ['utt-001'],
      },
      { contextBiasing },
    );

    expect(result.ok).toBe(true);
    expect(result.normalizedEntry).toEqual({
      id: 'term:nguyen-van-a',
      phrase: 'Nguyễn Văn A',
      displayForm: 'Nguyễn Văn A',
      language: 'vi',
      spokenAliases: ['anh A', 'Nguyen Van A'],
      weight: 7,
      category: 'Contacts',
      enabled: true,
      exactCase: true,
      promptPriority: 10,
      pronunciationRecordingIds: ['utt-001'],
    });
  });

  it('rejects malformed entry fields and duplicate aliases', () => {
    const result = validateVocabularyEntry(
      {
        id: 'bad id with spaces',
        phrase: ' ',
        displayForm: '',
        language: 'fr',
        spokenAliases: ['alias', ' alias ', 42],
        weight: 12,
        enabled: 'yes',
        exactCase: false,
        promptPriority: -1,
        pronunciationRecordingIds: ['utt-1', 'utt-1'],
      },
      { contextBiasing },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'invalid-id',
        'empty',
        'invalid-language',
        'duplicate',
        'invalid-field',
        'invalid-weight',
        'invalid-priority',
      ]),
    );
  });

  it('checks enabled entries against model language and weight contracts', () => {
    const entry = createEntry({ language: 'mixed', weight: 5 });
    const result = validateVocabularyEntry(entry, {
      contextBiasing: { ...contextBiasing, supportedEntryLanguages: ['vi', 'en'] },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'unsupported-language', field: 'language' }),
    );
  });

  it('rejects enabled entries when contextual biasing is unsupported', () => {
    const result = validateVocabularyEntry(createEntry(), {
      contextBiasing: unsupportedContextBiasing,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'unsupported-context-biasing', field: 'enabled' }),
    );
  });

  it('rejects aliases beyond the active model contract while leaving token-length checks to compilation', () => {
    const result = validateVocabularyEntry(
      createEntry({ spokenAliases: ['one', 'two', 'three'] }),
      { contextBiasing },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'limit-exceeded', field: 'spokenAliases' }),
    );
  });

  it('validates vocabulary sets, duplicate ids, duplicate phrases, and active-entry limits', () => {
    const set = createSet({
      entries: [
        createEntry({ id: 'term-one', phrase: 'Pangea Chat', displayForm: 'Pangea Chat' }),
        createEntry({ id: 'term-one', phrase: 'Wilson', displayForm: 'Wilson' }),
        createEntry({ id: 'term-three', phrase: 'pangea chat', displayForm: 'Pangea Chat' }),
      ],
    });
    const result = validateVocabularySet(set, { contextBiasing });

    expect(result.ok).toBe(false);
    expect(result.activeEntryCount).toBe(3);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate', entryId: 'term-one', field: 'id' }),
        expect.objectContaining({ code: 'duplicate', entryId: 'term-three', field: 'phrase' }),
        expect.objectContaining({ code: 'limit-exceeded', field: 'entries' }),
      ]),
    );
  });

  it('does not apply active model limits to disabled local sets', () => {
    const result = validateVocabularySet(
      createSet({ enabled: false, entries: [createEntry({ language: 'mixed' })] }),
      { contextBiasing: unsupportedContextBiasing },
    );

    expect(result.ok).toBe(true);
    expect(result.activeEntryCount).toBe(0);
  });

  it('builds an utterance-boundary revision from active sets only', () => {
    const activeSet = createSet({
      id: 'set-active',
      entries: [
        createEntry({ id: 'enabled' }),
        createEntry({
          id: 'disabled',
          phrase: 'Inactive term',
          displayForm: 'Inactive term',
          enabled: false,
        }),
      ],
    });
    const inactiveSet = createSet({
      id: 'set-inactive',
      enabled: false,
      entries: [createEntry({ id: 'ignored' })],
    });
    const result = validateVocabularyStoreSnapshot({
      schemaVersion: 1,
      revision: 12,
      sets: [activeSet, inactiveSet],
      activeSetIds: ['set-active', 'set-inactive'],
      updatedAt: now,
    });

    expect(result.ok).toBe(true);
    expect(result.activeEntryCount).toBe(1);
    expect(result.revision).toEqual({
      revision: 12,
      activeSetIds: ['set-active', 'set-inactive'],
      entries: [expect.objectContaining({ id: 'enabled' })],
    });
  });

  it('applies active model limits only to active set ids in store snapshots', () => {
    const futureModelSet = createSet({
      id: 'set-future',
      entries: [createEntry({ language: 'mixed' })],
    });
    const result = validateVocabularyStoreSnapshot(
      {
        schemaVersion: 1,
        revision: 2,
        sets: [futureModelSet],
        activeSetIds: [],
        updatedAt: now,
      },
      { contextBiasing: unsupportedContextBiasing },
    );

    expect(result.ok).toBe(true);
    expect(result.activeEntryCount).toBe(0);
  });

  it('rejects active-set references that do not exist', () => {
    const result = validateVocabularyStoreSnapshot({
      schemaVersion: 1,
      revision: 1,
      sets: [createSet()],
      activeSetIds: ['missing'],
      updatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'invalid-id', setId: 'missing', field: 'activeSetIds' }),
    );
  });
});

function createEntry(overrides: Partial<VocabularyEntryV1> = {}): VocabularyEntryV1 {
  return {
    id: 'term-default',
    phrase: 'Pangea Chat',
    displayForm: 'Pangea Chat',
    language: 'mixed',
    spokenAliases: [],
    weight: 5,
    enabled: true,
    exactCase: true,
    ...overrides,
  };
}

function createSet(overrides: Partial<VocabularySetV1> = {}): VocabularySetV1 {
  return {
    schemaVersion: 1,
    id: 'set-work',
    displayName: 'Work',
    enabled: true,
    revision: 1,
    entries: [createEntry()],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
