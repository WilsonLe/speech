import { describe, expect, it } from 'vitest';
import { argmaxToken, GreedyRnntDecoder, type GreedyRnntDecodeContext } from './greedy-rnnt';

const blankId = 0;
const vocabularySize = 5;

describe('GreedyRnntDecoder', () => {
  it('emits non-blank tokens and advances frame indices across chunks', async () => {
    const decoder = new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 2 });

    const first = await decoder.decodeChunk({
      frameCount: 2,
      logitsForStep: scriptedLogits([token(1), blank(), token(2), blank()]),
    });
    const second = await decoder.decodeChunk({
      frameCount: 1,
      logitsForStep: scriptedLogits([token(3), blank()]),
    });

    expect(first.tokens).toEqual([
      { tokenId: 1, frameIndex: 0, symbolIndexForFrame: 0, score: 10 },
      { tokenId: 2, frameIndex: 1, symbolIndexForFrame: 0, score: 10 },
    ]);
    expect(first.state).toMatchObject({ lastTokenId: 2, nextFrameIndex: 2, totalSymbols: 2 });
    expect(second.tokens).toEqual([
      { tokenId: 3, frameIndex: 2, symbolIndexForFrame: 0, score: 10 },
    ]);
    expect(second.state).toMatchObject({ lastTokenId: 3, nextFrameIndex: 3, totalSymbols: 3 });
    expect(second.state.tokens).toEqual([1, 2, 3]);
  });

  it('feeds the last emitted token into subsequent same-frame predictor steps', async () => {
    const decoder = new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 3 });
    const contexts: GreedyRnntDecodeContext[] = [];

    const result = await decoder.decodeChunk({
      frameCount: 1,
      logitsForStep: (context) => {
        contexts.push(context);
        if (context.symbolIndexForFrame === 0) return token(1);
        if (context.symbolIndexForFrame === 1) return token(4);
        return blank();
      },
    });

    expect(result.tokens.map((entry) => entry.tokenId)).toEqual([1, 4]);
    expect(contexts.map((entry) => entry.lastTokenId)).toEqual([blankId, 1, 4]);
    expect(contexts.map((entry) => entry.symbolIndexForFrame)).toEqual([0, 1, 2]);
  });

  it('enforces maxSymbolsPerFrame and reports limited frames without emitting blanks', async () => {
    const decoder = new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 2 });

    const result = await decoder.decodeChunk({
      frameCount: 2,
      logitsForStep: ({ frameIndex, symbolIndexForFrame }) => {
        if (frameIndex === 0) return token(symbolIndexForFrame + 1);
        return blank();
      },
    });

    expect(result.limitReached).toBe(true);
    expect(result.limitReason).toBe('max-symbols-per-frame');
    expect(result.limitedFrames).toEqual([0]);
    expect(result.tokens.map((entry) => entry.tokenId)).toEqual([1, 2]);
    expect(result.state).toMatchObject({ lastTokenId: 2, nextFrameIndex: 2, totalSymbols: 2 });
  });

  it('can cap total utterance symbols independently of the per-frame limit', async () => {
    const decoder = new GreedyRnntDecoder({
      blankId,
      vocabularySize,
      maxSymbolsPerFrame: 4,
      maxTotalSymbols: 3,
    });

    const result = await decoder.decodeChunk({
      frameCount: 2,
      logitsForStep: ({ symbolIndexForFrame }) => token(symbolIndexForFrame + 1),
    });

    expect(result.limitReached).toBe(true);
    expect(result.limitReason).toBe('max-total-symbols');
    expect(result.tokens.map((entry) => entry.tokenId)).toEqual([1, 2, 3]);
    expect(result.state).toMatchObject({ lastTokenId: 3, nextFrameIndex: 1, totalSymbols: 3 });
  });

  it('resets utterance state to the configured initial token', async () => {
    const decoder = new GreedyRnntDecoder({
      blankId,
      vocabularySize,
      maxSymbolsPerFrame: 2,
      initialTokenId: 4,
    });
    const observedLastTokens: number[] = [];

    await decoder.decodeChunk({
      frameCount: 1,
      logitsForStep: (context) => {
        observedLastTokens.push(context.lastTokenId);
        return context.symbolIndexForFrame === 0 ? token(1) : blank();
      },
    });
    decoder.resetUtterance();
    await decoder.decodeChunk({
      frameCount: 1,
      logitsForStep: (context) => {
        observedLastTokens.push(context.lastTokenId);
        return blank();
      },
    });

    expect(observedLastTokens).toEqual([4, 1, 4]);
    expect(decoder.snapshotState()).toMatchObject({
      lastTokenId: 4,
      nextFrameIndex: 1,
      totalSymbols: 0,
    });
    expect(decoder.snapshotState().tokens).toEqual([]);
  });

  it('accepts an empty chunk without requesting logits', async () => {
    const decoder = new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 1 });
    let requested = false;

    const result = await decoder.decodeChunk({
      frameCount: 0,
      logitsForStep: () => {
        requested = true;
        return blank();
      },
    });

    expect(requested).toBe(false);
    expect(result).toMatchObject({ limitReached: false, limitReason: null, tokens: [] });
    expect(result.state).toMatchObject({ nextFrameIndex: 0, totalSymbols: 0 });
  });

  it('rejects invalid configuration, chunk sizes, and logits', async () => {
    expect(
      () => new GreedyRnntDecoder({ blankId: 5, vocabularySize, maxSymbolsPerFrame: 1 }),
    ).toThrow(/blankId/);
    expect(() => new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 0 })).toThrow(
      /maxSymbolsPerFrame/,
    );

    const decoder = new GreedyRnntDecoder({ blankId, vocabularySize, maxSymbolsPerFrame: 1 });
    await expect(decoder.decodeChunk({ frameCount: -1, logitsForStep: blank })).rejects.toThrow(
      /frameCount/,
    );
    await expect(
      decoder.decodeChunk({ frameCount: 1, logitsForStep: () => [0, 1] }),
    ).rejects.toThrow(/logits length/);
    await expect(
      decoder.decodeChunk({ frameCount: 1, logitsForStep: () => [0, Number.NaN, 0, 0, 0] }),
    ).rejects.toThrow(/finite/);
  });
});

describe('argmaxToken', () => {
  it('chooses the first maximum token deterministically', () => {
    expect(argmaxToken([0, 2, 2, 1, -1], vocabularySize)).toEqual({ tokenId: 1, score: 2 });
  });

  it('ignores logits beyond the declared vocabulary size', () => {
    expect(argmaxToken([0, 1, 2, 3, 4, 100], vocabularySize)).toEqual({ tokenId: 4, score: 4 });
  });
});

function token(tokenId: number): Float32Array {
  const logits = new Float32Array(vocabularySize).fill(-10);
  logits[tokenId] = 10;
  return logits;
}

function blank(): Float32Array {
  return token(blankId);
}

function scriptedLogits(logits: readonly Float32Array[]) {
  let index = 0;
  return () => {
    const next = logits[index];
    index += 1;
    if (next === undefined) throw new Error('Synthetic logits script was exhausted.');
    return next;
  };
}
