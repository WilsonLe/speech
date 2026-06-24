import type { ExactBaseModelIdentityV1, ProfileFileRef, ProfileLanguage } from '@speech/protocol';

/** File extension for portable per-user personal voice models. */
export const PORTABLE_SPEECH_MODEL_EXTENSION = '.speechmodel';

/** MIME type for portable per-user personal voice models. */
export const PORTABLE_SPEECH_MODEL_MIME_TYPE = 'application/vnd.wilsonle.speech.personal-model';

/** Portable bundle schema version produced and consumed by this contract. */
export const PORTABLE_SPEECH_MODEL_MANIFEST_SCHEMA_VERSION = 1;

export type PortableSpeechModelAdaptationType = 'browser-top-adapter' | 'cli-residual-adapter';

export interface PortableSpeechModelAdaptationV1 {
  readonly type: PortableSpeechModelAdaptationType;
  readonly contractVersion: number;
  readonly algorithmId: string;
  readonly files: Readonly<Record<string, ProfileFileRef>>;
}

export interface PortableSpeechModelProfileV1 {
  readonly sourceProfileId: string;
  readonly languages: readonly ProfileLanguage[];
  readonly supportsMixed: boolean;
}

export interface PortableSpeechModelVocabularyV1 {
  readonly included: boolean;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly file: ProfileFileRef;
}

export interface PortableSpeechModelEvaluationV1 {
  readonly gatePassed: boolean;
  readonly summaryFile: ProfileFileRef;
  readonly metricsFile: ProfileFileRef;
}

/**
 * Privacy shape for a default portable bundle. Default exports exclude raw
 * audio, prepared features, optimizer/checkpoint state, and the shared base
 * model. Adapter weights and speaker embeddings are voice-derived data, so
 * `containsVoiceDerivedWeights` is always true.
 */
export interface PortableSpeechModelPrivacyV1 {
  readonly containsRawAudio: false;
  readonly containsPreparedFeatures: false;
  readonly containsVoiceDerivedWeights: true;
}

/**
 * Portable per-user personal voice model manifest. Describes a compact adapter
 * plus optional speaker profile and vocabulary bound to an exact shared base
 * model. The bundle never contains the base model itself.
 */
export interface PortableSpeechModelManifestV1 {
  readonly schemaVersion: 1;
  readonly bundleType: 'personal-voice-model';
  readonly bundleId: string;
  readonly modelRevision: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly exportedAt: string;
  readonly sourceAppVersion: string;
  readonly profile: PortableSpeechModelProfileV1;
  readonly baseModel: ExactBaseModelIdentityV1;
  readonly adaptation: PortableSpeechModelAdaptationV1;
  readonly vocabulary?: PortableSpeechModelVocabularyV1;
  readonly evaluation: PortableSpeechModelEvaluationV1;
  readonly privacy: PortableSpeechModelPrivacyV1;
  readonly files: readonly ProfileFileRef[];
}

export interface PortableManifestValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const bundleIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const languageValues = new Set<ProfileLanguage>(['vi', 'en']);
const adaptationTypeValues = new Set<PortableSpeechModelAdaptationType>([
  'browser-top-adapter',
  'cli-residual-adapter',
]);

export function validatePortableSpeechModelManifestV1(
  value: unknown,
): PortableManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['portable manifest must be an object'] };
  }

  if (value['schemaVersion'] !== 1) errors.push('schemaVersion must be 1');
  if (value['bundleType'] !== 'personal-voice-model') {
    errors.push('bundleType must be personal-voice-model');
  }
  validatePatternString(value['bundleId'], 'bundleId', bundleIdPattern, errors);
  validateNonEmptyString(value['modelRevision'], 'modelRevision', errors);
  validateNonEmptyString(value['displayName'], 'displayName', errors);
  validateNonEmptyString(value['createdAt'], 'createdAt', errors);
  validateNonEmptyString(value['exportedAt'], 'exportedAt', errors);
  validateNonEmptyString(value['sourceAppVersion'], 'sourceAppVersion', errors);
  validateProfile(value['profile'], errors);
  validateExactBaseModelIdentity(value['baseModel'], errors);
  validateAdaptation(value['adaptation'], errors);
  if (value['vocabulary'] !== undefined) {
    validateVocabulary(value['vocabulary'], errors);
  }
  validateEvaluation(value['evaluation'], errors);
  validatePrivacy(value['privacy'], errors);
  validateFilesArray(value['files'], errors);

  return { ok: errors.length === 0, errors };
}

export function parsePortableSpeechModelManifestV1(value: unknown): PortableSpeechModelManifestV1 {
  const result = validatePortableSpeechModelManifestV1(value);
  if (!result.ok) {
    throw new Error(`Portable speech model manifest v1 is invalid: ${result.errors.join('; ')}`);
  }
  return value as PortableSpeechModelManifestV1;
}

function validateProfile(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('profile must be an object');
    return;
  }
  validateNonEmptyString(value['sourceProfileId'], 'profile.sourceProfileId', errors);
  validateEnumArray(value['languages'], 'profile.languages', languageValues, errors);
  if (typeof value['supportsMixed'] !== 'boolean') {
    errors.push('profile.supportsMixed must be boolean');
  }
}

function validateExactBaseModelIdentity(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('baseModel must be an object');
    return;
  }
  validateNonEmptyString(value['id'], 'baseModel.id', errors);
  validateNonEmptyString(value['version'], 'baseModel.version', errors);
  validatePatternString(value['manifestSha256'], 'baseModel.manifestSha256', sha256Pattern, errors);
  validatePatternString(
    value['graphContractSha256'],
    'baseModel.graphContractSha256',
    sha256Pattern,
    errors,
  );
  validatePatternString(
    value['tokenizerSha256'],
    'baseModel.tokenizerSha256',
    sha256Pattern,
    errors,
  );
}

function validateAdaptation(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('adaptation must be an object');
    return;
  }
  validateEnumValue(value['type'], 'adaptation.type', adaptationTypeValues, errors);
  validatePositiveInteger(value['contractVersion'], 'adaptation.contractVersion', errors);
  validateNonEmptyString(value['algorithmId'], 'adaptation.algorithmId', errors);
  validateProfileFileMap(value['files'], 'adaptation.files', errors);
}

function validateVocabulary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('vocabulary must be an object');
    return;
  }
  if (typeof value['included'] !== 'boolean') {
    errors.push('vocabulary.included must be boolean');
  }
  validatePositiveInteger(value['schemaVersion'], 'vocabulary.schemaVersion', errors);
  validateNonNegativeInteger(value['revision'], 'vocabulary.revision', errors);
  validateProfileFileRef(value['file'], 'vocabulary.file', errors);
}

function validateEvaluation(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('evaluation must be an object');
    return;
  }
  if (typeof value['gatePassed'] !== 'boolean') {
    errors.push('evaluation.gatePassed must be boolean');
  }
  validateProfileFileRef(value['summaryFile'], 'evaluation.summaryFile', errors);
  validateProfileFileRef(value['metricsFile'], 'evaluation.metricsFile', errors);
}

function validatePrivacy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('privacy must be an object');
    return;
  }
  if (value['containsRawAudio'] !== false) {
    errors.push('privacy.containsRawAudio must be false');
  }
  if (value['containsPreparedFeatures'] !== false) {
    errors.push('privacy.containsPreparedFeatures must be false');
  }
  if (value['containsVoiceDerivedWeights'] !== true) {
    errors.push('privacy.containsVoiceDerivedWeights must be true');
  }
}

function validateFilesArray(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('files must be a non-empty array');
    return;
  }
  value.forEach((entry, index) => {
    validateProfileFileRef(entry, `files[${index}]`, errors);
  });
}

function validateProfileFileMap(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) errors.push(`${path} must include at least one file`);
  for (const [key, ref] of entries) {
    if (key.length === 0) errors.push(`${path} keys must be non-empty`);
    validateProfileFileRef(ref, `${path}.${key}`, errors);
  }
}

function validateProfileFileRef(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateNonEmptyString(value['path'], `${path}.path`, errors);
  validatePatternString(value['sha256'], `${path}.sha256`, sha256Pattern, errors);
  validatePositiveInteger(value['sizeBytes'], `${path}.sizeBytes`, errors);
  validateNonEmptyString(value['mediaType'], `${path}.mediaType`, errors);
}

function validateEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  const seen = new Set<T>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== 'string' || !allowed.has(entry as T)) {
      errors.push(`${entryPath} is not supported`);
      return;
    }
    const typedEntry = entry as T;
    if (seen.has(typedEntry)) errors.push(`${entryPath} must be unique`);
    seen.add(typedEntry);
  });
}

function validateEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): void {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    errors.push(`${path} is not supported`);
  }
}

function validateNonEmptyString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function validatePatternString(
  value: unknown,
  path: string,
  pattern: RegExp,
  errors: string[],
): void {
  validateNonEmptyString(value, path, errors);
  if (typeof value === 'string' && value.length > 0 && !pattern.test(value)) {
    errors.push(`${path} has invalid format`);
  }
}

function validatePositiveInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${path} must be a positive integer`);
  }
}

function validateNonNegativeInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    errors.push(`${path} must be a non-negative integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
