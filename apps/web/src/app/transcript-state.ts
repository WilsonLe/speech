export type TranscriptCaptureStatus = 'idle' | 'requesting' | 'listening' | 'stopping' | 'error';

export interface TranscriptTimingState {
  readonly utteranceStartedAtMs: number | null;
  readonly utteranceEndedAtMs: number | null;
  readonly firstPartialLatencyMs: number | null;
  readonly finalizationLatencyMs: number | null;
  readonly capturedSamples: number;
  readonly capturedChunks: number;
  readonly sampleRateHz: number | null;
}

export interface TranscriptWorkspaceState {
  readonly status: TranscriptCaptureStatus;
  readonly utteranceId: string | null;
  readonly committed: string;
  readonly provisional: string;
  readonly statusMessage: string;
  readonly errorMessage: string | null;
  readonly timings: TranscriptTimingState;
}

export const initialTranscriptTimingState: TranscriptTimingState = {
  utteranceStartedAtMs: null,
  utteranceEndedAtMs: null,
  firstPartialLatencyMs: null,
  finalizationLatencyMs: null,
  capturedSamples: 0,
  capturedChunks: 0,
  sampleRateHz: null,
};

export const initialTranscriptWorkspaceState: TranscriptWorkspaceState = {
  status: 'idle',
  utteranceId: null,
  committed: '',
  provisional: '',
  statusMessage: 'Ready. Hold the push-to-talk control or press Space while the page is focused.',
  errorMessage: null,
  timings: initialTranscriptTimingState,
};

export interface StartTranscriptUtteranceOptions {
  readonly utteranceId: string;
  readonly startedAtMs: number;
}

export interface TranscriptAudioChunkOptions {
  readonly sampleCount: number;
  readonly sampleRateHz: number;
}

export interface TranscriptPartialOptions {
  readonly committed: string;
  readonly provisional: string;
  readonly emittedAtMs: number;
}

export interface TranscriptFinalOptions {
  readonly text?: string;
  readonly releasedAtMs?: number;
  readonly endedAtMs: number;
}

export interface TranscriptDownloadOptions {
  readonly includeTimingMetadata: boolean;
  readonly generatedAtIso: string;
  readonly languageModeLabel: string;
  readonly formattingEnabled: boolean;
  readonly spokenCommandsEnabled: boolean;
}

export function startTranscriptRequest(state: TranscriptWorkspaceState): TranscriptWorkspaceState {
  if (state.status === 'listening' || state.status === 'requesting') {
    return state;
  }

  return {
    ...state,
    status: 'requesting',
    errorMessage: null,
    provisional: '',
    statusMessage: 'Requesting microphone permission for push-to-talk…',
    timings: initialTranscriptTimingState,
  };
}

export function startTranscriptUtterance(
  state: TranscriptWorkspaceState,
  options: StartTranscriptUtteranceOptions,
): TranscriptWorkspaceState {
  validateUtteranceId(options.utteranceId);
  return {
    ...state,
    status: 'listening',
    utteranceId: options.utteranceId,
    provisional: '',
    statusMessage: 'Listening locally. ASR worker partials will replace the provisional suffix.',
    timings: {
      ...initialTranscriptTimingState,
      utteranceStartedAtMs: options.startedAtMs,
    },
  };
}

export function applyTranscriptPartial(
  state: TranscriptWorkspaceState,
  options: TranscriptPartialOptions,
): TranscriptWorkspaceState {
  const startedAtMs = state.timings.utteranceStartedAtMs;
  const firstPartialLatencyMs =
    state.timings.firstPartialLatencyMs ??
    (startedAtMs === null ? null : Math.max(0, options.emittedAtMs - startedAtMs));

  return {
    ...state,
    committed: options.committed,
    provisional: options.provisional,
    statusMessage: 'Live partial received from the ASR worker.',
    timings: {
      ...state.timings,
      firstPartialLatencyMs,
    },
  };
}

export function recordTranscriptAudioChunk(
  state: TranscriptWorkspaceState,
  options: TranscriptAudioChunkOptions,
): TranscriptWorkspaceState {
  if (!Number.isFinite(options.sampleCount) || options.sampleCount < 0) {
    throw new Error('sampleCount must be a non-negative finite number.');
  }
  if (!Number.isFinite(options.sampleRateHz) || options.sampleRateHz <= 0) {
    throw new Error('sampleRateHz must be a positive finite number.');
  }

  return {
    ...state,
    timings: {
      ...state.timings,
      capturedChunks: state.timings.capturedChunks + 1,
      capturedSamples: state.timings.capturedSamples + options.sampleCount,
      sampleRateHz: options.sampleRateHz,
    },
  };
}

export function finishTranscriptUtterance(
  state: TranscriptWorkspaceState,
  options: TranscriptFinalOptions,
): TranscriptWorkspaceState {
  const utteranceEndedAtMs = options.endedAtMs;
  const finalText = options.text ?? state.committed;
  const hasFinalOutput = options.text !== undefined && finalText.length > 0;

  return {
    ...state,
    status: 'idle',
    utteranceId: null,
    committed: finalText,
    provisional: '',
    statusMessage: hasFinalOutput
      ? 'Utterance finalized locally.'
      : 'Audio capture ended. Transcript output is pending model integration.',
    timings: {
      ...state.timings,
      utteranceEndedAtMs,
      finalizationLatencyMs:
        options.releasedAtMs === undefined
          ? null
          : Math.max(0, utteranceEndedAtMs - options.releasedAtMs),
    },
  };
}

export function markTranscriptStopping(state: TranscriptWorkspaceState): TranscriptWorkspaceState {
  if (state.status !== 'requesting' && state.status !== 'listening') {
    return state;
  }

  return {
    ...state,
    status: 'stopping',
    statusMessage: 'Stopping capture and finalizing the current utterance…',
  };
}

export function failTranscriptCapture(
  state: TranscriptWorkspaceState,
  message: string,
): TranscriptWorkspaceState {
  return {
    ...state,
    status: 'error',
    utteranceId: null,
    provisional: '',
    errorMessage: message,
    statusMessage: 'Push-to-talk capture failed. Release the key/control and try again.',
  };
}

export function clearTranscript(state: TranscriptWorkspaceState): TranscriptWorkspaceState {
  if (state.status === 'idle') {
    return initialTranscriptWorkspaceState;
  }

  return {
    ...state,
    committed: '',
    provisional: '',
  };
}

export function editTranscriptCommittedText(
  state: TranscriptWorkspaceState,
  text: string,
): TranscriptWorkspaceState {
  return {
    ...state,
    committed: text,
  };
}

export function getTranscriptPlainText(state: Pick<TranscriptWorkspaceState, 'committed'>): string {
  return state.committed.trim();
}

export function buildTranscriptDownloadText(
  state: TranscriptWorkspaceState,
  options: TranscriptDownloadOptions,
): string {
  const text = getTranscriptPlainText(state);
  const body = text.length > 0 ? text : '';
  if (!options.includeTimingMetadata) {
    return `${body}\n`;
  }

  return [
    body,
    '',
    '---',
    `Generated: ${options.generatedAtIso}`,
    `Language mode: ${options.languageModeLabel}`,
    `Formatting: ${options.formattingEnabled ? 'enabled' : 'disabled'}`,
    `Spoken commands: ${options.spokenCommandsEnabled ? 'enabled' : 'disabled'}`,
    `Captured chunks: ${state.timings.capturedChunks.toString()}`,
    `Captured samples: ${state.timings.capturedSamples.toString()}`,
    `Sample rate: ${state.timings.sampleRateHz === null ? 'pending' : `${state.timings.sampleRateHz.toString()} Hz`}`,
    `First partial latency: ${formatOptionalLatency(state.timings.firstPartialLatencyMs)}`,
    `Finalization latency: ${formatOptionalLatency(state.timings.finalizationLatencyMs)}`,
    '',
  ].join('\n');
}

function formatOptionalLatency(value: number | null): string {
  return value === null ? 'pending' : `${Math.round(value).toString()} ms`;
}

function validateUtteranceId(value: string): void {
  if (value.trim().length === 0) {
    throw new Error('utteranceId must be a non-empty string.');
  }
}
