export type SpeechLanguage = 'vi' | 'en';
export type SpeechLanguageMode = SpeechLanguage | 'auto' | 'mixed';
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
    readonly maxActiveEntries: number;
    readonly maxPhraseTokens: number;
    readonly defaultWeight: number;
    readonly maxCumulativeBonus: number;
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

export function validateSpeechModelManifestV2(value: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }

  if (value['schemaVersion'] !== 2) errors.push('schemaVersion must be 2');
  if (value['architecture'] !== 'rnnt') errors.push('architecture must be rnnt');
  if (value['sampleRateHz'] !== 16000) errors.push('sampleRateHz must be 16000');

  for (const key of ['id', 'version', 'displayName'] as const) {
    const field = value[key];
    if (typeof field !== 'string' || field.length === 0) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  const languages = value['languages'];
  if (!Array.isArray(languages) || languages.length === 0) {
    errors.push('languages must be a non-empty array');
  }

  const license = value['license'];
  if (!isRecord(license)) {
    errors.push('license metadata is required');
  } else if (
    license['redistributionAllowed'] !== true &&
    license['redistributionAllowed'] !== false
  ) {
    errors.push('license.redistributionAllowed must be boolean');
  }

  const files = value['files'];
  if (!isRecord(files) || Object.keys(files).length === 0) {
    errors.push('files must list at least one model artifact');
  }

  const graphs = value['graphs'];
  if (!isRecord(graphs)) {
    errors.push('graphs contract is required');
  } else {
    for (const graphName of ['encoder', 'predictor', 'joiner'] as const) {
      if (!isRecord(graphs[graphName])) {
        errors.push(`graphs.${graphName} is required`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
