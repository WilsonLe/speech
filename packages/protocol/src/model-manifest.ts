export type SpeechLanguage = 'vi' | 'en';
export type SpeechLanguageMode = SpeechLanguage | 'auto' | 'mixed';
export type VocabularyEntryLanguage = SpeechLanguageMode;
export type ContextBiasingBoundaryMode = 'none' | 'token' | 'unicode-word';
export type ContextBiasingRevisionSwapPolicy = 'utterance-boundary';
export type TensorDataType = 'float32' | 'float16' | 'int32' | 'int64' | 'uint8' | 'int8' | 'bool';
export type ResidualAdapterGraphRole = 'encoder' | 'predictor' | 'joiner';
export type ResidualAdapterPrecision = 'float32' | 'float16' | 'int8';
export type ResidualAdapterApplicationMode = 'residual-add' | 'lhuc-scale' | 'film-affine';
export type ResidualAdapterActivationSwapPolicy = 'utterance-boundary';

export interface ResidualAdapterInsertionPointContract {
  readonly id: string;
  readonly targetGraph: ResidualAdapterGraphRole;
  readonly inputTensor: string;
  readonly outputTensor: string;
  readonly application: ResidualAdapterApplicationMode;
}

export interface TensorContract {
  readonly name: string;
  readonly dataType: TensorDataType;
  readonly shape: readonly (number | string)[];
  readonly description: string;
}

export interface GraphStateRelationship {
  readonly input: string;
  readonly output: string;
  readonly resetAtUtteranceBoundary: boolean;
}

export interface GraphContract {
  readonly fileKey: string;
  readonly inputs: readonly TensorContract[];
  readonly outputs: readonly TensorContract[];
  readonly stateRelationships?: readonly GraphStateRelationship[];
}

export interface SpeechModelManifestV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly languages: readonly SpeechLanguage[];
  readonly supportedLanguageModes: readonly SpeechLanguageMode[];
  readonly architecture: 'rnnt';
  readonly license: {
    readonly spdx?: string;
    readonly name: string;
    readonly noticeUrl?: string;
    readonly redistributionAllowed: boolean;
  };
  readonly sampleRateHz: 16000;
  readonly feature: {
    readonly type: 'log-mel';
    readonly bins: number;
    readonly frameLengthMs: number;
    readonly frameShiftMs: number;
    readonly fftSize: number;
    readonly lowFreqHz: number;
    readonly highFreqHz: number;
    readonly dither: number;
    readonly snipEdges: boolean;
  };
  readonly tokenizer: {
    readonly type: 'sentencepiece' | 'tokens';
    readonly vocabularySize: number;
    readonly byteFallback: boolean;
    readonly blankId: number;
    readonly unkId?: number;
    readonly bosId?: number;
    readonly eosId?: number;
    readonly languageTokenIds?: Partial<Record<SpeechLanguageMode, number>>;
    readonly wordBoundaryMarker?: string;
  };
  readonly streaming: {
    readonly chunkFrames: number;
    readonly chunkShiftFrames: number;
    readonly rightContextFrames: number;
    readonly maxSymbolsPerFrame: number;
  };
  readonly contextBiasing: {
    readonly supported: boolean;
    readonly algorithm: 'token-trie' | 'aho-corasick';
    readonly supportedEntryLanguages: readonly VocabularyEntryLanguage[];
    readonly maxActiveEntries: number;
    readonly maxPhraseTokens: number;
    readonly maxAliasesPerEntry: number;
    readonly maxAliasTokens: number;
    readonly defaultWeight: number;
    readonly maxCumulativeBonus: number;
    readonly weightRange: {
      readonly min: number;
      readonly max: number;
    };
    readonly presets: {
      readonly light: number;
      readonly normal: number;
      readonly strong: number;
    };
    readonly scoring: {
      readonly prefixBonus: number;
      readonly completionBonus: number;
      readonly mismatchPenalty: number;
    };
    readonly wordBoundary: {
      readonly mode: ContextBiasingBoundaryMode;
      readonly marker?: string;
      readonly requireForSingleToken: boolean;
    };
    readonly revisionSwap: ContextBiasingRevisionSwapPolicy;
    readonly diagnostics: {
      readonly emitMatchedVocabularyIds: boolean;
      readonly emitScoreBreakdown: boolean;
    };
  };
  readonly personalization?: {
    readonly speakerEmbedding?: {
      readonly supported: boolean;
      readonly dimension: number;
      readonly inputName: string;
      readonly encoderFileKey: string;
    };
    readonly residualAdapter?: {
      readonly supported: boolean;
      readonly contractVersion: number;
      readonly insertionPoints: readonly ResidualAdapterInsertionPointContract[];
      readonly maxParameters: number;
      readonly maxAdapterSizeBytes: number;
      readonly allowedPrecisions: readonly ResidualAdapterPrecision[];
      readonly activationSwap: ResidualAdapterActivationSwapPolicy;
    };
  };
  readonly files: Record<
    string,
    {
      readonly url: string;
      readonly sha256: string;
      readonly sizeBytes: number;
      readonly mediaType: string;
    }
  >;
  readonly graphs: {
    readonly encoder: GraphContract;
    readonly predictor: GraphContract;
    readonly joiner: GraphContract;
    readonly speakerEncoder?: GraphContract;
    readonly adapter?: GraphContract;
    readonly finalizer?: GraphContract;
  };
  readonly recommended: {
    readonly webgpu: boolean;
    readonly wasmThreads: number;
    readonly expectedMemoryMb: number;
  };
}

export type BrowserTrainingBackendKind =
  | 'repository-fixed-adapter-math'
  | 'onnxruntime-web-training';
export type BrowserTrainingBackendProofStatus =
  | 'fixed-adapter-math-required'
  | 'ort-training-worker-proof-passed';
export type BrowserTrainingAlgorithmId = 'browser-top-adapter-frame-ce-v1';
export type BrowserTrainingAdapterArchitecture = 'residual-bottleneck-lhuc-v1';
export type BrowserTrainingFeatureDtype = 'float16';
export type BrowserTrainingArtifactRole =
  | 'training-model'
  | 'eval-model'
  | 'optimizer-model'
  | 'nominal-checkpoint'
  | 'runtime-adapter'
  | 'contract-test-vectors'
  | 'anchor-pack';

export interface ExactBaseModelIdentityV1 {
  readonly id: string;
  readonly version: string;
  readonly manifestSha256: string;
  readonly graphContractSha256: string;
  readonly tokenizerSha256: string;
}

export interface BrowserTrainingArtifactRefV1 {
  readonly fileKey: string;
  readonly role: BrowserTrainingArtifactRole;
  readonly license: {
    readonly spdx?: string;
    readonly name: string;
    readonly noticeUrl?: string;
    readonly redistributionAllowed: boolean;
  };
  readonly provenance: {
    readonly source: string;
    readonly generatedBy: string;
    readonly createdAt?: string;
  };
}

export interface BrowserTrainingContractV1 {
  readonly supported: true;
  readonly contractVersion: 1;
  readonly backend: {
    readonly interface: 'BrowserTrainingBackend';
    readonly kind: BrowserTrainingBackendKind;
    readonly proofStatus: BrowserTrainingBackendProofStatus;
    readonly runtimePackage?: string;
  };
  readonly algorithmId: BrowserTrainingAlgorithmId;
  readonly minimumAppVersion: '0.5.0';
  readonly exactBaseModel: ExactBaseModelIdentityV1;
  readonly featureTap: {
    readonly graphId: string;
    readonly outputName: string;
    readonly dimension: number;
    readonly frameShiftMs: number;
    readonly persistedDtype: BrowserTrainingFeatureDtype;
  };
  readonly adapter: {
    readonly architecture: BrowserTrainingAdapterArchitecture;
    readonly inputDimension: number;
    readonly rank: number;
    readonly residualScale: number;
    readonly parameterTensors: readonly TensorContract[];
    readonly runtimeGraph: BrowserTrainingArtifactRefV1;
    readonly preferredMaxBytes: number;
    readonly hardMaxBytes: number;
  };
  readonly artifacts: {
    readonly trainingModel: BrowserTrainingArtifactRefV1;
    readonly evalModel: BrowserTrainingArtifactRefV1;
    readonly optimizerModel: BrowserTrainingArtifactRefV1;
    readonly nominalCheckpoint: readonly BrowserTrainingArtifactRefV1[];
    readonly contractTestVectors: BrowserTrainingArtifactRefV1;
    readonly anchorPack: readonly BrowserTrainingArtifactRefV1[];
  };
  readonly limits: {
    readonly maxUtterances: number;
    readonly maxAcceptedSeconds: number;
    readonly maxFramesPerBatch: number;
    readonly maxEpochs: number;
    readonly maxOptimizerSteps: number;
    readonly checkpointIntervalSteps: number;
  };
}

export interface SpeechModelManifestV3 extends Omit<SpeechModelManifestV2, 'schemaVersion'> {
  readonly schemaVersion: 3;
  readonly browserTraining: BrowserTrainingContractV1;
}

export type SpeechModelManifest = SpeechModelManifestV2 | SpeechModelManifestV3;

export interface ManifestValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const languageValues = new Set<SpeechLanguage>(['vi', 'en']);
const languageModeValues = new Set<SpeechLanguageMode>(['vi', 'en', 'auto', 'mixed']);
const tensorDataTypeValues = new Set<TensorDataType>([
  'float32',
  'float16',
  'int32',
  'int64',
  'uint8',
  'int8',
  'bool',
]);
const tokenizerTypeValues = new Set(['sentencepiece', 'tokens']);
const contextBiasingAlgorithmValues = new Set(['token-trie', 'aho-corasick']);
const contextBiasingBoundaryModeValues = new Set<ContextBiasingBoundaryMode>([
  'none',
  'token',
  'unicode-word',
]);
const contextBiasingRevisionSwapValues = new Set<ContextBiasingRevisionSwapPolicy>([
  'utterance-boundary',
]);
const residualAdapterGraphRoleValues = new Set<ResidualAdapterGraphRole>([
  'encoder',
  'predictor',
  'joiner',
]);
const residualAdapterPrecisionValues = new Set<ResidualAdapterPrecision>([
  'float32',
  'float16',
  'int8',
]);
const residualAdapterApplicationValues = new Set<ResidualAdapterApplicationMode>([
  'residual-add',
  'lhuc-scale',
  'film-affine',
]);
const browserTrainingBackendKindValues = new Set<BrowserTrainingBackendKind>([
  'repository-fixed-adapter-math',
  'onnxruntime-web-training',
]);
const browserTrainingProofStatusValues = new Set<BrowserTrainingBackendProofStatus>([
  'fixed-adapter-math-required',
  'ort-training-worker-proof-passed',
]);
const browserTrainingArtifactRoleValues = new Set<BrowserTrainingArtifactRole>([
  'training-model',
  'eval-model',
  'optimizer-model',
  'nominal-checkpoint',
  'runtime-adapter',
  'contract-test-vectors',
  'anchor-pack',
]);
const browserTrainingParameterTensorNames = new Set(['w_down', 'b_down', 'w_up', 'b_up', 'lhuc']);
const sha256Pattern = /^[a-f0-9]{64}$/;
const modelIdPattern = /^[a-z0-9][a-z0-9._-]*$/;

export function validateSpeechModelManifestV2(value: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }

  validateSpeechModelManifestBase(value, 2, errors);
  return { ok: errors.length === 0, errors };
}

export function validateSpeechModelManifestV3(value: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }

  const base = validateSpeechModelManifestBase(value, 3, errors);
  validateBrowserTrainingContract(value['browserTraining'], value, base.fileKeys, errors);
  return { ok: errors.length === 0, errors };
}

export function validateSpeechModelManifest(value: unknown): ManifestValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  if (value['schemaVersion'] === 2) return validateSpeechModelManifestV2(value);
  if (value['schemaVersion'] === 3) return validateSpeechModelManifestV3(value);
  return { ok: false, errors: ['schemaVersion must be 2 or 3'] };
}

export function parseSpeechModelManifestV2(value: unknown): SpeechModelManifestV2 {
  const result = validateSpeechModelManifestV2(value);
  if (!result.ok) {
    throw new Error(`Invalid SpeechModelManifestV2: ${result.errors.join('; ')}`);
  }
  return value as SpeechModelManifestV2;
}

export function parseSpeechModelManifestV3(value: unknown): SpeechModelManifestV3 {
  const result = validateSpeechModelManifestV3(value);
  if (!result.ok) {
    throw new Error(`Invalid SpeechModelManifestV3: ${result.errors.join('; ')}`);
  }
  return value as SpeechModelManifestV3;
}

export function parseSpeechModelManifest(value: unknown): SpeechModelManifest {
  const result = validateSpeechModelManifest(value);
  if (!result.ok) {
    throw new Error(`Invalid SpeechModelManifest: ${result.errors.join('; ')}`);
  }
  return value as SpeechModelManifest;
}

function validateSpeechModelManifestBase(
  value: Record<string, unknown>,
  schemaVersion: 2 | 3,
  errors: string[],
): { readonly fileKeys: ReadonlySet<string> } {
  if (value['schemaVersion'] !== schemaVersion) {
    errors.push(`schemaVersion must be ${schemaVersion}`);
  }
  validatePatternString(value['id'], 'id', modelIdPattern, errors);
  validateNonEmptyString(value['version'], 'version', errors);
  validateNonEmptyString(value['displayName'], 'displayName', errors);
  if (value['architecture'] !== 'rnnt') errors.push('architecture must be rnnt');
  if (value['sampleRateHz'] !== 16000) errors.push('sampleRateHz must be 16000');

  const languages = validateEnumArray(value['languages'], 'languages', languageValues, errors);
  const supportedLanguageModes = validateEnumArray(
    value['supportedLanguageModes'],
    'supportedLanguageModes',
    languageModeValues,
    errors,
  );
  if (languages !== undefined && supportedLanguageModes !== undefined) {
    validateLanguageModeCoverage(languages, supportedLanguageModes, errors);
  }

  validateLicense(value['license'], errors);
  validateFeature(value['feature'], errors);
  const vocabularySize = validateTokenizer(value['tokenizer'], errors);
  validateStreaming(value['streaming'], errors);
  validateContextBiasing(
    value['contextBiasing'],
    languages,
    supportedLanguageModes,
    value['tokenizer'],
    errors,
  );
  const fileKeys = validateFiles(value['files'], errors);
  validateGraphs(value['graphs'], fileKeys, errors);
  validatePersonalization(value['personalization'], fileKeys, value['graphs'], errors);
  validateRecommended(value['recommended'], errors);

  if (vocabularySize !== undefined) {
    validateTokenizerIds(value['tokenizer'], vocabularySize, supportedLanguageModes, errors);
  }

  return { fileKeys };
}

function validateLicense(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('license must be an object');
    return;
  }
  validateNonEmptyString(value['name'], 'license.name', errors);
  validateOptionalNonEmptyString(value['spdx'], 'license.spdx', errors);
  validateOptionalNonEmptyString(value['noticeUrl'], 'license.noticeUrl', errors);
  if (typeof value['redistributionAllowed'] !== 'boolean') {
    errors.push('license.redistributionAllowed must be boolean');
  }
}

function validateFeature(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('feature must be an object');
    return;
  }
  if (value['type'] !== 'log-mel') errors.push('feature.type must be log-mel');
  validatePositiveInteger(value['bins'], 'feature.bins', errors);
  const frameLengthMs = validatePositiveNumber(
    value['frameLengthMs'],
    'feature.frameLengthMs',
    errors,
  );
  validatePositiveNumber(value['frameShiftMs'], 'feature.frameShiftMs', errors);
  const fftSize = validatePositiveInteger(value['fftSize'], 'feature.fftSize', errors);
  const lowFreqHz = validateNonNegativeNumber(value['lowFreqHz'], 'feature.lowFreqHz', errors);
  const highFreqHz = validatePositiveNumber(value['highFreqHz'], 'feature.highFreqHz', errors);
  validateNonNegativeNumber(value['dither'], 'feature.dither', errors);
  if (typeof value['snipEdges'] !== 'boolean') errors.push('feature.snipEdges must be boolean');

  if (fftSize !== undefined && !isPowerOfTwo(fftSize)) {
    errors.push('feature.fftSize must be a power of two');
  }
  if (frameLengthMs !== undefined && fftSize !== undefined) {
    const frameLengthSamples = Math.round((16_000 * frameLengthMs) / 1_000);
    if (fftSize < frameLengthSamples) {
      errors.push('feature.fftSize must be at least the frame length in samples');
    }
  }
  if (lowFreqHz !== undefined && highFreqHz !== undefined) {
    if (highFreqHz <= lowFreqHz || highFreqHz > 8_000) {
      errors.push('feature.highFreqHz must be above lowFreqHz and at or below Nyquist');
    }
  }
}

function validateTokenizer(value: unknown, errors: string[]): number | undefined {
  if (!isRecord(value)) {
    errors.push('tokenizer must be an object');
    return undefined;
  }
  validateEnumValue(value['type'], 'tokenizer.type', tokenizerTypeValues, errors);
  if (typeof value['byteFallback'] !== 'boolean')
    errors.push('tokenizer.byteFallback must be boolean');
  return validatePositiveInteger(value['vocabularySize'], 'tokenizer.vocabularySize', errors);
}

function validateTokenizerIds(
  value: unknown,
  vocabularySize: number,
  supportedLanguageModes: readonly SpeechLanguageMode[] | undefined,
  errors: string[],
): void {
  if (!isRecord(value)) {
    return;
  }
  for (const key of ['blankId', 'unkId', 'bosId', 'eosId'] as const) {
    const idValue = value[key];
    if (key === 'blankId' || idValue !== undefined) {
      validateTokenId(idValue, `tokenizer.${key}`, vocabularySize, errors);
    }
  }

  const languageTokenIds = value['languageTokenIds'];
  if (languageTokenIds !== undefined) {
    if (!isRecord(languageTokenIds)) {
      errors.push('tokenizer.languageTokenIds must be an object');
    } else {
      for (const [mode, tokenId] of Object.entries(languageTokenIds)) {
        if (!languageModeValues.has(mode as SpeechLanguageMode)) {
          errors.push(`tokenizer.languageTokenIds.${mode} is not a supported language mode`);
          continue;
        }
        if (
          supportedLanguageModes !== undefined &&
          !supportedLanguageModes.includes(mode as SpeechLanguageMode)
        ) {
          errors.push(
            `tokenizer.languageTokenIds.${mode} must reference a supported language mode`,
          );
        }
        validateTokenId(tokenId, `tokenizer.languageTokenIds.${mode}`, vocabularySize, errors);
      }
    }
  }

  validateOptionalNonEmptyString(
    value['wordBoundaryMarker'],
    'tokenizer.wordBoundaryMarker',
    errors,
  );
}

function validateStreaming(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('streaming must be an object');
    return;
  }
  const chunkFrames = validatePositiveInteger(
    value['chunkFrames'],
    'streaming.chunkFrames',
    errors,
  );
  const chunkShiftFrames = validatePositiveInteger(
    value['chunkShiftFrames'],
    'streaming.chunkShiftFrames',
    errors,
  );
  validateNonNegativeInteger(value['rightContextFrames'], 'streaming.rightContextFrames', errors);
  validatePositiveInteger(value['maxSymbolsPerFrame'], 'streaming.maxSymbolsPerFrame', errors);
  if (
    chunkFrames !== undefined &&
    chunkShiftFrames !== undefined &&
    chunkShiftFrames > chunkFrames
  ) {
    errors.push('streaming.chunkShiftFrames must be less than or equal to chunkFrames');
  }
}

function validateContextBiasing(
  value: unknown,
  languages: readonly SpeechLanguage[] | undefined,
  supportedLanguageModes: readonly SpeechLanguageMode[] | undefined,
  tokenizer: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('contextBiasing must be an object');
    return;
  }
  const supported = value['supported'];
  if (typeof supported !== 'boolean') errors.push('contextBiasing.supported must be boolean');
  validateEnumValue(
    value['algorithm'],
    'contextBiasing.algorithm',
    contextBiasingAlgorithmValues,
    errors,
  );

  const supportedEntryLanguages = validateEnumArrayAllowEmpty(
    value['supportedEntryLanguages'],
    'contextBiasing.supportedEntryLanguages',
    languageModeValues,
    errors,
  );
  if (supportedEntryLanguages !== undefined && supportedLanguageModes !== undefined) {
    for (const entryLanguage of supportedEntryLanguages) {
      if (!supportedLanguageModes.includes(entryLanguage)) {
        errors.push(
          `contextBiasing.supportedEntryLanguages.${entryLanguage} must reference a supported language mode`,
        );
      }
    }
  }

  const maxActiveEntries = validateNonNegativeInteger(
    value['maxActiveEntries'],
    'contextBiasing.maxActiveEntries',
    errors,
  );
  const maxPhraseTokens = validateNonNegativeInteger(
    value['maxPhraseTokens'],
    'contextBiasing.maxPhraseTokens',
    errors,
  );
  const maxAliasesPerEntry = validateNonNegativeInteger(
    value['maxAliasesPerEntry'],
    'contextBiasing.maxAliasesPerEntry',
    errors,
  );
  const maxAliasTokens = validateNonNegativeInteger(
    value['maxAliasTokens'],
    'contextBiasing.maxAliasTokens',
    errors,
  );
  const defaultWeight = validateNonNegativeNumber(
    value['defaultWeight'],
    'contextBiasing.defaultWeight',
    errors,
  );
  const maxCumulativeBonus = validateNonNegativeNumber(
    value['maxCumulativeBonus'],
    'contextBiasing.maxCumulativeBonus',
    errors,
  );
  const weightRange = validateWeightRange(value['weightRange'], errors);
  const presets = validateContextBiasingPresets(value['presets'], errors);
  const scoring = validateContextBiasingScoring(value['scoring'], errors);
  validateContextBiasingWordBoundary(value['wordBoundary'], tokenizer, errors);
  validateEnumValue(
    value['revisionSwap'],
    'contextBiasing.revisionSwap',
    contextBiasingRevisionSwapValues,
    errors,
  );
  const diagnostics = validateContextBiasingDiagnostics(value['diagnostics'], errors);

  if (maxAliasesPerEntry === 0 && maxAliasTokens !== undefined && maxAliasTokens > 0) {
    errors.push('contextBiasing.maxAliasTokens must be 0 when maxAliasesPerEntry is 0');
  }
  if (maxAliasesPerEntry !== undefined && maxAliasesPerEntry > 0 && maxAliasTokens === 0) {
    errors.push('contextBiasing.maxAliasTokens must be positive when aliases are enabled');
  }
  if (defaultWeight !== undefined && weightRange !== undefined) {
    validateWeightInRange(defaultWeight, 'contextBiasing.defaultWeight', weightRange, errors);
  }
  if (presets !== undefined && weightRange !== undefined) {
    validateWeightInRange(presets.light, 'contextBiasing.presets.light', weightRange, errors);
    validateWeightInRange(presets.normal, 'contextBiasing.presets.normal', weightRange, errors);
    validateWeightInRange(presets.strong, 'contextBiasing.presets.strong', weightRange, errors);
    if (presets.light > presets.normal || presets.normal > presets.strong) {
      errors.push('contextBiasing.presets must be ordered light <= normal <= strong');
    }
  }
  if (scoring !== undefined && maxCumulativeBonus !== undefined) {
    if (scoring.prefixBonus > maxCumulativeBonus) {
      errors.push('contextBiasing.scoring.prefixBonus must not exceed maxCumulativeBonus');
    }
    if (scoring.completionBonus > maxCumulativeBonus) {
      errors.push('contextBiasing.scoring.completionBonus must not exceed maxCumulativeBonus');
    }
  }

  if (supported === true) {
    if (supportedEntryLanguages !== undefined && supportedEntryLanguages.length === 0) {
      errors.push('contextBiasing.supportedEntryLanguages must be non-empty when supported');
    }
    if (maxActiveEntries === 0) errors.push('contextBiasing.maxActiveEntries must be positive');
    if (maxPhraseTokens === 0) errors.push('contextBiasing.maxPhraseTokens must be positive');
    if (defaultWeight === 0) errors.push('contextBiasing.defaultWeight must be positive');
    if (maxCumulativeBonus === 0) errors.push('contextBiasing.maxCumulativeBonus must be positive');
    if (weightRange !== undefined && weightRange.max <= weightRange.min) {
      errors.push('contextBiasing.weightRange.max must be greater than weightRange.min');
    }
    if (scoring !== undefined && scoring.prefixBonus === 0 && scoring.completionBonus === 0) {
      errors.push('contextBiasing.scoring must include a positive prefix or completion bonus');
    }
    if (diagnostics !== undefined && !diagnostics.emitMatchedVocabularyIds) {
      errors.push(
        'contextBiasing.diagnostics.emitMatchedVocabularyIds must be true when supported',
      );
    }
  } else if (supported === false) {
    validateDisabledContextBiasing(
      {
        supportedEntryLanguages,
        maxActiveEntries,
        maxPhraseTokens,
        maxAliasesPerEntry,
        maxAliasTokens,
        defaultWeight,
        maxCumulativeBonus,
        weightRange,
        presets,
        scoring,
        diagnostics,
      },
      errors,
    );
  }

  if (supportedEntryLanguages !== undefined && languages !== undefined) {
    for (const entryLanguage of supportedEntryLanguages) {
      if (
        (entryLanguage === 'auto' || entryLanguage === 'mixed') &&
        !hasBilingualLanguages(languages)
      ) {
        errors.push(
          `contextBiasing.supportedEntryLanguages.${entryLanguage} requires both vi and en languages`,
        );
      }
    }
  }
}

function validateLanguageModeCoverage(
  languages: readonly SpeechLanguage[],
  supportedLanguageModes: readonly SpeechLanguageMode[],
  errors: string[],
): void {
  for (const language of languages) {
    if (!supportedLanguageModes.includes(language)) {
      errors.push(`supportedLanguageModes must include language ${language}`);
    }
  }
  for (const mode of supportedLanguageModes) {
    if ((mode === 'vi' || mode === 'en') && !languages.includes(mode)) {
      errors.push(`supportedLanguageModes.${mode} requires languages to include ${mode}`);
    }
    if ((mode === 'auto' || mode === 'mixed') && !hasBilingualLanguages(languages)) {
      errors.push(`supportedLanguageModes.${mode} requires both vi and en languages`);
    }
  }
}

function hasBilingualLanguages(languages: readonly SpeechLanguage[]): boolean {
  return languages.includes('vi') && languages.includes('en');
}

function validateWeightRange(
  value: unknown,
  errors: string[],
): { readonly min: number; readonly max: number } | undefined {
  if (!isRecord(value)) {
    errors.push('contextBiasing.weightRange must be an object');
    return undefined;
  }
  const min = validateNonNegativeNumber(value['min'], 'contextBiasing.weightRange.min', errors);
  const max = validateNonNegativeNumber(value['max'], 'contextBiasing.weightRange.max', errors);
  if (min === undefined || max === undefined) return undefined;
  if (max < min) errors.push('contextBiasing.weightRange.max must be greater than or equal to min');
  return { min, max };
}

function validateWeightInRange(
  value: number,
  path: string,
  weightRange: { readonly min: number; readonly max: number },
  errors: string[],
): void {
  if (value < weightRange.min || value > weightRange.max) {
    errors.push(`${path} must be within contextBiasing.weightRange`);
  }
}

function validateContextBiasingPresets(
  value: unknown,
  errors: string[],
): { readonly light: number; readonly normal: number; readonly strong: number } | undefined {
  if (!isRecord(value)) {
    errors.push('contextBiasing.presets must be an object');
    return undefined;
  }
  const light = validateNonNegativeNumber(value['light'], 'contextBiasing.presets.light', errors);
  const normal = validateNonNegativeNumber(
    value['normal'],
    'contextBiasing.presets.normal',
    errors,
  );
  const strong = validateNonNegativeNumber(
    value['strong'],
    'contextBiasing.presets.strong',
    errors,
  );
  if (light === undefined || normal === undefined || strong === undefined) return undefined;
  return { light, normal, strong };
}

function validateContextBiasingScoring(
  value: unknown,
  errors: string[],
):
  | {
      readonly prefixBonus: number;
      readonly completionBonus: number;
      readonly mismatchPenalty: number;
    }
  | undefined {
  if (!isRecord(value)) {
    errors.push('contextBiasing.scoring must be an object');
    return undefined;
  }
  const prefixBonus = validateNonNegativeNumber(
    value['prefixBonus'],
    'contextBiasing.scoring.prefixBonus',
    errors,
  );
  const completionBonus = validateNonNegativeNumber(
    value['completionBonus'],
    'contextBiasing.scoring.completionBonus',
    errors,
  );
  const mismatchPenalty = validateNonNegativeNumber(
    value['mismatchPenalty'],
    'contextBiasing.scoring.mismatchPenalty',
    errors,
  );
  if (prefixBonus === undefined || completionBonus === undefined || mismatchPenalty === undefined) {
    return undefined;
  }
  return { prefixBonus, completionBonus, mismatchPenalty };
}

function validateContextBiasingWordBoundary(
  value: unknown,
  tokenizer: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('contextBiasing.wordBoundary must be an object');
    return;
  }
  validateEnumValue(
    value['mode'],
    'contextBiasing.wordBoundary.mode',
    contextBiasingBoundaryModeValues,
    errors,
  );
  const marker = validateOptionalNonEmptyStringReturn(
    value['marker'],
    'contextBiasing.wordBoundary.marker',
    errors,
  );
  if (typeof value['requireForSingleToken'] !== 'boolean') {
    errors.push('contextBiasing.wordBoundary.requireForSingleToken must be boolean');
  }
  if (value['mode'] === 'token') {
    const tokenizerMarker = isRecord(tokenizer) ? tokenizer['wordBoundaryMarker'] : undefined;
    if (marker === undefined && typeof tokenizerMarker !== 'string') {
      errors.push(
        'contextBiasing.wordBoundary.marker must be set when token boundary mode is used without tokenizer.wordBoundaryMarker',
      );
    }
  }
}

function validateContextBiasingDiagnostics(
  value: unknown,
  errors: string[],
):
  | { readonly emitMatchedVocabularyIds: boolean; readonly emitScoreBreakdown: boolean }
  | undefined {
  if (!isRecord(value)) {
    errors.push('contextBiasing.diagnostics must be an object');
    return undefined;
  }
  const emitMatchedVocabularyIds = value['emitMatchedVocabularyIds'];
  const emitScoreBreakdown = value['emitScoreBreakdown'];
  if (typeof emitMatchedVocabularyIds !== 'boolean') {
    errors.push('contextBiasing.diagnostics.emitMatchedVocabularyIds must be boolean');
  }
  if (typeof emitScoreBreakdown !== 'boolean') {
    errors.push('contextBiasing.diagnostics.emitScoreBreakdown must be boolean');
  }
  if (typeof emitMatchedVocabularyIds !== 'boolean' || typeof emitScoreBreakdown !== 'boolean') {
    return undefined;
  }
  return { emitMatchedVocabularyIds, emitScoreBreakdown };
}

function validateDisabledContextBiasing(
  values: {
    readonly supportedEntryLanguages: readonly SpeechLanguageMode[] | undefined;
    readonly maxActiveEntries: number | undefined;
    readonly maxPhraseTokens: number | undefined;
    readonly maxAliasesPerEntry: number | undefined;
    readonly maxAliasTokens: number | undefined;
    readonly defaultWeight: number | undefined;
    readonly maxCumulativeBonus: number | undefined;
    readonly weightRange: { readonly min: number; readonly max: number } | undefined;
    readonly presets:
      | { readonly light: number; readonly normal: number; readonly strong: number }
      | undefined;
    readonly scoring:
      | {
          readonly prefixBonus: number;
          readonly completionBonus: number;
          readonly mismatchPenalty: number;
        }
      | undefined;
    readonly diagnostics:
      | { readonly emitMatchedVocabularyIds: boolean; readonly emitScoreBreakdown: boolean }
      | undefined;
  },
  errors: string[],
): void {
  if (values.supportedEntryLanguages !== undefined && values.supportedEntryLanguages.length > 0) {
    errors.push('contextBiasing.supportedEntryLanguages must be empty when unsupported');
  }
  if (values.maxActiveEntries !== undefined && values.maxActiveEntries !== 0) {
    errors.push('contextBiasing.maxActiveEntries must be 0 when unsupported');
  }
  if (values.maxPhraseTokens !== undefined && values.maxPhraseTokens !== 0) {
    errors.push('contextBiasing.maxPhraseTokens must be 0 when unsupported');
  }
  if (values.maxAliasesPerEntry !== undefined && values.maxAliasesPerEntry !== 0) {
    errors.push('contextBiasing.maxAliasesPerEntry must be 0 when unsupported');
  }
  if (values.maxAliasTokens !== undefined && values.maxAliasTokens !== 0) {
    errors.push('contextBiasing.maxAliasTokens must be 0 when unsupported');
  }
  if (values.defaultWeight !== undefined && values.defaultWeight !== 0) {
    errors.push('contextBiasing.defaultWeight must be 0 when unsupported');
  }
  if (values.maxCumulativeBonus !== undefined && values.maxCumulativeBonus !== 0) {
    errors.push('contextBiasing.maxCumulativeBonus must be 0 when unsupported');
  }
  if (
    values.weightRange !== undefined &&
    (values.weightRange.min !== 0 || values.weightRange.max !== 0)
  ) {
    errors.push('contextBiasing.weightRange must be 0..0 when unsupported');
  }
  if (
    values.presets !== undefined &&
    (values.presets.light !== 0 || values.presets.normal !== 0 || values.presets.strong !== 0)
  ) {
    errors.push('contextBiasing.presets must be 0 when unsupported');
  }
  if (
    values.scoring !== undefined &&
    (values.scoring.prefixBonus !== 0 ||
      values.scoring.completionBonus !== 0 ||
      values.scoring.mismatchPenalty !== 0)
  ) {
    errors.push('contextBiasing.scoring must be 0 when unsupported');
  }
  if (
    values.diagnostics !== undefined &&
    (values.diagnostics.emitMatchedVocabularyIds || values.diagnostics.emitScoreBreakdown)
  ) {
    errors.push('contextBiasing.diagnostics must be false when unsupported');
  }
}

function validateFiles(value: unknown, errors: string[]): ReadonlySet<string> {
  const fileKeys = new Set<string>();
  if (!isRecord(value)) {
    errors.push('files must be an object');
    return fileKeys;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push('files must list at least one model artifact');
  }

  for (const [fileKey, fileValue] of entries) {
    if (fileKey.length === 0) errors.push('files keys must be non-empty');
    fileKeys.add(fileKey);
    const path = `files.${fileKey}`;
    if (!isRecord(fileValue)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    validateNonEmptyString(fileValue['url'], `${path}.url`, errors);
    validatePatternString(fileValue['sha256'], `${path}.sha256`, sha256Pattern, errors);
    validatePositiveInteger(fileValue['sizeBytes'], `${path}.sizeBytes`, errors);
    validateNonEmptyString(fileValue['mediaType'], `${path}.mediaType`, errors);
  }

  return fileKeys;
}

function validateGraphs(value: unknown, fileKeys: ReadonlySet<string>, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('graphs must be an object');
    return;
  }

  for (const graphName of ['encoder', 'predictor', 'joiner'] as const) {
    if (!isRecord(value[graphName])) {
      errors.push(`graphs.${graphName} is required`);
    } else {
      validateGraph(value[graphName], `graphs.${graphName}`, fileKeys, errors);
    }
  }

  for (const graphName of ['speakerEncoder', 'adapter', 'finalizer'] as const) {
    if (value[graphName] !== undefined) {
      validateGraph(value[graphName], `graphs.${graphName}`, fileKeys, errors);
    }
  }
}

function validateGraph(
  value: unknown,
  path: string,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const fileKey = validateNonEmptyString(value['fileKey'], `${path}.fileKey`, errors);
  if (fileKey !== undefined && !fileKeys.has(fileKey)) {
    errors.push(`${path}.fileKey must reference an entry in files`);
  }

  const inputNames = validateTensorArray(value['inputs'], `${path}.inputs`, errors);
  const outputNames = validateTensorArray(value['outputs'], `${path}.outputs`, errors);
  validateStateRelationships(value['stateRelationships'], path, inputNames, outputNames, errors);
}

function validateTensorArray(value: unknown, path: string, errors: string[]): ReadonlySet<string> {
  const names = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return names;
  }

  value.forEach((tensor, index) => {
    const tensorPath = `${path}[${index}]`;
    if (!isRecord(tensor)) {
      errors.push(`${tensorPath} must be an object`);
      return;
    }

    const name = validateNonEmptyString(tensor['name'], `${tensorPath}.name`, errors);
    if (name !== undefined) {
      if (names.has(name)) errors.push(`${tensorPath}.name must be unique within ${path}`);
      names.add(name);
    }
    validateEnumValue(tensor['dataType'], `${tensorPath}.dataType`, tensorDataTypeValues, errors);
    validateNonEmptyString(tensor['description'], `${tensorPath}.description`, errors);

    const shape = tensor['shape'];
    if (!Array.isArray(shape) || shape.length === 0) {
      errors.push(`${tensorPath}.shape must be a non-empty array`);
    } else {
      shape.forEach((dimension, dimensionIndex) => {
        const dimensionPath = `${tensorPath}.shape[${dimensionIndex}]`;
        if (typeof dimension === 'string') {
          if (dimension.length === 0) errors.push(`${dimensionPath} must not be empty`);
        } else if (!Number.isInteger(dimension) || dimension <= 0) {
          errors.push(`${dimensionPath} must be a positive integer or symbolic string`);
        }
      });
    }
  });

  return names;
}

function validateStateRelationships(
  value: unknown,
  graphPath: string,
  inputNames: ReadonlySet<string>,
  outputNames: ReadonlySet<string>,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${graphPath}.stateRelationships must be an array`);
    return;
  }

  value.forEach((relationship, index) => {
    const path = `${graphPath}.stateRelationships[${index}]`;
    if (!isRecord(relationship)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const input = validateNonEmptyString(relationship['input'], `${path}.input`, errors);
    const output = validateNonEmptyString(relationship['output'], `${path}.output`, errors);
    if (typeof relationship['resetAtUtteranceBoundary'] !== 'boolean') {
      errors.push(`${path}.resetAtUtteranceBoundary must be boolean`);
    }
    if (input !== undefined && !inputNames.has(input)) {
      errors.push(`${path}.input must reference a graph input tensor`);
    }
    if (output !== undefined && !outputNames.has(output)) {
      errors.push(`${path}.output must reference a graph output tensor`);
    }
  });
}

function validatePersonalization(
  value: unknown,
  fileKeys: ReadonlySet<string>,
  graphs: unknown,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('personalization must be an object');
    return;
  }

  const speakerEmbedding = value['speakerEmbedding'];
  if (speakerEmbedding !== undefined) {
    if (!isRecord(speakerEmbedding)) {
      errors.push('personalization.speakerEmbedding must be an object');
    } else {
      if (typeof speakerEmbedding['supported'] !== 'boolean') {
        errors.push('personalization.speakerEmbedding.supported must be boolean');
      }
      validatePositiveInteger(
        speakerEmbedding['dimension'],
        'personalization.speakerEmbedding.dimension',
        errors,
      );
      validateNonEmptyString(
        speakerEmbedding['inputName'],
        'personalization.speakerEmbedding.inputName',
        errors,
      );
      const encoderFileKey = validateNonEmptyString(
        speakerEmbedding['encoderFileKey'],
        'personalization.speakerEmbedding.encoderFileKey',
        errors,
      );
      if (encoderFileKey !== undefined && !fileKeys.has(encoderFileKey)) {
        errors.push('personalization.speakerEmbedding.encoderFileKey must reference files');
      }
    }
  }

  const residualAdapter = value['residualAdapter'];
  if (residualAdapter !== undefined) {
    validateResidualAdapterContract(residualAdapter, graphs, errors);
  }
}

function validateResidualAdapterContract(value: unknown, graphs: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('personalization.residualAdapter must be an object');
    return;
  }
  if (typeof value['supported'] !== 'boolean') {
    errors.push('personalization.residualAdapter.supported must be boolean');
  }
  validatePositiveInteger(
    value['contractVersion'],
    'personalization.residualAdapter.contractVersion',
    errors,
  );
  const maxParameters = validateNonNegativeInteger(
    value['maxParameters'],
    'personalization.residualAdapter.maxParameters',
    errors,
  );
  const maxAdapterSizeBytes = validateNonNegativeInteger(
    value['maxAdapterSizeBytes'],
    'personalization.residualAdapter.maxAdapterSizeBytes',
    errors,
  );
  const insertionPoints = validateResidualAdapterInsertionPoints(value['insertionPoints'], errors);
  const allowedPrecisions = validateEnumArray(
    value['allowedPrecisions'],
    'personalization.residualAdapter.allowedPrecisions',
    residualAdapterPrecisionValues,
    errors,
  );
  if (value['activationSwap'] !== 'utterance-boundary') {
    errors.push('personalization.residualAdapter.activationSwap must be utterance-boundary');
  }

  const adapterGraph = isRecord(graphs) ? graphs['adapter'] : undefined;
  if (isRecord(adapterGraph)) {
    validateResidualAdapterGraphBindings(adapterGraph, insertionPoints, errors);
  }

  if (value['supported'] === true) {
    if (!isRecord(adapterGraph)) {
      errors.push('graphs.adapter is required when residual adapters are supported');
    }
    if (insertionPoints.length === 0) {
      errors.push(
        'personalization.residualAdapter.insertionPoints must not be empty when supported',
      );
    }
    if ((allowedPrecisions?.length ?? 0) === 0) {
      errors.push(
        'personalization.residualAdapter.allowedPrecisions must not be empty when supported',
      );
    }
    if (maxParameters !== undefined && maxParameters <= 0) {
      errors.push('personalization.residualAdapter.maxParameters must be positive when supported');
    }
    if (maxAdapterSizeBytes !== undefined && maxAdapterSizeBytes <= 0) {
      errors.push(
        'personalization.residualAdapter.maxAdapterSizeBytes must be positive when supported',
      );
    }
  }
}

interface ValidatedResidualAdapterInsertionPoint {
  readonly index: number;
  readonly id: string;
  readonly inputTensor: string;
  readonly outputTensor: string;
}

function validateResidualAdapterInsertionPoints(
  value: unknown,
  errors: string[],
): readonly ValidatedResidualAdapterInsertionPoint[] {
  if (!Array.isArray(value)) {
    errors.push('personalization.residualAdapter.insertionPoints must be an array');
    return [];
  }
  const seen = new Set<string>();
  const insertionPoints: ValidatedResidualAdapterInsertionPoint[] = [];
  value.forEach((entry, index) => {
    const path = `personalization.residualAdapter.insertionPoints[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const id = validateNonEmptyString(entry['id'], `${path}.id`, errors);
    if (id !== undefined) {
      if (seen.has(id)) errors.push(`${path}.id must be unique`);
      seen.add(id);
    }
    validateEnumValue(
      entry['targetGraph'],
      `${path}.targetGraph`,
      residualAdapterGraphRoleValues,
      errors,
    );
    const inputTensor = validateNonEmptyString(entry['inputTensor'], `${path}.inputTensor`, errors);
    const outputTensor = validateNonEmptyString(
      entry['outputTensor'],
      `${path}.outputTensor`,
      errors,
    );
    validateEnumValue(
      entry['application'],
      `${path}.application`,
      residualAdapterApplicationValues,
      errors,
    );
    if (id !== undefined && inputTensor !== undefined && outputTensor !== undefined) {
      insertionPoints.push({ index, id, inputTensor, outputTensor });
    }
  });
  return insertionPoints;
}

function validateResidualAdapterGraphBindings(
  graph: Record<string, unknown>,
  insertionPoints: readonly ValidatedResidualAdapterInsertionPoint[],
  errors: string[],
): void {
  const graphInputs = tensorNames(graph['inputs']);
  const graphOutputs = tensorNames(graph['outputs']);
  for (const insertionPoint of insertionPoints) {
    const path = `personalization.residualAdapter.insertionPoints[${insertionPoint.index}]`;
    if (!graphInputs.has(insertionPoint.inputTensor)) {
      errors.push(`${path}.inputTensor must reference graphs.adapter.inputs`);
    }
    if (!graphOutputs.has(insertionPoint.outputTensor)) {
      errors.push(`${path}.outputTensor must reference graphs.adapter.outputs`);
    }
  }
}

function tensorNames(value: unknown): ReadonlySet<string> {
  const names = new Set<string>();
  if (!Array.isArray(value)) return names;
  for (const tensor of value) {
    if (!isRecord(tensor)) continue;
    const name = tensor['name'];
    if (typeof name === 'string') names.add(name);
  }
  return names;
}

function validateBrowserTrainingContract(
  value: unknown,
  manifest: Record<string, unknown>,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('browserTraining must be an object');
    return;
  }

  if (value['supported'] !== true) errors.push('browserTraining.supported must be true');
  if (value['contractVersion'] !== 1) errors.push('browserTraining.contractVersion must be 1');
  validateBrowserTrainingBackend(value['backend'], errors);
  if (value['algorithmId'] !== 'browser-top-adapter-frame-ce-v1') {
    errors.push('browserTraining.algorithmId must be browser-top-adapter-frame-ce-v1');
  }
  if (value['minimumAppVersion'] !== '0.5.0') {
    errors.push('browserTraining.minimumAppVersion must be 0.5.0');
  }

  validateExactBaseModelIdentity(value['exactBaseModel'], manifest, errors);
  const featureTap = validateBrowserTrainingFeatureTap(value['featureTap'], manifest, errors);
  validateBrowserTrainingAdapter(value['adapter'], featureTap?.dimension, fileKeys, errors);
  validateBrowserTrainingArtifacts(value['artifacts'], fileKeys, errors);
  validateBrowserTrainingLimits(value['limits'], errors);
}

function validateBrowserTrainingBackend(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('browserTraining.backend must be an object');
    return;
  }
  if (value['interface'] !== 'BrowserTrainingBackend') {
    errors.push('browserTraining.backend.interface must be BrowserTrainingBackend');
  }
  validateEnumValue(
    value['kind'],
    'browserTraining.backend.kind',
    browserTrainingBackendKindValues,
    errors,
  );
  validateEnumValue(
    value['proofStatus'],
    'browserTraining.backend.proofStatus',
    browserTrainingProofStatusValues,
    errors,
  );
  validateOptionalNonEmptyString(
    value['runtimePackage'],
    'browserTraining.backend.runtimePackage',
    errors,
  );

  if (
    value['kind'] === 'repository-fixed-adapter-math' &&
    value['proofStatus'] !== 'fixed-adapter-math-required'
  ) {
    errors.push(
      'browserTraining.backend.proofStatus must be fixed-adapter-math-required for repository-fixed-adapter-math',
    );
  }
  if (
    value['kind'] === 'onnxruntime-web-training' &&
    value['proofStatus'] !== 'ort-training-worker-proof-passed'
  ) {
    errors.push(
      'browserTraining.backend.proofStatus must be ort-training-worker-proof-passed for onnxruntime-web-training',
    );
  }
}

function validateExactBaseModelIdentity(
  value: unknown,
  manifest: Record<string, unknown>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('browserTraining.exactBaseModel must be an object');
    return;
  }
  const id = validatePatternString(
    value['id'],
    'browserTraining.exactBaseModel.id',
    modelIdPattern,
    errors,
  );
  const version = validateNonEmptyString(
    value['version'],
    'browserTraining.exactBaseModel.version',
    errors,
  );
  validatePatternString(
    value['manifestSha256'],
    'browserTraining.exactBaseModel.manifestSha256',
    sha256Pattern,
    errors,
  );
  validatePatternString(
    value['graphContractSha256'],
    'browserTraining.exactBaseModel.graphContractSha256',
    sha256Pattern,
    errors,
  );
  validatePatternString(
    value['tokenizerSha256'],
    'browserTraining.exactBaseModel.tokenizerSha256',
    sha256Pattern,
    errors,
  );
  if (id !== undefined && id !== manifest['id']) {
    errors.push('browserTraining.exactBaseModel.id must match manifest id');
  }
  if (version !== undefined && version !== manifest['version']) {
    errors.push('browserTraining.exactBaseModel.version must match manifest version');
  }
}

function validateBrowserTrainingFeatureTap(
  value: unknown,
  manifest: Record<string, unknown>,
  errors: string[],
): { readonly dimension: number } | undefined {
  if (!isRecord(value)) {
    errors.push('browserTraining.featureTap must be an object');
    return undefined;
  }
  const graphId = validateNonEmptyString(
    value['graphId'],
    'browserTraining.featureTap.graphId',
    errors,
  );
  const outputName = validateNonEmptyString(
    value['outputName'],
    'browserTraining.featureTap.outputName',
    errors,
  );
  const dimension = validatePositiveInteger(
    value['dimension'],
    'browserTraining.featureTap.dimension',
    errors,
  );
  const frameShiftMs = validatePositiveNumber(
    value['frameShiftMs'],
    'browserTraining.featureTap.frameShiftMs',
    errors,
  );
  if (value['persistedDtype'] !== 'float16') {
    errors.push('browserTraining.featureTap.persistedDtype must be float16');
  }

  const graphs = manifest['graphs'];
  const graph = graphId !== undefined && isRecord(graphs) ? graphs[graphId] : undefined;
  if (graphId !== undefined && !isRecord(graph)) {
    errors.push('browserTraining.featureTap.graphId must reference a declared graph');
  }
  if (
    outputName !== undefined &&
    isRecord(graph) &&
    !tensorNames(graph['outputs']).has(outputName)
  ) {
    errors.push(
      'browserTraining.featureTap.outputName must reference the featureTap graph outputs',
    );
  }
  const feature = manifest['feature'];
  const manifestFrameShiftMs = isRecord(feature) ? feature['frameShiftMs'] : undefined;
  if (
    frameShiftMs !== undefined &&
    typeof manifestFrameShiftMs === 'number' &&
    frameShiftMs !== manifestFrameShiftMs
  ) {
    errors.push('browserTraining.featureTap.frameShiftMs must match feature.frameShiftMs');
  }
  return dimension === undefined ? undefined : { dimension };
}

function validateBrowserTrainingAdapter(
  value: unknown,
  featureDimension: number | undefined,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('browserTraining.adapter must be an object');
    return;
  }
  if (value['architecture'] !== 'residual-bottleneck-lhuc-v1') {
    errors.push('browserTraining.adapter.architecture must be residual-bottleneck-lhuc-v1');
  }
  const inputDimension = validatePositiveInteger(
    value['inputDimension'],
    'browserTraining.adapter.inputDimension',
    errors,
  );
  validatePositiveInteger(value['rank'], 'browserTraining.adapter.rank', errors);
  const residualScale = validatePositiveNumber(
    value['residualScale'],
    'browserTraining.adapter.residualScale',
    errors,
  );
  const parameterTensorNames = validateTensorArray(
    value['parameterTensors'],
    'browserTraining.adapter.parameterTensors',
    errors,
  );
  for (const requiredName of browserTrainingParameterTensorNames) {
    if (!parameterTensorNames.has(requiredName)) {
      errors.push(`browserTraining.adapter.parameterTensors must include ${requiredName}`);
    }
  }
  validateBrowserTrainingParameterTensorTypes(value['parameterTensors'], errors);
  validateBrowserTrainingArtifactRef(
    value['runtimeGraph'],
    'browserTraining.adapter.runtimeGraph',
    'runtime-adapter',
    fileKeys,
    errors,
  );
  const preferredMaxBytes = validatePositiveInteger(
    value['preferredMaxBytes'],
    'browserTraining.adapter.preferredMaxBytes',
    errors,
  );
  const hardMaxBytes = validatePositiveInteger(
    value['hardMaxBytes'],
    'browserTraining.adapter.hardMaxBytes',
    errors,
  );
  if (
    inputDimension !== undefined &&
    featureDimension !== undefined &&
    inputDimension !== featureDimension
  ) {
    errors.push('browserTraining.adapter.inputDimension must match featureTap.dimension');
  }
  if (residualScale !== undefined && residualScale > 1) {
    errors.push('browserTraining.adapter.residualScale must be less than or equal to 1');
  }
  if (
    preferredMaxBytes !== undefined &&
    hardMaxBytes !== undefined &&
    preferredMaxBytes > hardMaxBytes
  ) {
    errors.push('browserTraining.adapter.preferredMaxBytes must not exceed hardMaxBytes');
  }
}

function validateBrowserTrainingParameterTensorTypes(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((tensor, index) => {
    if (!isRecord(tensor)) return;
    const dataType = tensor['dataType'];
    if (dataType !== 'float32' && dataType !== 'float16') {
      errors.push(
        `browserTraining.adapter.parameterTensors[${index}].dataType must be float32 or float16`,
      );
    }
  });
}

function validateBrowserTrainingArtifacts(
  value: unknown,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('browserTraining.artifacts must be an object');
    return;
  }
  validateBrowserTrainingArtifactRef(
    value['trainingModel'],
    'browserTraining.artifacts.trainingModel',
    'training-model',
    fileKeys,
    errors,
  );
  validateBrowserTrainingArtifactRef(
    value['evalModel'],
    'browserTraining.artifacts.evalModel',
    'eval-model',
    fileKeys,
    errors,
  );
  validateBrowserTrainingArtifactRef(
    value['optimizerModel'],
    'browserTraining.artifacts.optimizerModel',
    'optimizer-model',
    fileKeys,
    errors,
  );
  validateBrowserTrainingArtifactArray(
    value['nominalCheckpoint'],
    'browserTraining.artifacts.nominalCheckpoint',
    'nominal-checkpoint',
    fileKeys,
    errors,
  );
  validateBrowserTrainingArtifactRef(
    value['contractTestVectors'],
    'browserTraining.artifacts.contractTestVectors',
    'contract-test-vectors',
    fileKeys,
    errors,
  );
  validateBrowserTrainingArtifactArray(
    value['anchorPack'],
    'browserTraining.artifacts.anchorPack',
    'anchor-pack',
    fileKeys,
    errors,
  );
}

function validateBrowserTrainingArtifactArray(
  value: unknown,
  path: string,
  expectedRole: BrowserTrainingArtifactRole,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) =>
    validateBrowserTrainingArtifactRef(entry, `${path}[${index}]`, expectedRole, fileKeys, errors),
  );
}

function validateBrowserTrainingArtifactRef(
  value: unknown,
  path: string,
  expectedRole: BrowserTrainingArtifactRole,
  fileKeys: ReadonlySet<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const fileKey = validateNonEmptyString(value['fileKey'], `${path}.fileKey`, errors);
  if (fileKey !== undefined && !fileKeys.has(fileKey)) {
    errors.push(`${path}.fileKey must reference an entry in files`);
  }
  validateEnumValue(value['role'], `${path}.role`, browserTrainingArtifactRoleValues, errors);
  if (value['role'] !== expectedRole) {
    errors.push(`${path}.role must be ${expectedRole}`);
  }
  validateBrowserTrainingArtifactLicense(value['license'], `${path}.license`, errors);
  validateArtifactProvenance(value['provenance'], `${path}.provenance`, errors);
}

function validateBrowserTrainingArtifactLicense(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateOptionalNonEmptyString(value['spdx'], `${path}.spdx`, errors);
  validateNonEmptyString(value['name'], `${path}.name`, errors);
  validateOptionalNonEmptyString(value['noticeUrl'], `${path}.noticeUrl`, errors);
  if (typeof value['redistributionAllowed'] !== 'boolean') {
    errors.push(`${path}.redistributionAllowed must be boolean`);
  }
}

function validateArtifactProvenance(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateNonEmptyString(value['source'], `${path}.source`, errors);
  validateNonEmptyString(value['generatedBy'], `${path}.generatedBy`, errors);
  validateOptionalNonEmptyString(value['createdAt'], `${path}.createdAt`, errors);
}

function validateBrowserTrainingLimits(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('browserTraining.limits must be an object');
    return;
  }
  validatePositiveInteger(value['maxUtterances'], 'browserTraining.limits.maxUtterances', errors);
  validatePositiveInteger(
    value['maxAcceptedSeconds'],
    'browserTraining.limits.maxAcceptedSeconds',
    errors,
  );
  validatePositiveInteger(
    value['maxFramesPerBatch'],
    'browserTraining.limits.maxFramesPerBatch',
    errors,
  );
  validatePositiveInteger(value['maxEpochs'], 'browserTraining.limits.maxEpochs', errors);
  const maxOptimizerSteps = validatePositiveInteger(
    value['maxOptimizerSteps'],
    'browserTraining.limits.maxOptimizerSteps',
    errors,
  );
  const checkpointIntervalSteps = validatePositiveInteger(
    value['checkpointIntervalSteps'],
    'browserTraining.limits.checkpointIntervalSteps',
    errors,
  );
  if (
    maxOptimizerSteps !== undefined &&
    checkpointIntervalSteps !== undefined &&
    checkpointIntervalSteps > maxOptimizerSteps
  ) {
    errors.push('browserTraining.limits.checkpointIntervalSteps must not exceed maxOptimizerSteps');
  }
}

function validateRecommended(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('recommended must be an object');
    return;
  }
  if (typeof value['webgpu'] !== 'boolean') errors.push('recommended.webgpu must be boolean');
  validatePositiveInteger(value['wasmThreads'], 'recommended.wasmThreads', errors);
  validatePositiveInteger(value['expectedMemoryMb'], 'recommended.expectedMemoryMb', errors);
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

  const seen = new Set<T>();
  const values: T[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !allowed.has(entry as T)) {
      errors.push(`${path}[${index}] is not supported`);
      return;
    }
    const typedEntry = entry as T;
    if (seen.has(typedEntry)) errors.push(`${path}[${index}] must be unique`);
    seen.add(typedEntry);
    values.push(typedEntry);
  });
  return values;
}

function validateEnumArrayAllowEmpty<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): readonly T[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return undefined;
  }

  const seen = new Set<T>();
  const values: T[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !allowed.has(entry as T)) {
      errors.push(`${path}[${index}] is not supported`);
      return;
    }
    const typedEntry = entry as T;
    if (seen.has(typedEntry)) errors.push(`${path}[${index}] must be unique`);
    seen.add(typedEntry);
    values.push(typedEntry);
  });
  return values;
}
function validateEnumValue(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  errors: string[],
): void {
  if (typeof value !== 'string' || !allowed.has(value)) {
    errors.push(`${path} is not supported`);
  }
}

function validateTokenId(
  value: unknown,
  path: string,
  vocabularySize: number,
  errors: string[],
): number | undefined {
  const tokenId = validateNonNegativeInteger(value, path, errors);
  if (tokenId !== undefined && tokenId >= vocabularySize) {
    errors.push(`${path} must be less than tokenizer.vocabularySize`);
  }
  return tokenId;
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

function validatePositiveNumber(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${path} must be a positive number`);
    return undefined;
  }
  return value;
}

function validateNonNegativeNumber(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative number`);
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
  validateOptionalNonEmptyStringReturn(value, path, errors);
}

function validateOptionalNonEmptyStringReturn(
  value: unknown,
  path: string,
  errors: string[],
): string | undefined {
  if (value !== undefined) {
    return validateNonEmptyString(value, path, errors);
  }
  return undefined;
}

function validatePatternString(
  value: unknown,
  path: string,
  pattern: RegExp,
  errors: string[],
): string | undefined {
  const stringValue = validateNonEmptyString(value, path, errors);
  if (stringValue !== undefined && !pattern.test(stringValue)) {
    errors.push(`${path} has invalid format`);
  }
  return stringValue;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
