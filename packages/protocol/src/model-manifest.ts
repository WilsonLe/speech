export type SpeechLanguage = 'vi' | 'en';
export type SpeechLanguageMode = SpeechLanguage | 'auto' | 'mixed';
export type VocabularyEntryLanguage = SpeechLanguageMode;
export type ContextBiasingBoundaryMode = 'none' | 'token' | 'unicode-word';
export type ContextBiasingRevisionSwapPolicy = 'utterance-boundary';
export type TensorDataType = 'float32' | 'float16' | 'int32' | 'int64' | 'uint8' | 'int8' | 'bool';

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
      readonly insertionPoints: readonly string[];
      readonly maxParameters: number;
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
const sha256Pattern = /^[a-f0-9]{64}$/;
const modelIdPattern = /^[a-z0-9][a-z0-9._-]*$/;

export function validateSpeechModelManifestV2(value: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }

  if (value['schemaVersion'] !== 2) errors.push('schemaVersion must be 2');
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
  validatePersonalization(value['personalization'], fileKeys, errors);
  validateRecommended(value['recommended'], errors);

  if (vocabularySize !== undefined) {
    validateTokenizerIds(value['tokenizer'], vocabularySize, supportedLanguageModes, errors);
  }

  return { ok: errors.length === 0, errors };
}

export function parseSpeechModelManifestV2(value: unknown): SpeechModelManifestV2 {
  const result = validateSpeechModelManifestV2(value);
  if (!result.ok) {
    throw new Error(`Invalid SpeechModelManifestV2: ${result.errors.join('; ')}`);
  }
  return value as SpeechModelManifestV2;
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
    if (!isRecord(residualAdapter)) {
      errors.push('personalization.residualAdapter must be an object');
    } else {
      if (typeof residualAdapter['supported'] !== 'boolean') {
        errors.push('personalization.residualAdapter.supported must be boolean');
      }
      validatePositiveInteger(
        residualAdapter['contractVersion'],
        'personalization.residualAdapter.contractVersion',
        errors,
      );
      validateStringArray(
        residualAdapter['insertionPoints'],
        'personalization.residualAdapter.insertionPoints',
        errors,
      );
      validatePositiveInteger(
        residualAdapter['maxParameters'],
        'personalization.residualAdapter.maxParameters',
        errors,
      );
    }
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

function validateStringArray(value: unknown, path: string, errors: string[]): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      errors.push(`${path}[${index}] must be a non-empty string`);
      return;
    }
    if (seen.has(entry)) errors.push(`${path}[${index}] must be unique`);
    seen.add(entry);
  });
  return [...seen];
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
