import { describe, expect, it } from 'vitest';
import { UtteranceFinalizationController } from './finalization';

describe('UtteranceFinalizationController', () => {
  it('emits low-flicker partials and one final result for an utterance', () => {
    const controller = new UtteranceFinalizationController();

    expect(controller.startUtterance({ utteranceId: 'utt-1' })).toEqual({
      state: 'listening',
      utteranceId: 'utt-1',
      committed: [],
      provisional: [],
      latest: [],
    });
    controller.updatePartial({ utteranceId: 'utt-1', hypothesis: [1, 2, 3] });
    controller.updatePartial({ utteranceId: 'utt-1', hypothesis: [1, 2, 4] });
    const partial = controller.updatePartial({ utteranceId: 'utt-1', hypothesis: [1, 2, 5] });

    expect(partial).toMatchObject({
      type: 'partial',
      utteranceId: 'utt-1',
      committed: [],
      committedDelta: [],
      provisional: [1, 2, 5],
      stablePrefix: [1, 2],
    });

    const final = controller.finalizeUtterance({ utteranceId: 'utt-1', hypothesis: [1, 2, 6] });

    expect(final).toEqual({
      type: 'final',
      utteranceId: 'utt-1',
      tokens: [1, 2, 6],
      committedDelta: [1, 2, 6],
      latest: [1, 2, 6],
      committedRevisionBlocked: false,
      committedCorrected: false,
    });
    expect(controller.snapshot()).toEqual({
      state: 'finalized',
      utteranceId: 'utt-1',
      committed: [1, 2, 6],
      provisional: [],
      latest: [1, 2, 6],
    });
  });

  it('uses the latest partial hypothesis when finalizing without an explicit final hypothesis', () => {
    const controller = new UtteranceFinalizationController({ provisionalHoldbackTokens: 1 });

    controller.startUtterance({ utteranceId: 'utt-2' });
    controller.updatePartial({ utteranceId: 'utt-2', hypothesis: [3, 4, 5] });
    controller.updatePartial({ utteranceId: 'utt-2', hypothesis: [3, 4, 6] });
    controller.updatePartial({ utteranceId: 'utt-2', hypothesis: [3, 4, 7] });

    const final = controller.finalizeUtterance({ utteranceId: 'utt-2' });

    expect(final.tokens).toEqual([3, 4, 7]);
    expect(final.committedDelta).toEqual([4, 7]);
    expect(controller.snapshot().state).toBe('finalized');
  });

  it('rejects partials and duplicate finals after finalization', () => {
    const controller = new UtteranceFinalizationController();
    controller.startUtterance({ utteranceId: 'utt-3' });
    controller.updatePartial({ utteranceId: 'utt-3', hypothesis: [1] });
    controller.finalizeUtterance({ utteranceId: 'utt-3' });

    expect(() => controller.updatePartial({ utteranceId: 'utt-3', hypothesis: [1, 2] })).toThrow(
      /no active listening utterance/,
    );
    expect(() => controller.finalizeUtterance({ utteranceId: 'utt-3' })).toThrow(
      /no active listening utterance/,
    );
  });

  it('validates start, update, and utterance id sequencing', () => {
    const controller = new UtteranceFinalizationController();

    expect(() => controller.startUtterance({ utteranceId: '   ' })).toThrow(/utteranceId/);
    expect(() => controller.updatePartial({ utteranceId: 'missing', hypothesis: [] })).toThrow(
      /no active listening utterance/,
    );

    controller.startUtterance({ utteranceId: 'active' });
    expect(() => controller.startUtterance({ utteranceId: 'next' })).toThrow(/still active/);
    expect(() => controller.updatePartial({ utteranceId: 'other', hypothesis: [] })).toThrow(
      /expected utterance active/,
    );
    expect(() => controller.finalizeUtterance({ utteranceId: 'other' })).toThrow(
      /expected utterance active/,
    );
  });

  it('resets state when a new utterance starts after finalization', () => {
    const controller = new UtteranceFinalizationController({ provisionalHoldbackTokens: 0 });

    controller.startUtterance({ utteranceId: 'old' });
    controller.updatePartial({ utteranceId: 'old', hypothesis: [8, 9] });
    controller.updatePartial({ utteranceId: 'old', hypothesis: [8, 10] });
    controller.updatePartial({ utteranceId: 'old', hypothesis: [8, 11] });
    expect(controller.snapshot().committed).toEqual([8]);
    controller.finalizeUtterance({ utteranceId: 'old', hypothesis: [8, 12] });

    expect(controller.startUtterance({ utteranceId: 'new' })).toEqual({
      state: 'listening',
      utteranceId: 'new',
      committed: [],
      provisional: [],
      latest: [],
    });
    expect(controller.updatePartial({ utteranceId: 'new', hypothesis: [1, 2] })).toMatchObject({
      committed: [],
      provisional: [1, 2],
    });
  });

  it('can reset manually to abandon an active utterance', () => {
    const controller = new UtteranceFinalizationController();

    controller.startUtterance({ utteranceId: 'abandon' });
    controller.updatePartial({ utteranceId: 'abandon', hypothesis: [1, 2, 3] });
    controller.reset();

    expect(controller.snapshot()).toEqual({
      state: 'idle',
      utteranceId: null,
      committed: [],
      provisional: [],
      latest: [],
    });
    expect(() => controller.finalizeUtterance({ utteranceId: 'abandon' })).toThrow(
      /no active listening utterance/,
    );
  });

  it('blocks divergent final rewrites unless final correction is enabled explicitly', () => {
    const conservative = new UtteranceFinalizationController({ provisionalHoldbackTokens: 0 });
    conservative.startUtterance({ utteranceId: 'conservative' });
    conservative.updatePartial({ utteranceId: 'conservative', hypothesis: [1, 2] });
    conservative.updatePartial({ utteranceId: 'conservative', hypothesis: [1, 3] });
    conservative.updatePartial({ utteranceId: 'conservative', hypothesis: [1, 4] });

    const blocked = conservative.finalizeUtterance({
      utteranceId: 'conservative',
      hypothesis: [9, 9],
    });

    expect(blocked.tokens).toEqual([1]);
    expect(blocked.committedRevisionBlocked).toBe(true);
    expect(blocked.committedCorrected).toBe(false);

    const correcting = new UtteranceFinalizationController({
      provisionalHoldbackTokens: 0,
      allowFinalCorrection: true,
    });
    correcting.startUtterance({ utteranceId: 'correcting' });
    correcting.updatePartial({ utteranceId: 'correcting', hypothesis: [1, 2] });
    correcting.updatePartial({ utteranceId: 'correcting', hypothesis: [1, 3] });
    correcting.updatePartial({ utteranceId: 'correcting', hypothesis: [1, 4] });

    const corrected = correcting.finalizeUtterance({
      utteranceId: 'correcting',
      hypothesis: [9, 9],
    });

    expect(corrected.tokens).toEqual([9, 9]);
    expect(corrected.committedRevisionBlocked).toBe(false);
    expect(corrected.committedCorrected).toBe(true);
  });
});
