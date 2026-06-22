import type { ErrorCode, WarningCode } from './errors';
import type { ModelIdentity, AdaptationType } from './profile';
import type { VocabularyEntryV1, VocabularyError } from './vocabulary';

export interface RuntimeCapabilities {
  readonly secureContext: boolean;
  readonly mediaDevices: boolean;
  readonly audioWorklet: boolean;
  readonly webWorkers: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly webAssemblySimd: boolean;
  readonly webAssemblyThreads: boolean;
  readonly webGpu: boolean;
  readonly persistentStorage: boolean;
  readonly selectedTier: 'A' | 'B' | 'C' | 'D';
}

export interface TimingSnapshot {
  readonly audioTimestampMs?: number;
  readonly workerReceivedAtMs: number;
  readonly partialEmittedAtMs?: number;
  readonly finalEmittedAtMs?: number;
  readonly featureMs?: number;
  readonly encoderMs?: number;
  readonly decoderMs?: number;
}

export interface RuntimeMetrics {
  readonly queueDepthFrames: number;
  readonly audioOverruns: number;
  readonly realTimeFactor?: number;
  readonly provider?: 'webgpu' | 'wasm';
  readonly wasmThreads?: number;
}

export interface LanguageSpan {
  readonly startToken: number;
  readonly endToken: number;
  readonly language: 'vi' | 'en' | 'mixed';
}

export type MainToAsrWorker =
  | {
      readonly type: 'INIT';
      readonly modelId: string;
      readonly preferredProvider: 'auto' | 'webgpu' | 'wasm';
    }
  | { readonly type: 'SET_LANGUAGE_MODE'; readonly mode: 'vi' | 'en' | 'auto' | 'mixed' }
  | {
      readonly type: 'SET_VOCABULARY';
      readonly revision: number;
      readonly entries: readonly VocabularyEntryV1[];
    }
  | {
      readonly type: 'LOAD_PROFILE';
      readonly profileId: string;
      readonly expectedBaseModel: ModelIdentity;
    }
  | { readonly type: 'UNLOAD_PROFILE' }
  | { readonly type: 'START_UTTERANCE'; readonly utteranceId: string; readonly startedAtMs: number }
  | { readonly type: 'AUDIO_AVAILABLE'; readonly writeSequence: number }
  | {
      readonly type: 'AUDIO_CHUNK';
      readonly utteranceId: string;
      readonly pcm: ArrayBuffer;
      readonly sampleRateHz: number;
    }
  | { readonly type: 'END_UTTERANCE'; readonly utteranceId: string; readonly endedAtMs: number }
  | { readonly type: 'RESET' }
  | { readonly type: 'DISPOSE' };

export type AsrWorkerToMain =
  | { readonly type: 'READY'; readonly capabilities: RuntimeCapabilities }
  | {
      readonly type: 'MODEL_PROGRESS';
      readonly phase: string;
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly type: 'VOCABULARY_READY';
      readonly revision: number;
      readonly accepted: number;
      readonly rejected: readonly VocabularyError[];
    }
  | {
      readonly type: 'PROFILE_READY';
      readonly profileId: string;
      readonly adaptationType: AdaptationType;
    }
  | {
      readonly type: 'PARTIAL';
      readonly utteranceId: string;
      readonly committed: string;
      readonly provisional: string;
      readonly languageSpans?: readonly LanguageSpan[];
      readonly timings: TimingSnapshot;
    }
  | {
      readonly type: 'FINAL';
      readonly utteranceId: string;
      readonly text: string;
      readonly languageSpans?: readonly LanguageSpan[];
      readonly matchedVocabularyIds?: readonly string[];
      readonly timings: TimingSnapshot;
    }
  | { readonly type: 'METRICS'; readonly metrics: RuntimeMetrics }
  | { readonly type: 'WARNING'; readonly code: WarningCode; readonly message: string }
  | {
      readonly type: 'ERROR';
      readonly code: ErrorCode;
      readonly recoverable: boolean;
      readonly message: string;
    };
