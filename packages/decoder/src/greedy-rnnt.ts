export type GreedyRnntLogits = ArrayLike<number>;

export interface GreedyRnntDecoderOptions {
  readonly blankId: number;
  readonly vocabularySize: number;
  readonly maxSymbolsPerFrame: number;
  readonly initialTokenId?: number;
  readonly maxTotalSymbols?: number;
  readonly maxScoreAdjustment?: number;
}

export interface GreedyRnntDecodeContext {
  readonly frameIndex: number;
  readonly frameOffset: number;
  readonly symbolIndexForFrame: number;
  readonly lastTokenId: number;
  readonly totalSymbols: number;
  readonly emittedTokens: readonly number[];
}

export type GreedyRnntLogitsProvider = (
  context: GreedyRnntDecodeContext,
) => GreedyRnntLogits | Promise<GreedyRnntLogits>;

export interface GreedyRnntTokenScoreAdjustment {
  readonly tokenId: number;
  readonly score: number;
  readonly matchedVocabularyIds?: readonly string[];
}

export type GreedyRnntScoreAdjuster = (
  context: GreedyRnntDecodeContext,
) => readonly GreedyRnntTokenScoreAdjustment[] | Promise<readonly GreedyRnntTokenScoreAdjustment[]>;

export interface GreedyRnntDecodeChunkOptions {
  readonly frameCount: number;
  readonly logitsForStep: GreedyRnntLogitsProvider;
  readonly scoreAdjustmentsForStep?: GreedyRnntScoreAdjuster;
}

export interface GreedyRnntArgmaxOptions {
  readonly scoreAdjustments?: readonly GreedyRnntTokenScoreAdjustment[];
  readonly maxScoreAdjustment?: number;
}

export interface GreedyRnntToken {
  readonly tokenId: number;
  readonly frameIndex: number;
  readonly symbolIndexForFrame: number;
  readonly score: number;
  readonly scoreAdjustment?: number;
  readonly adjustedScore?: number;
  readonly matchedVocabularyIds?: readonly string[];
}

export type GreedyRnntLimitReason = 'max-symbols-per-frame' | 'max-total-symbols';

export interface GreedyRnntDecoderState {
  readonly lastTokenId: number;
  readonly nextFrameIndex: number;
  readonly totalSymbols: number;
  readonly tokens: readonly number[];
}

export interface GreedyRnntDecodeResult {
  readonly tokens: readonly GreedyRnntToken[];
  readonly state: GreedyRnntDecoderState;
  readonly limitReached: boolean;
  readonly limitReason: GreedyRnntLimitReason | null;
  readonly limitedFrames: readonly number[];
}

export class GreedyRnntDecoder {
  private readonly blankId: number;
  private readonly vocabularySize: number;
  private readonly maxSymbolsPerFrame: number;
  private readonly initialTokenId: number;
  private readonly maxTotalSymbols: number | undefined;
  private readonly maxScoreAdjustment: number | undefined;
  private lastTokenId: number;
  private nextFrameIndex = 0;
  private totalSymbols = 0;
  private readonly tokens: number[] = [];

  constructor(options: GreedyRnntDecoderOptions) {
    this.vocabularySize = validatePositiveInteger(options.vocabularySize, 'vocabularySize');
    this.blankId = validateTokenId(options.blankId, 'blankId', this.vocabularySize);
    this.maxSymbolsPerFrame = validatePositiveInteger(
      options.maxSymbolsPerFrame,
      'maxSymbolsPerFrame',
    );
    this.initialTokenId = validateTokenId(
      options.initialTokenId ?? this.blankId,
      'initialTokenId',
      this.vocabularySize,
    );
    this.maxTotalSymbols = validateOptionalPositiveInteger(
      options.maxTotalSymbols,
      'maxTotalSymbols',
    );
    this.maxScoreAdjustment = validateOptionalNonNegativeNumber(
      options.maxScoreAdjustment,
      'maxScoreAdjustment',
    );
    this.lastTokenId = this.initialTokenId;
  }

  resetUtterance(): void {
    this.lastTokenId = this.initialTokenId;
    this.nextFrameIndex = 0;
    this.totalSymbols = 0;
    this.tokens.length = 0;
  }

  snapshotState(): GreedyRnntDecoderState {
    return {
      lastTokenId: this.lastTokenId,
      nextFrameIndex: this.nextFrameIndex,
      totalSymbols: this.totalSymbols,
      tokens: [...this.tokens],
    };
  }

  async decodeChunk(options: GreedyRnntDecodeChunkOptions): Promise<GreedyRnntDecodeResult> {
    const frameCount = validateNonNegativeInteger(options.frameCount, 'frameCount');
    const chunkTokens: GreedyRnntToken[] = [];
    const limitedFrames: number[] = [];
    let limitReason: GreedyRnntLimitReason | null = null;

    for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
      const frameIndex = this.nextFrameIndex + frameOffset;
      let blankSeen = false;

      for (
        let symbolIndexForFrame = 0;
        symbolIndexForFrame < this.maxSymbolsPerFrame;
        symbolIndexForFrame += 1
      ) {
        const context: GreedyRnntDecodeContext = {
          frameIndex,
          frameOffset,
          symbolIndexForFrame,
          lastTokenId: this.lastTokenId,
          totalSymbols: this.totalSymbols,
          emittedTokens: [...this.tokens],
        };
        const logits = await options.logitsForStep(context);
        const scoreAdjustments = await options.scoreAdjustmentsForStep?.(context);
        const selected = argmaxToken(logits, this.vocabularySize, {
          ...(scoreAdjustments !== undefined ? { scoreAdjustments } : {}),
          ...(this.maxScoreAdjustment !== undefined
            ? { maxScoreAdjustment: this.maxScoreAdjustment }
            : {}),
        });
        const { tokenId, score } = selected;

        if (tokenId === this.blankId) {
          blankSeen = true;
          break;
        }

        const token: GreedyRnntToken = {
          tokenId,
          frameIndex,
          symbolIndexForFrame,
          score,
          ...(selected.scoreAdjustment !== undefined
            ? { scoreAdjustment: selected.scoreAdjustment }
            : {}),
          ...(selected.adjustedScore !== undefined
            ? { adjustedScore: selected.adjustedScore }
            : {}),
          ...(selected.matchedVocabularyIds !== undefined
            ? { matchedVocabularyIds: selected.matchedVocabularyIds }
            : {}),
        };
        chunkTokens.push(token);
        this.tokens.push(tokenId);
        this.lastTokenId = tokenId;
        this.totalSymbols += 1;

        if (this.maxTotalSymbols !== undefined && this.totalSymbols >= this.maxTotalSymbols) {
          limitReason = 'max-total-symbols';
          this.nextFrameIndex = frameIndex + 1;
          return this.result(chunkTokens, limitedFrames, limitReason);
        }
      }

      if (!blankSeen) {
        limitedFrames.push(frameIndex);
        limitReason ??= 'max-symbols-per-frame';
      }
    }

    this.nextFrameIndex += frameCount;
    return this.result(chunkTokens, limitedFrames, limitReason);
  }

  private result(
    tokens: readonly GreedyRnntToken[],
    limitedFrames: readonly number[],
    limitReason: GreedyRnntLimitReason | null,
  ): GreedyRnntDecodeResult {
    return {
      tokens,
      state: this.snapshotState(),
      limitReached: limitReason !== null,
      limitReason,
      limitedFrames,
    };
  }
}

export function argmaxToken(
  logits: GreedyRnntLogits,
  vocabularySize: number,
  options: GreedyRnntArgmaxOptions = {},
): {
  readonly tokenId: number;
  readonly score: number;
  readonly scoreAdjustment?: number;
  readonly adjustedScore?: number;
  readonly matchedVocabularyIds?: readonly string[];
} {
  const checkedVocabularySize = validatePositiveInteger(vocabularySize, 'vocabularySize');
  const maxScoreAdjustment = validateOptionalNonNegativeNumber(
    options.maxScoreAdjustment,
    'maxScoreAdjustment',
  );
  if (logits.length < checkedVocabularySize) {
    throw new Error(
      `RNN-T logits length ${logits.length.toString()} is smaller than vocabulary size ${checkedVocabularySize.toString()}.`,
    );
  }

  const adjustments = normalizeScoreAdjustments(
    options.scoreAdjustments ?? [],
    checkedVocabularySize,
    maxScoreAdjustment,
  );
  let bestTokenId = 0;
  let bestScore = readLogit(logits, 0);
  let bestAdjustment = adjustments.get(0);
  let bestAdjustedScore = bestScore + (bestAdjustment?.score ?? 0);
  for (let tokenId = 1; tokenId < checkedVocabularySize; tokenId += 1) {
    const score = readLogit(logits, tokenId);
    const adjustment = adjustments.get(tokenId);
    const adjustedScore = score + (adjustment?.score ?? 0);
    if (adjustedScore > bestAdjustedScore) {
      bestTokenId = tokenId;
      bestScore = score;
      bestAdjustment = adjustment;
      bestAdjustedScore = adjustedScore;
    }
  }
  return {
    tokenId: bestTokenId,
    score: bestScore,
    ...(bestAdjustment !== undefined && bestAdjustment.score !== 0
      ? {
          scoreAdjustment: bestAdjustment.score,
          adjustedScore: bestAdjustedScore,
          ...(bestAdjustment.matchedVocabularyIds.length > 0
            ? { matchedVocabularyIds: bestAdjustment.matchedVocabularyIds }
            : {}),
        }
      : {}),
  };
}

function normalizeScoreAdjustments(
  adjustments: readonly GreedyRnntTokenScoreAdjustment[],
  vocabularySize: number,
  maxScoreAdjustment: number | undefined,
): ReadonlyMap<
  number,
  { readonly score: number; readonly matchedVocabularyIds: readonly string[] }
> {
  const byToken = new Map<number, { score: number; matchedVocabularyIds: Set<string> }>();
  for (const adjustment of adjustments) {
    const tokenId = validateTokenId(adjustment.tokenId, 'scoreAdjustment.tokenId', vocabularySize);
    if (!Number.isFinite(adjustment.score)) {
      throw new Error('scoreAdjustment.score must be a finite number.');
    }
    const current = byToken.get(tokenId) ?? { score: 0, matchedVocabularyIds: new Set<string>() };
    current.score += adjustment.score;
    for (const vocabularyId of adjustment.matchedVocabularyIds ?? []) {
      current.matchedVocabularyIds.add(vocabularyId);
    }
    byToken.set(tokenId, current);
  }

  return new Map(
    [...byToken.entries()].map(([tokenId, value]) => {
      const score =
        maxScoreAdjustment === undefined
          ? value.score
          : clamp(value.score, -maxScoreAdjustment, maxScoreAdjustment);
      return [
        tokenId,
        {
          score,
          matchedVocabularyIds: [...value.matchedVocabularyIds].sort(),
        },
      ];
    }),
  );
}

function readLogit(logits: GreedyRnntLogits, index: number): number {
  const value = logits[index];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `RNN-T logits must contain finite numbers; invalid value at index ${index.toString()}.`,
    );
  }
  return value;
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function validateOptionalPositiveInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  return validatePositiveInteger(value, name);
}

function validateOptionalNonNegativeNumber(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
  return value;
}

function validateNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function validateTokenId(value: number, name: string, vocabularySize: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= vocabularySize) {
    throw new Error(`${name} must be an integer token id in [0, vocabularySize).`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
