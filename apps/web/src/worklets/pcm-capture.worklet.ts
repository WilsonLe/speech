import {
  calculatePcmLevelMetrics,
  downmixToMono,
  getDefaultPcmCaptureProcessorOptions,
  type PcmCaptureProcessorOptions,
  type PcmCaptureWorkletCommand,
  type PcmCaptureWorkletMessage,
} from '@speech/audio';

interface WorkletProcessorConstructorOptions {
  readonly processorOptions?: Partial<PcmCaptureProcessorOptions>;
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly chunkSizeSamples: number;
  private readonly levelIntervalSamples: number;
  private readonly clipThreshold: number;
  private chunkBuffer: Float32Array;
  private chunkOffset = 0;
  private scratch = new Float32Array(128);
  private sequence = 0;
  private recording = false;
  private levelSampleCount = 0;
  private levelPeak = 0;
  private levelSumSquares = 0;
  private levelClippedSamples = 0;

  constructor(options: WorkletProcessorConstructorOptions = {}) {
    super();
    const defaults = getDefaultPcmCaptureProcessorOptions();
    this.chunkSizeSamples = options.processorOptions?.chunkSizeSamples ?? defaults.chunkSizeSamples;
    this.levelIntervalSamples = Math.max(
      1,
      Math.round(
        (sampleRate * (options.processorOptions?.levelIntervalMs ?? defaults.levelIntervalMs)) /
          1000,
      ),
    );
    this.clipThreshold = options.processorOptions?.clipThreshold ?? defaults.clipThreshold;
    this.chunkBuffer = new Float32Array(this.chunkSizeSamples);
    this.port.onmessage = (event) => this.handleCommand(event.data as PcmCaptureWorkletCommand);
  }

  override process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    silenceOutputs(outputs);

    if (!this.recording) {
      return true;
    }

    const channels = inputs[0] ?? [];
    const firstChannel = channels[0];
    if (!firstChannel || firstChannel.length === 0) {
      return true;
    }

    this.ensureScratch(firstChannel.length);
    const sampleCount = downmixToMono(channels, this.scratch);
    if (sampleCount === 0) {
      return true;
    }

    this.accumulateLevel(this.scratch, sampleCount);
    this.appendChunk(this.scratch, sampleCount);
    return true;
  }

  private handleCommand(command: PcmCaptureWorkletCommand): void {
    switch (command.type) {
      case 'START':
        this.resetBuffers();
        this.recording = true;
        this.postState('CAPTURE_STARTED');
        break;
      case 'STOP':
        this.flushChunk();
        this.flushLevel();
        this.recording = false;
        this.postState('CAPTURE_STOPPED');
        break;
      case 'RESET':
        this.resetBuffers();
        break;
      default:
        this.postMessage({
          type: 'CAPTURE_ERROR',
          sequence: this.sequence,
          code: 'AUDIO_CONTEXT_FAILED',
          message: 'Unknown PCM capture worklet command.',
        });
        this.sequence += 1;
    }
  }

  private ensureScratch(sampleCount: number): void {
    if (this.scratch.length < sampleCount) {
      this.scratch = new Float32Array(sampleCount);
    }
  }

  private appendChunk(samples: Float32Array, sampleCount: number): void {
    let copied = 0;
    while (copied < sampleCount) {
      const writableSamples = Math.min(
        this.chunkSizeSamples - this.chunkOffset,
        sampleCount - copied,
      );
      this.chunkBuffer.set(samples.subarray(copied, copied + writableSamples), this.chunkOffset);
      this.chunkOffset += writableSamples;
      copied += writableSamples;

      if (this.chunkOffset === this.chunkSizeSamples) {
        this.flushChunk();
      }
    }
  }

  private accumulateLevel(samples: Float32Array, sampleCount: number): void {
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const sample = samples[sampleIndex] ?? 0;
      const magnitude = Math.abs(sample);
      this.levelPeak = Math.max(this.levelPeak, magnitude);
      this.levelSumSquares += sample * sample;
      this.levelSampleCount += 1;
      if (magnitude >= this.clipThreshold) {
        this.levelClippedSamples += 1;
      }
    }

    if (this.levelSampleCount >= this.levelIntervalSamples) {
      this.flushLevel();
    }
  }

  private flushChunk(): void {
    if (this.chunkOffset === 0) {
      return;
    }

    const pcm =
      this.chunkOffset === this.chunkSizeSamples
        ? this.chunkBuffer
        : this.chunkBuffer.slice(0, this.chunkOffset);
    const sampleCount = this.chunkOffset;
    const metrics = calculatePcmLevelMetrics(pcm, sampleCount, this.clipThreshold);
    const pcmBuffer = pcm.buffer;
    if (!(pcmBuffer instanceof ArrayBuffer)) {
      this.postMessage({
        type: 'CAPTURE_ERROR',
        sequence: this.sequence,
        code: 'AUDIO_CONTEXT_FAILED',
        message: 'PCM capture produced a non-transferable buffer.',
      });
      this.sequence += 1;
      return;
    }

    const message: PcmCaptureWorkletMessage = {
      type: 'PCM_CHUNK',
      sequence: this.sequence,
      sampleRateHz: sampleRate,
      capturedFrame: currentFrame - sampleCount,
      sampleCount,
      pcm: pcmBuffer,
      metrics,
    };

    this.postMessage(message, [pcmBuffer]);
    this.sequence += 1;
    this.chunkBuffer = new Float32Array(this.chunkSizeSamples);
    this.chunkOffset = 0;
  }

  private flushLevel(): void {
    if (this.levelSampleCount === 0) {
      return;
    }

    const metrics = {
      sampleCount: this.levelSampleCount,
      peak: this.levelPeak,
      rms: Math.sqrt(this.levelSumSquares / this.levelSampleCount),
      clippedSamples: this.levelClippedSamples,
      clippingRatio: this.levelClippedSamples / this.levelSampleCount,
    };

    this.postMessage({
      type: 'LEVEL',
      sequence: this.sequence,
      sampleRateHz: sampleRate,
      capturedFrame: currentFrame,
      metrics,
    });
    this.sequence += 1;
    this.levelSampleCount = 0;
    this.levelPeak = 0;
    this.levelSumSquares = 0;
    this.levelClippedSamples = 0;
  }

  private postState(type: 'CAPTURE_STARTED' | 'CAPTURE_STOPPED'): void {
    this.postMessage({
      type,
      sequence: this.sequence,
      sampleRateHz: sampleRate,
      capturedFrame: currentFrame,
    });
    this.sequence += 1;
  }

  private postMessage(message: PcmCaptureWorkletMessage, transfer?: Transferable[]): void {
    this.port.postMessage(message, transfer ?? []);
  }

  private resetBuffers(): void {
    this.chunkBuffer = new Float32Array(this.chunkSizeSamples);
    this.chunkOffset = 0;
    this.levelSampleCount = 0;
    this.levelPeak = 0;
    this.levelSumSquares = 0;
    this.levelClippedSamples = 0;
  }
}

function silenceOutputs(outputs: Float32Array[][]): void {
  for (const output of outputs) {
    for (const channel of output) {
      channel.fill(0);
    }
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);

export {};
