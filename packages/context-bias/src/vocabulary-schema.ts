import type {
  SpeechModelManifestV2,
  VocabularyEntryLanguage,
  VocabularyEntryV1,
  VocabularyError,
  VocabularyErrorCode,
  VocabularyRevisionV1,
  VocabularySetSource,
  VocabularySetV1,
  VocabularyStoreSnapshotV1,
} from '@speech/protocol';
import { vocabularyEntryLanguageValues } from '@speech/protocol';

export interface VocabularySchemaLimits {
  readonly maxIdCodePoints: number;
  readonly maxSetDisplayNameCodePoints: number;
  readonly maxDescriptionCodePoints: number;
  readonly maxPhraseCodePoints: number;
  readonly maxDisplayFormCodePoints: number;
  readonly maxAliasCodePoints: number;
  readonly maxCategoryCodePoints: number;
  readonly maxRecordingIdsPerEntry: number;
  readonly maxEntriesPerSet: number;
  readonly maxSets: number;
  readonly defaultWeightRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly maxPromptPriority: number;
}

export interface VocabularyValidationOptions {
  readonly contextBiasing?: SpeechModelManifestV2['contextBiasing'];
  readonly limits?: Partial<VocabularySchemaLimits>;
}

export interface VocabularyEntryValidationResult {
  readonly ok: boolean;
  readonly errors: readonly VocabularyError[];
  readonly normalizedEntry?: VocabularyEntryV1;
}

export interface VocabularySetValidationResult {
  readonly ok: boolean;
  readonly errors: readonly VocabularyError[];
  readonly normalizedSet?: VocabularySetV1;
  readonly activeEntryCount: number;
}

export interface VocabularyStoreValidationResult {
  readonly ok: boolean;
  readonly errors: readonly VocabularyError[];
  readonly normalizedSnapshot?: VocabularyStoreSnapshotV1;
  readonly revision?: VocabularyRevisionV1;
  readonly activeEntryCount: number;
}

export const defaultVocabularySchemaLimits: VocabularySchemaLimits = {
  maxIdCodePoints: 128,
  maxSetDisplayNameCodePoints: 80,
  maxDescriptionCodePoints: 500,
  maxPhraseCodePoints: 160,
  maxDisplayFormCodePoints: 160,
  maxAliasCodePoints: 160,
  maxCategoryCodePoints: 64,
  maxRecordingIdsPerEntry: 64,
  maxEntriesPerSet: 1_000,
  maxSets: 32,
  defaultWeightRange: { min: 0, max: 10 },
  maxPromptPriority: 10_000,
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const vocabularySetSourceValues = new Set<VocabularySetSource>([
  'manual',
  'csv',
  'json',
  'imported',
  'system',
]);
const languageValues = new Set<VocabularyEntryLanguage>(vocabularyEntryLanguageValues);

export function normalizeVocabularyText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function canonicalizeVocabularyText(value: string): string {
  return normalizeVocabularyText(value).toLocaleLowerCase('vi');
}

export function validateVocabularyEntry(
  value: unknown,
  options: VocabularyValidationOptions & { readonly setId?: string } = {},
): VocabularyEntryValidationResult {
  const limits = resolveLimits(options.limits);
  const errors: VocabularyError[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [
        makeIssue('invalid-field', 'Vocabulary entry must be an object.', { setId: options.setId }),
      ],
    };
  }

  const id = validateId(value['id'], 'id', limits.maxIdCodePoints, errors, {
    setId: options.setId,
  });
  const entryId = id;
  const phrase = validateTextField(value['phrase'], 'phrase', limits.maxPhraseCodePoints, errors, {
    setId: options.setId,
    entryId,
    emptyCode: 'empty',
    overlongCode: 'overlong',
  });
  const displayForm = validateTextField(
    value['displayForm'],
    'displayForm',
    limits.maxDisplayFormCodePoints,
    errors,
    { setId: options.setId, entryId, emptyCode: 'empty', overlongCode: 'overlong' },
  );
  const language = validateLanguage(value['language'], errors, { setId: options.setId, entryId });
  const spokenAliases = validateAliases(value['spokenAliases'], phrase, limits, errors, {
    setId: options.setId,
    entryId,
  });
  const weight = validateWeight(value['weight'], options.contextBiasing, limits, errors, {
    setId: options.setId,
    entryId,
  });
  const enabled = validateBoolean(value['enabled'], 'enabled', errors, {
    setId: options.setId,
    entryId,
  });
  const exactCase = validateBoolean(value['exactCase'], 'exactCase', errors, {
    setId: options.setId,
    entryId,
  });
  const category = validateOptionalTextField(
    value['category'],
    'category',
    limits.maxCategoryCodePoints,
    errors,
    { setId: options.setId, entryId },
  );
  const promptPriority = validateOptionalNonNegativeInteger(
    value['promptPriority'],
    'promptPriority',
    limits.maxPromptPriority,
    errors,
    { setId: options.setId, entryId, code: 'invalid-priority' },
  );
  const pronunciationRecordingIds = validateRecordingIds(
    value['pronunciationRecordingIds'],
    limits,
    errors,
    { setId: options.setId, entryId },
  );

  if (enabled === true && options.contextBiasing?.supported === false) {
    errors.push(
      makeIssue(
        'unsupported-context-biasing',
        'Vocabulary entry cannot be enabled for a model that does not support contextual biasing.',
        {
          setId: options.setId,
          entryId,
          field: 'enabled',
        },
      ),
    );
  }

  if (
    enabled === true &&
    spokenAliases !== undefined &&
    options.contextBiasing?.supported === true &&
    spokenAliases.length > options.contextBiasing.maxAliasesPerEntry
  ) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `spokenAliases exceeds the model alias limit of ${options.contextBiasing.maxAliasesPerEntry.toString()}.`,
        {
          setId: options.setId,
          entryId,
          field: 'spokenAliases',
        },
      ),
    );
  }

  if (
    enabled === true &&
    language !== undefined &&
    options.contextBiasing?.supported === true &&
    !options.contextBiasing.supportedEntryLanguages.includes(language)
  ) {
    errors.push(
      makeIssue(
        'unsupported-language',
        `Vocabulary language ${language} is not supported by the active model context-bias contract.`,
        {
          setId: options.setId,
          entryId,
          field: 'language',
        },
      ),
    );
  }

  if (
    id === undefined ||
    phrase === undefined ||
    displayForm === undefined ||
    language === undefined ||
    spokenAliases === undefined ||
    weight === undefined ||
    enabled === undefined ||
    exactCase === undefined ||
    errors.length > 0
  ) {
    return { ok: false, errors };
  }

  const normalizedEntry: VocabularyEntryV1 = {
    id,
    phrase,
    displayForm,
    language,
    spokenAliases,
    weight,
    enabled,
    exactCase,
    ...(category !== undefined ? { category } : {}),
    ...(promptPriority !== undefined ? { promptPriority } : {}),
    ...(pronunciationRecordingIds !== undefined ? { pronunciationRecordingIds } : {}),
  };
  return { ok: true, errors: [], normalizedEntry };
}

export function validateVocabularySet(
  value: unknown,
  options: VocabularyValidationOptions = {},
): VocabularySetValidationResult {
  const limits = resolveLimits(options.limits);
  const errors: VocabularyError[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [makeIssue('invalid-field', 'Vocabulary set must be an object.')],
      activeEntryCount: 0,
    };
  }

  if (value['schemaVersion'] !== 1) {
    errors.push(
      makeIssue('invalid-schema-version', 'Vocabulary set schemaVersion must be 1.', {
        field: 'schemaVersion',
      }),
    );
  }

  const id = validateId(value['id'], 'id', limits.maxIdCodePoints, errors);
  const displayName = validateTextField(
    value['displayName'],
    'displayName',
    limits.maxSetDisplayNameCodePoints,
    errors,
    { setId: id, emptyCode: 'empty', overlongCode: 'overlong' },
  );
  const description = validateOptionalTextField(
    value['description'],
    'description',
    limits.maxDescriptionCodePoints,
    errors,
    { setId: id },
  );
  const enabled = validateBoolean(value['enabled'], 'enabled', errors, { setId: id });
  const revision = validateRevision(value['revision'], errors, { setId: id });
  const createdAt = validateIsoTimestamp(value['createdAt'], 'createdAt', errors, { setId: id });
  const updatedAt = validateIsoTimestamp(value['updatedAt'], 'updatedAt', errors, { setId: id });
  const source = validateOptionalSetSource(value['source'], errors, { setId: id });

  const rawEntries = value['entries'];
  const normalizedEntries: VocabularyEntryV1[] = [];
  let activeEntryCount = 0;
  if (!Array.isArray(rawEntries)) {
    errors.push(
      makeIssue('invalid-field', 'Vocabulary set entries must be an array.', {
        setId: id,
        field: 'entries',
      }),
    );
  } else {
    if (rawEntries.length > limits.maxEntriesPerSet) {
      errors.push(
        makeIssue(
          'limit-exceeded',
          `Vocabulary set must contain at most ${limits.maxEntriesPerSet.toString()} entries.`,
          {
            setId: id,
            field: 'entries',
          },
        ),
      );
    }
    const seenEntryIds = new Set<string>();
    const seenPhrases = new Map<string, string>();
    const entryOptions: VocabularyValidationOptions & { readonly setId?: string } = {
      ...(options.limits !== undefined ? { limits: options.limits } : {}),
      ...(enabled === true && options.contextBiasing !== undefined
        ? { contextBiasing: options.contextBiasing }
        : {}),
      ...(id !== undefined ? { setId: id } : {}),
    };
    for (const rawEntry of rawEntries) {
      const entryResult = validateVocabularyEntry(rawEntry, entryOptions);
      errors.push(...entryResult.errors);
      if (entryResult.normalizedEntry === undefined) continue;
      const entry = entryResult.normalizedEntry;
      normalizedEntries.push(entry);
      if (seenEntryIds.has(entry.id)) {
        errors.push(
          makeIssue('duplicate', `Vocabulary entry id ${entry.id} is duplicated.`, {
            setId: id,
            entryId: entry.id,
            field: 'id',
          }),
        );
      }
      seenEntryIds.add(entry.id);
      for (const key of [entry.phrase, ...entry.spokenAliases].map(canonicalizeVocabularyText)) {
        const existingEntryId = seenPhrases.get(`${entry.language}:${key}`);
        if (existingEntryId !== undefined) {
          errors.push(
            makeIssue(
              'duplicate',
              `Vocabulary phrase or alias duplicates entry ${existingEntryId}.`,
              {
                setId: id,
                entryId: entry.id,
                field: 'phrase',
              },
            ),
          );
        } else {
          seenPhrases.set(`${entry.language}:${key}`, entry.id);
        }
      }
      if (enabled === true && entry.enabled) activeEntryCount += 1;
    }
  }

  if (
    options.contextBiasing?.supported === true &&
    activeEntryCount > options.contextBiasing.maxActiveEntries
  ) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `Active vocabulary entries exceed the model limit of ${options.contextBiasing.maxActiveEntries.toString()}.`,
        {
          setId: id,
          field: 'entries',
        },
      ),
    );
  }

  if (
    id === undefined ||
    displayName === undefined ||
    enabled === undefined ||
    revision === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    errors.length > 0
  ) {
    return { ok: false, errors, activeEntryCount };
  }

  const normalizedSet: VocabularySetV1 = {
    schemaVersion: 1,
    id,
    displayName,
    enabled,
    revision,
    entries: normalizedEntries,
    createdAt,
    updatedAt,
    ...(description !== undefined ? { description } : {}),
    ...(source !== undefined ? { source } : {}),
  };
  return { ok: true, errors: [], normalizedSet, activeEntryCount };
}

export function validateVocabularyStoreSnapshot(
  value: unknown,
  options: VocabularyValidationOptions = {},
): VocabularyStoreValidationResult {
  const limits = resolveLimits(options.limits);
  const errors: VocabularyError[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [makeIssue('invalid-field', 'Vocabulary store snapshot must be an object.')],
      activeEntryCount: 0,
    };
  }

  if (value['schemaVersion'] !== 1) {
    errors.push(
      makeIssue('invalid-schema-version', 'Vocabulary store snapshot schemaVersion must be 1.', {
        field: 'schemaVersion',
      }),
    );
  }
  const revision = validateRevision(value['revision'], errors);
  const updatedAt = validateIsoTimestamp(value['updatedAt'], 'updatedAt', errors);

  const activeSetIds = validateStringArray(value['activeSetIds'], 'activeSetIds', errors);
  const activeSetIdSet = new Set<string>();
  if (activeSetIds !== undefined) {
    for (const setId of activeSetIds) {
      if (activeSetIdSet.has(setId)) {
        errors.push(
          makeIssue('duplicate', `Active vocabulary set id ${setId} is duplicated.`, {
            setId,
            field: 'activeSetIds',
          }),
        );
      }
      activeSetIdSet.add(setId);
    }
  }

  const rawSets = value['sets'];
  const normalizedSets: VocabularySetV1[] = [];
  const setIds = new Set<string>();
  const activeEntries: VocabularyEntryV1[] = [];
  let activeEntryCount = 0;
  if (!Array.isArray(rawSets)) {
    errors.push(
      makeIssue('invalid-field', 'Vocabulary store sets must be an array.', { field: 'sets' }),
    );
  } else {
    if (rawSets.length > limits.maxSets) {
      errors.push(
        makeIssue(
          'limit-exceeded',
          `Vocabulary store must contain at most ${limits.maxSets.toString()} sets.`,
          {
            field: 'sets',
          },
        ),
      );
    }
    for (const rawSet of rawSets) {
      const rawSetId =
        isRecord(rawSet) && typeof rawSet['id'] === 'string' ? rawSet['id'].trim() : undefined;
      const setOptions: VocabularyValidationOptions = {
        ...(options.limits !== undefined ? { limits: options.limits } : {}),
        ...(rawSetId !== undefined &&
        activeSetIdSet.has(rawSetId) &&
        options.contextBiasing !== undefined
          ? { contextBiasing: options.contextBiasing }
          : {}),
      };
      const setResult = validateVocabularySet(rawSet, setOptions);
      errors.push(...setResult.errors);
      if (setResult.normalizedSet === undefined) continue;
      const set = setResult.normalizedSet;
      normalizedSets.push(set);
      if (setIds.has(set.id)) {
        errors.push(
          makeIssue('duplicate', `Vocabulary set id ${set.id} is duplicated.`, {
            setId: set.id,
            field: 'id',
          }),
        );
      }
      setIds.add(set.id);
    }
  }

  if (activeSetIds !== undefined) {
    for (const setId of activeSetIds) {
      const activeSet = normalizedSets.find((set) => set.id === setId);
      if (activeSet === undefined) {
        errors.push(
          makeIssue('invalid-id', `Active vocabulary set id ${setId} does not reference a set.`, {
            setId,
            field: 'activeSetIds',
          }),
        );
        continue;
      }
      if (!activeSet.enabled) continue;
      for (const entry of activeSet.entries) {
        if (!entry.enabled) continue;
        activeEntries.push(entry);
        activeEntryCount += 1;
      }
    }
  }

  if (
    options.contextBiasing?.supported === true &&
    activeEntryCount > options.contextBiasing.maxActiveEntries
  ) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `Active vocabulary entries exceed the model limit of ${options.contextBiasing.maxActiveEntries.toString()}.`,
        {
          field: 'activeSetIds',
        },
      ),
    );
  }

  if (
    revision === undefined ||
    updatedAt === undefined ||
    activeSetIds === undefined ||
    errors.length > 0
  ) {
    return { ok: false, errors, activeEntryCount };
  }

  const normalizedSnapshot: VocabularyStoreSnapshotV1 = {
    schemaVersion: 1,
    revision,
    sets: normalizedSets,
    activeSetIds,
    updatedAt,
  };
  const revisionPayload: VocabularyRevisionV1 = {
    revision,
    activeSetIds,
    entries: activeEntries,
  };
  return {
    ok: true,
    errors: [],
    normalizedSnapshot,
    revision: revisionPayload,
    activeEntryCount,
  };
}

function resolveLimits(overrides?: Partial<VocabularySchemaLimits>): VocabularySchemaLimits {
  if (overrides === undefined) return defaultVocabularySchemaLimits;
  return {
    ...defaultVocabularySchemaLimits,
    ...overrides,
    defaultWeightRange: {
      ...defaultVocabularySchemaLimits.defaultWeightRange,
      ...overrides.defaultWeightRange,
    },
  };
}

function validateId(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: VocabularyError[],
  scope: IssueScope = {},
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(makeIssue('invalid-id', `${field} must be a string id.`, { ...scope, field }));
    return undefined;
  }
  const id = value.trim();
  if (id.length === 0) {
    errors.push(makeIssue('invalid-id', `${field} must not be empty.`, { ...scope, field }));
    return undefined;
  }
  if (!idPattern.test(id)) {
    errors.push(
      makeIssue(
        'invalid-id',
        `${field} may contain only letters, numbers, dots, underscores, colons, and hyphens.`,
        { ...scope, field },
      ),
    );
  }
  if (countCodePoints(id) > maxCodePoints) {
    errors.push(
      makeIssue('overlong', `${field} exceeds ${maxCodePoints.toString()} Unicode code points.`, {
        ...scope,
        field,
      }),
    );
  }
  return id;
}

function validateTextField(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: VocabularyError[],
  scope: IssueScope & {
    readonly emptyCode: VocabularyErrorCode;
    readonly overlongCode: VocabularyErrorCode;
  },
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(makeIssue('invalid-field', `${field} must be a string.`, { ...scope, field }));
    return undefined;
  }
  const normalized = normalizeVocabularyText(value);
  if (normalized.length === 0) {
    errors.push(makeIssue(scope.emptyCode, `${field} must not be empty.`, { ...scope, field }));
    return undefined;
  }
  if (countCodePoints(normalized) > maxCodePoints) {
    errors.push(
      makeIssue(
        scope.overlongCode,
        `${field} exceeds ${maxCodePoints.toString()} Unicode code points.`,
        { ...scope, field },
      ),
    );
  }
  return normalized;
}

function validateOptionalTextField(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: VocabularyError[],
  scope: IssueScope = {},
): string | undefined {
  if (value === undefined) return undefined;
  return validateTextField(value, field, maxCodePoints, errors, {
    ...scope,
    emptyCode: 'empty',
    overlongCode: 'overlong',
  });
}

function validateLanguage(
  value: unknown,
  errors: VocabularyError[],
  scope: IssueScope,
): VocabularyEntryLanguage | undefined {
  if (typeof value !== 'string' || !languageValues.has(value as VocabularyEntryLanguage)) {
    errors.push(
      makeIssue('invalid-language', 'language must be one of vi, en, mixed, or auto.', {
        ...scope,
        field: 'language',
      }),
    );
    return undefined;
  }
  return value as VocabularyEntryLanguage;
}

function validateAliases(
  value: unknown,
  phrase: string | undefined,
  limits: VocabularySchemaLimits,
  errors: VocabularyError[],
  scope: IssueScope,
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      makeIssue('invalid-field', 'spokenAliases must be an array.', {
        ...scope,
        field: 'spokenAliases',
      }),
    );
    return undefined;
  }
  const aliases: string[] = [];
  const seenAliases = new Set<string>();
  if (phrase !== undefined) seenAliases.add(canonicalizeVocabularyText(phrase));
  for (const [index, rawAlias] of value.entries()) {
    if (typeof rawAlias !== 'string') {
      errors.push(
        makeIssue('invalid-field', 'spokenAliases entries must be strings.', {
          ...scope,
          field: `spokenAliases.${index.toString()}`,
        }),
      );
      continue;
    }
    const alias = normalizeVocabularyText(rawAlias);
    if (alias.length === 0) {
      errors.push(
        makeIssue('empty', 'spokenAliases entries must not be empty.', {
          ...scope,
          field: `spokenAliases.${index.toString()}`,
        }),
      );
      continue;
    }
    if (countCodePoints(alias) > limits.maxAliasCodePoints) {
      errors.push(
        makeIssue(
          'overlong',
          `spokenAliases entries must be at most ${limits.maxAliasCodePoints.toString()} Unicode code points.`,
          {
            ...scope,
            field: `spokenAliases.${index.toString()}`,
          },
        ),
      );
    }
    const canonicalAlias = canonicalizeVocabularyText(alias);
    if (seenAliases.has(canonicalAlias)) {
      errors.push(
        makeIssue('duplicate', 'spokenAliases must not duplicate the phrase or another alias.', {
          ...scope,
          field: `spokenAliases.${index.toString()}`,
        }),
      );
    }
    seenAliases.add(canonicalAlias);
    aliases.push(alias);
  }
  return aliases;
}

function validateWeight(
  value: unknown,
  contextBiasing: SpeechModelManifestV2['contextBiasing'] | undefined,
  limits: VocabularySchemaLimits,
  errors: VocabularyError[],
  scope: IssueScope,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(
      makeIssue('invalid-weight', 'weight must be a finite number.', { ...scope, field: 'weight' }),
    );
    return undefined;
  }
  const range =
    contextBiasing?.supported === true ? contextBiasing.weightRange : limits.defaultWeightRange;
  if (value < range.min || value > range.max) {
    errors.push(
      makeIssue(
        'invalid-weight',
        `weight must be between ${range.min.toString()} and ${range.max.toString()}.`,
        {
          ...scope,
          field: 'weight',
        },
      ),
    );
  }
  return value;
}

function validateBoolean(
  value: unknown,
  field: string,
  errors: VocabularyError[],
  scope: IssueScope,
): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors.push(makeIssue('invalid-field', `${field} must be boolean.`, { ...scope, field }));
    return undefined;
  }
  return value;
}

function validateOptionalNonNegativeInteger(
  value: unknown,
  field: string,
  max: number,
  errors: VocabularyError[],
  scope: IssueScope & { readonly code: VocabularyErrorCode },
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    errors.push(
      makeIssue(scope.code, `${field} must be an integer in [0, ${max.toString()}].`, {
        ...scope,
        field,
      }),
    );
    return undefined;
  }
  return value;
}

function validateRecordingIds(
  value: unknown,
  limits: VocabularySchemaLimits,
  errors: VocabularyError[],
  scope: IssueScope,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(
      makeIssue('invalid-field', 'pronunciationRecordingIds must be an array.', {
        ...scope,
        field: 'pronunciationRecordingIds',
      }),
    );
    return undefined;
  }
  if (value.length > limits.maxRecordingIdsPerEntry) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `pronunciationRecordingIds may contain at most ${limits.maxRecordingIdsPerEntry.toString()} ids.`,
        {
          ...scope,
          field: 'pronunciationRecordingIds',
        },
      ),
    );
  }
  const ids: string[] = [];
  const seenIds = new Set<string>();
  for (const [index, rawId] of value.entries()) {
    const id = validateId(
      rawId,
      `pronunciationRecordingIds.${index.toString()}`,
      limits.maxIdCodePoints,
      errors,
      scope,
    );
    if (id === undefined) continue;
    if (seenIds.has(id)) {
      errors.push(
        makeIssue(
          'duplicate',
          `pronunciationRecordingIds.${index.toString()} duplicates another recording id.`,
          { ...scope, field: `pronunciationRecordingIds.${index.toString()}` },
        ),
      );
    }
    seenIds.add(id);
    ids.push(id);
  }
  return ids;
}

function validateRevision(
  value: unknown,
  errors: VocabularyError[],
  scope: IssueScope = {},
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(
      makeIssue('invalid-revision', 'revision must be a non-negative integer.', {
        ...scope,
        field: 'revision',
      }),
    );
    return undefined;
  }
  return value;
}

function validateIsoTimestamp(
  value: unknown,
  field: string,
  errors: VocabularyError[],
  scope: IssueScope = {},
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(
      makeIssue('invalid-timestamp', `${field} must be an ISO timestamp string.`, {
        ...scope,
        field,
      }),
    );
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length === 0 || Number.isNaN(Date.parse(normalized))) {
    errors.push(
      makeIssue('invalid-timestamp', `${field} must be a parseable ISO timestamp string.`, {
        ...scope,
        field,
      }),
    );
    return undefined;
  }
  return normalized;
}

function validateOptionalSetSource(
  value: unknown,
  errors: VocabularyError[],
  scope: IssueScope,
): VocabularySetSource | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !vocabularySetSourceValues.has(value as VocabularySetSource)) {
    errors.push(
      makeIssue('invalid-field', 'source must be one of manual, csv, json, imported, or system.', {
        ...scope,
        field: 'source',
      }),
    );
    return undefined;
  }
  return value as VocabularySetSource;
}

function validateStringArray(
  value: unknown,
  field: string,
  errors: VocabularyError[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(makeIssue('invalid-field', `${field} must be an array.`, { field }));
    return undefined;
  }
  const strings: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string') {
      errors.push(
        makeIssue('invalid-id', `${field}.${index.toString()} must be a string id.`, {
          field: `${field}.${index.toString()}`,
        }),
      );
      continue;
    }
    strings.push(item.trim());
  }
  return strings;
}

function countCodePoints(value: string): number {
  return [...value].length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface IssueScope {
  readonly setId?: string | undefined;
  readonly entryId?: string | undefined;
  readonly field?: string | undefined;
}

function makeIssue(
  code: VocabularyErrorCode,
  message: string,
  scope: IssueScope = {},
): VocabularyError {
  return {
    code,
    message,
    ...(scope.setId !== undefined ? { setId: scope.setId } : {}),
    ...(scope.entryId !== undefined ? { entryId: scope.entryId } : {}),
    ...(scope.field !== undefined ? { field: scope.field } : {}),
  };
}
