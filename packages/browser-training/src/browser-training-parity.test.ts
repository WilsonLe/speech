import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createSyntheticFrozenFeatureTinyAdapterDataset,
  trainFrozenFeatureTinyAdapter,
  type FrozenFeatureTinyAdapterCheckpointV1,
} from './index';

const referenceFixtureUrl = new URL(
  '../../../test-data/expected/tiny-adapter-parity.json',
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(referenceFixtureUrl, 'utf8')) as {
  schemaVersion: number;
  dataset: {
    datasetId: string;
    featureDimension: number;
    outputDimension: number;
    examples: Array<{
      id: string;
      features: number[];
      targetResidual: number[];
    }>;
  };
  options: {
    epochs: number;
    learningRate: number;
    l2Regularization: number;
    maxParameterCount: number;
    checkpointEveryEpochs: number;
  };
  initialLoss: number;
  checkpoints: Array<{
    epoch: number;
    loss: number;
    weights: number[];
    bias: number[];
    checksum: string;
  }>;
  final: {
    epoch: number;
    loss: number;
    weights: number[];
    bias: number[];
    checksum: string;
  };
  forwardOutput: { features: number[]; prediction: number[] };
};

const tolerance = 1e-9;

function expectNumbersClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? 0, 9);
  });
}

describe('browser/Python tiny-adapter numerical parity', () => {
  it('matches the synthetic dataset committed in the parity fixture', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();

    expect(dataset.datasetId).toBe(fixture.dataset.datasetId);
    expect(dataset.featureDimension).toBe(fixture.dataset.featureDimension);
    expect(dataset.outputDimension).toBe(fixture.dataset.outputDimension);
    expect(dataset.examples.map((example) => example.id)).toEqual(
      fixture.dataset.examples.map((example) => example.id),
    );
    dataset.examples.forEach((example, index) => {
      expectNumbersClose(example.features, fixture.dataset.examples[index]?.features ?? []);
      expectNumbersClose(
        example.targetResidual,
        fixture.dataset.examples[index]?.targetResidual ?? [],
      );
    });
  });

  it('matches the Python reference forward, loss, optimizer, checkpoint, and artifact output', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const collectedCheckpoints: FrozenFeatureTinyAdapterCheckpointV1[] = [];

    const result = trainFrozenFeatureTinyAdapter(dataset, {
      epochs: fixture.options.epochs,
      learningRate: fixture.options.learningRate,
      l2Regularization: fixture.options.l2Regularization,
      maxParameterCount: fixture.options.maxParameterCount,
      checkpointEveryEpochs: fixture.options.checkpointEveryEpochs,
      optimizer: 'sgd',
      learningRateSchedule: 'constant',
      targetLoss: 0,
      onCheckpoint: (checkpoint) => {
        collectedCheckpoints.push(checkpoint);
      },
    });

    expect(result.metrics.initialLoss).toBeCloseTo(fixture.initialLoss, 9);
    expect(result.metrics.epochsCompleted).toBe(fixture.final.epoch);
    expect(result.metrics.finalLoss).toBeCloseTo(fixture.final.loss, 9);
    expectNumbersClose(result.artifact.weights, fixture.final.weights);
    expectNumbersClose(result.artifact.bias, fixture.final.bias);
    // The checksum is computed over the JS-formatted rounded weights, so an exact
    // match proves the browser and Python round/serialize identically.
    expect(result.artifact.checksum).toBe(fixture.final.checksum);

    expect(collectedCheckpoints.length).toBe(fixture.checkpoints.length);
    collectedCheckpoints.forEach((checkpoint, index) => {
      const expected = fixture.checkpoints[index];
      expect(checkpoint.epoch).toBe(expected?.epoch);
      expect(checkpoint.loss).toBeCloseTo(expected?.loss ?? 0, 9);
      expectNumbersClose(checkpoint.artifact.weights, expected?.weights ?? []);
      expectNumbersClose(checkpoint.artifact.bias, expected?.bias ?? []);
      expect(checkpoint.artifact.checksum).toBe(expected?.checksum);
    });

    // Runtime-adapter forward output parity for a sample frozen-feature input.
    const { features, prediction } = fixture.forwardOutput;
    const featureDimension = dataset.featureDimension;
    const outputDimension = dataset.outputDimension;
    const computed = new Array<number>(outputDimension).fill(0);
    for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
      let value = result.artifact.bias[outputIndex] ?? 0;
      for (let featureIndex = 0; featureIndex < featureDimension; featureIndex += 1) {
        const weightIndex = outputIndex * featureDimension + featureIndex;
        value += (result.artifact.weights[weightIndex] ?? 0) * (features[featureIndex] ?? 0);
      }
      computed[outputIndex] = value;
    }
    expectNumbersClose(computed, prediction);
  });

  it('keeps the parity fixture private and local-only', () => {
    const privacy = (fixture as unknown as { privacy?: Record<string, unknown> }).privacy;
    expect(privacy).toMatchObject({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      containsProfileData: false,
      networkUpload: false,
      localOnly: true,
    });
  });
});

void tolerance;
