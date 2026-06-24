export type AdaptationType = 'speaker-embedding' | 'residual-adapter' | 'merged-model';
export type ProfileLanguage = 'vi' | 'en';
export type ProfileAdapterPrecision = 'float32' | 'float16' | 'int8';
export type ProfileAdapterApplicationMode = 'residual-add' | 'lhuc-scale' | 'film-affine';
export type ProfileActivationSwapPolicy = 'utterance-boundary';
export type ProfileTrainingRuntime = 'python-profile-trainer' | 'docker-profile-trainer';
export type SpeakerEmbeddingVectorFormat = 'float32-vector';

export interface ModelIdentity {
  readonly id: string;
  readonly version: string;
  readonly manifestSha256: string;
  readonly graphContractSha256: string;
}

export interface ProfileFileRef {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface EvaluationMetrics {
  readonly wer?: number;
  readonly cer?: number;
  readonly customTermRecall?: number;
  readonly falseInsertionsPer100Utterances?: number;
  readonly realTimeFactor?: number;
}

export interface SpeakerEmbeddingProfileBindingV1 {
  readonly fileKey: string;
  readonly dimension: number;
  readonly format: SpeakerEmbeddingVectorFormat;
  readonly l2Normalized: true;
}

export interface ResidualAdapterProfileGraphBindingV1 {
  readonly graphFileKey: string;
  readonly graphContractSha256: string;
  readonly parameterCount: number;
  readonly maxParameters: number;
  readonly precision: ProfileAdapterPrecision;
  readonly insertionPointIds: readonly string[];
  readonly application: ProfileAdapterApplicationMode;
  readonly activationSwap: ProfileActivationSwapPolicy;
}

export interface ResidualAdapterTrainingProvenanceV1 {
  readonly runtime: ProfileTrainingRuntime;
  readonly trainerVersion: string;
  readonly configSha256: string;
  readonly profilePackageSha256: string;
  readonly baseModelSha256: string;
  readonly randomSeed: number;
}

export interface MergedModelProfileBindingV1 {
  readonly graphContractSha256: string;
  readonly modelFileKeys: readonly string[];
}

export interface SpeakerEmbeddingAdaptationV1 {
  readonly type: 'speaker-embedding';
  readonly contractVersion: 1;
  readonly files: Record<string, ProfileFileRef>;
  readonly embedding: SpeakerEmbeddingProfileBindingV1;
}

export interface ResidualAdapterAdaptationV1 {
  readonly type: 'residual-adapter';
  readonly contractVersion: 1;
  readonly files: Record<string, ProfileFileRef>;
  readonly adapter: ResidualAdapterProfileGraphBindingV1;
  readonly training?: ResidualAdapterTrainingProvenanceV1;
}

export interface MergedModelAdaptationV1 {
  readonly type: 'merged-model';
  readonly contractVersion: 1;
  readonly files: Record<string, ProfileFileRef>;
  readonly mergedModel: MergedModelProfileBindingV1;
}

export type SpeechProfileAdaptationV1 =
  | SpeakerEmbeddingAdaptationV1
  | ResidualAdapterAdaptationV1
  | MergedModelAdaptationV1;

export interface SpeechProfileManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly baseModel: ModelIdentity;
  readonly languages: readonly ProfileLanguage[];
  readonly enrollment: {
    readonly acceptedUtterances: number;
    readonly acceptedSeconds: number;
    readonly languageCounts: Record<string, number>;
    readonly voiceConditionCounts: Record<string, number>;
    readonly sentenceBankVersion: string;
  };
  readonly vocabularyRevision?: number;
  readonly adaptation: SpeechProfileAdaptationV1;
  readonly evaluation: {
    readonly baseMetrics: EvaluationMetrics;
    readonly adaptedMetrics: EvaluationMetrics;
    readonly activationGatePassed: boolean;
    readonly warnings: readonly string[];
  };
  readonly privacy: {
    readonly containsRawAudio: boolean;
    readonly exportEncrypted: boolean;
  };
}

/** Adaptation source runtime for browser-trained artifacts. */
export type ProfileAdapterSource = 'python' | 'docker' | 'browser';

/**
 * Browser-trained top residual adapter adaptation (V2-only union member).
 *
 * The weights are voice-derived sensitive data; the manifest references them by
 * checksum and never embeds raw audio, transcripts, frozen features, or checkpoints.
 */
export interface BrowserTopAdapterAdaptationV1 {
  readonly type: 'browser-top-adapter';
  readonly contractVersion: 1;
  readonly algorithmId: 'browser-top-adapter-frame-ce-v1';
  readonly source: 'browser';
  readonly weights: ProfileFileRef;
  readonly speakerEmbedding?: ProfileFileRef;
  readonly vocabularyRevision?: number;
  readonly trainingJobId: string;
  readonly evaluationId: string;
}

/** CLI-trained residual adapter adaptation (V1-compatible member of the V2 union). */
export type CliResidualAdapterAdaptationV1 = ResidualAdapterAdaptationV1;
/** Legacy merged-model adaptation (V1-compatible member of the V2 union). */
export type LegacyMergedModelAdaptationV1 = MergedModelAdaptationV1;

/**
 * V2 adaptation union. V1 adaptations remain valid V2 members; the
 * `browser-top-adapter` member is the only addition. Existing CLI residual
 * adapters are never rewritten or converted during migration.
 */
export type SpeechProfileAdaptationV2 =
  | SpeakerEmbeddingAdaptationV1
  | CliResidualAdapterAdaptationV1
  | BrowserTopAdapterAdaptationV1
  | LegacyMergedModelAdaptationV1;

/**
 * Speech profile manifest V2. Adds the browser-trained adapter adaptation while
 * preserving every V1 field. V1 manifests remain loadable; upgrade is atomic and
 * copy-on-write at the storage layer (profile.v2.json) so a failed migration
 * leaves the original V1 archive intact.
 */
export interface SpeechProfileManifestV2 extends Omit<
  SpeechProfileManifestV1,
  'schemaVersion' | 'adaptation'
> {
  readonly schemaVersion: 2;
  readonly adaptation: SpeechProfileAdaptationV2;
}

/** Discriminated union of supported profile manifest schema versions. */
export type SpeechProfileManifest = SpeechProfileManifestV1 | SpeechProfileManifestV2;

export interface ProfileManifestValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const profileIdPattern = /^[a-z0-9][a-z0-9._-]*$/;
const languageValues = new Set<ProfileLanguage>(['vi', 'en']);
const adapterPrecisionValues = new Set<ProfileAdapterPrecision>(['float32', 'float16', 'int8']);
const adapterApplicationValues = new Set<ProfileAdapterApplicationMode>([
  'residual-add',
  'lhuc-scale',
  'film-affine',
]);
const trainingRuntimeValues = new Set<ProfileTrainingRuntime>([
  'python-profile-trainer',
  'docker-profile-trainer',
]);

export function validateSpeechProfileManifestV1(value: unknown): ProfileManifestValidationResult {
  return validateSpeechProfileManifestCore(value, 1, false);
}

export function validateSpeechProfileManifestV2(value: unknown): ProfileManifestValidationResult {
  return validateSpeechProfileManifestCore(value, 2, true);
}

/** Dispatch validator across supported profile manifest schema versions. */
export function validateSpeechProfileManifest(value: unknown): ProfileManifestValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['profile manifest must be an object'] };
  }
  const version = value['schemaVersion'];
  if (version === 1) return validateSpeechProfileManifestV1(value);
  if (version === 2) return validateSpeechProfileManifestV2(value);
  return { ok: false, errors: ['schemaVersion must be 1 or 2'] };
}

function validateSpeechProfileManifestCore(
  value: unknown,
  expectedVersion: 1 | 2,
  allowBrowserAdapter: boolean,
): ProfileManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['profile manifest must be an object'] };
  }

  if (value['schemaVersion'] !== expectedVersion) {
    errors.push(`schemaVersion must be ${expectedVersion.toString()}`);
  }
  validatePatternString(value['id'], 'id', profileIdPattern, errors);
  validateNonEmptyString(value['displayName'], 'displayName', errors);
  validateNonEmptyString(value['createdAt'], 'createdAt', errors);
  validateNonEmptyString(value['updatedAt'], 'updatedAt', errors);
  validateModelIdentity(value['baseModel'], 'baseModel', errors);
  validateEnumArray(value['languages'], 'languages', languageValues, errors);
  validateEnrollmentSummary(value['enrollment'], errors);
  if (value['vocabularyRevision'] !== undefined) {
    validateNonNegativeInteger(value['vocabularyRevision'], 'vocabularyRevision', errors);
  }
  validateAdaptation(value['adaptation'], errors, allowBrowserAdapter);
  validateEvaluation(value['evaluation'], errors);
  validatePrivacy(value['privacy'], errors);

  return { ok: errors.length === 0, errors };
}

export function parseSpeechProfileManifestV1(value: unknown): SpeechProfileManifestV1 {
  const result = validateSpeechProfileManifestV1(value);
  if (!result.ok) {
    throw new Error(`Speech profile manifest v1 is invalid: ${result.errors.join('; ')}`);
  }
  return value as SpeechProfileManifestV1;
}

export function parseSpeechProfileManifestV2(value: unknown): SpeechProfileManifestV2 {
  const result = validateSpeechProfileManifestV2(value);
  if (!result.ok) {
    throw new Error(`Speech profile manifest v2 is invalid: ${result.errors.join('; ')}`);
  }
  return value as SpeechProfileManifestV2;
}

export function parseSpeechProfileManifest(value: unknown): SpeechProfileManifest {
  if (!isRecord(value)) {
    throw new Error('Speech profile manifest must be an object');
  }
  const version = value['schemaVersion'];
  if (version === 1) return parseSpeechProfileManifestV1(value);
  if (version === 2) return parseSpeechProfileManifestV2(value);
  throw new Error(
    `Speech profile manifest schemaVersion must be 1 or 2; received ${String(version)}`,
  );
}

/**
 * Copy-on-write V1 -> V2 migration. Produces a new V2 manifest without mutating
 * the input. V1 adaptation members (including CLI residual adapters) remain
 * valid V2 members and are never rewritten or retrained. The manifest is metadata
 * only; it never carries raw audio, transcripts, frozen features, or checkpoints.
 */
export function migrateSpeechProfileManifestV1ToV2(
  manifest: SpeechProfileManifestV1,
): SpeechProfileManifestV2 {
  const result = validateSpeechProfileManifestV1(manifest);
  if (!result.ok) {
    throw new Error(`Cannot migrate an invalid V1 profile manifest: ${result.errors.join('; ')}`);
  }
  const { schemaVersion: _omittedSchemaVersion, ...rest } = manifest;
  void _omittedSchemaVersion;
  return { ...rest, schemaVersion: 2 };
}

function validateAdaptation(value: unknown, errors: string[], allowBrowserAdapter: boolean): void {
  if (!isRecord(value)) {
    errors.push('adaptation must be an object');
    return;
  }
  const type = value['type'];
  const knownV1Type =
    type === 'speaker-embedding' || type === 'residual-adapter' || type === 'merged-model';
  const isBrowserTopAdapter = type === 'browser-top-adapter';
  if (!knownV1Type && !(allowBrowserAdapter && isBrowserTopAdapter)) {
    errors.push('adaptation.type is not supported');
    return;
  }
  if (value['contractVersion'] !== 1) errors.push('adaptation.contractVersion must be 1');

  if (isBrowserTopAdapter) {
    validateBrowserTopAdapterBinding(value, errors);
    return;
  }

  const fileKeys = validateProfileFiles(value['files'], 'adaptation.files', errors);

  if (type === 'speaker-embedding') {
    validateSpeakerEmbeddingBinding(value['embedding'], fileKeys, errors);
  } else if (type === 'residual-adapter') {
    validateResidualAdapterBinding(value['adapter'], fileKeys, errors);
    validateTrainingProvenance(value['training'], errors);
  } else {
    validateMergedModelBinding(value['mergedModel'], fileKeys, errors);
  }
}

function validateBrowserTopAdapterBinding(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('adaptation must be an object');
    return;
  }
  if (value['algorithmId'] !== 'browser-top-adapter-frame-ce-v1') {
    errors.push('adaptation.algorithmId must be browser-top-adapter-frame-ce-v1');
  }
  if (value['source'] !== 'browser') {
    errors.push('adaptation.source must be browser');
  }
  validateProfileFileRef(value['weights'], 'adaptation.weights', errors);
  if (value['speakerEmbedding'] !== undefined) {
    validateProfileFileRef(value['speakerEmbedding'], 'adaptation.speakerEmbedding', errors);
  }
  if (value['vocabularyRevision'] !== undefined) {
    validateNonNegativeInteger(
      value['vocabularyRevision'],
      'adaptation.vocabularyRevision',
      errors,
    );
  }
  validateNonEmptyString(value['trainingJobId'], 'adaptation.trainingJobId', errors);
  validateNonEmptyString(value['evaluationId'], 'adaptation.evaluationId', errors);
}

function validateSpeakerEmbeddingBinding(
  value: unknown,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('adaptation.embedding must be an object');
    return;
  }
  const fileKey = validateNonEmptyString(value['fileKey'], 'adaptation.embedding.fileKey', errors);
  if (fileKey !== undefined && !fileKeys.has(fileKey)) {
    errors.push('adaptation.embedding.fileKey must reference adaptation.files');
  }
  validatePositiveInteger(value['dimension'], 'adaptation.embedding.dimension', errors);
  if (value['format'] !== 'float32-vector') {
    errors.push('adaptation.embedding.format must be float32-vector');
  }
  if (value['l2Normalized'] !== true) {
    errors.push('adaptation.embedding.l2Normalized must be true');
  }
}

function validateResidualAdapterBinding(
  value: unknown,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('adaptation.adapter must be an object');
    return;
  }
  const graphFileKey = validateNonEmptyString(
    value['graphFileKey'],
    'adaptation.adapter.graphFileKey',
    errors,
  );
  if (graphFileKey !== undefined && !fileKeys.has(graphFileKey)) {
    errors.push('adaptation.adapter.graphFileKey must reference adaptation.files');
  }
  validatePatternString(
    value['graphContractSha256'],
    'adaptation.adapter.graphContractSha256',
    sha256Pattern,
    errors,
  );
  const parameterCount = validatePositiveInteger(
    value['parameterCount'],
    'adaptation.adapter.parameterCount',
    errors,
  );
  const maxParameters = validatePositiveInteger(
    value['maxParameters'],
    'adaptation.adapter.maxParameters',
    errors,
  );
  if (
    parameterCount !== undefined &&
    maxParameters !== undefined &&
    parameterCount > maxParameters
  ) {
    errors.push('adaptation.adapter.parameterCount must not exceed maxParameters');
  }
  validateEnumValue(
    value['precision'],
    'adaptation.adapter.precision',
    adapterPrecisionValues,
    errors,
  );
  validateStringArray(value['insertionPointIds'], 'adaptation.adapter.insertionPointIds', errors);
  validateEnumValue(
    value['application'],
    'adaptation.adapter.application',
    adapterApplicationValues,
    errors,
  );
  if (value['activationSwap'] !== 'utterance-boundary') {
    errors.push('adaptation.adapter.activationSwap must be utterance-boundary');
  }
}

function validateMergedModelBinding(
  value: unknown,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('adaptation.mergedModel must be an object');
    return;
  }
  validatePatternString(
    value['graphContractSha256'],
    'adaptation.mergedModel.graphContractSha256',
    sha256Pattern,
    errors,
  );
  const modelFileKeys = validateStringArray(
    value['modelFileKeys'],
    'adaptation.mergedModel.modelFileKeys',
    errors,
  );
  for (const modelFileKey of modelFileKeys) {
    if (!fileKeys.has(modelFileKey)) {
      errors.push(
        `adaptation.mergedModel.modelFileKeys.${modelFileKey} must reference adaptation.files`,
      );
    }
  }
}

function validateTrainingProvenance(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('adaptation.training must be an object');
    return;
  }
  validateEnumValue(value['runtime'], 'adaptation.training.runtime', trainingRuntimeValues, errors);
  validateNonEmptyString(value['trainerVersion'], 'adaptation.training.trainerVersion', errors);
  validatePatternString(
    value['configSha256'],
    'adaptation.training.configSha256',
    sha256Pattern,
    errors,
  );
  validatePatternString(
    value['profilePackageSha256'],
    'adaptation.training.profilePackageSha256',
    sha256Pattern,
    errors,
  );
  validatePatternString(
    value['baseModelSha256'],
    'adaptation.training.baseModelSha256',
    sha256Pattern,
    errors,
  );
  validateNonNegativeInteger(value['randomSeed'], 'adaptation.training.randomSeed', errors);
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

function validateProfileFiles(value: unknown, path: string, errors: string[]): ReadonlySet<string> {
  const keys = new Set<string>();
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return keys;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) errors.push(`${path} must include at least one file`);
  for (const [key, ref] of entries) {
    if (key.length === 0) errors.push(`${path} keys must be non-empty`);
    keys.add(key);
    const refPath = `${path}.${key}`;
    if (!isRecord(ref)) {
      errors.push(`${refPath} must be an object`);
      continue;
    }
    validateNonEmptyString(ref['path'], `${refPath}.path`, errors);
    validatePatternString(ref['sha256'], `${refPath}.sha256`, sha256Pattern, errors);
    validatePositiveInteger(ref['sizeBytes'], `${refPath}.sizeBytes`, errors);
    validateNonEmptyString(ref['mediaType'], `${refPath}.mediaType`, errors);
  }
  return keys;
}

function validateEvaluation(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('evaluation must be an object');
    return;
  }
  validateEvaluationMetrics(value['baseMetrics'], 'evaluation.baseMetrics', errors);
  validateEvaluationMetrics(value['adaptedMetrics'], 'evaluation.adaptedMetrics', errors);
  if (typeof value['activationGatePassed'] !== 'boolean') {
    errors.push('evaluation.activationGatePassed must be boolean');
  }
  validateStringArrayAllowEmpty(value['warnings'], 'evaluation.warnings', errors);
}

function validateEvaluationMetrics(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of [
    'wer',
    'cer',
    'customTermRecall',
    'falseInsertionsPer100Utterances',
    'realTimeFactor',
  ] as const) {
    const metric = value[key];
    if (metric !== undefined) validateNonNegativeNumber(metric, `${path}.${key}`, errors);
  }
}

function validateModelIdentity(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateNonEmptyString(value['id'], `${path}.id`, errors);
  validateNonEmptyString(value['version'], `${path}.version`, errors);
  validatePatternString(value['manifestSha256'], `${path}.manifestSha256`, sha256Pattern, errors);
  validatePatternString(
    value['graphContractSha256'],
    `${path}.graphContractSha256`,
    sha256Pattern,
    errors,
  );
}

function validateEnrollmentSummary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('enrollment must be an object');
    return;
  }
  validateNonNegativeInteger(value['acceptedUtterances'], 'enrollment.acceptedUtterances', errors);
  validateNonNegativeNumber(value['acceptedSeconds'], 'enrollment.acceptedSeconds', errors);
  validateCountRecord(value['languageCounts'], 'enrollment.languageCounts', errors);
  validateCountRecord(value['voiceConditionCounts'], 'enrollment.voiceConditionCounts', errors);
  validateNonEmptyString(value['sentenceBankVersion'], 'enrollment.sentenceBankVersion', errors);
}

function validatePrivacy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('privacy must be an object');
    return;
  }
  if (typeof value['containsRawAudio'] !== 'boolean') {
    errors.push('privacy.containsRawAudio must be boolean');
  }
  if (typeof value['exportEncrypted'] !== 'boolean') {
    errors.push('privacy.exportEncrypted must be boolean');
  }
}

function validateCountRecord(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const [key, count] of Object.entries(value)) {
    if (key.length === 0) errors.push(`${path} keys must be non-empty`);
    validateNonNegativeInteger(count, `${path}.${key}`, errors);
  }
}

function validateEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): readonly T[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return [];
  }
  const seen = new Set<T>();
  const output: T[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== 'string' || !allowed.has(entry as T)) {
      errors.push(`${entryPath} is not supported`);
      return;
    }
    const typedEntry = entry as T;
    if (seen.has(typedEntry)) errors.push(`${entryPath} must be unique`);
    seen.add(typedEntry);
    output.push(typedEntry);
  });
  return output;
}

function validateEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    errors.push(`${path} is not supported`);
    return undefined;
  }
  return value as T;
}

function validateStringArray(value: unknown, path: string, errors: string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return [];
  }
  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== 'string' || entry.length === 0) {
      errors.push(`${entryPath} must be a non-empty string`);
      return;
    }
    if (seen.has(entry)) errors.push(`${entryPath} must be unique`);
    seen.add(entry);
    output.push(entry);
  });
  return output;
}

function validateStringArrayAllowEmpty(
  value: unknown,
  path: string,
  errors: string[],
): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const output: string[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== 'string') {
      errors.push(`${entryPath} must be a string`);
      return;
    }
    output.push(entry);
  });
  return output;
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

function validatePatternString(
  value: unknown,
  path: string,
  pattern: RegExp,
  errors: string[],
): string | undefined {
  const text = validateNonEmptyString(value, path, errors);
  if (text !== undefined && !pattern.test(text)) {
    errors.push(`${path} has invalid format`);
  }
  return text;
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${path} must be a positive integer`);
    return undefined;
  }
  return value as number;
}

function validateNonNegativeInteger(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (!Number.isInteger(value) || (value as number) < 0) {
    errors.push(`${path} must be a non-negative integer`);
    return undefined;
  }
  return value as number;
}

function validateNonNegativeNumber(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative finite number`);
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
