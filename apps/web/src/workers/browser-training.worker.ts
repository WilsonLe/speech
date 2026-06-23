/// <reference lib="webworker" />

import {
  createSyntheticFrozenFeatureTinyAdapterDataset,
  trainFrozenFeatureTinyAdapter,
  type FrozenFeatureTinyAdapterDatasetV1,
  type FrozenFeatureTinyAdapterProgressV1,
  type FrozenFeatureTinyAdapterTrainingOptions,
  type FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/personalization';

export interface StartBrowserTrainingPrototypeMessage {
  readonly type: 'START_BROWSER_TRAINING_PROTOTYPE';
  readonly requestId: string;
  readonly dataset?: FrozenFeatureTinyAdapterDatasetV1;
  readonly options?: BrowserTrainingWorkerOptions;
}

export type BrowserTrainingWorkerOptions = Partial<
  Omit<FrozenFeatureTinyAdapterTrainingOptions, 'onProgress' | 'shouldCancel'>
>;

export interface BrowserTrainingProgressMessage {
  readonly type: 'BROWSER_TRAINING_PROGRESS';
  readonly requestId: string;
  readonly progress: FrozenFeatureTinyAdapterProgressV1;
}

export interface BrowserTrainingCompleteMessage {
  readonly type: 'BROWSER_TRAINING_COMPLETE';
  readonly requestId: string;
  readonly result: FrozenFeatureTinyAdapterTrainingResultV1;
}

export interface BrowserTrainingErrorMessage {
  readonly type: 'BROWSER_TRAINING_ERROR';
  readonly requestId: string;
  readonly message: string;
}

export type BrowserTrainingWorkerMessage = StartBrowserTrainingPrototypeMessage;
export type BrowserTrainingWorkerResponse =
  | BrowserTrainingProgressMessage
  | BrowserTrainingCompleteMessage
  | BrowserTrainingErrorMessage;

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<BrowserTrainingWorkerMessage>) => {
  const message = event.data;
  if (message.type !== 'START_BROWSER_TRAINING_PROTOTYPE') {
    return;
  }

  try {
    const dataset = message.dataset ?? createSyntheticFrozenFeatureTinyAdapterDataset();
    if (dataset.privacy.containsPrivateFrozenFeatureValues || dataset.privacy.containsProfileData) {
      throw new Error(
        'The public browser-training prototype worker only returns synthetic or non-private aggregate results. Private frozen-feature datasets must stay in profile-owned training storage until explicitly packaged.',
      );
    }
    const result = trainFrozenFeatureTinyAdapter(dataset, {
      ...(message.options ?? {}),
      onProgress: (progress) => {
        ctx.postMessage({
          type: 'BROWSER_TRAINING_PROGRESS',
          requestId: message.requestId,
          progress,
        } satisfies BrowserTrainingProgressMessage);
      },
    });
    ctx.postMessage({
      type: 'BROWSER_TRAINING_COMPLETE',
      requestId: message.requestId,
      result,
    } satisfies BrowserTrainingCompleteMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'BROWSER_TRAINING_ERROR',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies BrowserTrainingErrorMessage);
  }
});

export {};
