import {
  StablePrefixController,
  type StablePrefixControllerOptions,
  type StablePrefixResult,
} from './stable-prefix';

export type UtteranceFinalizationState = 'idle' | 'listening' | 'finalized';

export type UtteranceFinalizationControllerOptions = StablePrefixControllerOptions;

export interface UtteranceStartOptions {
  readonly utteranceId: string;
}

export interface UtterancePartialOptions {
  readonly utteranceId: string;
  readonly hypothesis: readonly number[];
}

export interface UtteranceFinalizeOptions {
  readonly utteranceId: string;
  readonly hypothesis?: readonly number[];
}

export interface UtterancePartialResult {
  readonly type: 'partial';
  readonly utteranceId: string;
  readonly committed: readonly number[];
  readonly committedDelta: readonly number[];
  readonly provisional: readonly number[];
  readonly latest: readonly number[];
  readonly stablePrefix: readonly number[];
  readonly committedRevisionBlocked: boolean;
}

export interface UtteranceFinalResult {
  readonly type: 'final';
  readonly utteranceId: string;
  readonly tokens: readonly number[];
  readonly committedDelta: readonly number[];
  readonly latest: readonly number[];
  readonly committedRevisionBlocked: boolean;
  readonly committedCorrected: boolean;
}

export interface UtteranceFinalizationSnapshot {
  readonly state: UtteranceFinalizationState;
  readonly utteranceId: string | null;
  readonly committed: readonly number[];
  readonly provisional: readonly number[];
  readonly latest: readonly number[];
}

export class UtteranceFinalizationController {
  private readonly stablePrefix: StablePrefixController;
  private state: UtteranceFinalizationState = 'idle';
  private utteranceId: string | null = null;
  private provisional: number[] = [];
  private latest: number[] = [];

  constructor(options: UtteranceFinalizationControllerOptions = {}) {
    this.stablePrefix = new StablePrefixController(options);
  }

  startUtterance(options: UtteranceStartOptions): UtteranceFinalizationSnapshot {
    const utteranceId = validateUtteranceId(options.utteranceId);
    if (this.state === 'listening') {
      throw new Error(
        `Cannot start utterance ${utteranceId}; utterance ${this.utteranceId ?? ''} is still active.`,
      );
    }

    this.stablePrefix.resetUtterance();
    this.state = 'listening';
    this.utteranceId = utteranceId;
    this.provisional = [];
    this.latest = [];
    return this.snapshot();
  }

  updatePartial(options: UtterancePartialOptions): UtterancePartialResult {
    this.assertListening(options.utteranceId, 'update partial');
    const stableResult = this.stablePrefix.update(options.hypothesis);
    this.provisional = [...stableResult.provisional];
    this.latest = [...stableResult.latest];
    return this.partialResult(stableResult);
  }

  finalizeUtterance(options: UtteranceFinalizeOptions): UtteranceFinalResult {
    this.assertListening(options.utteranceId, 'finalize utterance');
    const stableResult = this.stablePrefix.finalize(options.hypothesis);
    this.state = 'finalized';
    this.provisional = [];
    this.latest = [...stableResult.latest];
    return {
      type: 'final',
      utteranceId: this.utteranceId ?? options.utteranceId,
      tokens: [...stableResult.committed],
      committedDelta: [...stableResult.committedDelta],
      latest: [...stableResult.latest],
      committedRevisionBlocked: stableResult.committedRevisionBlocked,
      committedCorrected: stableResult.committedCorrected,
    };
  }

  reset(): void {
    this.stablePrefix.resetUtterance();
    this.state = 'idle';
    this.utteranceId = null;
    this.provisional = [];
    this.latest = [];
  }

  snapshot(): UtteranceFinalizationSnapshot {
    return {
      state: this.state,
      utteranceId: this.utteranceId,
      committed: this.stablePrefix.snapshot().committed,
      provisional: [...this.provisional],
      latest: [...this.latest],
    };
  }

  private partialResult(stableResult: StablePrefixResult): UtterancePartialResult {
    return {
      type: 'partial',
      utteranceId: this.utteranceId ?? '',
      committed: [...stableResult.committed],
      committedDelta: [...stableResult.committedDelta],
      provisional: [...stableResult.provisional],
      latest: [...stableResult.latest],
      stablePrefix: [...stableResult.stablePrefix],
      committedRevisionBlocked: stableResult.committedRevisionBlocked,
    };
  }

  private assertListening(utteranceId: string, action: string): void {
    const checkedUtteranceId = validateUtteranceId(utteranceId);
    if (this.state !== 'listening') {
      throw new Error(`Cannot ${action}; no active listening utterance.`);
    }
    if (this.utteranceId !== checkedUtteranceId) {
      throw new Error(
        `Cannot ${action}; expected utterance ${this.utteranceId ?? ''} but received ${checkedUtteranceId}.`,
      );
    }
  }
}

function validateUtteranceId(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('utteranceId must be a non-empty string.');
  }
  return value;
}
