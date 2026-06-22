export type GreedyRnntLogits = ArrayLike<number>;

export interface GreedyRnntDecoderOptions {
  readonly blankId: number;
  readonly vocabularySize: number;
  readonly maxSymbolsPerFrame: number;
  readonly initialTokenId?: number;
  readonly maxTotalSymbols?: number;
}

export interface GreedyRnntDecodeContext {
  readonly frameIndex: number;
  readonly frameOffset: number;
  readonly symbolIndexForFrame: number;
  readonly lastTokenId: number;
  readonly totalSymbols: number;
}

export type GreedyRnntLogitsProvider = (
  context: GreedyRnntDecodeContext,
) => GreedyRnntLogits | Promise<GreedyRnntLogits>;

export interface GreedyRnntDecodeChunkOptions {
  readonly frameCount: number;
  readonly logitsForStep: GreedyRnntLogitsProvider;
}

export interface GreedyRnntToken {
  readonly tokenId: number;
  readonly frameIndex: number;
  readonly symbolIndexForFrame: number;
  readonly score: number;
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
        const logits = await options.logitsForStep({
          frameIndex,
          frameOffset,
          symbolIndexForFrame,
          lastTokenId: this.lastTokenId,
          totalSymbols: this.totalSymbols,
        });
        const { tokenId, score } = argmaxToken(logits, this.vocabularySize);

        if (tokenId === this.blankId) {
          blankSeen = true;
          break;
        }

        const token: GreedyRnntToken = {
          tokenId,
          frameIndex,
          symbolIndexForFrame,
          score,
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
): { readonly tokenId: number; readonly score: number } {
  const checkedVocabularySize = validatePositiveInteger(vocabularySize, 'vocabularySize');
  if (logits.length < checkedVocabularySize) {
    throw new Error(
      `RNN-T logits length ${logits.length.toString()} is smaller than vocabulary size ${checkedVocabularySize.toString()}.`,
    );
  }

  let bestTokenId = 0;
  let bestScore = readLogit(logits, 0);
  for (let tokenId = 1; tokenId < checkedVocabularySize; tokenId += 1) {
    const score = readLogit(logits, tokenId);
    if (score > bestScore) {
      bestTokenId = tokenId;
      bestScore = score;
    }
  }
  return { tokenId: bestTokenId, score: bestScore };
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
