import { describe, expect, it } from 'vitest';
import {
  StreamingLinearResampler,
  calculateExpectedResampledSampleCount,
  resamplePcmLinear,
} from './resampler';

describe('StreamingLinearResampler', () => {
  it('returns an identity copy when sample rates match', () => {
    const input = new Float32Array([0, 0.25, -0.25, 1]);
    const resampler = new StreamingLinearResampler({
      sourceSampleRateHz: 16_000,
      targetSampleRateHz: 16_000,
    });

    const output = resampler.process(input);
    const final = resampler.finish();

    expect(output).not.toBe(input);
    expect(Array.from(output)).toEqual(Array.from(input));
    expect(final).toHaveLength(0);
    expect(resampler.state.outputSamplesProduced).toBe(input.length);
  });

  it('downsamples 48 kHz to 16 kHz at exact 3:1 positions', () => {
    const input = new Float32Array([0, 1, 2, 3, 4, 5, 6]);
    const output = resamplePcmLinear(input, { sourceSampleRateHz: 48_000 });

    expect(Array.from(output)).toEqual([0, 3, 6]);
  });

  it('matches whole-buffer output when data arrives in uneven chunks', () => {
    const input = createSine(48_000, 440, 0.25);
    const whole = resamplePcmLinear(input, { sourceSampleRateHz: 48_000 });
    const chunked = processInChunks(input, 48_000, [17, 128, 511, 3, 2048]);

    expect(chunked.length).toBe(whole.length);
    expect(maxAbsDiff(chunked, whole)).toBeLessThan(1e-6);
  });

  it('handles 44.1 kHz source sample rate without chunk-boundary drift', () => {
    const input = createSine(44_100, 1_000, 0.2);
    const whole = resamplePcmLinear(input, { sourceSampleRateHz: 44_100 });
    const chunked = processInChunks(input, 44_100, [100, 7, 509, 1_024]);

    expect(chunked.length).toBe(whole.length);
    expect(maxAbsDiff(chunked, whole)).toBeLessThan(1e-6);
    expect(whole.length).toBe(calculateExpectedResampledSampleCount(input.length, 44_100));
  });

  it('keeps silence silent and preserves bounded sine amplitude', () => {
    const silence = resamplePcmLinear(new Float32Array(4_800), { sourceSampleRateHz: 48_000 });
    const sine = resamplePcmLinear(createSine(48_000, 500, 0.1), { sourceSampleRateHz: 48_000 });

    expect(maxAbs(silence)).toBe(0);
    expect(maxAbs(sine)).toBeLessThanOrEqual(1);
    expect(maxAbs(sine)).toBeGreaterThan(0.9);
  });

  it('preserves an impulse across chunk boundaries', () => {
    const input = new Float32Array(32);
    input[15] = 1;

    const whole = resamplePcmLinear(input, { sourceSampleRateHz: 48_000 });
    const chunked = processInChunks(input, 48_000, [7, 8, 1, 16]);

    expect(chunked.length).toBe(whole.length);
    expect(maxAbsDiff(chunked, whole)).toBeLessThan(1e-6);
    expect(maxAbs(chunked)).toBe(1);
  });

  it('flushes short utterances on finish', () => {
    const resampler = new StreamingLinearResampler({ sourceSampleRateHz: 48_000 });

    const live = resampler.process(new Float32Array([0.5]));
    const final = resampler.finish();

    expect(live).toHaveLength(0);
    expect(Array.from(final)).toEqual([0.5]);
  });

  it('keeps streaming output count within one sample over a 30-minute synthetic stream', () => {
    const sourceRate = 48_000;
    const targetRate = 16_000;
    const thirtyMinutesSamples = sourceRate * 60 * 30;
    const chunk = new Float32Array(sourceRate / 10);
    const resampler = new StreamingLinearResampler({
      sourceSampleRateHz: sourceRate,
      targetSampleRateHz: targetRate,
    });
    let produced = 0;

    for (let offset = 0; offset < thirtyMinutesSamples; offset += chunk.length) {
      produced += resampler.process(chunk).length;
    }
    produced += resampler.finish().length;

    const expected = calculateExpectedResampledSampleCount(
      thirtyMinutesSamples,
      sourceRate,
      targetRate,
    );
    expect(produced).toBe(expected);
    expect(
      Math.abs(produced - thirtyMinutesSamples * (targetRate / sourceRate)),
    ).toBeLessThanOrEqual(1);
  });
});

function processInChunks(input: Float32Array, sourceSampleRateHz: number, chunkSizes: number[]) {
  const resampler = new StreamingLinearResampler({ sourceSampleRateHz });
  const outputs: Float32Array[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < input.length) {
    const chunkSize = chunkSizes[chunkIndex % chunkSizes.length] ?? 1;
    const nextOffset = Math.min(input.length, offset + chunkSize);
    outputs.push(resampler.process(input.subarray(offset, nextOffset)));
    offset = nextOffset;
    chunkIndex += 1;
  }

  outputs.push(resampler.finish());
  return concat(outputs);
}

function concat(chunks: readonly Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function createSine(
  sampleRateHz: number,
  frequencyHz: number,
  durationSeconds: number,
): Float32Array {
  const sampleCount = Math.floor(sampleRateHz * durationSeconds);
  const output = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    output[index] = Math.sin((2 * Math.PI * frequencyHz * index) / sampleRateHz);
  }
  return output;
}

function maxAbs(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function maxAbsDiff(left: Float32Array, right: Float32Array): number {
  expect(left.length).toBe(right.length);
  let peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    peak = Math.max(peak, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
  }
  return peak;
}
