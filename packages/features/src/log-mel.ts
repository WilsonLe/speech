export interface LogMelFeatureConfig {
  readonly sampleRateHz: number;
  readonly melBinCount: number;
  readonly frameLengthMs: number;
  readonly frameShiftMs: number;
  readonly fftSize: number;
  readonly lowFreqHz: number;
  readonly highFreqHz: number;
  readonly dither: number;
  readonly snipEdges: boolean;
  readonly logFloor?: number;
}

export interface ResolvedLogMelFeatureConfig extends Required<LogMelFeatureConfig> {
  readonly frameLengthSamples: number;
  readonly frameShiftSamples: number;
  readonly powerBinCount: number;
}

export interface LogMelFeatureBatch {
  readonly frames: Float32Array;
  readonly frameCount: number;
  readonly melBinCount: number;
}

export interface LogMelFeatureState {
  readonly inputSamplesReceived: number;
  readonly framesProduced: number;
  readonly pendingSamples: number;
  readonly finished: boolean;
}

export const defaultLogMelFeatureConfig: LogMelFeatureConfig = {
  sampleRateHz: 16_000,
  melBinCount: 80,
  frameLengthMs: 25,
  frameShiftMs: 10,
  fftSize: 512,
  lowFreqHz: 20,
  highFreqHz: 7_600,
  dither: 0,
  snipEdges: true,
  logFloor: 1e-10,
};

export class StreamingLogMelExtractor {
  readonly config: ResolvedLogMelFeatureConfig;

  private readonly hannWindow: Float64Array;
  private readonly melFilterBank: Float64Array;
  private readonly real: Float64Array;
  private readonly imag: Float64Array;
  private readonly powerSpectrum: Float64Array;
  private readonly bitReversal: Uint32Array;
  private readonly twiddleCos: Float64Array;
  private readonly twiddleSin: Float64Array;
  private pending = new Float32Array(0);
  private inputSamplesReceived = 0;
  private framesProduced = 0;
  private finished = false;

  constructor(config: LogMelFeatureConfig = defaultLogMelFeatureConfig) {
    this.config = resolveLogMelFeatureConfig(config);
    this.hannWindow = createHannWindow(this.config.frameLengthSamples);
    this.melFilterBank = createMelFilterBank(this.config);
    this.real = new Float64Array(this.config.fftSize);
    this.imag = new Float64Array(this.config.fftSize);
    this.powerSpectrum = new Float64Array(this.config.powerBinCount);
    this.bitReversal = createBitReversalTable(this.config.fftSize);
    this.twiddleCos = new Float64Array(this.config.fftSize / 2);
    this.twiddleSin = new Float64Array(this.config.fftSize / 2);

    for (let index = 0; index < this.config.fftSize / 2; index += 1) {
      const angle = (-2 * Math.PI * index) / this.config.fftSize;
      this.twiddleCos[index] = Math.cos(angle);
      this.twiddleSin[index] = Math.sin(angle);
    }
  }

  get state(): LogMelFeatureState {
    return {
      inputSamplesReceived: this.inputSamplesReceived,
      framesProduced: this.framesProduced,
      pendingSamples: this.pending.length,
      finished: this.finished,
    };
  }

  process(samples: Float32Array): LogMelFeatureBatch {
    if (this.finished) {
      throw new Error('Cannot process more PCM after finishing log-Mel extraction.');
    }

    if (samples.length > 0) {
      this.inputSamplesReceived += samples.length;
      this.appendSamples(samples);
    }

    return this.drainCompleteFrames();
  }

  finish(): LogMelFeatureBatch {
    if (this.finished) {
      return createFeatureBatch(new Float32Array(0), 0, this.config.melBinCount);
    }

    const complete = this.drainCompleteFrames();
    let padded = createFeatureBatch(new Float32Array(0), 0, this.config.melBinCount);

    if (!this.config.snipEdges && this.pending.length > 0) {
      const output = new Float32Array(this.config.melBinCount);
      this.writeFrame(this.pending, 0, true, output, 0);
      this.framesProduced += 1;
      padded = createFeatureBatch(output, 1, this.config.melBinCount);
    }

    this.pending = new Float32Array(0);
    this.finished = true;
    return concatLogMelFeatureBatches([complete, padded]);
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.inputSamplesReceived = 0;
    this.framesProduced = 0;
    this.finished = false;
  }

  private appendSamples(samples: Float32Array): void {
    if (this.pending.length === 0) {
      this.pending = samples.slice();
      return;
    }

    const next = new Float32Array(this.pending.length + samples.length);
    next.set(this.pending, 0);
    next.set(samples, this.pending.length);
    this.pending = next;
  }

  private drainCompleteFrames(): LogMelFeatureBatch {
    if (this.pending.length < this.config.frameLengthSamples) {
      return createFeatureBatch(new Float32Array(0), 0, this.config.melBinCount);
    }

    const frameCount =
      Math.floor(
        (this.pending.length - this.config.frameLengthSamples) / this.config.frameShiftSamples,
      ) + 1;
    const output = new Float32Array(frameCount * this.config.melBinCount);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      this.writeFrame(
        this.pending,
        frameIndex * this.config.frameShiftSamples,
        false,
        output,
        frameIndex * this.config.melBinCount,
      );
    }

    this.framesProduced += frameCount;
    this.dropConsumedFrameStarts(frameCount);
    return createFeatureBatch(output, frameCount, this.config.melBinCount);
  }

  private writeFrame(
    samples: Float32Array,
    startOffset: number,
    zeroPad: boolean,
    output: Float32Array,
    outputOffset: number,
  ): void {
    this.real.fill(0);
    this.imag.fill(0);

    for (let sampleIndex = 0; sampleIndex < this.config.frameLengthSamples; sampleIndex += 1) {
      const sourceIndex = startOffset + sampleIndex;
      const sample = sourceIndex < samples.length ? (samples[sourceIndex] ?? 0) : 0;
      if (!zeroPad && sourceIndex >= samples.length) {
        throw new Error('Cannot compute an unpadded log-Mel frame without enough samples.');
      }
      this.real[sampleIndex] = sample * (this.hannWindow[sampleIndex] ?? 0);
    }

    fftInPlace(this.real, this.imag, this.bitReversal, this.twiddleCos, this.twiddleSin);

    for (let bin = 0; bin < this.config.powerBinCount; bin += 1) {
      const real = this.real[bin] ?? 0;
      const imag = this.imag[bin] ?? 0;
      this.powerSpectrum[bin] = real * real + imag * imag;
    }

    for (let melBin = 0; melBin < this.config.melBinCount; melBin += 1) {
      let energy = 0;
      const filterOffset = melBin * this.config.powerBinCount;
      for (let bin = 0; bin < this.config.powerBinCount; bin += 1) {
        energy += (this.melFilterBank[filterOffset + bin] ?? 0) * (this.powerSpectrum[bin] ?? 0);
      }
      output[outputOffset + melBin] = Math.log(Math.max(energy, this.config.logFloor));
    }
  }

  private dropConsumedFrameStarts(frameCount: number): void {
    const dropSamples = frameCount * this.config.frameShiftSamples;
    if (dropSamples <= 0) {
      return;
    }
    this.pending = this.pending.slice(Math.min(dropSamples, this.pending.length));
  }
}

export function resolveLogMelFeatureConfig(
  config: LogMelFeatureConfig = defaultLogMelFeatureConfig,
): ResolvedLogMelFeatureConfig {
  const sampleRateHz = assertPositiveInteger(config.sampleRateHz, 'sampleRateHz');
  const melBinCount = assertPositiveInteger(config.melBinCount, 'melBinCount');
  const frameLengthMs = assertPositiveNumber(config.frameLengthMs, 'frameLengthMs');
  const frameShiftMs = assertPositiveNumber(config.frameShiftMs, 'frameShiftMs');
  const fftSize = assertPositiveInteger(config.fftSize, 'fftSize');
  const lowFreqHz = assertNonNegativeNumber(config.lowFreqHz, 'lowFreqHz');
  const highFreqHz = assertPositiveNumber(config.highFreqHz, 'highFreqHz');
  const dither = assertNonNegativeNumber(config.dither, 'dither');
  const logFloor = assertPositiveNumber(config.logFloor ?? 1e-10, 'logFloor');
  const frameLengthSamples = Math.round((sampleRateHz * frameLengthMs) / 1_000);
  const frameShiftSamples = Math.round((sampleRateHz * frameShiftMs) / 1_000);

  if (dither !== 0) {
    throw new Error('Log-Mel extraction is deterministic; non-zero dither is unsupported.');
  }
  if (!Number.isInteger(frameLengthSamples) || frameLengthSamples <= 0) {
    throw new Error('frameLengthMs must map to a positive integer sample count.');
  }
  if (!Number.isInteger(frameShiftSamples) || frameShiftSamples <= 0) {
    throw new Error('frameShiftMs must map to a positive integer sample count.');
  }
  if (!isPowerOfTwo(fftSize)) {
    throw new Error('fftSize must be a power of two.');
  }
  if (fftSize < frameLengthSamples) {
    throw new Error('fftSize must be at least frameLengthSamples.');
  }
  const nyquistHz = sampleRateHz / 2;
  if (highFreqHz <= lowFreqHz || highFreqHz > nyquistHz) {
    throw new Error('highFreqHz must be above lowFreqHz and at or below Nyquist.');
  }

  return {
    sampleRateHz,
    melBinCount,
    frameLengthMs,
    frameShiftMs,
    fftSize,
    lowFreqHz,
    highFreqHz,
    dither,
    snipEdges: config.snipEdges,
    logFloor,
    frameLengthSamples,
    frameShiftSamples,
    powerBinCount: fftSize / 2 + 1,
  };
}

export function extractLogMelFeatures(
  samples: Float32Array,
  config: LogMelFeatureConfig = defaultLogMelFeatureConfig,
): LogMelFeatureBatch {
  const extractor = new StreamingLogMelExtractor(config);
  return concatLogMelFeatureBatches([extractor.process(samples), extractor.finish()]);
}

export function concatLogMelFeatureBatches(
  batches: readonly LogMelFeatureBatch[],
): LogMelFeatureBatch {
  const firstBatch = batches[0];
  const melBinCount = firstBatch?.melBinCount ?? defaultLogMelFeatureConfig.melBinCount;
  const frameCount = batches.reduce((sum, batch) => sum + batch.frameCount, 0);
  const output = new Float32Array(frameCount * melBinCount);
  let outputOffset = 0;

  for (const batch of batches) {
    if (batch.melBinCount !== melBinCount) {
      throw new Error('Cannot concatenate log-Mel batches with different mel bin counts.');
    }
    output.set(batch.frames, outputOffset);
    outputOffset += batch.frames.length;
  }

  return createFeatureBatch(output, frameCount, melBinCount);
}

function createFeatureBatch(
  frames: Float32Array,
  frameCount: number,
  melBinCount: number,
): LogMelFeatureBatch {
  return { frames, frameCount, melBinCount };
}

function createHannWindow(frameLengthSamples: number): Float64Array {
  const window = new Float64Array(frameLengthSamples);
  if (frameLengthSamples === 1) {
    window[0] = 1;
    return window;
  }

  for (let index = 0; index < frameLengthSamples; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (frameLengthSamples - 1));
  }
  return window;
}

function createMelFilterBank(config: ResolvedLogMelFeatureConfig): Float64Array {
  const filterBank = new Float64Array(config.melBinCount * config.powerBinCount);
  const lowMel = hzToMel(config.lowFreqHz);
  const highMel = hzToMel(config.highFreqHz);
  const melPoints: number[] = [];
  for (let index = 0; index < config.melBinCount + 2; index += 1) {
    melPoints.push(lowMel + ((highMel - lowMel) * index) / (config.melBinCount + 1));
  }
  const hzPoints = melPoints.map(melToHz);
  const binFrequencies: number[] = [];
  for (let bin = 0; bin < config.powerBinCount; bin += 1) {
    binFrequencies.push((bin * config.sampleRateHz) / config.fftSize);
  }

  for (let melBin = 0; melBin < config.melBinCount; melBin += 1) {
    const leftHz = hzPoints[melBin] ?? 0;
    const centerHz = hzPoints[melBin + 1] ?? 0;
    const rightHz = hzPoints[melBin + 2] ?? 0;
    const leftWidth = centerHz - leftHz;
    const rightWidth = rightHz - centerHz;

    if (leftWidth <= 0 || rightWidth <= 0) {
      throw new Error('Invalid Mel filter spacing.');
    }

    for (let bin = 0; bin < config.powerBinCount; bin += 1) {
      const frequencyHz = binFrequencies[bin] ?? 0;
      let weight = 0;
      if (frequencyHz >= leftHz && frequencyHz <= centerHz) {
        weight = (frequencyHz - leftHz) / leftWidth;
      } else if (frequencyHz > centerHz && frequencyHz <= rightHz) {
        weight = (rightHz - frequencyHz) / rightWidth;
      }
      filterBank[melBin * config.powerBinCount + bin] = Math.max(0, weight);
    }
  }

  return filterBank;
}

function fftInPlace(
  real: Float64Array,
  imag: Float64Array,
  bitReversal: Uint32Array,
  twiddleCos: Float64Array,
  twiddleSin: Float64Array,
): void {
  const size = real.length;

  for (let index = 0; index < size; index += 1) {
    const reversedIndex = bitReversal[index] ?? 0;
    if (index < reversedIndex) {
      const realValue = real[index] ?? 0;
      const imagValue = imag[index] ?? 0;
      real[index] = real[reversedIndex] ?? 0;
      imag[index] = imag[reversedIndex] ?? 0;
      real[reversedIndex] = realValue;
      imag[reversedIndex] = imagValue;
    }
  }

  for (let fftSize = 2; fftSize <= size; fftSize *= 2) {
    const halfSize = fftSize / 2;
    const tableStep = size / fftSize;
    for (let offset = 0; offset < size; offset += fftSize) {
      for (let index = 0; index < halfSize; index += 1) {
        const twiddleIndex = index * tableStep;
        const evenIndex = offset + index;
        const oddIndex = evenIndex + halfSize;
        const realOdd = real[oddIndex] ?? 0;
        const imagOdd = imag[oddIndex] ?? 0;
        const wr = twiddleCos[twiddleIndex] ?? 0;
        const wi = twiddleSin[twiddleIndex] ?? 0;
        const tr = wr * realOdd - wi * imagOdd;
        const ti = wr * imagOdd + wi * realOdd;
        const realEven = real[evenIndex] ?? 0;
        const imagEven = imag[evenIndex] ?? 0;
        real[oddIndex] = realEven - tr;
        imag[oddIndex] = imagEven - ti;
        real[evenIndex] = realEven + tr;
        imag[evenIndex] = imagEven + ti;
      }
    }
  }
}

function createBitReversalTable(size: number): Uint32Array {
  const table = new Uint32Array(size);
  const bitCount = Math.log2(size);
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      reversed = (reversed << 1) | ((index >> bit) & 1);
    }
    table[index] = reversed;
  }
  return table;
}

function hzToMel(hz: number): number {
  return 2_595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2_595) - 1);
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertPositiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function assertNonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}
