import { describe, expect, it } from 'vitest';
import {
  createBrowserTrainingPrivacy,
  createSyntheticFrozenFeatureTinyAdapterDataset,
  trainFrozenFeatureTinyAdapter,
  validateFrozenFeatureTinyAdapterDataset,
  type FrozenFeatureTinyAdapterDatasetV1,
} from './browser-training';

describe('browser frozen-feature tiny-adapter prototype', () => {
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
  });

  it('emits progress and supports cooperative cancellation without mutating active profiles', () => {
    const progressEpochs: number[] = [];
    const result = trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
      epochs: 30,
      progressEveryEpochs: 5,
      onProgress: (progress) => progressEpochs.push(progress.epoch),
      shouldCancel: (progress) => progress.epoch >= 7,
    });

    expect(result.status).toBe('cancelled');
    expect(result.metrics.epochsCompleted).toBe(7);
    expect(progressEpochs).toContain(5);
    expect(progressEpochs.at(-1)).toBe(7);
    expect(result.compatibility.activationGateRequired).toBe(true);
  });

  it('validates dimensions, checksums, and local-only privacy before training', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();

    expect(validateFrozenFeatureTinyAdapterDataset(dataset)).toBe(dataset);
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
  });

  it('refuses adapters that exceed the tiny parameter budget', () => {
    expect(() =>
      trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
        maxParameterCount: 4,
      }),
    ).toThrow(/parameter count/);
  });

  it('propagates private frozen-feature markers into training results', () => {
    const privateDataset = {
      ...createSyntheticFrozenFeatureTinyAdapterDataset(),
      datasetId: 'private-profile-frozen-feature-dataset',
      source: {
        ...createSyntheticFrozenFeatureTinyAdapterDataset().source,
        kind: 'profile-frozen-features' as const,
      },
      privacy: createBrowserTrainingPrivacy({
        containsPrivateFrozenFeatureValues: true,
        containsProfileData: true,
      }),
    } satisfies FrozenFeatureTinyAdapterDatasetV1;

    expect(trainFrozenFeatureTinyAdapter(privateDataset, { epochs: 10 }).privacy).toEqual({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: true,
      containsProfileData: true,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    });
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
