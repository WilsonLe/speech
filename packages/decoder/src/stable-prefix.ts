export interface StablePrefixControllerOptions {
  readonly historySize?: number;
  readonly minStableHypotheses?: number;
  readonly provisionalHoldbackTokens?: number;
  readonly allowFinalCorrection?: boolean;
}

export interface StablePrefixResult {
  readonly committed: readonly number[];
  readonly committedDelta: readonly number[];
  readonly provisional: readonly number[];
  readonly latest: readonly number[];
  readonly stablePrefix: readonly number[];
  readonly historySize: number;
  readonly finalized: boolean;
  readonly committedRevisionBlocked: boolean;
  readonly committedCorrected: boolean;
}

export interface StablePrefixSnapshot {
  readonly committed: readonly number[];
  readonly history: readonly (readonly number[])[];
  readonly latest: readonly number[];
}

export class StablePrefixController {
  private readonly historyLimit: number;
  private readonly minStableHypotheses: number;
  private readonly provisionalHoldbackTokens: number;
  private readonly allowFinalCorrection: boolean;
  private readonly history: number[][] = [];
  private committed: number[] = [];

  constructor(options: StablePrefixControllerOptions = {}) {
    this.historyLimit = validatePositiveInteger(options.historySize ?? 3, 'historySize');
    this.minStableHypotheses = validatePositiveInteger(
      options.minStableHypotheses ?? Math.min(3, this.historyLimit),
      'minStableHypotheses',
    );
    if (this.minStableHypotheses > this.historyLimit) {
      throw new Error('minStableHypotheses must be less than or equal to historySize.');
    }
    this.provisionalHoldbackTokens = validateNonNegativeInteger(
      options.provisionalHoldbackTokens ?? 2,
      'provisionalHoldbackTokens',
    );
    this.allowFinalCorrection = options.allowFinalCorrection ?? false;
  }

  resetUtterance(): void {
    this.history.length = 0;
    this.committed = [];
  }

  snapshot(): StablePrefixSnapshot {
    return {
      committed: [...this.committed],
      history: this.history.map((hypothesis) => [...hypothesis]),
      latest: [...(this.history.at(-1) ?? [])],
    };
  }

  update(hypothesis: readonly number[]): StablePrefixResult {
    const latest = copyHypothesis(hypothesis);
    this.pushHypothesis(latest);

    const stablePrefix = this.computeStablePrefix();
    const targetCommitLength = Math.max(0, stablePrefix.length - this.provisionalHoldbackTokens);
    let committedDelta: number[] = [];
    let committedRevisionBlocked = false;

    if (targetCommitLength > this.committed.length) {
      const candidateCommitted = stablePrefix.slice(0, targetCommitLength);
      if (isPrefix(this.committed, candidateCommitted)) {
        committedDelta = candidateCommitted.slice(this.committed.length);
        this.committed = candidateCommitted;
      } else {
        committedRevisionBlocked = true;
      }
    } else if (stablePrefix.length > 0 && !isPrefix(this.committed, stablePrefix)) {
      committedRevisionBlocked = true;
    }

    return this.result({
      committedDelta,
      stablePrefix,
      latest,
      finalized: false,
      committedRevisionBlocked,
      committedCorrected: false,
    });
  }

  finalize(hypothesis?: readonly number[]): StablePrefixResult {
    const latest =
      hypothesis === undefined ? [...(this.history.at(-1) ?? [])] : copyHypothesis(hypothesis);
    if (hypothesis !== undefined) this.pushHypothesis(latest);

    const previousCommitted = this.committed;
    let committedDelta: number[] = [];
    let committedRevisionBlocked = false;
    let committedCorrected = false;

    if (this.allowFinalCorrection || isPrefix(previousCommitted, latest)) {
      committedCorrected = !isPrefix(previousCommitted, latest);
      committedDelta = committedCorrected ? [...latest] : latest.slice(previousCommitted.length);
      this.committed = [...latest];
    } else {
      committedRevisionBlocked = true;
    }

    return this.result({
      committedDelta,
      stablePrefix: [...latest],
      latest,
      finalized: true,
      committedRevisionBlocked,
      committedCorrected,
    });
  }

  private pushHypothesis(hypothesis: number[]): void {
    this.history.push(hypothesis);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
  }

  private computeStablePrefix(): number[] {
    if (this.history.length < this.minStableHypotheses) return [];
    return longestCommonPrefix(this.history);
  }

  private result(options: {
    readonly committedDelta: readonly number[];
    readonly stablePrefix: readonly number[];
    readonly latest: readonly number[];
    readonly finalized: boolean;
    readonly committedRevisionBlocked: boolean;
    readonly committedCorrected: boolean;
  }): StablePrefixResult {
    const provisional = isPrefix(this.committed, options.latest)
      ? options.latest.slice(this.committed.length)
      : [];
    return {
      committed: [...this.committed],
      committedDelta: [...options.committedDelta],
      provisional,
      latest: [...options.latest],
      stablePrefix: [...options.stablePrefix],
      historySize: this.history.length,
      finalized: options.finalized,
      committedRevisionBlocked: options.committedRevisionBlocked,
      committedCorrected: options.committedCorrected,
    };
  }
}

export function longestCommonPrefix(hypotheses: readonly (readonly number[])[]): number[] {
  if (hypotheses.length === 0) return [];
  const [first, ...rest] = hypotheses;
  if (first === undefined) return [];

  let prefixLength = first.length;
  for (const hypothesis of rest) {
    prefixLength = Math.min(prefixLength, hypothesis.length);
    for (let index = 0; index < prefixLength; index += 1) {
      if (first[index] !== hypothesis[index]) {
        prefixLength = index;
        break;
      }
    }
  }
  return first.slice(0, prefixLength);
}

function isPrefix(prefix: readonly number[], value: readonly number[]): boolean {
  if (prefix.length > value.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== value[index]) return false;
  }
  return true;
}

function copyHypothesis(hypothesis: readonly number[]): number[] {
  return hypothesis.map((tokenId, index) =>
    validateTokenId(tokenId, `hypothesis[${index.toString()}]`),
  );
}

function validateTokenId(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer token id.`);
  }
  return value;
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function validateNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}
