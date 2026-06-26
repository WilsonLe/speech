export const uiPreferencesStorageKey = 'speech:ui-preferences:v1';

export const legacyUiPreferenceKeys = {
  transcriptTextScale: 'speech:ui:transcript-text-scale',
  reducedMotion: 'speech:ui:reduced-motion',
  lastPrimaryDestination: 'speech:ui:last-primary-destination',
  dismissedHintIds: 'speech:ui:dismissed-hint-ids',
} as const;

export const currentOnboardingRevision = 1;

export const transcriptTextScales = ['default', 'large'] as const;
export type TranscriptTextScale = (typeof transcriptTextScales)[number];

export const reducedMotionPreferences = ['system', 'reduce', 'full'] as const;
export type ReducedMotionPreference = (typeof reducedMotionPreferences)[number];

export const primaryDestinations = ['dictate', 'vocabulary', 'models'] as const;
export type PrimaryDestination = (typeof primaryDestinations)[number];

export const dismissedHintRegistry = [
  'dictate-space-shortcut',
  'dictate-vocabulary-applies-next-utterance',
  'vocabulary-advanced-fields',
  'models-local-only',
  'training-progress-saved-on-device',
  'export-recordings-excluded',
] as const;

export type DismissedHintId = (typeof dismissedHintRegistry)[number];

export const maxDismissedHintIds = dismissedHintRegistry.length;

export interface UiPreferencesV1 {
  readonly schemaVersion: 1;
  readonly onboardingRevision: number;
  readonly transcriptTextScale: TranscriptTextScale;
  readonly reducedMotion: ReducedMotionPreference;
  readonly dismissedHintIds: readonly DismissedHintId[];
  readonly lastPrimaryDestination: PrimaryDestination;
}

export interface UiPreferencesLoadResult {
  readonly preferences: UiPreferencesV1;
  readonly status: 'defaulted' | 'loaded' | 'migrated' | 'repaired';
  readonly errors: readonly string[];
}

export type UiPreferencesStorageReader = Pick<Storage, 'getItem'>;
export type UiPreferencesStorageWriter = Pick<Storage, 'removeItem' | 'setItem'>;
export type UiPreferencesStorage = UiPreferencesStorageReader & UiPreferencesStorageWriter;

export function createDefaultUiPreferences(): UiPreferencesV1 {
  return {
    schemaVersion: 1,
    onboardingRevision: currentOnboardingRevision,
    transcriptTextScale: 'default',
    reducedMotion: 'system',
    dismissedHintIds: [],
    lastPrimaryDestination: 'dictate',
  };
}

export function parseUiPreferencesV1(value: unknown): UiPreferencesLoadResult {
  const defaults = createDefaultUiPreferences();
  if (!isPlainRecord(value)) {
    return {
      preferences: defaults,
      status: 'defaulted',
      errors: ['UI preferences were not an object.'],
    };
  }

  const errors: string[] = [];
  const preferences: UiPreferencesV1 = {
    schemaVersion: 1,
    onboardingRevision: parseOnboardingRevision(value['onboardingRevision'], errors),
    transcriptTextScale: parseEnum(
      value['transcriptTextScale'],
      transcriptTextScales,
      defaults.transcriptTextScale,
      'transcriptTextScale',
      errors,
    ),
    reducedMotion: parseEnum(
      value['reducedMotion'],
      reducedMotionPreferences,
      defaults.reducedMotion,
      'reducedMotion',
      errors,
    ),
    dismissedHintIds: parseDismissedHintIds(value['dismissedHintIds'], errors),
    lastPrimaryDestination: parseEnum(
      value['lastPrimaryDestination'],
      primaryDestinations,
      defaults.lastPrimaryDestination,
      'lastPrimaryDestination',
      errors,
    ),
  };

  if (value['schemaVersion'] !== 1) {
    errors.push('schemaVersion must be 1.');
  }

  return { preferences, status: errors.length === 0 ? 'loaded' : 'repaired', errors };
}

export function loadUiPreferences(storage: UiPreferencesStorageReader): UiPreferencesLoadResult {
  const raw = storage.getItem(uiPreferencesStorageKey);
  if (raw !== null && raw.trim().length > 0) {
    try {
      return parseUiPreferencesV1(JSON.parse(raw) as unknown);
    } catch (error) {
      return {
        preferences: createDefaultUiPreferences(),
        status: 'repaired',
        errors: [error instanceof Error ? error.message : 'UI preferences could not be parsed.'],
      };
    }
  }

  return migrateLegacyUiPreferences(storage);
}

export function saveUiPreferences(
  storage: UiPreferencesStorageWriter,
  preferences: UiPreferencesV1,
): void {
  const parsed = parseUiPreferencesV1(preferences);
  storage.setItem(uiPreferencesStorageKey, JSON.stringify(parsed.preferences));
}

export function resetUiPreferences(storage: UiPreferencesStorageWriter): void {
  storage.removeItem(uiPreferencesStorageKey);
}

export function updateUiPreferences(
  preferences: UiPreferencesV1,
  patch: Partial<Omit<UiPreferencesV1, 'schemaVersion'>>,
): UiPreferencesV1 {
  return parseUiPreferencesV1({ ...preferences, ...patch, schemaVersion: 1 }).preferences;
}

export function addDismissedHint(
  preferences: UiPreferencesV1,
  hintId: DismissedHintId,
): UiPreferencesV1 {
  if (preferences.dismissedHintIds.includes(hintId)) return preferences;
  return {
    ...preferences,
    dismissedHintIds: normalizeDismissedHintIds([...preferences.dismissedHintIds, hintId]),
  };
}

export function removeDismissedHint(
  preferences: UiPreferencesV1,
  hintId: DismissedHintId,
): UiPreferencesV1 {
  return {
    ...preferences,
    dismissedHintIds: preferences.dismissedHintIds.filter((candidate) => candidate !== hintId),
  };
}

function migrateLegacyUiPreferences(storage: UiPreferencesStorageReader): UiPreferencesLoadResult {
  const defaults = createDefaultUiPreferences();
  const migrated = parseUiPreferencesV1({
    schemaVersion: 1,
    onboardingRevision: defaults.onboardingRevision,
    transcriptTextScale: storage.getItem(legacyUiPreferenceKeys.transcriptTextScale),
    reducedMotion: storage.getItem(legacyUiPreferenceKeys.reducedMotion),
    dismissedHintIds: parseLegacyDismissedHints(
      storage.getItem(legacyUiPreferenceKeys.dismissedHintIds),
    ),
    lastPrimaryDestination: storage.getItem(legacyUiPreferenceKeys.lastPrimaryDestination),
  });

  const hasLegacyValue = Object.values(legacyUiPreferenceKeys).some(
    (key) => storage.getItem(key) !== null,
  );
  if (!hasLegacyValue) {
    return { preferences: defaults, status: 'defaulted', errors: [] };
  }
  return { ...migrated, status: migrated.errors.length === 0 ? 'migrated' : 'repaired' };
}

function parseLegacyDismissedHints(raw: string | null): unknown {
  if (raw === null || raw.trim().length === 0) return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw.split(',').map((item) => item.trim());
  }
}

function parseOnboardingRevision(value: unknown, errors: string[]): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  errors.push('onboardingRevision must be a non-negative integer.');
  return currentOnboardingRevision;
}

function parseDismissedHintIds(value: unknown, errors: string[]): readonly DismissedHintId[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) errors.push('dismissedHintIds must be an array.');
    return [];
  }
  const normalized = normalizeDismissedHintIds(value);
  if (normalized.length !== value.length) {
    errors.push('dismissedHintIds were capped to the finite registry.');
  }
  return normalized;
}

function normalizeDismissedHintIds(value: readonly unknown[]): readonly DismissedHintId[] {
  const allowed = new Set<string>(dismissedHintRegistry);
  const normalized: DismissedHintId[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string' || !allowed.has(candidate)) continue;
    if (normalized.includes(candidate as DismissedHintId)) continue;
    normalized.push(candidate as DismissedHintId);
    if (normalized.length >= maxDismissedHintIds) break;
  }
  return normalized;
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  fieldName: string,
  errors: string[],
): T[number] {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  errors.push(`${fieldName} must be one of: ${allowed.join(', ')}.`);
  return fallback;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
