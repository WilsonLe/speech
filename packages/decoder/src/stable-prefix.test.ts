import { describe, expect, it } from 'vitest';
import { longestCommonPrefix, StablePrefixController } from './stable-prefix';

describe('StablePrefixController', () => {
  it('waits for three hypotheses, commits only stable tokens, and holds back the provisional suffix', () => {
    const controller = new StablePrefixController();

    expect(controller.update([1, 2, 3, 4])).toMatchObject({
      committed: [],
      committedDelta: [],
      provisional: [1, 2, 3, 4],
      stablePrefix: [],
      historySize: 1,
    });
    expect(controller.update([1, 2, 3, 5])).toMatchObject({
      committed: [],
      committedDelta: [],
      provisional: [1, 2, 3, 5],
      stablePrefix: [],
      historySize: 2,
    });

    const third = controller.update([1, 2, 3, 6]);

    expect(third).toMatchObject({
      committed: [1],
      committedDelta: [1],
      provisional: [2, 3, 6],
      stablePrefix: [1, 2, 3],
      historySize: 3,
      finalized: false,
      committedRevisionBlocked: false,
    });
  });

  it('continues committing tokens as the rolling stable prefix advances', () => {
    const controller = new StablePrefixController();

    controller.update([10, 11, 12, 13]);
    controller.update([10, 11, 12, 14]);
    controller.update([10, 11, 12, 15]);
    const fourth = controller.update([10, 11, 12, 16]);

    expect(fourth.stablePrefix).toEqual([10, 11, 12]);
    expect(fourth.committed).toEqual([10]);
    expect(fourth.committedDelta).toEqual([]);

    const fifth = controller.update([10, 11, 12, 13, 17]);
    const sixth = controller.update([10, 11, 12, 13, 18]);
    const seventh = controller.update([10, 11, 12, 13, 19]);

    expect(fifth.committedDelta).toEqual([]);
    expect(sixth.committedDelta).toEqual([]);
    expect(seventh.stablePrefix).toEqual([10, 11, 12, 13]);
    expect(seventh.committed).toEqual([10, 11]);
    expect(seventh.committedDelta).toEqual([11]);
    expect(seventh.provisional).toEqual([12, 13, 19]);
  });

  it('never rewrites committed tokens during live updates', () => {
    const controller = new StablePrefixController({ provisionalHoldbackTokens: 0 });

    controller.update([1, 2, 3]);
    controller.update([1, 2, 4]);
    expect(controller.update([1, 2, 5]).committed).toEqual([1, 2]);

    const divergent = controller.update([9, 9, 9]);

    expect(divergent.committed).toEqual([1, 2]);
    expect(divergent.provisional).toEqual([]);
    expect(divergent.committedRevisionBlocked).toBe(false);
    expect(controller.snapshot().committed).toEqual([1, 2]);
  });

  it('reports a blocked live revision when a new stable prefix would contradict committed tokens', () => {
    const controller = new StablePrefixController({ provisionalHoldbackTokens: 0 });

    controller.update([1, 2, 3]);
    controller.update([1, 2, 4]);
    controller.update([1, 2, 5]);

    controller.update([9, 9]);
    controller.update([9, 9, 1]);
    const blocked = controller.update([9, 9, 2]);

    expect(blocked.stablePrefix).toEqual([9, 9]);
    expect(blocked.committed).toEqual([1, 2]);
    expect(blocked.committedDelta).toEqual([]);
    expect(blocked.committedRevisionBlocked).toBe(true);
  });

  it('finalizes by appending the latest provisional suffix when committed tokens still match', () => {
    const controller = new StablePrefixController();

    controller.update([1, 2, 3]);
    controller.update([1, 2, 4]);
    controller.update([1, 2, 5]);

    const result = controller.finalize([1, 2, 6, 7]);

    expect(result).toMatchObject({
      committed: [1, 2, 6, 7],
      committedDelta: [1, 2, 6, 7],
      provisional: [],
      latest: [1, 2, 6, 7],
      finalized: true,
      committedRevisionBlocked: false,
      committedCorrected: false,
    });
  });

  it('blocks final committed rewrites unless final correction is explicitly enabled', () => {
    const conservative = new StablePrefixController({ provisionalHoldbackTokens: 0 });
    conservative.update([1, 2]);
    conservative.update([1, 3]);
    conservative.update([1, 4]);

    const blocked = conservative.finalize([9, 9]);

    expect(blocked.committed).toEqual([1]);
    expect(blocked.committedDelta).toEqual([]);
    expect(blocked.committedRevisionBlocked).toBe(true);
    expect(blocked.committedCorrected).toBe(false);

    const correcting = new StablePrefixController({
      provisionalHoldbackTokens: 0,
      allowFinalCorrection: true,
    });
    correcting.update([1, 2]);
    correcting.update([1, 3]);
    correcting.update([1, 4]);

    const corrected = correcting.finalize([9, 9]);

    expect(corrected.committed).toEqual([9, 9]);
    expect(corrected.committedDelta).toEqual([9, 9]);
    expect(corrected.committedRevisionBlocked).toBe(false);
    expect(corrected.committedCorrected).toBe(true);
  });

  it('resets committed and history state at utterance boundaries', () => {
    const controller = new StablePrefixController({ provisionalHoldbackTokens: 0 });

    controller.update([1, 2]);
    controller.update([1, 3]);
    controller.update([1, 4]);
    expect(controller.snapshot().committed).toEqual([1]);

    controller.resetUtterance();

    expect(controller.snapshot()).toEqual({ committed: [], history: [], latest: [] });
    expect(controller.update([7, 8])).toMatchObject({
      committed: [],
      provisional: [7, 8],
      historySize: 1,
    });
  });

  it('validates options and token ids', () => {
    expect(() => new StablePrefixController({ historySize: 0 })).toThrow(/historySize/);
    expect(() => new StablePrefixController({ historySize: 2, minStableHypotheses: 3 })).toThrow(
      /minStableHypotheses/,
    );
    expect(() => new StablePrefixController({ provisionalHoldbackTokens: -1 })).toThrow(
      /provisionalHoldbackTokens/,
    );
    expect(() => new StablePrefixController().update([1, -1])).toThrow(/hypothesis\[1\]/);
  });
});

describe('longestCommonPrefix', () => {
  it('returns the shared prefix across all hypotheses', () => {
    expect(
      longestCommonPrefix([
        [1, 2, 3, 4],
        [1, 2, 3, 5],
        [1, 2, 6],
      ]),
    ).toEqual([1, 2]);
  });

  it('handles empty input and empty hypotheses', () => {
    expect(longestCommonPrefix([])).toEqual([]);
    expect(longestCommonPrefix([[1, 2], [], [1]])).toEqual([]);
  });
});
