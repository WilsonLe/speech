export interface StreamingResamplerOptions {
  readonly sourceSampleRateHz: number;
  readonly targetSampleRateHz?: number;
}

export interface StreamingResamplerState {
  readonly sourceSampleRateHz: number;
  readonly targetSampleRateHz: number;
  readonly inputSamplesReceived: number;
  readonly outputSamplesProduced: number;
  readonly pendingInputSamples: number;
  readonly nextOutputSourcePosition: number;
}

const defaultTargetSampleRateHz = 16_000;
const positionEpsilon = 1e-9;

export class StreamingLinearResampler {
  private readonly sourceSampleRateHz: number;
  private readonly targetSampleRateHz: number;
  private readonly sourceStepPerOutput: number;
  private readonly identity: boolean;
  private buffer = new Float32Array(0);
  private bufferStartIndex = 0;
  private inputSamplesReceived = 0;
  private outputSamplesProduced = 0;
  private nextOutputSourcePosition = 0;
  private finished = false;

  constructor(options: StreamingResamplerOptions) {
    this.sourceSampleRateHz = assertPositiveInteger(
      options.sourceSampleRateHz,
      'sourceSampleRateHz',
    );
    this.targetSampleRateHz = assertPositiveInteger(
      options.targetSampleRateHz ?? defaultTargetSampleRateHz,
      'targetSampleRateHz',
    );
    this.sourceStepPerOutput = this.sourceSampleRateHz / this.targetSampleRateHz;
    this.identity = this.sourceSampleRateHz === this.targetSampleRateHz;
  }

  get state(): StreamingResamplerState {
    return {
      sourceSampleRateHz: this.sourceSampleRateHz,
      targetSampleRateHz: this.targetSampleRateHz,
      inputSamplesReceived: this.inputSamplesReceived,
      outputSamplesProduced: this.outputSamplesProduced,
      pendingInputSamples: this.buffer.length,
      nextOutputSourcePosition: this.nextOutputSourcePosition,
    };
  }

  process(input: Float32Array): Float32Array {
    if (this.finished) {
      throw new Error('Cannot process more input after finishing the streaming resampler.');
    }

    if (input.length === 0) {
      return new Float32Array(0);
    }

    this.inputSamplesReceived += input.length;

    if (this.identity) {
      this.outputSamplesProduced += input.length;
      return input.slice();
    }

    this.appendInput(input);
    return this.drain(false);
  }

  finish(): Float32Array {
    if (this.finished) {
      return new Float32Array(0);
    }

    this.finished = true;

    if (this.identity) {
      return new Float32Array(0);
    }

    const output = this.drain(true);
    this.buffer = new Float32Array(0);
    this.bufferStartIndex = this.inputSamplesReceived;
    return output;
  }

  reset(): void {
    this.buffer = new Float32Array(0);
    this.bufferStartIndex = 0;
    this.inputSamplesReceived = 0;
    this.outputSamplesProduced = 0;
    this.nextOutputSourcePosition = 0;
    this.finished = false;
  }

  private appendInput(input: Float32Array): void {
    if (this.buffer.length === 0) {
      this.buffer = input.slice();
      this.bufferStartIndex = this.inputSamplesReceived - input.length;
      return;
    }

    const nextBuffer = new Float32Array(this.buffer.length + input.length);
    nextBuffer.set(this.buffer, 0);
    nextBuffer.set(input, this.buffer.length);
    this.buffer = nextBuffer;
  }

  private drain(allowFinalSample: boolean): Float32Array {
    if (this.buffer.length === 0) {
      return new Float32Array(0);
    }

    const endExclusive = this.bufferStartIndex + this.buffer.length;
    const lastAvailableIndex = endExclusive - 1;
    const output = new Float32Array(
      Math.max(
        0,
        Math.ceil((lastAvailableIndex - this.nextOutputSourcePosition) / this.sourceStepPerOutput) +
          2,
      ),
    );
    let outputOffset = 0;

    while (true) {
      const sourcePosition = allowFinalSample
        ? Math.min(this.nextOutputSourcePosition, lastAvailableIndex)
        : this.nextOutputSourcePosition;
      const floorIndex = Math.floor(sourcePosition);
      const nextIndex = floorIndex + 1;

      if (allowFinalSample) {
        if (this.nextOutputSourcePosition > lastAvailableIndex + positionEpsilon) {
          break;
        }
      } else if (nextIndex >= endExclusive) {
        break;
      }

      if (floorIndex < this.bufferStartIndex) {
        throw new Error('Streaming resampler lost required history.');
      }

      const localIndex = floorIndex - this.bufferStartIndex;
      const current = this.buffer[localIndex] ?? 0;
      const next = nextIndex < endExclusive ? (this.buffer[localIndex + 1] ?? current) : current;
      const fraction = sourcePosition - floorIndex;
      if (outputOffset >= output.length) {
        throw new Error('Streaming resampler output buffer estimate was too small.');
      }
      output[outputOffset] = current + (next - current) * fraction;
      outputOffset += 1;
      this.nextOutputSourcePosition += this.sourceStepPerOutput;
    }

    this.outputSamplesProduced += outputOffset;
    this.dropConsumedHistory();
    return output.slice(0, outputOffset);
  }

  private dropConsumedHistory(): void {
    const keepFromIndex = Math.max(
      this.bufferStartIndex,
      Math.floor(this.nextOutputSourcePosition) - 1,
    );
    const dropCount = Math.min(this.buffer.length, keepFromIndex - this.bufferStartIndex);
    if (dropCount <= 0) {
      return;
    }

    this.buffer = this.buffer.slice(dropCount);
    this.bufferStartIndex += dropCount;
  }
}

export function resamplePcmLinear(
  input: Float32Array,
  options: StreamingResamplerOptions,
): Float32Array {
  const resampler = new StreamingLinearResampler(options);
  const first = resampler.process(input);
  const final = resampler.finish();
  if (final.length === 0) {
    return first;
  }

  const output = new Float32Array(first.length + final.length);
  output.set(first, 0);
  output.set(final, first.length);
  return output;
}

export function calculateExpectedResampledSampleCount(
  inputSampleCount: number,
  sourceSampleRateHz: number,
  targetSampleRateHz = defaultTargetSampleRateHz,
): number {
  assertNonNegativeInteger(inputSampleCount, 'inputSampleCount');
  assertPositiveInteger(sourceSampleRateHz, 'sourceSampleRateHz');
  assertPositiveInteger(targetSampleRateHz, 'targetSampleRateHz');

  if (inputSampleCount === 0) {
    return 0;
  }

  if (sourceSampleRateHz === targetSampleRateHz) {
    return inputSampleCount;
  }

  return Math.floor(((inputSampleCount - 1) * targetSampleRateHz) / sourceSampleRateHz) + 1;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}
