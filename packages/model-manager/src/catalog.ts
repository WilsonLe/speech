import type { SpeechLanguage } from '@speech/protocol';

export type ModelCatalogRuntimeStatus = 'available' | 'candidate' | 'blocked';

export interface ModelCatalogV1 {
  readonly schemaVersion: 1;
  readonly models: readonly ModelCatalogEntryV1[];
  readonly note?: string;
}

export interface ModelCatalogEntryV1 {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly languages: readonly SpeechLanguage[];
  readonly manifestUrl?: string;
  readonly manifestSha256?: string;
  readonly license: {
    readonly spdx?: string;
    readonly name: string;
    readonly redistributionAllowed: boolean;
  };
  readonly runtime: {
    readonly status: ModelCatalogRuntimeStatus;
    readonly installable: boolean;
    readonly streamingReady: boolean;
    readonly notes: readonly string[];
  };
}

export interface ModelCatalogValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const languageValues = new Set<SpeechLanguage>(['vi', 'en']);
const statusValues = new Set<ModelCatalogRuntimeStatus>(['available', 'candidate', 'blocked']);
const idPattern = /^[a-z0-9][a-z0-9._-]*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export function validateModelCatalogV1(value: unknown): ModelCatalogValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['catalog must be an object'] };
  }
  if (value['schemaVersion'] !== 1) errors.push('schemaVersion must be 1');
  validateOptionalNonEmptyString(value['note'], 'note', errors);

  const models = value['models'];
  if (!Array.isArray(models)) {
    errors.push('models must be an array');
  } else {
    const ids = new Set<string>();
    for (const [index, model] of models.entries()) {
      validateCatalogEntry(model, `models[${index.toString()}]`, ids, errors);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parseModelCatalogV1(value: unknown): ModelCatalogV1 {
  const result = validateModelCatalogV1(value);
  if (!result.ok) {
    throw new Error(`Invalid ModelCatalogV1: ${result.errors.join('; ')}`);
  }
  return value as ModelCatalogV1;
}

function validateCatalogEntry(
  value: unknown,
  path: string,
  ids: Set<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const id = validatePatternString(value['id'], `${path}.id`, idPattern, errors);
  if (id !== undefined) {
    if (ids.has(id)) errors.push(`${path}.id must be unique`);
    ids.add(id);
  }
  validateNonEmptyString(value['version'], `${path}.version`, errors);
  validateNonEmptyString(value['displayName'], `${path}.displayName`, errors);
  validateEnumArray(value['languages'], `${path}.languages`, languageValues, errors);
  const runtime = validateRuntime(value['runtime'], `${path}.runtime`, errors);
  validateCatalogManifestPointers(value, path, runtime, errors);
  validateLicense(value['license'], `${path}.license`, errors);
}

function validateLicense(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateOptionalNonEmptyString(value['spdx'], `${path}.spdx`, errors);
  validateNonEmptyString(value['name'], `${path}.name`, errors);
  if (typeof value['redistributionAllowed'] !== 'boolean') {
    errors.push(`${path}.redistributionAllowed must be boolean`);
  }
}

interface RuntimeValidationSummary {
  readonly status: ModelCatalogRuntimeStatus | undefined;
  readonly installable: boolean | undefined;
  readonly streamingReady: boolean | undefined;
}

function validateRuntime(
  value: unknown,
  path: string,
  errors: string[],
): RuntimeValidationSummary | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  const status = validateEnumValue(value['status'], `${path}.status`, statusValues, errors);
  const installable = validateBoolean(value['installable'], `${path}.installable`, errors);
  const streamingReady = validateBoolean(value['streamingReady'], `${path}.streamingReady`, errors);
  if (status === 'blocked') {
    if (installable === true)
      errors.push(`${path}.installable must be false when status is blocked`);
    if (streamingReady === true) {
      errors.push(`${path}.streamingReady must be false when status is blocked`);
    }
  }
  const notes = value['notes'];
  if (!Array.isArray(notes) || notes.length === 0) {
    errors.push(`${path}.notes must be a non-empty array`);
  } else {
    for (const [index, note] of notes.entries()) {
      validateNonEmptyString(note, `${path}.notes[${index.toString()}]`, errors);
    }
  }
  return { status, installable, streamingReady };
}

function validateCatalogManifestPointers(
  value: Record<string, unknown>,
  path: string,
  runtime: RuntimeValidationSummary | undefined,
  errors: string[],
): void {
  const manifestUrl = value['manifestUrl'];
  const manifestSha256 = value['manifestSha256'];
  const hasManifestUrl = manifestUrl !== undefined;
  const hasManifestSha256 = manifestSha256 !== undefined;

  if (runtime?.installable === true) {
    validateNonEmptyString(manifestUrl, `${path}.manifestUrl`, errors);
    validatePatternString(manifestSha256, `${path}.manifestSha256`, sha256Pattern, errors);
    return;
  }

  if (hasManifestUrl || hasManifestSha256) {
    validateNonEmptyString(manifestUrl, `${path}.manifestUrl`, errors);
    validatePatternString(manifestSha256, `${path}.manifestSha256`, sha256Pattern, errors);
    return;
  }

  if (runtime?.status !== undefined && runtime.status !== 'blocked') {
    errors.push(`${path}.manifestUrl is required unless runtime.status is blocked`);
  }
}

function validateEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): readonly T[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return undefined;
  }
  const result: T[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || !allowed.has(item as T)) {
      errors.push(`${path}[${index.toString()}] has unsupported value`);
      continue;
    }
    result.push(item as T);
  }
  return result;
}

function validateEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    errors.push(`${path} has unsupported value`);
    return undefined;
  }
  return value as T;
}

function validatePatternString(
  value: unknown,
  path: string,
  pattern: RegExp,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
    return undefined;
  }
  if (!pattern.test(value)) {
    errors.push(`${path} has invalid format`);
    return undefined;
  }
  return value;
}

function validateBoolean(value: unknown, path: string, errors: string[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors.push(`${path} must be boolean`);
    return undefined;
  }
  return value;
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function validateOptionalNonEmptyString(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  validateNonEmptyString(value, path, errors);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
