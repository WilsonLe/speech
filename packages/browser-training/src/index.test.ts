import { describe, expect, it } from 'vitest';
import {
  createBrowserTrainingPrivacy,
  createDefaultBrowserTrainingBackend,
  createRepositoryFixedAdapterMathBackend,
  createSyntheticFrozenFeatureTinyAdapterDataset,
  repositoryFixedAdapterMathBackendDescriptorV1,
  selectBrowserTrainingBackend,
  trainFrozenFeatureTinyAdapter,
  validateFrozenFeatureTinyAdapterCheckpoint,
  validateFrozenFeatureTinyAdapterDataset,
  type FrozenFeatureTinyAdapterCheckpointV1,
  type FrozenFeatureTinyAdapterDatasetV1,
  type OnnxRuntimeTrainingBackendProofV1,
} from './index';

function createBlockedOrtTrainingProof(): OnnxRuntimeTrainingBackendProofV1 {
  return {
    schemaVersion: 1,
    packageName: 'onnxruntime-web',
    packageVersion: '1.27.0',
    trainingApiAvailable: false,
    packageIncludesTrainingWasm: false,
    workerProof: {
      status: 'blocked-no-public-js-api-or-package-artifact',
      forward: false,
      backward: false,
      optimizerStep: false,
      checkpointSaveLoad: false,
      weightExport: false,
      reason:
        'The pinned npm package lacks both ort-training-wasm-simd-threaded.wasm and public TrainingSession/CheckpointState symbols.',
    },
    privacy: {
      inspectedPackageMetadataOnly: true,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    },
  };
}

function createBalancedSamplerDataset(): FrozenFeatureTinyAdapterDatasetV1 {
  const base = createSyntheticFrozenFeatureTinyAdapterDataset();
  return {
    ...base,
    datasetId: 'synthetic-balanced-sampler-dataset-v1',
    featureDimension: 3,
    outputDimension: 1,
    examples: [
      {
        id: 'normal-short-a',
        features: [1, 0, 0.1],
        targetResidual: [0.2],
        frameCount: 20,
        conditionKey: 'normal',
      },
      {
        id: 'normal-long-a',
        features: [0.8, 0.1, 0.4],
        targetResidual: [0.16],
        frameCount: 120,
        conditionKey: 'normal',
      },
      {
        id: 'whisper-short-a',
        features: [0.1, 1, -0.2],
        targetResidual: [-0.1],
        frameCount: 24,
        conditionKey: 'whisper',
      },
      {
        id: 'whisper-long-a',
        features: [0.2, 0.9, 0.5],
        targetResidual: [-0.06],
        frameCount: 110,
        conditionKey: 'whisper',
      },
      {
        id: 'projected-mid-a',
        features: [-0.3, 0.2, 1],
        targetResidual: [0.08],
        frameCount: 64,
        conditionKey: 'projected',
      },
      {
        id: 'projected-long-a',
        features: [0.4, -0.1, 0.9],
        targetResidual: [0.12],
        frameCount: 140,
        conditionKey: 'projected',
      },
      {
        id: 'validation-normal',
        features: [0.9, 0.05, 0.2],
        targetResidual: [0.18],
        frameCount: 42,
        conditionKey: 'normal',
        split: 'validation',
      },
      {
        id: 'validation-whisper',
        features: [0.05, 0.8, -0.1],
        targetResidual: [-0.08],
        frameCount: 44,
        conditionKey: 'whisper',
        split: 'validation',
      },
    ],
  };
}

describe('browser frozen-feature tiny-adapter backend', () => {
  it('exposes an implementation-agnostic BrowserTrainingBackend descriptor', () => {
    const backend = createDefaultBrowserTrainingBackend();

    expect(backend.descriptor).toEqual(repositoryFixedAdapterMathBackendDescriptorV1);
    expect(createRepositoryFixedAdapterMathBackend().descriptor).toBe(
      repositoryFixedAdapterMathBackendDescriptorV1,
    );
    expect(backend.descriptor).toMatchObject({
      schemaVersion: 1,
      interface: 'BrowserTrainingBackend',
      backendId: 'repository-fixed-adapter-math-v1',
      kind: 'repository-fixed-adapter-math',
      proofStatus: 'fixed-adapter-math-required',
      algorithmId: 'browser-top-adapter-frame-ce-v1',
      owner: 'dedicated-training-worker',
      capabilities: {
        checkpoint: true,
        fixedAdapterMath: true,
        onnxRuntimeTraining: false,
      },
      privacy: {
        localOnly: true,
        networkUpload: false,
        telemetry: false,
        exposesConcreteRuntimeToUi: false,
      },
    });
  });

  it('routes an ORT Training request without proof to the fixed adapter-math backend', () => {
    const selection = selectBrowserTrainingBackend({
      preferredKind: 'onnxruntime-web-training',
    });

    expect(selection.backend.descriptor.kind).toBe('repository-fixed-adapter-math');
    expect(selection.fallback?.reasons).toEqual(['ort-training-proof-unavailable']);
    expect(selection.privacy).toEqual({
      inspectedPackageMetadataOnly: false,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    });
  });

  it('routes the pinned unavailable ORT Training proof to the fixed adapter-math backend', () => {
    const selection = selectBrowserTrainingBackend({
      preferredKind: 'onnxruntime-web-training',
      onnxRuntimeTrainingProof: createBlockedOrtTrainingProof(),
    });

    expect(selection.requestedKind).toBe('onnxruntime-web-training');
    expect(selection.backend.descriptor.kind).toBe('repository-fixed-adapter-math');
    expect(selection.fallback).toEqual({
      requestedKind: 'onnxruntime-web-training',
      selectedKind: 'repository-fixed-adapter-math',
      reasons: [
        'ort-training-api-unavailable',
        'ort-training-wasm-unavailable',
        'ort-training-worker-proof-not-passed',
      ],
      message:
        'ONNX Runtime Training is unavailable (ort-training-api-unavailable, ort-training-wasm-unavailable, ort-training-worker-proof-not-passed); routing to repository fixed adapter-math backend.',
    });
    expect(selection.privacy).toEqual({
      inspectedPackageMetadataOnly: true,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    });
  });

  it('does not claim an ORT Training backend even if a future proof shape passes', () => {
    const selection = selectBrowserTrainingBackend({
      preferredKind: 'onnxruntime-web-training',
      onnxRuntimeTrainingProof: {
        ...createBlockedOrtTrainingProof(),
        trainingApiAvailable: true,
        packageIncludesTrainingWasm: true,
        workerProof: {
          status: 'passed',
          forward: true,
          backward: true,
          optimizerStep: true,
          checkpointSaveLoad: true,
          weightExport: true,
        },
      },
    });

    expect(selection.backend.descriptor.kind).toBe('repository-fixed-adapter-math');
    expect(selection.fallback?.reasons).toEqual(['ort-training-backend-not-implemented']);
    expect(selection.backend.descriptor.capabilities.onnxRuntimeTraining).toBe(false);
  });

  it('trains a deterministic tiny affine adapter over frozen synthetic features', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const first = trainFrozenFeatureTinyAdapter(dataset, { epochs: 60, progressEveryEpochs: 20 });
    const second = trainFrozenFeatureTinyAdapter(dataset, { epochs: 60, progressEveryEpochs: 20 });

    expect(first.schemaVersion).toBe(1);
    expect(first.status).toBe('completed');
    expect(first.workerOwner).toBe('dedicated-training-worker');
    expect(first.metrics.examples).toBe(dataset.examples.length);
    expect(first.metrics.finalLoss).toBeLessThan(first.metrics.initialLoss);
    expect(first.metrics.lossReduction).toBeGreaterThan(0);
    expect(first.artifact).toMatchObject({
      schemaVersion: 1,
      artifactType: 'frozen-feature-affine-adapter',
      trainableScope: 'top-residual-adapter',
      featureDimension: 4,
      outputDimension: 2,
      parameterCount: 10,
      precision: 'float32',
    });
    expect(first.artifact.weights).toHaveLength(8);
    expect(first.artifact.bias).toHaveLength(2);
    expect(first.artifact.checksum).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
    expect(first.artifact).toEqual(second.artifact);
    expect(first.checkpoint.epoch).toBe(first.metrics.epochsCompleted);
    expect(first.recovery).toMatchObject({
      resumable: false,
      reloadRecoverySupported: true,
      previousActiveProfileIntact: true,
      activationGateRequired: true,
    });
    expect(first.compatibility).toMatchObject({
      activationGateRequired: true,
      importChecksumRequired: true,
      trainableScope: 'top-residual-adapter',
    });
    expect(first.privacy).toEqual({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      containsProfileData: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    });
    expect(first.diagnostics.optimization.optimizer).toBe('adamw');
    expect(first.diagnostics.safety).toEqual({
      finiteLoss: true,
      nanInfGuardTriggered: false,
    });
  });

  it('uses balanced sampler diagnostics, AdamW clipping, validation loss, and scheduling', () => {
    const result = trainFrozenFeatureTinyAdapter(createBalancedSamplerDataset(), {
      epochs: 12,
      batchSize: 2,
      samplerSeed: 'unit-balanced-sampler',
      lengthBucketCount: 3,
      conditionBalanced: true,
      gradientClipNorm: 0.000001,
      validationEveryEpochs: 1,
      targetLoss: 0,
    });

    expect(result.status).toBe('completed');
    expect(result.metrics.stoppedEarly).toBe(false);
    expect(result.metrics.validationLoss).toBeGreaterThanOrEqual(0);
    expect(result.metrics.bestValidationLoss).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.sampler).toMatchObject({
      batchSize: 2,
      lengthBucketCount: 3,
      conditionBalanced: true,
      trainingExamples: 6,
      validationExamples: 2,
      batchesPerEpoch: 3,
    });
    expect(result.diagnostics.sampler.seedFingerprint).toMatch(/^sampler-seed:fnv1a32:/);
    expect(Object.keys(result.diagnostics.sampler.conditionExampleCounts)).toHaveLength(3);
    expect(Object.keys(result.diagnostics.sampler.conditionExampleCounts)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^condition:fnv1a32:/),
        expect.stringMatching(/^condition:fnv1a32:/),
        expect.stringMatching(/^condition:fnv1a32:/),
      ]),
    );
    expect(Object.values(result.diagnostics.sampler.conditionExampleCounts)).toEqual([2, 2, 2]);
    expect(Object.values(result.diagnostics.sampler.lengthBucketExampleCounts)).toHaveLength(3);
    expect(
      Object.values(result.diagnostics.sampler.lengthBucketExampleCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(6);
    expect(result.diagnostics.optimization).toMatchObject({
      optimizer: 'adamw',
      learningRateSchedule: 'linear-decay',
      gradientClipNorm: 0.000001,
    });
    expect(result.diagnostics.optimization.gradientClipEvents).toBeGreaterThan(0);
    expect(result.diagnostics.optimization.lastLearningRate).toBeLessThan(0.04);
    expect(result.diagnostics.validation).toMatchObject({
      enabled: true,
      everyEpochs: 1,
      stoppedEarly: false,
    });
  });

  it('stops early when validation loss does not improve by the configured delta', () => {
    const progressStoppedEarly: boolean[] = [];
    const result = trainFrozenFeatureTinyAdapter(createBalancedSamplerDataset(), {
      epochs: 80,
      targetLoss: 0,
      batchSize: 2,
      validationEveryEpochs: 1,
      earlyStoppingPatience: 2,
      earlyStoppingMinDelta: 1,
      onProgress: (progress) => {
        progressStoppedEarly.push(progress.stoppedEarly === true);
      },
      progressEveryEpochs: 1,
    });

    expect(result.metrics.epochsCompleted).toBeLessThan(80);
    expect(result.metrics.stoppedEarly).toBe(true);
    expect(result.diagnostics.validation.stoppedEarly).toBe(true);
    expect(result.diagnostics.validation.epochsWithoutImprovement).toBeGreaterThanOrEqual(2);
    expect(progressStoppedEarly).toContain(true);
  });

  it('validates sampler, optimizer, split, and finite-value guards', () => {
    const dataset = createBalancedSamplerDataset();
    expect(() =>
      validateFrozenFeatureTinyAdapterDataset({
        ...dataset,
        examples: dataset.examples.map((example) => ({ ...example, split: 'validation' as const })),
      }),
    ).toThrow(/train split/);
    expect(() =>
      validateFrozenFeatureTinyAdapterDataset({
        ...dataset,
        examples: [{ ...dataset.examples[0]!, conditionKey: ' ' }, ...dataset.examples.slice(1)],
      }),
    ).toThrow(/conditionKey/);
    expect(() => trainFrozenFeatureTinyAdapter(dataset, { optimizer: 'rmsprop' as never })).toThrow(
      /optimizer/,
    );
    expect(() => trainFrozenFeatureTinyAdapter(dataset, { gradientClipNorm: 0 })).toThrow(
      /gradientClipNorm/,
    );
    expect(() =>
      trainFrozenFeatureTinyAdapter({
        ...dataset,
        examples: [
          { ...dataset.examples[0]!, features: [Number.NaN, 0, 0] },
          ...dataset.examples.slice(1),
        ],
      }),
    ).toThrow(/finite/);
  });

  it('emits progress and supports cooperative cancellation without mutating active profiles', () => {
    const progressEpochs: number[] = [];
    const checkpoints: FrozenFeatureTinyAdapterCheckpointV1[] = [];
    const result = trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
      epochs: 30,
      progressEveryEpochs: 5,
      checkpointEveryEpochs: 5,
      onProgress: (progress) => progressEpochs.push(progress.epoch),
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
      shouldCancel: (progress) => progress.epoch >= 7,
    });

    expect(result.status).toBe('cancelled');
    expect(result.metrics.epochsCompleted).toBe(7);
    expect(progressEpochs).toContain(5);
    expect(progressEpochs.at(-1)).toBe(7);
    expect(checkpoints.map((checkpoint) => checkpoint.epoch)).toEqual([5, 7]);
    expect(result.recovery).toMatchObject({
      checkpointEpoch: 7,
      resumable: true,
      previousActiveProfileIntact: true,
      activationGateRequired: true,
    });
  });

  it('pauses with a resumable checkpoint and resumes from checkpoint state', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const paused = trainFrozenFeatureTinyAdapter(dataset, {
      epochs: 40,
      progressEveryEpochs: 4,
      checkpointEveryEpochs: 4,
      targetLoss: 0,
      shouldPause: (progress) => progress.epoch >= 12,
    });

    expect(paused.status).toBe('paused');
    expect(paused.checkpoint.epoch).toBe(12);
    expect(paused.recovery.resumable).toBe(true);
    expect(validateFrozenFeatureTinyAdapterCheckpoint(dataset, paused.checkpoint)).toBe(
      paused.checkpoint,
    );

    const resumed = trainFrozenFeatureTinyAdapter(dataset, {
      epochs: 40,
      progressEveryEpochs: 10,
      checkpointEveryEpochs: 10,
      targetLoss: 0,
      resumeFromCheckpoint: paused.checkpoint,
    });

    expect(resumed.status).toBe('completed');
    expect(resumed.metrics.epochsCompleted).toBe(40);
    expect(resumed.metrics.finalLoss).toBeLessThan(paused.metrics.finalLoss);
    expect(resumed.recovery.resumable).toBe(false);
  });

  it('validates dimensions, checksums, checkpoints, and local-only privacy before training', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const checkpoint = trainFrozenFeatureTinyAdapter(dataset, {
      epochs: 12,
      checkpointEveryEpochs: 6,
    }).checkpoint;

    expect(validateFrozenFeatureTinyAdapterDataset(dataset)).toBe(dataset);
    expect(validateFrozenFeatureTinyAdapterCheckpoint(dataset, checkpoint)).toBe(checkpoint);
    expect(() =>
      validateFrozenFeatureTinyAdapterDataset({
        ...dataset,
        examples: [...dataset.examples, { ...dataset.examples[0]!, id: dataset.examples[0]!.id }],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateFrozenFeatureTinyAdapterDataset({
        ...dataset,
        source: { ...dataset.source, graphContractSha256: 'not-a-sha' },
      }),
    ).toThrow(/graphContractSha256/);
    expect(() =>
      validateFrozenFeatureTinyAdapterDataset({
        ...dataset,
        privacy: {
          ...dataset.privacy,
          containsRawAudio: true,
        } as unknown as FrozenFeatureTinyAdapterDatasetV1['privacy'],
      }),
    ).toThrow(/raw audio/);
    expect(() =>
      validateFrozenFeatureTinyAdapterCheckpoint(dataset, {
        ...checkpoint,
        checkpointId: 'tampered',
      }),
    ).toThrow(/checkpointId/);
    expect(() =>
      trainFrozenFeatureTinyAdapter(
        { ...dataset, datasetId: 'different-dataset' },
        { resumeFromCheckpoint: checkpoint },
      ),
    ).toThrow(/datasetId/);
  });

  it('refuses adapters that exceed the tiny parameter budget', () => {
    expect(() =>
      trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
        maxParameterCount: 4,
      }),
    ).toThrow(/parameter count/);
  });

  it('propagates private frozen-feature markers into training results and checkpoints', () => {
    const baseDataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const privateDataset = {
      ...baseDataset,
      datasetId: 'private-profile-frozen-feature-dataset',
      source: {
        ...baseDataset.source,
        kind: 'profile-frozen-features' as const,
      },
      privacy: createBrowserTrainingPrivacy({
        containsPrivateFrozenFeatureValues: true,
        containsProfileData: true,
      }),
    } satisfies FrozenFeatureTinyAdapterDatasetV1;

    const result = trainFrozenFeatureTinyAdapter(privateDataset, { epochs: 10 });

    expect(result.privacy).toEqual({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: true,
      containsProfileData: true,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    });
    expect(result.checkpoint.privacy).toEqual(result.privacy);
  });

  it('creates explicit sensitive-feature privacy markers for future profile datasets', () => {
    expect(
      createBrowserTrainingPrivacy({
        containsPrivateFrozenFeatureValues: true,
        containsProfileData: true,
      }),
    ).toEqual({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: true,
      containsProfileData: true,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    });
  });
});
