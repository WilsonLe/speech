import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  StreamingLogMelExtractor,
  concatLogMelFeatureBatches,
  defaultLogMelFeatureConfig,
  extractLogMelFeatures,
  resolveLogMelFeatureConfig,
  type LogMelFeatureConfig,
} from './log-mel';

interface ReferenceFixtureBundle {
  readonly config: LogMelFeatureConfig;
  readonly fixtures: readonly ReferenceFixture[];
}

interface ReferenceFixture {
  readonly name: string;
  readonly sampleCount: number;
  readonly frameCount: number;
  readonly melBinCount: number;
  readonly features: readonly (readonly number[])[];
}

const referenceFixtureUrl = new URL(
  '../../../test-data/expected/log-mel-reference.json',
  import.meta.url,
);
const referenceFixture = JSON.parse(
  readFileSync(referenceFixtureUrl, 'utf8'),
) as ReferenceFixtureBundle;

describe('log-Mel feature extraction', () => {
  it('resolves the default 16 kHz 80-bin frame configuration', () => {
    const config = resolveLogMelFeatureConfig(defaultLogMelFeatureConfig);

    expect(config.frameLengthSamples).toBe(400);
    expect(config.frameShiftSamples).toBe(160);
    expect(config.powerBinCount).toBe(257);
    expect(config.melBinCount).toBe(80);
  });

  it('matches checked-in Python reference fixtures', () => {
    for (const fixture of referenceFixture.fixtures) {
      const samples = createFixtureSamples(fixture.name, fixture.sampleCount);
      const features = extractLogMelFeatures(samples, referenceFixture.config);
      const expected = flatten(fixture.features);

      expect(features.frameCount, fixture.name).toBe(fixture.frameCount);
      expect(features.melBinCount, fixture.name).toBe(fixture.melBinCount);
      expect(features.frames.length, fixture.name).toBe(expected.length);
      expect(maxAbsDiff(features.frames, expected), fixture.name).toBeLessThan(1e-3);
    }
  });

  it('matches whole-buffer output when PCM arrives in uneven chunks', () => {
    const samples = createFixtureSamples('sine_440hz', 1_600);
    const whole = extractLogMelFeatures(samples, referenceFixture.config);
    const chunked = processInChunks(samples, referenceFixture.config, [17, 128, 511, 3]);

    expect(chunked.frameCount).toBe(whole.frameCount);
    expect(chunked.melBinCount).toBe(whole.melBinCount);
    expect(maxAbsDiff(chunked.frames, whole.frames)).toBeLessThan(1e-6);
  });

  it('pads one final incomplete frame only when snipEdges is disabled', () => {
    const short = createFixtureSamples('sine_440hz', 200);
    const snipped = extractLogMelFeatures(short, { ...referenceFixture.config, snipEdges: true });
    const padded = extractLogMelFeatures(short, { ...referenceFixture.config, snipEdges: false });

    expect(snipped.frameCount).toBe(0);
    expect(snipped.frames).toHaveLength(0);
    expect(padded.frameCount).toBe(1);
    expect(padded.frames).toHaveLength(referenceFixture.config.melBinCount);
    expect(maxAbs(padded.frames)).toBeGreaterThan(0);
  });

  it('rejects nondeterministic dither in browser feature extraction', () => {
    expect(() =>
      resolveLogMelFeatureConfig({
        ...referenceFixture.config,
        dither: 1,
      }),
    ).toThrow(/dither/i);
  });
});

function processInChunks(
  samples: Float32Array,
  config: LogMelFeatureConfig,
  chunkSizes: readonly number[],
) {
  const extractor = new StreamingLogMelExtractor(config);
  const batches = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < samples.length) {
    const chunkSize = chunkSizes[chunkIndex % chunkSizes.length] ?? 1;
    const nextOffset = Math.min(samples.length, offset + chunkSize);
    batches.push(extractor.process(samples.subarray(offset, nextOffset)));
    offset = nextOffset;
    chunkIndex += 1;
  }

  batches.push(extractor.finish());
  return concatLogMelFeatureBatches(batches);
}

function createFixtureSamples(name: string, sampleCount: number): Float32Array {
  const samples = new Float32Array(sampleCount);
  if (name === 'silence') {
    return samples;
  }
  if (name === 'impulse') {
    samples[320] = 1;
    return samples;
  }
  if (name === 'sine_440hz') {
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / 16_000);
    }
    return samples;
  }
  if (name === 'clipped_square') {
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = Math.floor(index / 40) % 2 === 0 ? 1 : -1;
    }
    return samples;
  }

  throw new Error(`Unknown fixture: ${name}`);
}

function flatten(frames: readonly (readonly number[])[]): Float32Array {
  const totalLength = frames.reduce((sum, frame) => sum + frame.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.length;
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
