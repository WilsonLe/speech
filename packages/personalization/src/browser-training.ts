export type BrowserTrainingPrototypeStatus = 'completed' | 'cancelled';

export interface FrozenFeatureTinyAdapterExampleV1 {
  readonly id: string;
  readonly features: readonly number[];
  readonly targetResidual: readonly number[];
  readonly weight?: number;
}

export interface FrozenFeatureTinyAdapterDatasetV1 {
  readonly schemaVersion: 1;
  readonly datasetId: string;
  readonly featureDimension: number;
  readonly outputDimension: number;
  readonly examples: readonly FrozenFeatureTinyAdapterExampleV1[];
  readonly source: {
    readonly kind: 'synthetic-ci-fixture' | 'profile-frozen-features';
    readonly baseModelId: string;
    readonly baseModelVersion: string;
    readonly graphContractSha256: string;
  };
  readonly privacy: BrowserTrainingPrivacyV1;
}

export interface BrowserTrainingPrivacyV1 {
  readonly containsRawAudio: false;
  readonly containsTranscriptText: false;
  readonly containsPrivateFrozenFeatureValues: boolean;
  readonly containsProfileData: boolean;
  readonly networkUpload: false;
  readonly telemetry: false;
  readonly localOnly: true;
}

export interface FrozenFeatureTinyAdapterTrainingOptions {
  readonly epochs: number;
  readonly learningRate: number;
  readonly l2Regularization: number;
  readonly maxParameterCount: number;
  readonly targetLoss?: number;
  readonly progressEveryEpochs?: number;
  readonly shouldCancel?: (state: FrozenFeatureTinyAdapterProgressV1) => boolean;
  readonly onProgress?: (state: FrozenFeatureTinyAdapterProgressV1) => void;
}

export interface FrozenFeatureTinyAdapterProgressV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly epochs: number;
  readonly loss: number;
  readonly status: 'training' | 'completed' | 'cancelled';
}

export interface FrozenFeatureTinyAdapterArtifactV1 {
  readonly schemaVersion: 1;
  readonly artifactType: 'frozen-feature-affine-adapter';
  readonly trainableScope: 'top-residual-adapter';
  readonly featureDimension: number;
  readonly outputDimension: number;
  readonly parameterCount: number;
  readonly precision: 'float32';
  readonly weights: readonly number[];
  readonly bias: readonly number[];
  readonly checksum: string;
}

export interface FrozenFeatureTinyAdapterTrainingResultV1 {
  readonly schemaVersion: 1;
  readonly status: BrowserTrainingPrototypeStatus;
  readonly workerOwner: 'dedicated-training-worker';
  readonly datasetId: string;
  readonly artifact: FrozenFeatureTinyAdapterArtifactV1;
  readonly metrics: {
    readonly examples: number;
    readonly epochsCompleted: number;
    readonly initialLoss: number;
    readonly finalLoss: number;
    readonly lossReduction: number;
  };
  readonly compatibility: {
    readonly baseModelId: string;
    readonly baseModelVersion: string;
    readonly graphContractSha256: string;
    readonly trainableScope: 'top-residual-adapter';
    readonly activationGateRequired: true;
    readonly importChecksumRequired: true;
  };
  readonly privacy: BrowserTrainingPrivacyV1;
}

export const defaultFrozenFeatureTinyAdapterTrainingOptions: FrozenFeatureTinyAdapterTrainingOptions =
  {
    epochs: 80,
    learningRate: 0.04,
    l2Regularization: 0.001,
    maxParameterCount: 1_024,
    targetLoss: 0.0005,
    progressEveryEpochs: 10,
  };

export function createSyntheticFrozenFeatureTinyAdapterDataset(): FrozenFeatureTinyAdapterDatasetV1 {
  return {
    schemaVersion: 1,
    datasetId: 'synthetic-frozen-feature-tiny-adapter-v1',
    featureDimension: 4,
    outputDimension: 2,
    examples: [
      { id: 'case-a', features: [1, 0, 0.2, -0.1], targetResidual: [0.18, -0.08] },
      { id: 'case-b', features: [0.8, 0.1, 0.1, 0.2], targetResidual: [0.16, -0.02] },
      { id: 'case-c', features: [0.1, 1, -0.2, 0.3], targetResidual: [-0.04, 0.22] },
      { id: 'case-d', features: [0.2, 0.9, 0.3, -0.2], targetResidual: [0.02, 0.18] },
      { id: 'case-e', features: [-0.4, 0.3, 1, 0.5], targetResidual: [-0.1, 0.06] },
      { id: 'case-f', features: [0.3, -0.2, 0.4, 1], targetResidual: [0.05, -0.12] },
    ],
    source: {
      kind: 'synthetic-ci-fixture',
      baseModelId: 'mock-browser-training-base',
      baseModelVersion: '0.0.0-ci',
      graphContractSha256: '0'.repeat(64),
    },
    privacy: createBrowserTrainingPrivacy({
      containsPrivateFrozenFeatureValues: false,
      containsProfileData: false,
    }),
  };
}

export function trainFrozenFeatureTinyAdapter(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  optionsInput: Partial<FrozenFeatureTinyAdapterTrainingOptions> = {},
): FrozenFeatureTinyAdapterTrainingResultV1 {
  validateFrozenFeatureTinyAdapterDataset(dataset);
  const options = normalizeTrainingOptions(optionsInput);
  const parameterCount =
    dataset.featureDimension * dataset.outputDimension + dataset.outputDimension;
  if (parameterCount > options.maxParameterCount) {
    throw new Error(
      `Frozen-feature adapter parameter count ${parameterCount.toString()} exceeds limit ${options.maxParameterCount.toString()}.`,
    );
  }

  const weights = new Array<number>(dataset.featureDimension * dataset.outputDimension).fill(0);
  const bias = new Array<number>(dataset.outputDimension).fill(0);
  const initialLoss = calculateLoss(dataset, weights, bias, options.l2Regularization);
  let finalLoss = initialLoss;
  let epochsCompleted = 0;
  let status: BrowserTrainingPrototypeStatus = 'completed';

  for (let epoch = 1; epoch <= options.epochs; epoch += 1) {
    runSgdEpoch(dataset, weights, bias, options.learningRate, options.l2Regularization);
    finalLoss = calculateLoss(dataset, weights, bias, options.l2Regularization);
    epochsCompleted = epoch;
    const progress = createProgress(epoch, options.epochs, finalLoss, 'training');
    if (shouldEmitProgress(epoch, options) || finalLoss <= (options.targetLoss ?? -1)) {
      options.onProgress?.(progress);
    }
    if (options.shouldCancel?.(progress) === true) {
      status = 'cancelled';
      options.onProgress?.(createProgress(epoch, options.epochs, finalLoss, 'cancelled'));
      break;
    }
    if (finalLoss <= (options.targetLoss ?? -1)) {
      break;
    }
  }

  if (status === 'completed') {
    options.onProgress?.(createProgress(epochsCompleted, options.epochs, finalLoss, 'completed'));
  }

  const roundedWeights = weights.map(roundFloat);
  const roundedBias = bias.map(roundFloat);
  const artifact: FrozenFeatureTinyAdapterArtifactV1 = {
    schemaVersion: 1,
    artifactType: 'frozen-feature-affine-adapter',
    trainableScope: 'top-residual-adapter',
    featureDimension: dataset.featureDimension,
    outputDimension: dataset.outputDimension,
    parameterCount,
    precision: 'float32',
    weights: roundedWeights,
    bias: roundedBias,
    checksum: checksumTinyAdapter(roundedWeights, roundedBias),
  };

  return {
    schemaVersion: 1,
    status,
    workerOwner: 'dedicated-training-worker',
    datasetId: dataset.datasetId,
    artifact,
    metrics: {
      examples: dataset.examples.length,
      epochsCompleted,
      initialLoss: roundFloat(initialLoss),
      finalLoss: roundFloat(finalLoss),
      lossReduction: roundFloat(initialLoss - finalLoss),
    },
    compatibility: {
      baseModelId: dataset.source.baseModelId,
      baseModelVersion: dataset.source.baseModelVersion,
      graphContractSha256: dataset.source.graphContractSha256,
      trainableScope: 'top-residual-adapter',
      activationGateRequired: true,
      importChecksumRequired: true,
    },
    privacy: createBrowserTrainingPrivacy({
      containsPrivateFrozenFeatureValues: dataset.privacy.containsPrivateFrozenFeatureValues,
      containsProfileData: dataset.privacy.containsProfileData,
    }),
  };
}

export function validateFrozenFeatureTinyAdapterDataset(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
): FrozenFeatureTinyAdapterDatasetV1 {
  if (dataset.schemaVersion !== 1) {
    throw new Error('Frozen-feature tiny-adapter dataset schemaVersion must be 1.');
  }
  if (!dataset.datasetId.trim()) {
    throw new Error('Frozen-feature tiny-adapter datasetId is required.');
  }
  assertPositiveInteger(dataset.featureDimension, 'featureDimension');
  assertPositiveInteger(dataset.outputDimension, 'outputDimension');
  if (dataset.examples.length < 2) {
    throw new Error('Frozen-feature tiny-adapter training requires at least two examples.');
  }
  const seenIds = new Set<string>();
  for (const example of dataset.examples) {
    if (!example.id.trim()) {
      throw new Error('Frozen-feature tiny-adapter example id is required.');
    }
    if (seenIds.has(example.id)) {
      throw new Error(`Duplicate frozen-feature example id: ${example.id}`);
    }
    seenIds.add(example.id);
    if (example.features.length !== dataset.featureDimension) {
      throw new Error(`Example ${example.id} feature dimension does not match dataset.`);
    }
    if (example.targetResidual.length !== dataset.outputDimension) {
      throw new Error(`Example ${example.id} target residual dimension does not match dataset.`);
    }
    for (const value of [...example.features, ...example.targetResidual]) {
      assertFiniteNumber(value, `example ${example.id} value`);
    }
    if (example.weight !== undefined && (!Number.isFinite(example.weight) || example.weight <= 0)) {
      throw new Error(`Example ${example.id} weight must be a positive finite number.`);
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(dataset.source.graphContractSha256)) {
    throw new Error('Frozen-feature dataset graphContractSha256 must be a SHA-256 hex string.');
  }
  if (dataset.privacy.networkUpload !== false || dataset.privacy.localOnly !== true) {
    throw new Error('Frozen-feature tiny-adapter dataset must be local-only with no upload.');
  }
  if (dataset.privacy.containsRawAudio || dataset.privacy.containsTranscriptText) {
    throw new Error(
      'Frozen-feature tiny-adapter dataset must not include raw audio or transcript text.',
    );
  }
  return dataset;
}

export function createBrowserTrainingPrivacy(
  overrides: Pick<
    BrowserTrainingPrivacyV1,
    'containsPrivateFrozenFeatureValues' | 'containsProfileData'
  >,
): BrowserTrainingPrivacyV1 {
  return {
    containsRawAudio: false,
    containsTranscriptText: false,
    containsPrivateFrozenFeatureValues: overrides.containsPrivateFrozenFeatureValues,
    containsProfileData: overrides.containsProfileData,
    networkUpload: false,
    telemetry: false,
    localOnly: true,
  };
}

function normalizeTrainingOptions(
  input: Partial<FrozenFeatureTinyAdapterTrainingOptions>,
): FrozenFeatureTinyAdapterTrainingOptions {
  const options = { ...defaultFrozenFeatureTinyAdapterTrainingOptions, ...input };
  assertPositiveInteger(options.epochs, 'epochs');
  assertPositiveFinite(options.learningRate, 'learningRate');
  assertPositiveFinite(options.maxParameterCount, 'maxParameterCount');
  if (options.l2Regularization < 0 || !Number.isFinite(options.l2Regularization)) {
    throw new Error('l2Regularization must be a finite non-negative number.');
  }
  if (options.targetLoss !== undefined && options.targetLoss < 0) {
    throw new Error('targetLoss must be non-negative when provided.');
  }
  if (options.progressEveryEpochs !== undefined) {
    assertPositiveInteger(options.progressEveryEpochs, 'progressEveryEpochs');
  }
  return options;
}

function runSgdEpoch(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  weights: number[],
  bias: number[],
  learningRate: number,
  l2Regularization: number,
): void {
  for (const example of dataset.examples) {
    const prediction = predict(example.features, weights, bias, dataset.outputDimension);
    const exampleWeight = example.weight ?? 1;
    for (let outputIndex = 0; outputIndex < dataset.outputDimension; outputIndex += 1) {
      const error = (prediction[outputIndex] ?? 0) - (example.targetResidual[outputIndex] ?? 0);
      const gradientScale = (2 * error * exampleWeight) / dataset.outputDimension;
      for (let featureIndex = 0; featureIndex < dataset.featureDimension; featureIndex += 1) {
        const weightIndex = outputIndex * dataset.featureDimension + featureIndex;
        const weight = weights[weightIndex] ?? 0;
        const feature = example.features[featureIndex] ?? 0;
        weights[weightIndex] =
          weight - learningRate * (gradientScale * feature + l2Regularization * weight);
      }
      bias[outputIndex] = (bias[outputIndex] ?? 0) - learningRate * gradientScale;
    }
  }
}

function calculateLoss(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  weights: readonly number[],
  bias: readonly number[],
  l2Regularization: number,
): number {
  let totalError = 0;
  let totalWeight = 0;
  for (const example of dataset.examples) {
    const prediction = predict(example.features, weights, bias, dataset.outputDimension);
    const exampleWeight = example.weight ?? 1;
    for (let outputIndex = 0; outputIndex < dataset.outputDimension; outputIndex += 1) {
      const error = (prediction[outputIndex] ?? 0) - (example.targetResidual[outputIndex] ?? 0);
      totalError += error * error * exampleWeight;
      totalWeight += exampleWeight;
    }
  }
  const mse = totalError / Math.max(1, totalWeight * dataset.outputDimension);
  const l2 = weights.reduce((sum, value) => sum + value * value, 0) * l2Regularization;
  return mse + l2;
}

function predict(
  features: readonly number[],
  weights: readonly number[],
  bias: readonly number[],
  outputDimension: number,
): number[] {
  const featureDimension = features.length;
  const output = new Array<number>(outputDimension).fill(0);
  for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
    let value = bias[outputIndex] ?? 0;
    for (let featureIndex = 0; featureIndex < featureDimension; featureIndex += 1) {
      const weightIndex = outputIndex * featureDimension + featureIndex;
      value += (weights[weightIndex] ?? 0) * (features[featureIndex] ?? 0);
    }
    output[outputIndex] = value;
  }
  return output;
}

function shouldEmitProgress(
  epoch: number,
  options: FrozenFeatureTinyAdapterTrainingOptions,
): boolean {
  return options.progressEveryEpochs !== undefined && epoch % options.progressEveryEpochs === 0;
}

function createProgress(
  epoch: number,
  epochs: number,
  loss: number,
  status: FrozenFeatureTinyAdapterProgressV1['status'],
): FrozenFeatureTinyAdapterProgressV1 {
  return {
    schemaVersion: 1,
    epoch,
    epochs,
    loss: roundFloat(loss),
    status,
  };
}

function checksumTinyAdapter(weights: readonly number[], bias: readonly number[]): string {
  const payload = JSON.stringify({ weights, bias });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertPositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return value;
}

function assertFiniteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function roundFloat(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
