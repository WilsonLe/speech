export interface PcmLevelMetrics {
  readonly sampleCount: number;
  readonly peak: number;
  readonly rms: number;
  readonly clippedSamples: number;
  readonly clippingRatio: number;
}

const defaultClipThreshold = 0.98;

export function downmixToMono(
  inputChannels: readonly Float32Array[],
  output: Float32Array,
): number {
  const firstChannel = inputChannels[0];
  if (!firstChannel || output.length === 0) {
    return 0;
  }

  let sampleCount = Math.min(firstChannel.length, output.length);
  for (const channel of inputChannels) {
    sampleCount = Math.min(sampleCount, channel.length);
  }

  if (sampleCount === 0) {
    return 0;
  }

  if (inputChannels.length === 1) {
    output.set(firstChannel.subarray(0, sampleCount), 0);
    return sampleCount;
  }

  const scale = 1 / inputChannels.length;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sum = 0;
    for (const channel of inputChannels) {
      sum += channel[sampleIndex] ?? 0;
    }
    output[sampleIndex] = sum * scale;
  }

  return sampleCount;
}

export function calculatePcmLevelMetrics(
  samples: Float32Array,
  sampleCount = samples.length,
  clipThreshold = defaultClipThreshold,
): PcmLevelMetrics {
  const boundedSampleCount = Math.min(sampleCount, samples.length);
  if (boundedSampleCount <= 0) {
    return { sampleCount: 0, peak: 0, rms: 0, clippedSamples: 0, clippingRatio: 0 };
  }

  let peak = 0;
  let sumSquares = 0;
  let clippedSamples = 0;

  for (let sampleIndex = 0; sampleIndex < boundedSampleCount; sampleIndex += 1) {
    const sample = samples[sampleIndex] ?? 0;
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sumSquares += sample * sample;
    if (magnitude >= clipThreshold) {
      clippedSamples += 1;
    }
  }

  return {
    sampleCount: boundedSampleCount,
    peak,
    rms: Math.sqrt(sumSquares / boundedSampleCount),
    clippedSamples,
    clippingRatio: clippedSamples / boundedSampleCount,
  };
}
