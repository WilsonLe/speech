import { describe, expect, it } from 'vitest';
import {
  createSyntheticFrozenFeatureTinyAdapterDataset,
  trainFrozenFeatureTinyAdapter,
  type FrozenFeatureTinyAdapterCheckpointV1,
  type FrozenFeatureTinyAdapterProgressV1,
} from '@speech/browser-training';
import type {
  BrowserTrainingCoordinationEventV1,
  BrowserTrainingRecoveryRecordV1,
  BrowserTrainingRuntimeWarningV1,
} from '../workers/browser-training-client';
import { buildBrowserTrainingProgressView } from './browser-training-ui';

describe('browser training progress UI helpers', () => {
  it('builds named active phases from aggregate epoch progress', () => {
    const progress: FrozenFeatureTinyAdapterProgressV1 = {
      schemaVersion: 1,
      epoch: 40,
      epochs: 160,
      loss: 0.012345,
      status: 'training',
      validationLoss: 0.014,
      learningRate: 0.01,
      optimizer: 'adamw',
      stoppedEarly: false,
    };

    const view = buildBrowserTrainingProgressView({
      status: { state: 'training', latestProgress: progress },
      recovery: null,
      coordination: createCoordinationEvent('lock-acquired'),
      warnings: [],
    });

    expect(view.currentPhaseLabel).toBe('Training adapter epochs');
    expect(view.progressPercent).toBe(25);
    expect(view.progressValueText).toContain('epoch 40/160');
    expect(view.phases.map((phase) => phase.label)).toEqual([
      'Prepare worker',
      'Coordinate local lock',
      'Train adapter epochs',
      'Save reload recovery',
      'Await activation gate',
    ]);
    expect(view.phases.find((phase) => phase.id === 'train-adapter')).toMatchObject({
      status: 'active',
      detail: 'epoch 40/160 · loss 0.012345 · validation 0.014000',
    });
    expect(view.privacy.containsFeatureTensors).toBe(false);
  });

  it('summarizes resumable reload recovery without checkpoint identifiers or adapter weights', () => {
    const paused = trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
      epochs: 24,
      progressEveryEpochs: 4,
      checkpointEveryEpochs: 4,
      targetLoss: 0,
      shouldPause: (progress) => progress.epoch >= 8,
    });
    const recovery = createRecovery('paused', paused.checkpoint);

    const view = buildBrowserTrainingProgressView({
      status: { state: 'complete', result: paused },
      recovery,
      coordination: createCoordinationEvent('lock-released'),
      warnings: [],
    });

    expect(view.currentPhaseLabel).toBe('Training paused with reload recovery');
    expect(view.recovery).toMatchObject({
      status: 'paused',
      checkpointEpoch: 8,
      resumable: true,
    });
    expect(view.phases.find((phase) => phase.id === 'checkpoint-recovery')).toMatchObject({
      status: 'attention',
      detail: 'Reload recovery paused at epoch 8.',
    });
    expect(JSON.stringify(view)).not.toContain(paused.checkpoint.checkpointId);
    expect(JSON.stringify(view)).not.toContain(paused.checkpoint.artifact.checksum);
  });

  it('marks reload recovery complete when a completed run clears the checkpoint', () => {
    const completed = trainFrozenFeatureTinyAdapter(
      createSyntheticFrozenFeatureTinyAdapterDataset(),
      {
        epochs: 4,
        progressEveryEpochs: 1,
        checkpointEveryEpochs: 1,
        targetLoss: 0,
      },
    );

    const view = buildBrowserTrainingProgressView({
      status: { state: 'complete', result: completed },
      recovery: null,
      coordination: createCoordinationEvent('lock-released'),
      warnings: [],
    });

    expect(view.currentPhaseLabel).toBe('Training completed; activation gate still required');
    expect(view.phases.find((phase) => phase.id === 'checkpoint-recovery')).toMatchObject({
      status: 'complete',
      detail: 'Completed run cleared prototype recovery; no resume checkpoint is needed.',
    });
  });

  it('uses sanitized resource guidance instead of raw runtime-warning messages', () => {
    const warnings: readonly BrowserTrainingRuntimeWarningV1[] = [
      {
        code: 'ASR_PRIORITY_PAUSE',
        message: 'secret-profile-id and raw checkpoint path must not be copied into summaries',
      },
      {
        code: 'CHECKPOINT_STORAGE_VOLATILE',
        message: 'raw checkpoint bytes unavailable',
      },
    ];

    const view = buildBrowserTrainingProgressView({
      status: { state: 'idle' },
      recovery: null,
      coordination: null,
      warnings,
      controlIntent: 'pause-requested',
    });

    expect(view.currentPhaseLabel).toBe('Pause requested at next safe checkpoint');
    expect(view.resourceWarnings).toContain(
      'ASR runtime activity can pause training at a cooperative checkpoint boundary.',
    );
    expect(view.resourceWarnings).toContain(
      'Prototype recovery uses browser-local storage and is not an activation path.',
    );
    expect(JSON.stringify(view)).not.toContain('secret-profile-id');
    expect(JSON.stringify(view)).not.toContain('raw checkpoint path');
  });
});

function createRecovery(
  status: BrowserTrainingRecoveryRecordV1['status'],
  checkpoint: FrozenFeatureTinyAdapterCheckpointV1,
): BrowserTrainingRecoveryRecordV1 {
  return {
    schemaVersion: 1,
    status,
    checkpoint,
    updatedAt: '2026-01-01T00:00:00.000Z',
    warnings: [],
  };
}

function createCoordinationEvent(
  eventType: BrowserTrainingCoordinationEventV1['eventType'],
): BrowserTrainingCoordinationEventV1 {
  return {
    schemaVersion: 1,
    eventType,
    requestId: 'request-redacted',
    tabId: 'tab-redacted',
    scope: {
      schemaVersion: 1,
      scopeFingerprint: 'redacted-fnv1a32:12345678',
      source: 'synthetic-default',
      privacy: {
        exposesRawProfileId: false,
        exposesDatasetId: false,
        localOnly: true,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    message: 'Redacted coordination event.',
    privacy: {
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      containsCheckpoint: false,
      containsAdapterWeights: false,
      containsRawProfileId: false,
      containsDatasetId: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}
