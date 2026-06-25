import { describe, expect, it } from 'vitest';
import { buildCtcForcedAlignment } from './ctc-forced-alignment';

describe('CTC forced alignment', () => {
  it('aligns target tokens to a deterministic high-confidence Viterbi path', () => {
    const result = buildCtcForcedAlignment({
      utteranceId: 'utt-align-high',
      targetTokenIds: [1, 2, 3],
      frameCount: 7,
      vocabularySize: 5,
      blankId: 0,
      frameLogits: logitsForSymbols([0, 1, 0, 2, 0, 3, 0], 5),
      options: { minimumFrameConfidence: 0.7, minimumMeanTokenConfidence: 0.7 },
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      algorithmId: 'ctc-viterbi-forced-alignment-v1',
      utteranceId: 'utt-align-high',
      targetTokenCount: 3,
      privacy: {
        localOnly: true,
        containsRawAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        containsTokenIds: true,
      },
    });
    expect(result.frames.map((frame) => frame.tokenId)).toEqual([0, 1, 0, 2, 0, 3, 0]);
    expect(result.frames.map((frame) => frame.trainingMask)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    expect(
      result.frames.filter((frame) => frame.trainingMask === 1).map((frame) => frame.weight),
    ).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(result.summary).toMatchObject({
      frameCount: 7,
      targetTokenCount: 3,
      usableFrameCount: 3,
      excludedFrameCount: 4,
      blankFrameCount: 4,
      lowConfidenceFrameCount: 0,
      status: 'aligned',
    });
    expect(result.summary.meanTokenConfidence ?? 0).toBeGreaterThan(0.99);
  });

  it('keeps repeated target tokens separated by a blank state', () => {
    const result = buildCtcForcedAlignment({
      targetTokenIds: [2, 2],
      frameCount: 5,
      vocabularySize: 4,
      blankId: 0,
      frameLogits: logitsForSymbols([0, 2, 0, 2, 0], 4),
    });

    expect(result.frames.map((frame) => frame.tokenId)).toEqual([0, 2, 0, 2, 0]);
    expect(
      result.frames.filter((frame) => !frame.blank).map((frame) => frame.targetTokenIndex),
    ).toEqual([0, 1]);
  });

  it('excludes low-confidence alignments without dropping frames', () => {
    const result = buildCtcForcedAlignment({
      utteranceId: 'utt-align-low',
      targetTokenIds: [1, 2],
      frameCount: 5,
      vocabularySize: 5,
      blankId: 0,
      frameLogits: new Float32Array(25),
      options: { minimumFrameConfidence: 0.7, minimumMeanTokenConfidence: 0.7 },
    });

    expect(result.frames).toHaveLength(5);
    expect(result.frames.every((frame) => frame.trainingMask === 0 && frame.weight === 0)).toBe(
      true,
    );
    expect(result.summary).toMatchObject({
      frameCount: 5,
      usableFrameCount: 0,
      excludedFrameCount: 5,
      status: 'low-confidence-excluded',
      exclusionReason: 'no-usable-token-frames',
    });
  });

  it('rejects impossible target/logit contracts', () => {
    expect(() =>
      buildCtcForcedAlignment({
        targetTokenIds: [1, 2, 3],
        frameCount: 2,
        vocabularySize: 4,
        blankId: 0,
        frameLogits: logitsForSymbols([1, 2], 4),
      }),
    ).toThrow(/could not align/);
    expect(() =>
      buildCtcForcedAlignment({
        targetTokenIds: [0],
        frameCount: 1,
        vocabularySize: 4,
        blankId: 0,
        frameLogits: logitsForSymbols([0], 4),
      }),
    ).toThrow(/must not be the CTC blank/);
  });
});

function logitsForSymbols(symbols: readonly number[], vocabularySize: number): Float32Array {
  const logits = new Float32Array(symbols.length * vocabularySize);
  logits.fill(-6);
  symbols.forEach((symbol, frameIndex) => {
    logits[frameIndex * vocabularySize + symbol] = 6;
  });
  return logits;
}
