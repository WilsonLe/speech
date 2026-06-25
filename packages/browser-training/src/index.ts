import type {
  BrowserTrainingAlgorithmId,
  BrowserTrainingBackendKind,
  BrowserTrainingBackendProofStatus,
} from '@speech/protocol';

export type BrowserTrainingPrototypeStatus = 'completed' | 'cancelled' | 'paused';
export type BrowserTrainingBackendId =
  | 'repository-fixed-adapter-math-v1'
  | 'onnxruntime-web-training-v1';
export type BrowserTrainingBackendAvailability = 'available' | 'unavailable';
export type BrowserTrainingBackendPreference = BrowserTrainingBackendKind;
export type BrowserTrainingBackendFallbackReason =
  | 'ort-training-proof-unavailable'
  | 'ort-training-api-unavailable'
  | 'ort-training-wasm-unavailable'
  | 'ort-training-worker-proof-not-passed'
  | 'ort-training-backend-not-implemented';
export type OnnxRuntimeTrainingWorkerProofStatus =
  | 'blocked-no-public-js-api-or-package-artifact'
  | 'not-run'
  | 'passed';

export interface BrowserTrainingBackendDescriptorV1 {
  readonly schemaVersion: 1;
  readonly interface: 'BrowserTrainingBackend';
  readonly backendId: BrowserTrainingBackendId;
  readonly kind: BrowserTrainingBackendKind;
  readonly proofStatus: BrowserTrainingBackendProofStatus;
  readonly algorithmId: BrowserTrainingAlgorithmId;
  readonly trainableScope: 'top-residual-adapter';
  readonly owner: 'dedicated-training-worker';
  readonly availability: BrowserTrainingBackendAvailability;
  readonly runtimePackage?: string;
  readonly capabilities: {
    readonly pause: true;
    readonly cancel: true;
    readonly checkpoint: true;
    readonly reloadRecovery: true;
    readonly fixedAdapterMath: boolean;
    readonly onnxRuntimeTraining: boolean;
  };
  readonly privacy: {
    readonly localOnly: true;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly exposesConcreteRuntimeToUi: false;
  };
}

export interface BrowserTrainingBackendSession {
  readonly backend: BrowserTrainingBackendDescriptorV1;
  readonly dataset: FrozenFeatureTinyAdapterDatasetV1;
  readonly options: FrozenFeatureTinyAdapterTrainingOptions;
  readonly parameterCount: number;
  readonly initialLoss: number;
  readonly epoch: number;
  readonly loss: number;
  runEpoch(): FrozenFeatureTinyAdapterProgressV1;
  hasReachedTargetLoss(): boolean;
  shouldCheckpoint(): boolean;
  createProgress(
    status: FrozenFeatureTinyAdapterProgressV1['status'],
  ): FrozenFeatureTinyAdapterProgressV1;
  createCheckpoint(): FrozenFeatureTinyAdapterCheckpointV1;
  finish(status: BrowserTrainingPrototypeStatus): FrozenFeatureTinyAdapterTrainingResultV1;
}

export interface BrowserTrainingBackend {
  readonly descriptor: BrowserTrainingBackendDescriptorV1;
  createSession(
    dataset: FrozenFeatureTinyAdapterDatasetV1,
    options?: Partial<FrozenFeatureTinyAdapterTrainingOptions>,
  ): BrowserTrainingBackendSession;
  train(
    dataset: FrozenFeatureTinyAdapterDatasetV1,
    options?: Partial<FrozenFeatureTinyAdapterTrainingOptions>,
  ): FrozenFeatureTinyAdapterTrainingResultV1;
}

export interface OnnxRuntimeTrainingWorkerProofV1 {
  readonly status: OnnxRuntimeTrainingWorkerProofStatus;
  readonly forward: boolean;
  readonly backward: boolean;
  readonly optimizerStep: boolean;
  readonly checkpointSaveLoad: boolean;
  readonly weightExport: boolean;
  readonly reason?: string;
}

export interface OnnxRuntimeTrainingBackendProofV1 {
  readonly schemaVersion: 1;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly trainingApiAvailable: boolean;
  readonly packageIncludesTrainingWasm: boolean;
  readonly workerProof: OnnxRuntimeTrainingWorkerProofV1;
  readonly privacy: {
    readonly inspectedPackageMetadataOnly: true;
    readonly containsAudio: false;
    readonly containsTranscript: false;
    readonly containsProfileData: false;
    readonly networkRequiredForProbe: false;
    readonly localOnly: true;
  };
}

export interface BrowserTrainingBackendSelectionOptionsV1 {
  readonly preferredKind?: BrowserTrainingBackendPreference;
  readonly onnxRuntimeTrainingProof?: OnnxRuntimeTrainingBackendProofV1;
}

export interface BrowserTrainingBackendFallbackV1 {
  readonly requestedKind: 'onnxruntime-web-training';
  readonly selectedKind: 'repository-fixed-adapter-math';
  readonly reasons: readonly BrowserTrainingBackendFallbackReason[];
  readonly message: string;
}

export interface BrowserTrainingBackendSelectionV1 {
  readonly schemaVersion: 1;
  readonly requestedKind: BrowserTrainingBackendPreference;
  readonly backend: BrowserTrainingBackend;
  readonly descriptor: BrowserTrainingBackendDescriptorV1;
  readonly fallback?: BrowserTrainingBackendFallbackV1;
  readonly privacy: {
    readonly inspectedPackageMetadataOnly: boolean;
    readonly containsAudio: false;
    readonly containsTranscript: false;
    readonly containsProfileData: false;
    readonly networkRequiredForProbe: false;
    readonly localOnly: true;
  };
}

export const repositoryFixedAdapterMathBackendDescriptorV1: BrowserTrainingBackendDescriptorV1 = {
  schemaVersion: 1,
  interface: 'BrowserTrainingBackend',
  backendId: 'repository-fixed-adapter-math-v1',
  kind: 'repository-fixed-adapter-math',
  proofStatus: 'fixed-adapter-math-required',
  algorithmId: 'browser-top-adapter-frame-ce-v1',
  trainableScope: 'top-residual-adapter',
  owner: 'dedicated-training-worker',
  availability: 'available',
  capabilities: {
    pause: true,
    cancel: true,
    checkpoint: true,
    reloadRecovery: true,
    fixedAdapterMath: true,
    onnxRuntimeTraining: false,
  },
  privacy: {
    localOnly: true,
    networkUpload: false,
    telemetry: false,
    exposesConcreteRuntimeToUi: false,
  },
};

export function createRepositoryFixedAdapterMathBackend(): BrowserTrainingBackend {
  return repositoryFixedAdapterMathBackend;
}

export function createDefaultBrowserTrainingBackend(): BrowserTrainingBackend {
  return selectBrowserTrainingBackend().backend;
}

export function selectBrowserTrainingBackend(
  options: BrowserTrainingBackendSelectionOptionsV1 = {},
): BrowserTrainingBackendSelectionV1 {
  const requestedKind = options.preferredKind ?? 'repository-fixed-adapter-math';
  const fallback =
    requestedKind === 'onnxruntime-web-training'
      ? createOnnxRuntimeTrainingFallback(options.onnxRuntimeTrainingProof)
      : undefined;
  const backend = createRepositoryFixedAdapterMathBackend();
  return {
    schemaVersion: 1,
    requestedKind,
    backend,
    descriptor: backend.descriptor,
    ...(fallback === undefined ? {} : { fallback }),
    privacy: {
      inspectedPackageMetadataOnly: options.onnxRuntimeTrainingProof !== undefined,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    },
  };
}

function createOnnxRuntimeTrainingFallback(
  proof: OnnxRuntimeTrainingBackendProofV1 | undefined,
): BrowserTrainingBackendFallbackV1 {
  const reasons = getOnnxRuntimeTrainingFallbackReasons(proof);
  return {
    requestedKind: 'onnxruntime-web-training',
    selectedKind: 'repository-fixed-adapter-math',
    reasons,
    message: `ONNX Runtime Training is unavailable (${reasons.join(', ')}); routing to repository fixed adapter-math backend.`,
  };
}

function getOnnxRuntimeTrainingFallbackReasons(
  proof: OnnxRuntimeTrainingBackendProofV1 | undefined,
): readonly BrowserTrainingBackendFallbackReason[] {
  if (proof === undefined) {
    return ['ort-training-proof-unavailable'];
  }
  const reasons: BrowserTrainingBackendFallbackReason[] = [];
  if (!proof.trainingApiAvailable) {
    reasons.push('ort-training-api-unavailable');
  }
  if (!proof.packageIncludesTrainingWasm) {
    reasons.push('ort-training-wasm-unavailable');
  }
  if (!hasPassedOnnxRuntimeTrainingWorkerProof(proof.workerProof)) {
    reasons.push('ort-training-worker-proof-not-passed');
  }
  if (reasons.length === 0) {
    reasons.push('ort-training-backend-not-implemented');
  }
  return reasons;
}

function hasPassedOnnxRuntimeTrainingWorkerProof(proof: OnnxRuntimeTrainingWorkerProofV1): boolean {
  return (
    proof.status === 'passed' &&
    proof.forward &&
    proof.backward &&
    proof.optimizerStep &&
    proof.checkpointSaveLoad &&
    proof.weightExport
  );
}

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
  readonly checkpointEveryEpochs?: number;
  readonly resumeFromCheckpoint?: FrozenFeatureTinyAdapterCheckpointV1;
  readonly shouldCancel?: (state: FrozenFeatureTinyAdapterProgressV1) => boolean;
  readonly shouldPause?: (state: FrozenFeatureTinyAdapterProgressV1) => boolean;
  readonly onProgress?: (state: FrozenFeatureTinyAdapterProgressV1) => void;
  readonly onCheckpoint?: (checkpoint: FrozenFeatureTinyAdapterCheckpointV1) => void;
}

export interface FrozenFeatureTinyAdapterProgressV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly epochs: number;
  readonly loss: number;
  readonly status: 'training' | 'completed' | 'cancelled' | 'paused';
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

export interface FrozenFeatureTinyAdapterCheckpointV1 {
  readonly schemaVersion: 1;
  readonly checkpointType: 'frozen-feature-tiny-adapter-checkpoint';
  readonly checkpointId: string;
  readonly datasetId: string;
  readonly epoch: number;
  readonly epochs: number;
  readonly loss: number;
  readonly initialLoss: number;
  readonly artifact: FrozenFeatureTinyAdapterArtifactV1;
  readonly compatibility: FrozenFeatureTinyAdapterCompatibilityV1;
  readonly privacy: BrowserTrainingPrivacyV1;
}

export interface FrozenFeatureTinyAdapterCompatibilityV1 {
  readonly baseModelId: string;
  readonly baseModelVersion: string;
  readonly graphContractSha256: string;
  readonly trainableScope: 'top-residual-adapter';
  readonly activationGateRequired: true;
  readonly importChecksumRequired: true;
}

export interface FrozenFeatureTinyAdapterRecoveryV1 {
  readonly checkpointId: string;
  readonly checkpointEpoch: number;
  readonly resumable: boolean;
  readonly reloadRecoverySupported: true;
  readonly previousActiveProfileIntact: true;
  readonly activationGateRequired: true;
}

export interface FrozenFeatureTinyAdapterTrainingResultV1 {
  readonly schemaVersion: 1;
  readonly status: BrowserTrainingPrototypeStatus;
  readonly workerOwner: 'dedicated-training-worker';
  readonly datasetId: string;
  readonly artifact: FrozenFeatureTinyAdapterArtifactV1;
  readonly checkpoint: FrozenFeatureTinyAdapterCheckpointV1;
  readonly metrics: {
    readonly examples: number;
    readonly epochsCompleted: number;
    readonly initialLoss: number;
    readonly finalLoss: number;
    readonly lossReduction: number;
  };
  readonly compatibility: FrozenFeatureTinyAdapterCompatibilityV1;
  readonly recovery: FrozenFeatureTinyAdapterRecoveryV1;
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
    checkpointEveryEpochs: 10,
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
  const session = createFrozenFeatureTinyAdapterTrainingSession(dataset, optionsInput);
  let status: BrowserTrainingPrototypeStatus = 'completed';

  while (session.epoch < session.options.epochs) {
    const progress = session.runEpoch();
    if (shouldEmitProgress(progress.epoch, session.options) || session.hasReachedTargetLoss()) {
      session.options.onProgress?.(progress);
    }
    if (session.shouldCheckpoint()) {
      session.options.onCheckpoint?.(session.createCheckpoint());
    }
    if (session.options.shouldCancel?.(progress) === true) {
      status = 'cancelled';
      const cancelled = session.createProgress('cancelled');
      session.options.onProgress?.(cancelled);
      session.options.onCheckpoint?.(session.createCheckpoint());
      break;
    }
    if (session.options.shouldPause?.(progress) === true) {
      status = 'paused';
      const paused = session.createProgress('paused');
      session.options.onProgress?.(paused);
      session.options.onCheckpoint?.(session.createCheckpoint());
      break;
    }
    if (session.hasReachedTargetLoss()) {
      break;
    }
  }

  if (status === 'completed') {
    session.options.onProgress?.(session.createProgress('completed'));
  }

  return session.finish(status);
}

export function createFrozenFeatureTinyAdapterTrainingSession(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  optionsInput: Partial<FrozenFeatureTinyAdapterTrainingOptions> = {},
): FrozenFeatureTinyAdapterTrainingSession {
  return new FrozenFeatureTinyAdapterTrainingSession(dataset, optionsInput);
}

const repositoryFixedAdapterMathBackend: BrowserTrainingBackend = {
  descriptor: repositoryFixedAdapterMathBackendDescriptorV1,
  createSession: (dataset, options) =>
    createFrozenFeatureTinyAdapterTrainingSession(dataset, options),
  train: (dataset, options) => trainFrozenFeatureTinyAdapter(dataset, options),
};

export class FrozenFeatureTinyAdapterTrainingSession implements BrowserTrainingBackendSession {
  readonly backend = repositoryFixedAdapterMathBackendDescriptorV1;
  readonly dataset: FrozenFeatureTinyAdapterDatasetV1;
  readonly options: FrozenFeatureTinyAdapterTrainingOptions;
  readonly parameterCount: number;
  readonly initialLoss: number;

  private readonly weights: number[];
  private readonly bias: number[];
  private currentEpoch: number;
  private currentLoss: number;

  constructor(
    dataset: FrozenFeatureTinyAdapterDatasetV1,
    optionsInput: Partial<FrozenFeatureTinyAdapterTrainingOptions> = {},
  ) {
    validateFrozenFeatureTinyAdapterDataset(dataset);
    this.options = normalizeTrainingOptions(optionsInput);
    this.dataset = dataset;
    this.parameterCount =
      dataset.featureDimension * dataset.outputDimension + dataset.outputDimension;
    if (this.parameterCount > this.options.maxParameterCount) {
      throw new Error(
        `Frozen-feature adapter parameter count ${this.parameterCount.toString()} exceeds limit ${this.options.maxParameterCount.toString()}.`,
      );
    }

    const checkpoint = this.options.resumeFromCheckpoint;
    if (checkpoint !== undefined) {
      validateFrozenFeatureTinyAdapterCheckpoint(dataset, checkpoint);
      if (checkpoint.epochs > this.options.epochs) {
        throw new Error(
          'Frozen-feature checkpoint epoch budget exceeds requested training epochs.',
        );
      }
      this.weights = [...checkpoint.artifact.weights];
      this.bias = [...checkpoint.artifact.bias];
      this.currentEpoch = checkpoint.epoch;
      this.initialLoss = checkpoint.initialLoss;
      this.currentLoss = checkpoint.loss;
      return;
    }

    this.weights = new Array<number>(dataset.featureDimension * dataset.outputDimension).fill(0);
    this.bias = new Array<number>(dataset.outputDimension).fill(0);
    this.currentEpoch = 0;
    this.initialLoss = calculateLoss(
      dataset,
      this.weights,
      this.bias,
      this.options.l2Regularization,
    );
    this.currentLoss = this.initialLoss;
  }

  get epoch(): number {
    return this.currentEpoch;
  }

  get loss(): number {
    return this.currentLoss;
  }

  runEpoch(): FrozenFeatureTinyAdapterProgressV1 {
    if (this.currentEpoch >= this.options.epochs) {
      return this.createProgress('completed');
    }
    runSgdEpoch(
      this.dataset,
      this.weights,
      this.bias,
      this.options.learningRate,
      this.options.l2Regularization,
    );
    this.currentEpoch += 1;
    this.currentLoss = calculateLoss(
      this.dataset,
      this.weights,
      this.bias,
      this.options.l2Regularization,
    );
    return this.createProgress('training');
  }

  hasReachedTargetLoss(): boolean {
    return this.options.targetLoss !== undefined && this.currentLoss <= this.options.targetLoss;
  }

  shouldCheckpoint(): boolean {
    return (
      this.options.checkpointEveryEpochs !== undefined &&
      this.currentEpoch > 0 &&
      this.currentEpoch % this.options.checkpointEveryEpochs === 0
    );
  }

  createProgress(
    status: FrozenFeatureTinyAdapterProgressV1['status'],
  ): FrozenFeatureTinyAdapterProgressV1 {
    return createProgress(this.currentEpoch, this.options.epochs, this.currentLoss, status);
  }

  createCheckpoint(): FrozenFeatureTinyAdapterCheckpointV1 {
    const artifact = createArtifact(this.dataset, this.weights, this.bias, this.parameterCount);
    const checkpoint: FrozenFeatureTinyAdapterCheckpointV1 = {
      schemaVersion: 1,
      checkpointType: 'frozen-feature-tiny-adapter-checkpoint',
      checkpointId: createCheckpointId(
        this.dataset.datasetId,
        this.currentEpoch,
        artifact.checksum,
      ),
      datasetId: this.dataset.datasetId,
      epoch: this.currentEpoch,
      epochs: this.options.epochs,
      loss: roundFloat(this.currentLoss),
      initialLoss: roundFloat(this.initialLoss),
      artifact,
      compatibility: createCompatibility(this.dataset),
      privacy: createBrowserTrainingPrivacy({
        containsPrivateFrozenFeatureValues: this.dataset.privacy.containsPrivateFrozenFeatureValues,
        containsProfileData: this.dataset.privacy.containsProfileData,
      }),
    };
    return validateFrozenFeatureTinyAdapterCheckpoint(this.dataset, checkpoint);
  }

  finish(status: BrowserTrainingPrototypeStatus): FrozenFeatureTinyAdapterTrainingResultV1 {
    const artifact = createArtifact(this.dataset, this.weights, this.bias, this.parameterCount);
    const checkpoint = this.createCheckpoint();
    return {
      schemaVersion: 1,
      status,
      workerOwner: 'dedicated-training-worker',
      datasetId: this.dataset.datasetId,
      artifact,
      checkpoint,
      metrics: {
        examples: this.dataset.examples.length,
        epochsCompleted: this.currentEpoch,
        initialLoss: roundFloat(this.initialLoss),
        finalLoss: roundFloat(this.currentLoss),
        lossReduction: roundFloat(this.initialLoss - this.currentLoss),
      },
      compatibility: createCompatibility(this.dataset),
      recovery: {
        checkpointId: checkpoint.checkpointId,
        checkpointEpoch: checkpoint.epoch,
        resumable: status !== 'completed' && checkpoint.epoch < this.options.epochs,
        reloadRecoverySupported: true,
        previousActiveProfileIntact: true,
        activationGateRequired: true,
      },
      privacy: createBrowserTrainingPrivacy({
        containsPrivateFrozenFeatureValues: this.dataset.privacy.containsPrivateFrozenFeatureValues,
        containsProfileData: this.dataset.privacy.containsProfileData,
      }),
    };
  }
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
  if (
    dataset.source.kind !== 'synthetic-ci-fixture' &&
    dataset.source.kind !== 'profile-frozen-features'
  ) {
    throw new Error('Frozen-feature dataset source kind is unsupported.');
  }
  if (!dataset.source.baseModelId.trim() || !dataset.source.baseModelVersion.trim()) {
    throw new Error('Frozen-feature dataset base model identity is required.');
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

export function validateFrozenFeatureTinyAdapterCheckpoint(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  checkpoint: FrozenFeatureTinyAdapterCheckpointV1,
): FrozenFeatureTinyAdapterCheckpointV1 {
  validateFrozenFeatureTinyAdapterDataset(dataset);
  if (checkpoint.schemaVersion !== 1) {
    throw new Error('Frozen-feature tiny-adapter checkpoint schemaVersion must be 1.');
  }
  if (checkpoint.checkpointType !== 'frozen-feature-tiny-adapter-checkpoint') {
    throw new Error('Frozen-feature tiny-adapter checkpoint type is invalid.');
  }
  if (!checkpoint.checkpointId.trim()) {
    throw new Error('Frozen-feature tiny-adapter checkpointId is required.');
  }
  if (checkpoint.datasetId !== dataset.datasetId) {
    throw new Error('Frozen-feature tiny-adapter checkpoint datasetId does not match dataset.');
  }
  assertNonNegativeInteger(checkpoint.epoch, 'checkpoint epoch');
  assertPositiveInteger(checkpoint.epochs, 'checkpoint epochs');
  if (checkpoint.epoch > checkpoint.epochs) {
    throw new Error('Frozen-feature tiny-adapter checkpoint epoch exceeds epoch budget.');
  }
  assertFiniteNumber(checkpoint.loss, 'checkpoint loss');
  assertFiniteNumber(checkpoint.initialLoss, 'checkpoint initialLoss');
  validateArtifact(dataset, checkpoint.artifact);
  if (
    checkpoint.checkpointId !==
    createCheckpointId(dataset.datasetId, checkpoint.epoch, checkpoint.artifact.checksum)
  ) {
    throw new Error('Frozen-feature tiny-adapter checkpointId does not match checkpoint artifact.');
  }
  validateCompatibility(dataset, checkpoint.compatibility);
  if (
    checkpoint.privacy.containsRawAudio ||
    checkpoint.privacy.containsTranscriptText ||
    checkpoint.privacy.networkUpload !== false ||
    checkpoint.privacy.telemetry !== false ||
    checkpoint.privacy.localOnly !== true
  ) {
    throw new Error('Frozen-feature tiny-adapter checkpoint privacy flags must remain local-only.');
  }
  if (
    checkpoint.privacy.containsPrivateFrozenFeatureValues !==
      dataset.privacy.containsPrivateFrozenFeatureValues ||
    checkpoint.privacy.containsProfileData !== dataset.privacy.containsProfileData
  ) {
    throw new Error('Frozen-feature tiny-adapter checkpoint privacy flags do not match dataset.');
  }
  return checkpoint;
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
  assertPositiveInteger(options.maxParameterCount, 'maxParameterCount');
  if (options.l2Regularization < 0 || !Number.isFinite(options.l2Regularization)) {
    throw new Error('l2Regularization must be a finite non-negative number.');
  }
  if (
    options.targetLoss !== undefined &&
    (!Number.isFinite(options.targetLoss) || options.targetLoss < 0)
  ) {
    throw new Error('targetLoss must be non-negative when provided.');
  }
  if (options.progressEveryEpochs !== undefined) {
    assertPositiveInteger(options.progressEveryEpochs, 'progressEveryEpochs');
  }
  if (options.checkpointEveryEpochs !== undefined) {
    assertPositiveInteger(options.checkpointEveryEpochs, 'checkpointEveryEpochs');
  }
  return options;
}

function createArtifact(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  weights: readonly number[],
  bias: readonly number[],
  parameterCount: number,
): FrozenFeatureTinyAdapterArtifactV1 {
  const roundedWeights = weights.map(roundFloat);
  const roundedBias = bias.map(roundFloat);
  return {
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
}

function validateArtifact(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  artifact: FrozenFeatureTinyAdapterArtifactV1,
): void {
  if (artifact.schemaVersion !== 1 || artifact.artifactType !== 'frozen-feature-affine-adapter') {
    throw new Error('Frozen-feature tiny-adapter artifact type is invalid.');
  }
  if (artifact.trainableScope !== 'top-residual-adapter' || artifact.precision !== 'float32') {
    throw new Error('Frozen-feature tiny-adapter artifact scope or precision is invalid.');
  }
  if (
    artifact.featureDimension !== dataset.featureDimension ||
    artifact.outputDimension !== dataset.outputDimension
  ) {
    throw new Error('Frozen-feature tiny-adapter artifact dimensions do not match dataset.');
  }
  const expectedParameterCount =
    dataset.featureDimension * dataset.outputDimension + dataset.outputDimension;
  if (artifact.parameterCount !== expectedParameterCount) {
    throw new Error('Frozen-feature tiny-adapter artifact parameter count is invalid.');
  }
  if (artifact.weights.length !== dataset.featureDimension * dataset.outputDimension) {
    throw new Error('Frozen-feature tiny-adapter artifact weights have the wrong length.');
  }
  if (artifact.bias.length !== dataset.outputDimension) {
    throw new Error('Frozen-feature tiny-adapter artifact bias has the wrong length.');
  }
  for (const value of [...artifact.weights, ...artifact.bias]) {
    assertFiniteNumber(value, 'frozen-feature tiny-adapter artifact value');
  }
  if (artifact.checksum !== checksumTinyAdapter(artifact.weights, artifact.bias)) {
    throw new Error('Frozen-feature tiny-adapter artifact checksum does not match weights.');
  }
}

function createCompatibility(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
): FrozenFeatureTinyAdapterCompatibilityV1 {
  return {
    baseModelId: dataset.source.baseModelId,
    baseModelVersion: dataset.source.baseModelVersion,
    graphContractSha256: dataset.source.graphContractSha256,
    trainableScope: 'top-residual-adapter',
    activationGateRequired: true,
    importChecksumRequired: true,
  };
}

function validateCompatibility(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  compatibility: FrozenFeatureTinyAdapterCompatibilityV1,
): void {
  const expected = createCompatibility(dataset);
  if (
    compatibility.baseModelId !== expected.baseModelId ||
    compatibility.baseModelVersion !== expected.baseModelVersion ||
    compatibility.graphContractSha256 !== expected.graphContractSha256 ||
    compatibility.trainableScope !== expected.trainableScope ||
    compatibility.activationGateRequired !== true ||
    compatibility.importChecksumRequired !== true
  ) {
    throw new Error('Frozen-feature tiny-adapter compatibility does not match dataset.');
  }
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

function createCheckpointId(datasetId: string, epoch: number, checksum: string): string {
  return `${datasetId}:epoch-${epoch.toString()}:${checksum}`;
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

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
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
