import type { ErrorCode } from '@speech/protocol';
import type { AudioContextLike, ConnectableAudioNodeLike } from './microphone';
import type { PcmLevelMetrics } from './pcm';

export const PCM_CAPTURE_PROCESSOR_NAME = 'pcm-capture';

export interface PcmCaptureProcessorOptions {
  readonly chunkSizeSamples: number;
  readonly levelIntervalMs: number;
  readonly clipThreshold: number;
}

export interface PcmCaptureLevelMessage {
  readonly type: 'LEVEL';
  readonly sequence: number;
  readonly sampleRateHz: number;
  readonly capturedFrame: number;
  readonly metrics: PcmLevelMetrics;
}

export interface PcmCaptureChunkMessage {
  readonly type: 'PCM_CHUNK';
  readonly sequence: number;
  readonly sampleRateHz: number;
  readonly capturedFrame: number;
  readonly sampleCount: number;
  readonly pcm: ArrayBuffer;
  readonly metrics: PcmLevelMetrics;
}

export interface PcmCaptureStateMessage {
  readonly type: 'CAPTURE_STARTED' | 'CAPTURE_STOPPED';
  readonly sequence: number;
  readonly sampleRateHz: number;
  readonly capturedFrame: number;
}

export interface PcmCaptureErrorMessage {
  readonly type: 'CAPTURE_ERROR';
  readonly sequence: number;
  readonly code: ErrorCode;
  readonly message: string;
}

export type PcmCaptureWorkletMessage =
  | PcmCaptureLevelMessage
  | PcmCaptureChunkMessage
  | PcmCaptureStateMessage
  | PcmCaptureErrorMessage;

export type PcmCaptureWorkletCommand = { readonly type: 'START' | 'STOP' | 'RESET' };

export interface PcmCaptureWorkletFailure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly recoveryStep: string;
}

interface MessagePortLike {
  onmessage: ((event: MessageEvent<PcmCaptureWorkletMessage>) => void) | null;
  postMessage: (message: PcmCaptureWorkletCommand) => void;
  close?: () => void;
  start?: () => void;
}

export interface AudioWorkletNodeLike extends ConnectableAudioNodeLike {
  readonly port: MessagePortLike;
}

export interface PcmCaptureWorkletAttachOptions {
  readonly audioContext: AudioContextLike;
  readonly sourceNode: ConnectableAudioNodeLike;
  readonly workletModuleUrl: string | URL;
  readonly processorName?: string;
  readonly chunkSizeSamples?: number;
  readonly levelIntervalMs?: number;
  readonly clipThreshold?: number;
  readonly onMessage?: (message: PcmCaptureWorkletMessage) => void;
  readonly createAudioWorkletNode?: (
    context: AudioContextLike,
    processorName: string,
    options: AudioWorkletNodeOptions,
  ) => AudioWorkletNodeLike;
}

const defaultProcessorOptions: PcmCaptureProcessorOptions = {
  chunkSizeSamples: 2_048,
  levelIntervalMs: 100,
  clipThreshold: 0.98,
};

export function getDefaultPcmCaptureProcessorOptions(): PcmCaptureProcessorOptions {
  return defaultProcessorOptions;
}

export class PcmCaptureWorkletController {
  private disposed = false;
  private started = false;

  constructor(
    private readonly sourceNode: ConnectableAudioNodeLike,
    private readonly workletNode: AudioWorkletNodeLike,
  ) {}

  get active(): boolean {
    return this.started && !this.disposed;
  }

  start(): void {
    this.assertUsable();
    if (this.started) {
      return;
    }
    this.workletNode.port.postMessage({ type: 'START' });
    this.started = true;
  }

  stop(): void {
    if (this.disposed || !this.started) {
      return;
    }
    this.workletNode.port.postMessage({ type: 'STOP' });
    this.started = false;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    if (this.started) {
      this.workletNode.port.postMessage({ type: 'STOP' });
    }

    this.started = false;
    this.workletNode.port.onmessage = null;
    this.sourceNode.disconnect();
    this.workletNode.disconnect();
    this.workletNode.port.close?.();
    this.disposed = true;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw createPcmCaptureWorkletFailure(
        'AUDIO_CONTEXT_FAILED',
        'PCM capture worklet has already been disposed.',
      );
    }
  }
}

export async function attachPcmCaptureWorklet(
  options: PcmCaptureWorkletAttachOptions,
): Promise<PcmCaptureWorkletController> {
  const audioWorklet = options.audioContext.audioWorklet;
  if (!audioWorklet) {
    throw createPcmCaptureWorkletFailure(
      'AUDIO_CONTEXT_FAILED',
      'AudioWorklet is unavailable in this browser context.',
    );
  }

  const processorOptions: PcmCaptureProcessorOptions = {
    chunkSizeSamples: options.chunkSizeSamples ?? defaultProcessorOptions.chunkSizeSamples,
    levelIntervalMs: options.levelIntervalMs ?? defaultProcessorOptions.levelIntervalMs,
    clipThreshold: options.clipThreshold ?? defaultProcessorOptions.clipThreshold,
  };

  await audioWorklet.addModule(options.workletModuleUrl);

  const workletNode = (options.createAudioWorkletNode ?? createBrowserAudioWorkletNode)(
    options.audioContext,
    options.processorName ?? PCM_CAPTURE_PROCESSOR_NAME,
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions,
    },
  );

  workletNode.port.onmessage = (event) => options.onMessage?.(event.data);
  workletNode.port.start?.();
  options.sourceNode.connect(workletNode);
  workletNode.connect(options.audioContext.destination);

  return new PcmCaptureWorkletController(options.sourceNode, workletNode);
}

function createBrowserAudioWorkletNode(
  context: AudioContextLike,
  processorName: string,
  options: AudioWorkletNodeOptions,
): AudioWorkletNodeLike {
  const audioWorkletNodeConstructor = globalThis.AudioWorkletNode;
  if (!audioWorkletNodeConstructor) {
    throw createPcmCaptureWorkletFailure(
      'AUDIO_CONTEXT_FAILED',
      'AudioWorkletNode is unavailable in this browser context.',
    );
  }

  return new audioWorkletNodeConstructor(
    context as unknown as BaseAudioContext,
    processorName,
    options,
  ) as unknown as AudioWorkletNodeLike;
}

function createPcmCaptureWorkletFailure(
  code: ErrorCode,
  message: string,
): PcmCaptureWorkletFailure {
  return {
    code,
    message,
    recoveryStep:
      'Use a current Chromium or Edge browser in a secure context, then restart microphone capture.',
  };
}
