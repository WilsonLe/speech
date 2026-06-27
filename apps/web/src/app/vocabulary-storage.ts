import {
  canonicalizeVocabularyText,
  normalizeVocabularyText,
  validateVocabularyStoreSnapshot,
} from '@speech/context-bias';
import {
  formatVocabularyValidationErrors,
  getVocabularyOperationReasonCopy,
  vocabularyValidationReasonCodes,
} from '../content/reasonCodes';
import type {
  VocabularyEntryLanguage,
  VocabularyEntryV1,
  VocabularyError,
  VocabularySetV1,
  VocabularyStoreSnapshotV1,
} from '@speech/protocol';

export const vocabularyStorageKey = 'speech:vocabulary-store:v1';

export interface StoredVocabularyResult {
  readonly snapshot: VocabularyStoreSnapshotV1;
  readonly message: string;
}

export interface VocabularyImportResult {
  readonly ok: boolean;
  readonly snapshot?: VocabularyStoreSnapshotV1;
  readonly importedEntries: number;
  readonly message: string;
}

export interface VocabularyEntryDraft {
  readonly id?: string;
  readonly phrase: string;
  readonly displayForm: string;
  readonly language: VocabularyEntryLanguage;
  readonly spokenAliasesText: string;
  readonly weight: number;
  readonly category: string;
  readonly enabled: boolean;
  readonly exactCase: boolean;
  readonly promptPriority: string;
}

const csvHeaders = [
  'id',
  'phrase',
  'displayForm',
  'language',
  'spokenAliases',
  'weight',
  'category',
  'enabled',
  'exactCase',
  'promptPriority',
] as const;

export function createDefaultVocabularyStore(
  nowIso = new Date().toISOString(),
): VocabularyStoreSnapshotV1 {
  const defaultSet: VocabularySetV1 = {
    schemaVersion: 1,
    id: 'set-work',
    displayName: 'Work',
    description: 'Local vocabulary terms for names, products, acronyms, and project phrases.',
    enabled: true,
    revision: 1,
    entries: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    source: 'manual',
  };
  return {
    schemaVersion: 1,
    revision: 1,
    sets: [defaultSet],
    activeSetIds: [defaultSet.id],
    updatedAt: nowIso,
  };
}

export function loadVocabularyStore(
  storage: Pick<Storage, 'getItem'>,
  nowIso = new Date().toISOString(),
): StoredVocabularyResult {
  const raw = storage.getItem(vocabularyStorageKey);
  if (raw === null || raw.trim().length === 0) {
    return {
      snapshot: createDefaultVocabularyStore(nowIso),
      message: getVocabularyOperationReasonCopy('vocabulary-store-created').message,
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateVocabularyStoreSnapshot(parsed);
    if (validation.normalizedSnapshot !== undefined) {
      return {
        snapshot: validation.normalizedSnapshot,
        message: getVocabularyOperationReasonCopy('vocabulary-store-loaded').message,
      };
    }
    return {
      snapshot: createDefaultVocabularyStore(nowIso),
      message: formatVocabularyOperationMessage('vocabulary-store-reset'),
    };
  } catch {
    return {
      snapshot: createDefaultVocabularyStore(nowIso),
      message: formatVocabularyOperationMessage('vocabulary-store-unreadable'),
    };
  }
}

export function saveVocabularyStore(
  storage: Pick<Storage, 'setItem'>,
  snapshot: VocabularyStoreSnapshotV1,
): void {
  storage.setItem(vocabularyStorageKey, JSON.stringify(snapshot));
}

export function createVocabularySet(
  snapshot: VocabularyStoreSnapshotV1,
  displayName: string,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  const name = normalizeVocabularyText(displayName);
  if (name.length === 0) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-name-required'),
    };
  }
  const id = uniqueId('set', name, new Set(snapshot.sets.map((set) => set.id)));
  const set: VocabularySetV1 = {
    schemaVersion: 1,
    id,
    displayName: name,
    enabled: true,
    revision: 1,
    entries: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    source: 'manual',
  };
  return validateNextSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 1,
      sets: [...snapshot.sets, set],
      activeSetIds: [...snapshot.activeSetIds, set.id],
      updatedAt: nowIso,
    },
    `Created vocabulary set “${name}”.`,
  );
}

export function deleteVocabularySet(
  snapshot: VocabularyStoreSnapshotV1,
  setId: string,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  if (snapshot.sets.length <= 1) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-keep-one-set'),
    };
  }
  const nextSets = snapshot.sets.filter((set) => set.id !== setId);
  if (nextSets.length === snapshot.sets.length) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  }
  return validateNextSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 1,
      sets: nextSets,
      activeSetIds: snapshot.activeSetIds.filter((id) => id !== setId),
      updatedAt: nowIso,
    },
    'Deleted vocabulary set locally.',
  );
}

export function setVocabularySetEnabled(
  snapshot: VocabularyStoreSnapshotV1,
  setId: string,
  enabled: boolean,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  let found = false;
  const nextSets = snapshot.sets.map((set) => {
    if (set.id !== setId) return set;
    found = true;
    return { ...set, enabled, revision: set.revision + 1, updatedAt: nowIso };
  });
  if (!found)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  const activeSetIds = enabled
    ? appendUnique(snapshot.activeSetIds, setId)
    : snapshot.activeSetIds.filter((id) => id !== setId);
  return validateNextSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 1,
      sets: nextSets,
      activeSetIds,
      updatedAt: nowIso,
    },
    enabled ? 'Enabled vocabulary set for the next utterance.' : 'Disabled vocabulary set locally.',
  );
}

export function upsertVocabularyEntry(
  snapshot: VocabularyStoreSnapshotV1,
  setId: string,
  draft: VocabularyEntryDraft,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  const set = snapshot.sets.find((candidate) => candidate.id === setId);
  if (set === undefined)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  const entry = createEntryFromDraft(draft, new Set(set.entries.map((item) => item.id)));
  const nextEntries = draft.id
    ? set.entries.map((candidate) => (candidate.id === draft.id ? entry : candidate))
    : [...set.entries, entry];
  if (draft.id && !set.entries.some((candidate) => candidate.id === draft.id)) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-word-not-found'),
    };
  }
  const nextSet: VocabularySetV1 = {
    ...set,
    entries: nextEntries,
    revision: set.revision + 1,
    updatedAt: nowIso,
  };
  return replaceVocabularySet(
    snapshot,
    nextSet,
    draft.id ? 'Updated vocabulary entry locally.' : 'Added vocabulary entry locally.',
    nowIso,
    1,
  );
}

export function deleteVocabularyEntry(
  snapshot: VocabularyStoreSnapshotV1,
  setId: string,
  entryId: string,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  const set = snapshot.sets.find((candidate) => candidate.id === setId);
  if (set === undefined)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  const nextEntries = set.entries.filter((entry) => entry.id !== entryId);
  if (nextEntries.length === set.entries.length) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-word-not-found'),
    };
  }
  const nextSet: VocabularySetV1 = {
    ...set,
    entries: nextEntries,
    revision: set.revision + 1,
    updatedAt: nowIso,
  };
  return replaceVocabularySet(snapshot, nextSet, 'Deleted vocabulary entry locally.', nowIso);
}

export function toggleVocabularyEntry(
  snapshot: VocabularyStoreSnapshotV1,
  setId: string,
  entryId: string,
  enabled: boolean,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  const set = snapshot.sets.find((candidate) => candidate.id === setId);
  if (set === undefined)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  const nextSet: VocabularySetV1 = {
    ...set,
    entries: set.entries.map((entry) => (entry.id === entryId ? { ...entry, enabled } : entry)),
    revision: set.revision + 1,
    updatedAt: nowIso,
  };
  return replaceVocabularySet(
    snapshot,
    nextSet,
    enabled ? 'Enabled vocabulary entry.' : 'Disabled vocabulary entry.',
    nowIso,
  );
}

export function serializeVocabularyJson(snapshot: VocabularyStoreSnapshotV1): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function importVocabularyJson(
  text: string,
  current: VocabularyStoreSnapshotV1,
  selectedSetId: string,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isSnapshotLike(parsed)) {
      const validation = validateVocabularyStoreSnapshot(parsed);
      if (validation.normalizedSnapshot === undefined) {
        return {
          ok: false,
          importedEntries: 0,
          message: formatVocabularyErrors(validation.errors),
        };
      }
      return {
        ok: true,
        snapshot: { ...validation.normalizedSnapshot, updatedAt: nowIso },
        importedEntries: validation.normalizedSnapshot.sets.reduce(
          (count, set) => count + set.entries.length,
          0,
        ),
        message: formatVocabularyOperationMessage('vocabulary-import-json-store-imported'),
      };
    }
    if (Array.isArray(parsed)) {
      return appendImportedEntries(
        current,
        selectedSetId,
        parsed,
        nowIso,
        formatVocabularyOperationMessage('vocabulary-import-json-words-imported'),
      );
    }
    if (isSetLike(parsed)) {
      const validation = validateVocabularyStoreSnapshot({
        ...current,
        revision: current.revision + 1,
        sets: [...current.sets.filter((set) => set.id !== parsed.id), parsed],
        activeSetIds: appendUnique(
          current.activeSetIds.filter((id) => id !== parsed.id),
          parsed.id,
        ),
        updatedAt: nowIso,
      });
      if (validation.normalizedSnapshot === undefined) {
        return {
          ok: false,
          importedEntries: 0,
          message: formatVocabularyErrors(validation.errors),
        };
      }
      return {
        ok: true,
        snapshot: validation.normalizedSnapshot,
        importedEntries: parsed.entries.length,
        message: formatVocabularyOperationMessage('vocabulary-import-json-set-imported'),
      };
    }
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-import-json-shape'),
    };
  } catch {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-import-json-unreadable'),
    };
  }
}

export function serializeVocabularyCsv(set: VocabularySetV1): string {
  const rows = [csvHeaders, ...set.entries.map(entryToCsvRow)];
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}

export function importVocabularyCsv(
  text: string,
  current: VocabularyStoreSnapshotV1,
  selectedSetId: string,
  nowIso = new Date().toISOString(),
): VocabularyImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-import-csv-empty'),
    };
  const [header, ...dataRows] = rows;
  const normalizedHeader = header?.map((cell) => cell.trim()) ?? [];
  const expectedHeader = csvHeaders.join(',');
  if (normalizedHeader.join(',') !== expectedHeader) {
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-import-csv-header'),
    };
  }
  const entries = dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => csvRowToEntry(row));
  return appendImportedEntries(
    current,
    selectedSetId,
    entries,
    nowIso,
    formatVocabularyOperationMessage('vocabulary-import-csv-words-imported'),
  );
}

export function formatVocabularyErrors(
  errors: readonly { readonly code?: string; readonly field?: string; readonly message: string }[],
): string {
  const vocabularyErrors: Pick<VocabularyError, 'code' | 'field'>[] = [];
  for (const error of errors) {
    if (typeof error.code === 'string' && isVocabularyValidationCode(error.code)) {
      vocabularyErrors.push(
        error.field === undefined ? { code: error.code } : { code: error.code, field: error.field },
      );
    }
  }
  if (vocabularyErrors.length > 0) return formatVocabularyValidationErrors(vocabularyErrors);
  if (errors.length === 0) {
    return getVocabularyOperationReasonCopy('vocabulary-validation-ok').message;
  }
  return formatVocabularyOperationMessage('vocabulary-import-json-shape');
}

function formatVocabularyOperationMessage(
  code: Parameters<typeof getVocabularyOperationReasonCopy>[0],
): string {
  const copy = getVocabularyOperationReasonCopy(code);
  return `${copy.message} ${copy.action}`;
}

function isVocabularyValidationCode(
  code: string,
): code is (typeof vocabularyValidationReasonCodes)[number] {
  return (vocabularyValidationReasonCodes as readonly string[]).includes(code);
}

function createEntryFromDraft(
  draft: VocabularyEntryDraft,
  existingIds: ReadonlySet<string>,
): VocabularyEntryV1 {
  const phrase = normalizeVocabularyText(draft.phrase);
  const displayForm = normalizeVocabularyText(draft.displayForm || draft.phrase);
  const id = draft.id ?? uniqueId('term', phrase, existingIds);
  const aliases = draft.spokenAliasesText
    .split(/[\n,]/u)
    .map(normalizeVocabularyText)
    .filter((alias) => alias.length > 0);
  const promptPriority = draft.promptPriority.trim();
  return {
    id,
    phrase,
    displayForm,
    language: draft.language,
    spokenAliases: aliases,
    weight: draft.weight,
    enabled: draft.enabled,
    exactCase: draft.exactCase,
    ...(draft.category.trim().length > 0
      ? { category: normalizeVocabularyText(draft.category) }
      : {}),
    ...(promptPriority.length > 0 ? { promptPriority: Number(promptPriority) } : {}),
  };
}

function appendImportedEntries(
  current: VocabularyStoreSnapshotV1,
  selectedSetId: string,
  rawEntries: readonly unknown[],
  nowIso: string,
  message: string,
): VocabularyImportResult {
  const set = current.sets.find((candidate) => candidate.id === selectedSetId);
  if (set === undefined)
    return {
      ok: false,
      importedEntries: 0,
      message: formatVocabularyOperationMessage('vocabulary-set-not-found'),
    };
  const existingIds = new Set(set.entries.map((entry) => entry.id));
  const entries = rawEntries.map((rawEntry, index) =>
    normalizeImportedEntry(rawEntry, existingIds, index),
  );
  const nextSet: VocabularySetV1 = {
    ...set,
    entries: [...set.entries, ...entries],
    revision: set.revision + 1,
    updatedAt: nowIso,
    source: 'imported',
  };
  return replaceVocabularySet(current, nextSet, message, nowIso, entries.length);
}

function normalizeImportedEntry(
  rawEntry: unknown,
  existingIds: Set<string>,
  index: number,
): VocabularyEntryV1 {
  if (!isRecord(rawEntry)) {
    const id = uniqueId('term', `imported-${index.toString()}`, existingIds);
    existingIds.add(id);
    return {
      id,
      phrase: '',
      displayForm: '',
      language: 'auto',
      spokenAliases: [],
      weight: 5,
      enabled: true,
      exactCase: false,
    };
  }
  const phrase = typeof rawEntry['phrase'] === 'string' ? rawEntry['phrase'] : '';
  const displayForm =
    typeof rawEntry['displayForm'] === 'string' ? rawEntry['displayForm'] : phrase;
  const id =
    typeof rawEntry['id'] === 'string' && rawEntry['id'].trim().length > 0
      ? uniqueExistingOrSuffix(rawEntry['id'].trim(), existingIds)
      : uniqueId('term', phrase || `imported-${index.toString()}`, existingIds);
  existingIds.add(id);
  const language = isVocabularyLanguage(rawEntry['language']) ? rawEntry['language'] : 'auto';
  const spokenAliases = Array.isArray(rawEntry['spokenAliases'])
    ? rawEntry['spokenAliases'].filter((item): item is string => typeof item === 'string')
    : [];
  const weight = typeof rawEntry['weight'] === 'number' ? rawEntry['weight'] : 5;
  const enabled = typeof rawEntry['enabled'] === 'boolean' ? rawEntry['enabled'] : true;
  const exactCase = typeof rawEntry['exactCase'] === 'boolean' ? rawEntry['exactCase'] : false;
  const category =
    typeof rawEntry['category'] === 'string' ? normalizeVocabularyText(rawEntry['category']) : '';
  const promptPriority =
    typeof rawEntry['promptPriority'] === 'number' ? rawEntry['promptPriority'] : undefined;
  return {
    id,
    phrase: normalizeVocabularyText(phrase),
    displayForm: normalizeVocabularyText(displayForm),
    language,
    spokenAliases: spokenAliases.map(normalizeVocabularyText).filter((alias) => alias.length > 0),
    weight,
    enabled,
    exactCase,
    ...(category.length > 0 ? { category } : {}),
    ...(promptPriority !== undefined ? { promptPriority } : {}),
  };
}

function replaceVocabularySet(
  snapshot: VocabularyStoreSnapshotV1,
  nextSet: VocabularySetV1,
  message: string,
  nowIso: string,
  importedEntries = 0,
): VocabularyImportResult {
  const nextSnapshot: VocabularyStoreSnapshotV1 = {
    ...snapshot,
    revision: snapshot.revision + 1,
    sets: snapshot.sets.map((set) => (set.id === nextSet.id ? nextSet : set)),
    activeSetIds: nextSet.enabled
      ? appendUnique(snapshot.activeSetIds, nextSet.id)
      : snapshot.activeSetIds.filter((id) => id !== nextSet.id),
    updatedAt: nowIso,
  };
  return validateNextSnapshot(nextSnapshot, message, importedEntries);
}

function validateNextSnapshot(
  snapshot: VocabularyStoreSnapshotV1,
  message: string,
  importedEntries = 0,
): VocabularyImportResult {
  const validation = validateVocabularyStoreSnapshot(snapshot);
  if (validation.normalizedSnapshot === undefined) {
    return { ok: false, importedEntries: 0, message: formatVocabularyErrors(validation.errors) };
  }
  return { ok: true, snapshot: validation.normalizedSnapshot, importedEntries, message };
}

function entryToCsvRow(entry: VocabularyEntryV1): readonly string[] {
  return [
    entry.id,
    entry.phrase,
    entry.displayForm,
    entry.language,
    entry.spokenAliases.join('|'),
    entry.weight.toString(),
    entry.category ?? '',
    entry.enabled ? 'true' : 'false',
    entry.exactCase ? 'true' : 'false',
    entry.promptPriority?.toString() ?? '',
  ];
}

function csvRowToEntry(row: readonly string[]): VocabularyEntryV1 {
  const [
    id,
    phrase,
    displayForm,
    language,
    spokenAliases,
    weight,
    category,
    enabled,
    exactCase,
    promptPriority,
  ] = row;
  return {
    id: id ?? '',
    phrase: phrase ?? '',
    displayForm: displayForm ?? phrase ?? '',
    language: isVocabularyLanguage(language) ? language : 'auto',
    spokenAliases: (spokenAliases ?? '')
      .split('|')
      .map(normalizeVocabularyText)
      .filter((alias) => alias.length > 0),
    weight: Number(weight ?? '5'),
    enabled: (enabled ?? 'true').toLocaleLowerCase() !== 'false',
    exactCase: (exactCase ?? 'false').toLocaleLowerCase() === 'true',
    ...(category !== undefined && category.trim().length > 0
      ? { category: normalizeVocabularyText(category) }
      : {}),
    ...(promptPriority !== undefined && promptPriority.trim().length > 0
      ? { promptPriority: Number(promptPriority) }
      : {}),
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += character ?? '';
  }
  row.push(cell);
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/u.test(value)) return value;
  return `"${value.replace(/"/gu, '""')}"`;
}

function uniqueId(prefix: string, text: string, existingIds: ReadonlySet<string>): string {
  const base = `${prefix}-${slugify(text) || 'item'}`;
  return uniqueExistingOrSuffix(base, existingIds);
}

function uniqueExistingOrSuffix(base: string, existingIds: ReadonlySet<string>): string {
  let candidate = sanitizeId(base);
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${sanitizeId(base)}-${suffix.toString()}`;
    suffix += 1;
  }
  return candidate;
}

function sanitizeId(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return sanitized.length > 0 ? sanitized : 'item';
}

function slugify(value: string): string {
  return canonicalizeVocabularyText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

function isSnapshotLike(value: unknown): value is VocabularyStoreSnapshotV1 {
  return isRecord(value) && value['schemaVersion'] === 1 && Array.isArray(value['sets']);
}

function isSetLike(value: unknown): value is VocabularySetV1 {
  return isRecord(value) && value['schemaVersion'] === 1 && Array.isArray(value['entries']);
}

function isVocabularyLanguage(value: unknown): value is VocabularyEntryLanguage {
  return value === 'vi' || value === 'en' || value === 'mixed' || value === 'auto';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
