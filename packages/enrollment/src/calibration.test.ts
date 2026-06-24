import { describe, expect, it } from 'vitest';
import {
  calculateRelativeDb,
  estimateSnrDb,
  evaluateVoiceConditionGuidance,
  formatDbRange,
  getVoiceConditionTarget,
} from './calibration';

describe('enrollment microphone calibration guidance', () => {
  it('computes relative dB and SNR from RMS levels', () => {
    expect(calculateRelativeDb(0.1, 0.05)).toBeCloseTo(6.0206, 4);
    expect(estimateSnrDb(0.1, 0.01)).toBeCloseTo(20, 4);
  });

  it('requires room noise and a normal baseline before condition guidance', () => {
    const result = evaluateVoiceConditionGuidance(
      { rms: 0.05, peak: 0.2, clippingRatio: 0 },
      null,
      'normal',
    );

    expect(result.status).toBe('not-ready');
    expect(result.message).toMatch(/normal calibration sentence/i);
  });

  it('accepts whisper levels below the normal baseline', () => {
    const result = evaluateVoiceConditionGuidance(
      { rms: 0.025, peak: 0.08, clippingRatio: 0 },
      { normalRms: 0.1, roomNoiseRms: 0.001 },
      'whisper',
    );

    expect(result.status).toBe('in-range');
    expect(result.relativeDb).toBeCloseTo(-12.041, 3);
  });

  it('warns projected speech is not yelling and catches too-loud levels', () => {
    const target = getVoiceConditionTarget('projected');
    const result = evaluateVoiceConditionGuidance(
      { rms: 0.5, peak: 0.8, clippingRatio: 0 },
      { normalRms: 0.1, roomNoiseRms: 0.001 },
      'projected',
    );

    expect(target.instruction).toMatch(/Do not strain, scream/i);
    expect(formatDbRange(target)).toContain('relative to normal');
    expect(result.status).toBe('too-loud');
  });

  it('prioritizes clipping and low-SNR recovery guidance', () => {
    expect(
      evaluateVoiceConditionGuidance(
        { rms: 0.12, peak: 0.99, clippingRatio: 0.002 },
        { normalRms: 0.1, roomNoiseRms: 0.001 },
        'normal',
      ).status,
    ).toBe('clipping');

    expect(
      evaluateVoiceConditionGuidance(
        { rms: 0.11, peak: 0.2, clippingRatio: 0 },
        { normalRms: 0.1, roomNoiseRms: 0.05 },
        'normal',
      ).status,
    ).toBe('low-snr');
  });
});
