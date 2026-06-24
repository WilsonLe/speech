import { describe, expect, it } from 'vitest';
import { calculatePcmLevelMetrics, downmixToMono } from './pcm';

describe('PCM helpers', () => {
  it('downmixes multiple channels to mono without changing sample order', () => {
    const left = new Float32Array([0.2, -0.4, 0.6]);
    const right = new Float32Array([0.4, 0.2, -0.2]);
    const output = new Float32Array(3);

    const sampleCount = downmixToMono([left, right], output);

    expect(sampleCount).toBe(3);
    expect(Array.from(output)).toEqual([
      0.30000001192092896, -0.10000000149011612, 0.20000001788139343,
    ]);
  });

  it('calculates peak, RMS, and clipping ratio', () => {
    const metrics = calculatePcmLevelMetrics(new Float32Array([0, 0.5, -1, 0.25]), 4, 0.98);

    expect(metrics.sampleCount).toBe(4);
    expect(metrics.peak).toBe(1);
    expect(metrics.rms).toBeCloseTo(0.5728, 4);
    expect(metrics.clippedSamples).toBe(1);
    expect(metrics.clippingRatio).toBe(0.25);
  });
});
