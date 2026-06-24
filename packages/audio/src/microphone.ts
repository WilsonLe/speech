import type { ErrorCode } from '@speech/protocol';

export interface MicrophoneProcessingOptions {
  readonly echoCancellation: boolean;
  readonly noiseSuppression: boolean;
  readonly autoGainControl: boolean;
}

export interface MicrophoneCaptureRequest {
  readonly deviceId?: string;
  readonly processing: MicrophoneProcessingOptions;
}

export interface MicrophoneTrackSettings {
  readonly deviceId?: string;
  readonly groupId?: string;
  readonly channelCount?: number;
  readonly sampleRate?: number;
  readonly sampleSize?: number;
  readonly echoCancellation?: boolean;
  readonly noiseSuppression?: boolean;
  readonly autoGainControl?: boolean;
  readonly latency?: number;
}

export interface MicrophoneCaptureSnapshot {
  readonly requestedConstraints: MediaStreamConstraints;
  readonly actualSettings: MicrophoneTrackSettings;
  readonly audioContextSampleRateHz: number;
  readonly trackLabel: string;
  readonly trackState: MediaStreamTrackState;
  readonly startedAt: string;
}

export interface MicrophoneCaptureSession extends MicrophoneCaptureSnapshot {
  readonly stream: MediaStream;
  readonly audioContext: AudioContextLike;
  readonly sourceNode: ConnectableAudioNodeLike;
  readonly stop: () => Promise<void>;
}

export interface MicrophoneCaptureFailure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly recoveryStep: string;
}

interface MediaDevicesLike {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface ConnectableAudioNodeLike {
  connect: (destination: ConnectableAudioNodeLike) => ConnectableAudioNodeLike;
  disconnect: () => void;
}

export interface AudioWorkletLike {
  addModule: (moduleURL: string | URL) => Promise<void>;
}

export interface AudioContextLike {
  readonly sampleRate: number;
  readonly state: AudioContextState;
  readonly destination: ConnectableAudioNodeLike;
  readonly audioWorklet?: AudioWorkletLike;
  createMediaStreamSource: (stream: MediaStream) => ConnectableAudioNodeLike;
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

export interface MicrophoneCaptureDependencies {
  readonly mediaDevices?: MediaDevicesLike;
  readonly createAudioContext?: () => AudioContextLike;
  readonly now?: () => string;
}

const defaultProcessingOptions: MicrophoneProcessingOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function getDefaultMicrophoneProcessingOptions(): MicrophoneProcessingOptions {
  return defaultProcessingOptions;
}

export function createMicrophoneConstraints(
  request: MicrophoneCaptureRequest,
): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
    echoCancellation: request.processing.echoCancellation,
    noiseSuppression: request.processing.noiseSuppression,
    autoGainControl: request.processing.autoGainControl,
    ...(request.deviceId ? { deviceId: { exact: request.deviceId } } : {}),
  };

  return { audio, video: false };
}

export class MicrophoneCaptureController {
  private readonly mediaDevices: MediaDevicesLike | undefined;
  private readonly createAudioContext: () => AudioContextLike;
  private readonly now: () => string;
  private activeSession: MicrophoneCaptureSession | null = null;

  constructor(dependencies: MicrophoneCaptureDependencies = {}) {
    this.mediaDevices = dependencies.mediaDevices ?? getBrowserMediaDevices();
    this.createAudioContext = dependencies.createAudioContext ?? createBrowserAudioContext;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  get active(): boolean {
    return this.activeSession !== null;
  }

  get snapshot(): MicrophoneCaptureSnapshot | null {
    if (!this.activeSession) {
      return null;
    }

    const {
      stream: _stream,
      audioContext: _audioContext,
      sourceNode: _sourceNode,
      stop: _stop,
      ...snapshot
    } = this.activeSession;
    return snapshot;
  }

  async start(request: MicrophoneCaptureRequest): Promise<MicrophoneCaptureSession> {
    await this.stop();

    if (!this.mediaDevices) {
      throw createMicrophoneError('MIC_DEVICE_NOT_FOUND', 'Browser media devices are unavailable.');
    }

    const requestedConstraints = createMicrophoneConstraints(request);

    try {
      const stream = await this.mediaDevices.getUserMedia(requestedConstraints);
      const audioContext = this.createAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const track = stream.getAudioTracks()[0];
      if (!track) {
        await disposeResources(stream, sourceNode, audioContext);
        throw createMicrophoneError(
          'MIC_DEVICE_NOT_FOUND',
          'No microphone audio track was returned.',
        );
      }

      const session: MicrophoneCaptureSession = {
        stream,
        requestedConstraints,
        actualSettings: normalizeTrackSettings(track.getSettings()),
        audioContextSampleRateHz: audioContext.sampleRate,
        trackLabel: track.label,
        trackState: track.readyState,
        startedAt: this.now(),
        audioContext,
        sourceNode,
        stop: async () => {
          if (this.activeSession?.stream === stream) {
            this.activeSession = null;
          }
          await disposeResources(stream, sourceNode, audioContext);
        },
      };

      this.activeSession = session;
      return session;
    } catch (error) {
      if (isMicrophoneCaptureFailure(error)) {
        throw error;
      }
      throw mapGetUserMediaError(error);
    }
  }

  async stop(): Promise<void> {
    const session = this.activeSession;
    this.activeSession = null;
    await session?.stop();
  }
}

function getBrowserMediaDevices(): MediaDevicesLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return navigator.mediaDevices;
}

function createBrowserAudioContext(): AudioContextLike {
  const audioContextGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor = globalThis.AudioContext ?? audioContextGlobal.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw createMicrophoneError('AUDIO_CONTEXT_FAILED', 'AudioContext is unavailable.');
  }

  return new AudioContextConstructor() as unknown as AudioContextLike;
}

function normalizeTrackSettings(settings: MediaTrackSettings): MicrophoneTrackSettings {
  const extendedSettings = settings as MediaTrackSettings & { readonly latency?: number };

  return {
    ...(typeof settings.deviceId === 'string' ? { deviceId: settings.deviceId } : {}),
    ...(typeof settings.groupId === 'string' ? { groupId: settings.groupId } : {}),
    ...(typeof settings.channelCount === 'number' ? { channelCount: settings.channelCount } : {}),
    ...(typeof settings.sampleRate === 'number' ? { sampleRate: settings.sampleRate } : {}),
    ...(typeof settings.sampleSize === 'number' ? { sampleSize: settings.sampleSize } : {}),
    ...(typeof settings.echoCancellation === 'boolean'
      ? { echoCancellation: settings.echoCancellation }
      : {}),
    ...(typeof settings.noiseSuppression === 'boolean'
      ? { noiseSuppression: settings.noiseSuppression }
      : {}),
    ...(typeof settings.autoGainControl === 'boolean'
      ? { autoGainControl: settings.autoGainControl }
      : {}),
    ...(typeof extendedSettings.latency === 'number' ? { latency: extendedSettings.latency } : {}),
  };
}

async function disposeResources(
  stream: MediaStream,
  sourceNode: ConnectableAudioNodeLike,
  audioContext: AudioContextLike,
): Promise<void> {
  sourceNode.disconnect();
  for (const track of stream.getTracks()) {
    track.stop();
  }

  if (audioContext.state !== 'closed') {
    await audioContext.close();
  }
}

function createMicrophoneError(code: ErrorCode, message: string): MicrophoneCaptureFailure {
  return { code, message, recoveryStep: recoveryStepFor(code) };
}

function mapGetUserMediaError(error: unknown): MicrophoneCaptureFailure {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return createMicrophoneError('MIC_PERMISSION_DENIED', 'Microphone permission was denied.');
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return createMicrophoneError('MIC_DEVICE_NOT_FOUND', 'No microphone device was found.');
    }

    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return createMicrophoneError('AUDIO_CONTEXT_FAILED', 'The microphone could not be opened.');
    }
  }

  return createMicrophoneError(
    'AUDIO_CONTEXT_FAILED',
    error instanceof Error ? error.message : 'Microphone capture failed.',
  );
}

function isMicrophoneCaptureFailure(error: unknown): error is MicrophoneCaptureFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'recoveryStep' in error &&
    'message' in error
  );
}

function recoveryStepFor(code: ErrorCode): string {
  switch (code) {
    case 'MIC_PERMISSION_DENIED':
      return 'Allow microphone access in the browser permission prompt or site settings, then try again.';
    case 'MIC_DEVICE_NOT_FOUND':
      return 'Connect or select a microphone, then retry the microphone check.';
    case 'AUDIO_CONTEXT_FAILED':
      return 'Close other apps using the microphone, refresh the PWA, and try again.';
    default:
      return 'Stop capture, refresh the PWA, and retry.';
  }
}
