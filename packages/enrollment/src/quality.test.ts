import { describe, expect, it } from 'vitest';
import { analyzeEnrollmentTakeQuality } from './quality';

const sampleRateHz = 16_000;

function makeTone(durationMs: number, amplitude: number): Float32Array {
  const sampleCount = Math.round((durationMs / 1_000) * sampleRateHz);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * amplitude;
  }
  return pcm;
}

function makePaddedSpeech(
  options: {
    readonly leadingMs?: number;
    readonly speechMs?: number;
    readonly trailingMs?: number;
    readonly amplitude?: number;
  } = {},
): Float32Array {
  const leading = new Float32Array(Math.round(((options.leadingMs ?? 250) / 1_000) * sampleRateHz));
  const speech = makeTone(options.speechMs ?? 1_600, options.amplitude ?? 0.1);
  const trailing = new Float32Array(
    Math.round(((options.trailingMs ?? 250) / 1_000) * sampleRateHz),
  );
  const pcm = new Float32Array(leading.length + speech.length + trailing.length);
  pcm.set(leading, 0);
  pcm.set(speech, leading.length);
  pcm.set(trailing, leading.length + speech.length);
  return pcm;
}

describe('enrollment take quality analyzer', () => {
  it('passes a clean local take without storing audio or transcript text in the report', () => {
    const report = analyzeEnrollmentTakeQuality({
      pcm: makePaddedSpeech(),
      sampleRateHz,
      referenceText: 'Tôi vừa update dashboard.',
      language: 'mixed',
      voiceCondition: 'normal',
      calibration: { normalRms: 0.07, roomNoiseRms: 0.004 },
      alignment: { recognizedText: 'tôi vừa update dashboard', confidence: 0.72 },
    });

    expect(report.status).toBe('pass');
    expect(report.reasonCodes).toEqual([]);
    expect(report.level.durationMs).toBeCloseTo(2_100, -1);
    expect(report.level.snrDb).toBeGreaterThan(12);
    expect(report.vad.activeSpeechDurationMs).toBeGreaterThan(1_400);
    expect(report.pace.status).toBe('in-range');
    expect(report.alignment.coverage).toBe(1);
    expect(report.privacy).toEqual({
      containsAudio: false,
      containsTranscriptText: false,
      localOnly: true,
    });
  });

  it('recommends retry for clipped or too-short takes', () => {
    const clipped = makePaddedSpeech({ speechMs: 100, amplitude: 1 });
    const report = analyzeEnrollmentTakeQuality({
      pcm: clipped,
      sampleRateHz,
      referenceText: 'Please read this sentence clearly.',
      language: 'en',
      voiceCondition: 'normal',
      calibration: { normalRms: 0.1, roomNoiseRms: 0.001 },
    });

    expect(report.status).toBe('retry');
    expect(report.reasonCodes).toContain('duration-too-short');
    expect(report.reasonCodes).toContain('clipping');
    expect(report.manualAcceptanceAllowed).toBe(true);
  });

  it('uses relative voice-condition and SNR checks as review guidance', () => {
    const report = analyzeEnrollmentTakeQuality({
      pcm: makePaddedSpeech({ amplitude: 0.03 }),
      sampleRateHz,
      referenceText: 'Hãy nói rõ câu này.',
      language: 'vi',
      voiceCondition: 'projected',
      calibration: { normalRms: 0.1, roomNoiseRms: 0.006 },
      alignment: { recognizedText: 'hãy nói rõ câu này', confidence: 0.8 },
    });

    expect(report.status).toBe('review');
    expect(report.reasonCodes).toContain('condition-too-quiet');
    expect(report.reasonCodes).toContain('low-snr');
  });

  it('does not reject solely for low base-model confidence or unavailable alignment', () => {
    const lowConfidence = analyzeEnrollmentTakeQuality({
      pcm: makePaddedSpeech(),
      sampleRateHz,
      referenceText: 'Tôi nói rõ từng câu.',
      language: 'vi',
      voiceCondition: 'normal',
      calibration: { normalRms: 0.07, roomNoiseRms: 0.003 },
      alignment: { recognizedText: 'tôi nói rõ từng câu', confidence: 0.2 },
    });
    const unavailable = analyzeEnrollmentTakeQuality({
      pcm: makePaddedSpeech(),
      sampleRateHz,
      referenceText: 'Tôi nói rõ từng câu.',
      language: 'vi',
      voiceCondition: 'normal',
      calibration: { normalRms: 0.07, roomNoiseRms: 0.003 },
    });

    expect(lowConfidence.status).toBe('review');
    expect(lowConfidence.reasonCodes).toContain('low-base-model-confidence');
    expect(lowConfidence.summary).toMatch(/valid accents/i);
    expect(unavailable.reasonCodes).toEqual(['alignment-unavailable']);
    expect(unavailable.status).toBe('review');
  });

  it('flags likely VAD truncation at the beginning or end of a take', () => {
    const report = analyzeEnrollmentTakeQuality({
      pcm: makePaddedSpeech({ leadingMs: 0, trailingMs: 0, speechMs: 1_000 }),
      sampleRateHz,
      referenceText: 'Please read this sentence clearly.',
      language: 'en',
      voiceCondition: 'normal',
      calibration: { normalRms: 0.07, roomNoiseRms: 0.002 },
      alignment: { recognizedText: 'please read this sentence clearly', confidence: 0.7 },
    });

    expect(report.status).toBe('retry');
    expect(report.reasonCodes).toContain('vad-missing-start');
    expect(report.reasonCodes).toContain('vad-missing-end');
  });
});
