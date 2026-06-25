export interface CtcForcedAlignmentOptionsV1 {
  readonly minimumFrameConfidence?: number;
  readonly minimumMeanTokenConfidence?: number;
  readonly tokenFrameWeight?: number;
  readonly blankFrameWeight?: number;
  readonly includeBlankFrames?: boolean;
}

export interface CtcForcedAlignmentInputV1 {
  readonly schemaVersion?: 1;
  readonly utteranceId?: string;
  readonly targetTokenIds: readonly number[];
  readonly frameLogits: Float32Array | readonly number[];
  readonly frameCount: number;
  readonly vocabularySize: number;
  readonly blankId: number;
  readonly options?: CtcForcedAlignmentOptionsV1;
}

export interface CtcFrameLabelV1 {
  readonly frameIndex: number;
  readonly stateIndex: number;
  readonly tokenId: number;
  readonly targetTokenIndex?: number;
  readonly blank: boolean;
  readonly confidence: number;
  readonly weight: number;
  readonly trainingMask: 0 | 1;
}

export interface CtcForcedAlignmentSummaryV1 {
  readonly frameCount: number;
  readonly targetTokenCount: number;
  readonly usableFrameCount: number;
  readonly excludedFrameCount: number;
  readonly blankFrameCount: number;
  readonly lowConfidenceFrameCount: number;
  readonly meanFrameConfidence: number;
  readonly meanTokenConfidence: number | null;
  readonly pathLogProbability: number;
  readonly status: 'aligned' | 'low-confidence-excluded';
  readonly exclusionReason?:
    | 'low-frame-confidence'
    | 'low-utterance-confidence'
    | 'no-usable-token-frames';
}

export interface CtcForcedAlignmentResultV1 {
  readonly schemaVersion: 1;
  readonly algorithmId: 'ctc-viterbi-forced-alignment-v1';
  readonly utteranceId?: string;
  readonly blankId: number;
  readonly vocabularySize: number;
  readonly targetTokenCount: number;
  readonly options: Required<CtcForcedAlignmentOptionsV1>;
  readonly summary: CtcForcedAlignmentSummaryV1;
  readonly frames: readonly CtcFrameLabelV1[];
  readonly privacy: {
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsTokenIds: true;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

const defaultOptions: Required<CtcForcedAlignmentOptionsV1> = {
  minimumFrameConfidence: 0.55,
  minimumMeanTokenConfidence: 0.45,
  tokenFrameWeight: 1,
  blankFrameWeight: 0,
  includeBlankFrames: false,
};

export function buildCtcForcedAlignment(
  input: CtcForcedAlignmentInputV1,
): CtcForcedAlignmentResultV1 {
  const frameCount = assertPositiveInteger(input.frameCount, 'frameCount');
  const vocabularySize = assertPositiveInteger(input.vocabularySize, 'vocabularySize');
  const blankId = assertNonNegativeInteger(input.blankId, 'blankId');
  if (blankId >= vocabularySize) {
    throw new Error('blankId must be within vocabularySize.');
  }
  const targetTokenIds = input.targetTokenIds.map((tokenId, index) => {
    const normalized = assertNonNegativeInteger(tokenId, `targetTokenIds[${index.toString()}]`);
    if (normalized >= vocabularySize) {
      throw new Error(`targetTokenIds[${index.toString()}] must be within vocabularySize.`);
    }
    if (normalized === blankId) {
      throw new Error(`targetTokenIds[${index.toString()}] must not be the CTC blank token.`);
    }
    return normalized;
  });
  if (targetTokenIds.length === 0) {
    throw new Error('targetTokenIds must contain at least one token.');
  }
  const logits = input.frameLogits;
  if (logits.length !== frameCount * vocabularySize) {
    throw new Error('frameLogits length must equal frameCount * vocabularySize.');
  }
  const options = normalizeOptions(input.options);
  const logProbabilities = computeFrameLogProbabilities(logits, frameCount, vocabularySize);
  const symbols = createExtendedTargetSymbols(targetTokenIds, blankId);
  const path = viterbiAlignCtc({
    logProbabilities,
    frameCount,
    vocabularySize,
    symbols,
  });
  const frames = path.states.map((stateIndex, frameIndex): CtcFrameLabelV1 => {
    const tokenId = symbols[stateIndex] ?? blankId;
    const blank = tokenId === blankId;
    const confidence = Math.exp(
      logProbabilities[frameIndex * vocabularySize + tokenId] ?? -Infinity,
    );
    const targetTokenIndex = blank ? undefined : Math.floor((stateIndex - 1) / 2);
    const frameIsUsable = blank
      ? options.includeBlankFrames
      : confidence >= options.minimumFrameConfidence;
    const baseWeight = blank ? options.blankFrameWeight : options.tokenFrameWeight;
    return {
      frameIndex,
      stateIndex,
      tokenId,
      ...(targetTokenIndex === undefined ? {} : { targetTokenIndex }),
      blank,
      confidence,
      weight: frameIsUsable ? confidence * baseWeight : 0,
      trainingMask: frameIsUsable && baseWeight > 0 ? 1 : 0,
    };
  });
  const tokenFrames = frames.filter((frame) => !frame.blank);
  const meanTokenConfidence =
    tokenFrames.length === 0 ? null : mean(tokenFrames.map((frame) => frame.confidence));
  const lowConfidenceFrameCount = frames.filter(
    (frame) => !frame.blank && frame.confidence < options.minimumFrameConfidence,
  ).length;
  let status: CtcForcedAlignmentSummaryV1['status'] = 'aligned';
  let exclusionReason: CtcForcedAlignmentSummaryV1['exclusionReason'];
  if (frames.every((frame) => frame.trainingMask === 0)) {
    status = 'low-confidence-excluded';
    exclusionReason = 'no-usable-token-frames';
  } else if (
    meanTokenConfidence !== null &&
    meanTokenConfidence < options.minimumMeanTokenConfidence
  ) {
    status = 'low-confidence-excluded';
    exclusionReason = 'low-utterance-confidence';
  } else if (lowConfidenceFrameCount > 0) {
    exclusionReason = 'low-frame-confidence';
  }
  const outputFrames =
    status === 'low-confidence-excluded'
      ? frames.map((frame) => ({ ...frame, weight: 0, trainingMask: 0 as const }))
      : frames;
  const usableFrameCount = outputFrames.filter((frame) => frame.trainingMask === 1).length;
  const summary: CtcForcedAlignmentSummaryV1 = {
    frameCount,
    targetTokenCount: targetTokenIds.length,
    usableFrameCount,
    excludedFrameCount: frameCount - usableFrameCount,
    blankFrameCount: outputFrames.filter((frame) => frame.blank).length,
    lowConfidenceFrameCount,
    meanFrameConfidence: mean(outputFrames.map((frame) => frame.confidence)),
    meanTokenConfidence,
    pathLogProbability: path.logProbability,
    status,
    ...(exclusionReason === undefined ? {} : { exclusionReason }),
  };
  return {
    schemaVersion: 1,
    algorithmId: 'ctc-viterbi-forced-alignment-v1',
    ...(input.utteranceId === undefined ? {} : { utteranceId: input.utteranceId }),
    blankId,
    vocabularySize,
    targetTokenCount: targetTokenIds.length,
    options,
    summary,
    frames: outputFrames,
    privacy: {
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsFeatureTensors: false,
      containsTokenIds: true,
      networkUpload: false,
      telemetry: false,
    },
  };
}

function normalizeOptions(
  options: CtcForcedAlignmentOptionsV1 | undefined,
): Required<CtcForcedAlignmentOptionsV1> {
  return {
    minimumFrameConfidence: assertUnitInterval(
      options?.minimumFrameConfidence ?? defaultOptions.minimumFrameConfidence,
      'minimumFrameConfidence',
    ),
    minimumMeanTokenConfidence: assertUnitInterval(
      options?.minimumMeanTokenConfidence ?? defaultOptions.minimumMeanTokenConfidence,
      'minimumMeanTokenConfidence',
    ),
    tokenFrameWeight: assertNonNegativeFinite(
      options?.tokenFrameWeight ?? defaultOptions.tokenFrameWeight,
      'tokenFrameWeight',
    ),
    blankFrameWeight: assertNonNegativeFinite(
      options?.blankFrameWeight ?? defaultOptions.blankFrameWeight,
      'blankFrameWeight',
    ),
    includeBlankFrames: options?.includeBlankFrames ?? defaultOptions.includeBlankFrames,
  };
}

function createExtendedTargetSymbols(targetTokenIds: readonly number[], blankId: number): number[] {
  const symbols: number[] = [];
  for (const tokenId of targetTokenIds) {
    symbols.push(blankId, tokenId);
  }
  symbols.push(blankId);
  return symbols;
}

function computeFrameLogProbabilities(
  logits: Float32Array | readonly number[],
  frameCount: number,
  vocabularySize: number,
): Float64Array {
  const output = new Float64Array(frameCount * vocabularySize);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const offset = frameIndex * vocabularySize;
    let maxLogit = -Infinity;
    for (let tokenId = 0; tokenId < vocabularySize; tokenId += 1) {
      const value = logits[offset + tokenId];
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error('frameLogits must contain only finite numbers.');
      }
      if (value > maxLogit) maxLogit = value;
    }
    let sumExp = 0;
    for (let tokenId = 0; tokenId < vocabularySize; tokenId += 1) {
      sumExp += Math.exp((logits[offset + tokenId] ?? 0) - maxLogit);
    }
    const logDenominator = maxLogit + Math.log(sumExp);
    for (let tokenId = 0; tokenId < vocabularySize; tokenId += 1) {
      output[offset + tokenId] = (logits[offset + tokenId] ?? 0) - logDenominator;
    }
  }
  return output;
}

function viterbiAlignCtc(input: {
  readonly logProbabilities: Float64Array;
  readonly frameCount: number;
  readonly vocabularySize: number;
  readonly symbols: readonly number[];
}): { readonly states: readonly number[]; readonly logProbability: number } {
  const stateCount = input.symbols.length;
  const backpointers = Array.from({ length: input.frameCount }, () =>
    new Int32Array(stateCount).fill(-1),
  );
  let previous = new Float64Array(stateCount).fill(-Infinity);
  previous[0] = frameSymbolLogProbability(input, 0, 0);
  if (stateCount > 1) {
    previous[1] = frameSymbolLogProbability(input, 0, 1);
  }

  for (let frameIndex = 1; frameIndex < input.frameCount; frameIndex += 1) {
    const current = new Float64Array(stateCount).fill(-Infinity);
    for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
      let bestPreviousState = stateIndex;
      let bestPreviousScore = previous[stateIndex] ?? -Infinity;
      if (stateIndex > 0 && (previous[stateIndex - 1] ?? -Infinity) > bestPreviousScore) {
        bestPreviousState = stateIndex - 1;
        bestPreviousScore = previous[stateIndex - 1] ?? -Infinity;
      }
      if (
        stateIndex > 1 &&
        canSkipCtcState(input.symbols, stateIndex) &&
        (previous[stateIndex - 2] ?? -Infinity) > bestPreviousScore
      ) {
        bestPreviousState = stateIndex - 2;
        bestPreviousScore = previous[stateIndex - 2] ?? -Infinity;
      }
      if (bestPreviousScore > -Infinity) {
        current[stateIndex] =
          bestPreviousScore + frameSymbolLogProbability(input, frameIndex, stateIndex);
        const backpointerRow = backpointers[frameIndex];
        if (backpointerRow === undefined) {
          throw new Error('CTC forced alignment backpointer row is missing.');
        }
        backpointerRow[stateIndex] = bestPreviousState;
      }
    }
    previous = current;
  }

  const endStates = [stateCount - 1, stateCount - 2].filter((stateIndex) => stateIndex >= 0);
  let bestEndState = endStates[0] ?? 0;
  let bestEndScore = previous[bestEndState] ?? -Infinity;
  for (const stateIndex of endStates.slice(1)) {
    const score = previous[stateIndex] ?? -Infinity;
    if (score > bestEndScore) {
      bestEndState = stateIndex;
      bestEndScore = score;
    }
  }
  if (bestEndScore === -Infinity) {
    throw new Error('CTC forced alignment could not align target tokens to the provided frames.');
  }

  const states = new Array<number>(input.frameCount);
  let state = bestEndState;
  for (let frameIndex = input.frameCount - 1; frameIndex >= 0; frameIndex -= 1) {
    states[frameIndex] = state;
    if (frameIndex > 0) {
      const backpointerRow = backpointers[frameIndex];
      const previousState = backpointerRow?.[state];
      if (previousState === undefined || previousState < 0) {
        throw new Error('CTC forced alignment backtracking failed.');
      }
      state = previousState;
    }
  }
  return { states, logProbability: bestEndScore };
}

function frameSymbolLogProbability(
  input: {
    readonly logProbabilities: Float64Array;
    readonly vocabularySize: number;
    readonly symbols: readonly number[];
  },
  frameIndex: number,
  stateIndex: number,
): number {
  const tokenId = input.symbols[stateIndex];
  if (tokenId === undefined) return -Infinity;
  return input.logProbabilities[frameIndex * input.vocabularySize + tokenId] ?? -Infinity;
}

function canSkipCtcState(symbols: readonly number[], stateIndex: number): boolean {
  const symbol = symbols[stateIndex];
  const previousSkipSymbol = symbols[stateIndex - 2];
  const previousStateSymbol = symbols[stateIndex - 1];
  return (
    symbol !== undefined &&
    previousSkipSymbol !== undefined &&
    symbol !== previousSkipSymbol &&
    symbol !== previousStateSymbol
  );
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function assertUnitInterval(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
  return value;
}

function assertNonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
  return value;
}
