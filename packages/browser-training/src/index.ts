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

export type FrozenFeatureTinyAdapterExampleSplit = 'train' | 'validation';
export type FrozenFeatureTinyAdapterOptimizerKind = 'sgd' | 'adamw';
export type FrozenFeatureTinyAdapterLearningRateSchedule = 'constant' | 'linear-decay';

export interface FrozenFeatureTinyAdapterExampleV1 {
  readonly id: string;
  readonly features: readonly number[];
  readonly targetResidual: readonly number[];
  readonly weight?: number;
  readonly frameCount?: number;
  readonly conditionKey?: string;
  readonly split?: FrozenFeatureTinyAdapterExampleSplit;
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
  readonly optimizer: FrozenFeatureTinyAdapterOptimizerKind;
  readonly batchSize: number;
  readonly samplerSeed: string;
  readonly lengthBucketCount: number;
  readonly conditionBalanced: boolean;
  readonly gradientClipNorm?: number;
  readonly learningRateSchedule: FrozenFeatureTinyAdapterLearningRateSchedule;
  readonly minLearningRateRatio: number;
  readonly validationEveryEpochs?: number;
  readonly earlyStoppingPatience?: number;
  readonly earlyStoppingMinDelta: number;
  readonly progressEveryEpochs?: number;
  readonly checkpointEveryEpochs?: number;
  readonly resumeFromCheckpoint?: FrozenFeatureTinyAdapterCheckpointV1;
  readonly shouldCancel?: (state: FrozenFeatureTinyAdapterProgressV1) => boolean;
  readonly shouldPause?: (state: FrozenFeatureTinyAdapterProgressV1) => boolean;
  readonly onProgress?: (state: FrozenFeatureTinyAdapterProgressV1) => void;
  readonly onCheckpoint?: (checkpoint: FrozenFeatureTinyAdapterCheckpointV1) => void;
}

export interface FrozenFeatureTinyAdapterSamplerDiagnosticsV1 {
  readonly seedFingerprint: string;
  readonly batchSize: number;
  readonly lengthBucketCount: number;
  readonly conditionBalanced: boolean;
  readonly trainingExamples: number;
  readonly validationExamples: number;
  readonly batchesPerEpoch: number;
  readonly conditionExampleCounts: Readonly<Record<string, number>>;
  readonly lengthBucketExampleCounts: Readonly<Record<string, number>>;
}

export interface FrozenFeatureTinyAdapterOptimizationDiagnosticsV1 {
  readonly optimizer: FrozenFeatureTinyAdapterOptimizerKind;
  readonly learningRateSchedule: FrozenFeatureTinyAdapterLearningRateSchedule;
  readonly minLearningRateRatio: number;
  readonly lastLearningRate: number;
  readonly gradientClipNorm?: number;
  readonly gradientClipEvents: number;
}

export interface FrozenFeatureTinyAdapterValidationDiagnosticsV1 {
  readonly enabled: boolean;
  readonly everyEpochs?: number;
  readonly loss?: number;
  readonly bestLoss?: number;
  readonly bestEpoch?: number;
  readonly epochsWithoutImprovement: number;
  readonly stoppedEarly: boolean;
}

export interface FrozenFeatureTinyAdapterSafetyDiagnosticsV1 {
  readonly finiteLoss: true;
  readonly nanInfGuardTriggered: false;
}

export interface FrozenFeatureTinyAdapterTrainingDiagnosticsV1 {
  readonly sampler: FrozenFeatureTinyAdapterSamplerDiagnosticsV1;
  readonly optimization: FrozenFeatureTinyAdapterOptimizationDiagnosticsV1;
  readonly validation: FrozenFeatureTinyAdapterValidationDiagnosticsV1;
  readonly safety: FrozenFeatureTinyAdapterSafetyDiagnosticsV1;
}

export interface FrozenFeatureTinyAdapterProgressV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly epochs: number;
  readonly loss: number;
  readonly status: 'training' | 'completed' | 'cancelled' | 'paused';
  readonly validationLoss?: number;
  readonly learningRate?: number;
  readonly optimizer?: FrozenFeatureTinyAdapterOptimizerKind;
  readonly stoppedEarly?: boolean;
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
  readonly resumeState: FrozenFeatureTinyAdapterCheckpointResumeStateV1;
  readonly resumeStateChecksum: string;
  readonly compatibility: FrozenFeatureTinyAdapterCompatibilityV1;
  readonly privacy: BrowserTrainingPrivacyV1;
}

export interface FrozenFeatureTinyAdapterCheckpointResumeStateV1 {
  readonly schemaVersion: 1;
  readonly stateType: 'frozen-feature-tiny-adapter-resume-state';
  readonly trainingConfigFingerprint: string;
  readonly datasetFingerprint: string;
  readonly epoch: number;
  readonly nextEpoch: number;
  readonly loss: number;
  readonly initialLoss: number;
  readonly parameterState: {
    readonly weights: readonly number[];
    readonly bias: readonly number[];
  };
  readonly optimizerState: FrozenFeatureTinyAdapterCheckpointOptimizerStateV1;
  readonly samplerState: {
    readonly deterministicOrdering: 'stable-hash-v1';
    readonly seedFingerprint: string;
    readonly nextEpoch: number;
  };
  readonly validationState: {
    readonly latestLoss?: number;
    readonly bestLoss?: number;
    readonly bestEpoch?: number;
    readonly epochsWithoutImprovement: number;
    readonly stoppedEarly: boolean;
  };
  readonly optimizationState: {
    readonly gradientClipEvents: number;
    readonly lastLearningRate: number;
  };
}

export type FrozenFeatureTinyAdapterCheckpointOptimizerStateV1 =
  | {
      readonly optimizer: 'sgd';
      readonly step: number;
    }
  | {
      readonly optimizer: 'adamw';
      readonly weightM: readonly number[];
      readonly weightV: readonly number[];
      readonly biasM: readonly number[];
      readonly biasV: readonly number[];
      readonly step: number;
    };

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
    readonly validationLoss?: number;
    readonly bestValidationLoss?: number;
    readonly bestValidationEpoch?: number;
    readonly stoppedEarly: boolean;
  };
  readonly diagnostics: FrozenFeatureTinyAdapterTrainingDiagnosticsV1;
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
    optimizer: 'adamw',
    batchSize: 8,
    samplerSeed: 'browser-training-fixed-adapter-v1',
    lengthBucketCount: 4,
    conditionBalanced: true,
    gradientClipNorm: 1,
    learningRateSchedule: 'linear-decay',
    minLearningRateRatio: 0.1,
    validationEveryEpochs: 1,
    earlyStoppingMinDelta: 0,
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

  private readonly trainExamples: readonly FrozenFeatureTinyAdapterExampleV1[];
  private readonly validationExamples: readonly FrozenFeatureTinyAdapterExampleV1[];
  private readonly samplerDiagnostics: FrozenFeatureTinyAdapterSamplerDiagnosticsV1;
  private readonly weights: number[];
  private readonly bias: number[];
  private readonly optimizerState: AdamWOptimizerState;
  private currentEpoch: number;
  private currentLoss: number;
  private latestValidationLoss: number | undefined;
  private bestValidationLoss: number | undefined;
  private bestValidationEpoch: number | undefined;
  private epochsWithoutValidationImprovement: number;
  private earlyStopped: boolean;
  private gradientClipEvents: number;
  private lastLearningRate: number;

  constructor(
    dataset: FrozenFeatureTinyAdapterDatasetV1,
    optionsInput: Partial<FrozenFeatureTinyAdapterTrainingOptions> = {},
  ) {
    validateFrozenFeatureTinyAdapterDataset(dataset);
    this.options = normalizeTrainingOptions(optionsInput);
    this.dataset = dataset;
    this.trainExamples = dataset.examples.filter((example) => example.split !== 'validation');
    this.validationExamples = dataset.examples.filter((example) => example.split === 'validation');
    this.samplerDiagnostics = createSamplerDiagnostics(dataset, this.trainExamples, this.options);
    this.parameterCount =
      dataset.featureDimension * dataset.outputDimension + dataset.outputDimension;
    this.optimizerState = createAdamWOptimizerState(
      dataset.featureDimension * dataset.outputDimension,
      dataset.outputDimension,
    );
    this.epochsWithoutValidationImprovement = 0;
    this.earlyStopped = false;
    this.gradientClipEvents = 0;
    this.lastLearningRate = this.options.learningRate;
    if (this.parameterCount > this.options.maxParameterCount) {
      throw new Error(
        `Frozen-feature adapter parameter count ${this.parameterCount.toString()} exceeds limit ${this.options.maxParameterCount.toString()}.`,
      );
    }

    const checkpoint = this.options.resumeFromCheckpoint;
    if (checkpoint !== undefined) {
      validateFrozenFeatureTinyAdapterCheckpoint(dataset, checkpoint);
      validateCheckpointResumeOptions(this.options, checkpoint);
      this.weights = [...checkpoint.resumeState.parameterState.weights];
      this.bias = [...checkpoint.resumeState.parameterState.bias];
      restoreOptimizerState(this.optimizerState, checkpoint.resumeState.optimizerState);
      this.currentEpoch = checkpoint.epoch;
      this.initialLoss = checkpoint.resumeState.initialLoss;
      this.currentLoss = checkpoint.resumeState.loss;
      this.latestValidationLoss = checkpoint.resumeState.validationState.latestLoss;
      this.bestValidationLoss = checkpoint.resumeState.validationState.bestLoss;
      this.bestValidationEpoch = checkpoint.resumeState.validationState.bestEpoch;
      this.epochsWithoutValidationImprovement =
        checkpoint.resumeState.validationState.epochsWithoutImprovement;
      this.earlyStopped = checkpoint.resumeState.validationState.stoppedEarly;
      this.gradientClipEvents = checkpoint.resumeState.optimizationState.gradientClipEvents;
      this.lastLearningRate = checkpoint.resumeState.optimizationState.lastLearningRate;
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
    this.latestValidationLoss = calculateValidationLoss(
      this.validationExamples,
      this.weights,
      this.bias,
      this.options.l2Regularization,
    );
    this.bestValidationLoss = this.latestValidationLoss;
    this.bestValidationEpoch = this.latestValidationLoss === undefined ? undefined : 0;
  }

  get epoch(): number {
    return this.currentEpoch;
  }

  get loss(): number {
    return this.currentLoss;
  }

  runEpoch(): FrozenFeatureTinyAdapterProgressV1 {
    if (this.currentEpoch >= this.options.epochs || this.earlyStopped) {
      return this.createProgress('completed');
    }
    const nextEpoch = this.currentEpoch + 1;
    this.lastLearningRate = getScheduledLearningRate(this.options, nextEpoch);
    if (this.options.optimizer === 'sgd') {
      runSgdEpoch(
        this.trainExamples,
        this.weights,
        this.bias,
        this.dataset.featureDimension,
        this.dataset.outputDimension,
        this.lastLearningRate,
        this.options.l2Regularization,
      );
    } else {
      const outcome = runAdamWEpoch(
        this.dataset,
        this.trainExamples,
        this.weights,
        this.bias,
        this.optimizerState,
        this.options,
        nextEpoch,
        this.lastLearningRate,
      );
      this.gradientClipEvents += outcome.gradientClipEvents;
    }
    assertFiniteTrainingState(this.weights, this.bias, 'frozen-feature tiny-adapter parameters');
    this.currentEpoch = nextEpoch;
    this.currentLoss = calculateLoss(
      this.dataset,
      this.weights,
      this.bias,
      this.options.l2Regularization,
    );
    assertFiniteNumber(this.currentLoss, 'frozen-feature tiny-adapter loss');
    this.updateValidationState();
    return this.createProgress('training');
  }

  hasReachedTargetLoss(): boolean {
    return (
      this.earlyStopped ||
      (this.options.targetLoss !== undefined && this.currentLoss <= this.options.targetLoss)
    );
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
    return createProgress({
      epoch: this.currentEpoch,
      epochs: this.options.epochs,
      loss: this.currentLoss,
      status,
      ...(this.latestValidationLoss === undefined
        ? {}
        : { validationLoss: this.latestValidationLoss }),
      learningRate: this.lastLearningRate,
      optimizer: this.options.optimizer,
      stoppedEarly: this.earlyStopped,
    });
  }

  createCheckpoint(): FrozenFeatureTinyAdapterCheckpointV1 {
    const artifact = createArtifact(this.dataset, this.weights, this.bias, this.parameterCount);
    const resumeState = this.createResumeState();
    const resumeStateChecksum = checksumResumeState(resumeState);
    const checkpoint: FrozenFeatureTinyAdapterCheckpointV1 = {
      schemaVersion: 1,
      checkpointType: 'frozen-feature-tiny-adapter-checkpoint',
      checkpointId: createCheckpointId(
        this.dataset.datasetId,
        this.currentEpoch,
        artifact.checksum,
        resumeStateChecksum,
      ),
      datasetId: this.dataset.datasetId,
      epoch: this.currentEpoch,
      epochs: this.options.epochs,
      loss: roundFloat(this.currentLoss),
      initialLoss: roundFloat(this.initialLoss),
      artifact,
      resumeState,
      resumeStateChecksum,
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
        ...(this.latestValidationLoss === undefined
          ? {}
          : { validationLoss: roundFloat(this.latestValidationLoss) }),
        ...(this.bestValidationLoss === undefined
          ? {}
          : { bestValidationLoss: roundFloat(this.bestValidationLoss) }),
        ...(this.bestValidationEpoch === undefined
          ? {}
          : { bestValidationEpoch: this.bestValidationEpoch }),
        stoppedEarly: this.earlyStopped,
      },
      diagnostics: this.createDiagnostics(),
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

  private createResumeState(): FrozenFeatureTinyAdapterCheckpointResumeStateV1 {
    return {
      schemaVersion: 1,
      stateType: 'frozen-feature-tiny-adapter-resume-state',
      trainingConfigFingerprint: createTrainingConfigFingerprint(this.options),
      datasetFingerprint: createDatasetFingerprint(this.dataset),
      epoch: this.currentEpoch,
      nextEpoch: this.currentEpoch + 1,
      loss: this.currentLoss,
      initialLoss: this.initialLoss,
      parameterState: {
        weights: [...this.weights],
        bias: [...this.bias],
      },
      optimizerState: createCheckpointOptimizerState(
        this.options.optimizer,
        this.optimizerState,
        this.currentEpoch,
      ),
      samplerState: {
        deterministicOrdering: 'stable-hash-v1',
        seedFingerprint: createDiagnosticFingerprint('sampler-seed', this.options.samplerSeed),
        nextEpoch: this.currentEpoch + 1,
      },
      validationState: {
        ...(this.latestValidationLoss === undefined
          ? {}
          : { latestLoss: this.latestValidationLoss }),
        ...(this.bestValidationLoss === undefined ? {} : { bestLoss: this.bestValidationLoss }),
        ...(this.bestValidationEpoch === undefined ? {} : { bestEpoch: this.bestValidationEpoch }),
        epochsWithoutImprovement: this.epochsWithoutValidationImprovement,
        stoppedEarly: this.earlyStopped,
      },
      optimizationState: {
        gradientClipEvents: this.gradientClipEvents,
        lastLearningRate: this.lastLearningRate,
      },
    };
  }

  private updateValidationState(): void {
    if (
      this.validationExamples.length === 0 ||
      this.options.validationEveryEpochs === undefined ||
      this.currentEpoch % this.options.validationEveryEpochs !== 0
    ) {
      return;
    }
    this.latestValidationLoss = calculateValidationLoss(
      this.validationExamples,
      this.weights,
      this.bias,
      this.options.l2Regularization,
    );
    if (this.latestValidationLoss === undefined) return;
    assertFiniteNumber(this.latestValidationLoss, 'frozen-feature tiny-adapter validation loss');
    const minDelta = this.options.earlyStoppingMinDelta;
    if (
      this.bestValidationLoss === undefined ||
      this.latestValidationLoss < this.bestValidationLoss - minDelta
    ) {
      this.bestValidationLoss = this.latestValidationLoss;
      this.bestValidationEpoch = this.currentEpoch;
      this.epochsWithoutValidationImprovement = 0;
      return;
    }
    this.epochsWithoutValidationImprovement += 1;
    if (
      this.options.earlyStoppingPatience !== undefined &&
      this.epochsWithoutValidationImprovement >= this.options.earlyStoppingPatience
    ) {
      this.earlyStopped = true;
    }
  }

  private createDiagnostics(): FrozenFeatureTinyAdapterTrainingDiagnosticsV1 {
    return {
      sampler: this.samplerDiagnostics,
      optimization: {
        optimizer: this.options.optimizer,
        learningRateSchedule: this.options.learningRateSchedule,
        minLearningRateRatio: roundFloat(this.options.minLearningRateRatio),
        lastLearningRate: roundFloat(this.lastLearningRate),
        ...(this.options.gradientClipNorm === undefined
          ? {}
          : { gradientClipNorm: roundFloat(this.options.gradientClipNorm) }),
        gradientClipEvents: this.gradientClipEvents,
      },
      validation: {
        enabled: this.validationExamples.length > 0,
        ...(this.options.validationEveryEpochs === undefined
          ? {}
          : { everyEpochs: this.options.validationEveryEpochs }),
        ...(this.latestValidationLoss === undefined
          ? {}
          : { loss: roundFloat(this.latestValidationLoss) }),
        ...(this.bestValidationLoss === undefined
          ? {}
          : { bestLoss: roundFloat(this.bestValidationLoss) }),
        ...(this.bestValidationEpoch === undefined ? {} : { bestEpoch: this.bestValidationEpoch }),
        epochsWithoutImprovement: this.epochsWithoutValidationImprovement,
        stoppedEarly: this.earlyStopped,
      },
      safety: {
        finiteLoss: true,
        nanInfGuardTriggered: false,
      },
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
  let trainingExampleCount = 0;
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
    if (example.frameCount !== undefined) {
      assertPositiveInteger(example.frameCount, `example ${example.id} frameCount`);
    }
    if (example.conditionKey !== undefined && !example.conditionKey.trim()) {
      throw new Error(`Example ${example.id} conditionKey must not be empty.`);
    }
    if (
      example.split !== undefined &&
      example.split !== 'train' &&
      example.split !== 'validation'
    ) {
      throw new Error(`Example ${example.id} split is unsupported.`);
    }
    if (example.split !== 'validation') {
      trainingExampleCount += 1;
    }
  }
  if (trainingExampleCount === 0) {
    throw new Error(
      'Frozen-feature tiny-adapter training requires at least one train split example.',
    );
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
  validateCheckpointResumeState(dataset, checkpoint);
  if (
    checkpoint.checkpointId !==
    createCheckpointId(
      dataset.datasetId,
      checkpoint.epoch,
      checkpoint.artifact.checksum,
      checkpoint.resumeStateChecksum,
    )
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

function validateCheckpointResumeState(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  checkpoint: FrozenFeatureTinyAdapterCheckpointV1,
): void {
  const state = checkpoint.resumeState as
    | FrozenFeatureTinyAdapterCheckpointResumeStateV1
    | undefined;
  if (
    state === undefined ||
    state.schemaVersion !== 1 ||
    state.stateType !== 'frozen-feature-tiny-adapter-resume-state'
  ) {
    throw new Error('Frozen-feature tiny-adapter checkpoint resume state is invalid.');
  }
  if (state.datasetFingerprint !== createDatasetFingerprint(dataset)) {
    throw new Error('Frozen-feature tiny-adapter checkpoint dataset fingerprint is invalid.');
  }
  if (state.epoch !== checkpoint.epoch || state.nextEpoch !== checkpoint.epoch + 1) {
    throw new Error('Frozen-feature tiny-adapter checkpoint resume epoch state is invalid.');
  }
  if (state.samplerState.nextEpoch !== state.nextEpoch) {
    throw new Error('Frozen-feature tiny-adapter checkpoint sampler state is invalid.');
  }
  if (state.samplerState.deterministicOrdering !== 'stable-hash-v1') {
    throw new Error('Frozen-feature tiny-adapter checkpoint sampler ordering is unsupported.');
  }
  if (!/^sampler-seed:fnv1a32:[a-f0-9]{8}$/.test(state.samplerState.seedFingerprint)) {
    throw new Error('Frozen-feature tiny-adapter checkpoint sampler seed fingerprint is invalid.');
  }
  assertFiniteNumber(state.loss, 'checkpoint resume loss');
  assertFiniteNumber(state.initialLoss, 'checkpoint resume initialLoss');
  if (
    checkpoint.loss !== roundFloat(state.loss) ||
    checkpoint.initialLoss !== roundFloat(state.initialLoss)
  ) {
    throw new Error(
      'Frozen-feature tiny-adapter checkpoint rounded losses do not match resume state.',
    );
  }
  const expectedWeightCount = dataset.featureDimension * dataset.outputDimension;
  if (state.parameterState.weights.length !== expectedWeightCount) {
    throw new Error('Frozen-feature tiny-adapter checkpoint resume weights have the wrong length.');
  }
  if (state.parameterState.bias.length !== dataset.outputDimension) {
    throw new Error('Frozen-feature tiny-adapter checkpoint resume bias has the wrong length.');
  }
  for (const value of [...state.parameterState.weights, ...state.parameterState.bias]) {
    assertFiniteNumber(value, 'checkpoint resume parameter');
  }
  if (
    checksumTinyAdapter(
      state.parameterState.weights.map(roundFloat),
      state.parameterState.bias.map(roundFloat),
    ) !== checkpoint.artifact.checksum
  ) {
    throw new Error(
      'Frozen-feature tiny-adapter checkpoint resume parameters do not match artifact.',
    );
  }
  validateCheckpointOptimizerState(
    state.optimizerState,
    expectedWeightCount,
    dataset.outputDimension,
  );
  validateCheckpointValidationState(state.validationState);
  assertNonNegativeInteger(
    state.optimizationState.gradientClipEvents,
    'checkpoint resume gradientClipEvents',
  );
  assertFiniteNumber(
    state.optimizationState.lastLearningRate,
    'checkpoint resume lastLearningRate',
  );
  if (checkpoint.resumeStateChecksum !== checksumResumeState(state)) {
    throw new Error('Frozen-feature tiny-adapter checkpoint resume state checksum is invalid.');
  }
}

function validateCheckpointOptimizerState(
  state: FrozenFeatureTinyAdapterCheckpointOptimizerStateV1,
  weightParameterCount: number,
  biasParameterCount: number,
): void {
  if (state.optimizer === 'sgd') {
    assertNonNegativeInteger(state.step, 'checkpoint SGD optimizer step');
    return;
  }
  if (state.optimizer !== 'adamw') {
    throw new Error('Frozen-feature tiny-adapter checkpoint optimizer state is unsupported.');
  }
  if (
    state.weightM.length !== weightParameterCount ||
    state.weightV.length !== weightParameterCount ||
    state.biasM.length !== biasParameterCount ||
    state.biasV.length !== biasParameterCount
  ) {
    throw new Error(
      'Frozen-feature tiny-adapter checkpoint AdamW optimizer state has wrong dimensions.',
    );
  }
  for (const value of [...state.weightM, ...state.weightV, ...state.biasM, ...state.biasV]) {
    assertFiniteNumber(value, 'checkpoint AdamW optimizer value');
  }
  assertNonNegativeInteger(state.step, 'checkpoint AdamW optimizer step');
}

function validateCheckpointValidationState(
  state: FrozenFeatureTinyAdapterCheckpointResumeStateV1['validationState'],
): void {
  if (state.latestLoss !== undefined)
    assertFiniteNumber(state.latestLoss, 'checkpoint validation loss');
  if (state.bestLoss !== undefined)
    assertFiniteNumber(state.bestLoss, 'checkpoint best validation loss');
  if (state.bestEpoch !== undefined)
    assertNonNegativeInteger(state.bestEpoch, 'checkpoint best validation epoch');
  assertNonNegativeInteger(
    state.epochsWithoutImprovement,
    'checkpoint epochsWithoutValidationImprovement',
  );
}

function validateCheckpointResumeOptions(
  options: FrozenFeatureTinyAdapterTrainingOptions,
  checkpoint: FrozenFeatureTinyAdapterCheckpointV1,
): void {
  if (checkpoint.epochs !== options.epochs) {
    throw new Error(
      'Frozen-feature checkpoint epoch budget must match requested training epochs for deterministic resume.',
    );
  }
  const expectedConfigFingerprint = createTrainingConfigFingerprint(options);
  if (checkpoint.resumeState.trainingConfigFingerprint !== expectedConfigFingerprint) {
    throw new Error(
      'Frozen-feature checkpoint training options do not match deterministic resume state.',
    );
  }
  if (
    checkpoint.resumeState.samplerState.seedFingerprint !==
    createDiagnosticFingerprint('sampler-seed', options.samplerSeed)
  ) {
    throw new Error(
      'Frozen-feature checkpoint sampler state does not match deterministic resume options.',
    );
  }
  if (checkpoint.resumeState.optimizerState.optimizer !== options.optimizer) {
    throw new Error(
      'Frozen-feature checkpoint optimizer state does not match deterministic resume options.',
    );
  }
}

function restoreOptimizerState(
  target: AdamWOptimizerState,
  source: FrozenFeatureTinyAdapterCheckpointOptimizerStateV1,
): void {
  if (source.optimizer === 'sgd') {
    target.step = source.step;
    target.weightM.fill(0);
    target.weightV.fill(0);
    target.biasM.fill(0);
    target.biasV.fill(0);
    return;
  }
  target.weightM.splice(0, target.weightM.length, ...source.weightM);
  target.weightV.splice(0, target.weightV.length, ...source.weightV);
  target.biasM.splice(0, target.biasM.length, ...source.biasM);
  target.biasV.splice(0, target.biasV.length, ...source.biasV);
  target.step = source.step;
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
  if (options.optimizer !== 'sgd' && options.optimizer !== 'adamw') {
    throw new Error('optimizer must be sgd or adamw.');
  }
  assertPositiveInteger(options.batchSize, 'batchSize');
  if (!options.samplerSeed.trim()) {
    throw new Error('samplerSeed is required.');
  }
  assertPositiveInteger(options.lengthBucketCount, 'lengthBucketCount');
  if (options.gradientClipNorm !== undefined) {
    assertPositiveFinite(options.gradientClipNorm, 'gradientClipNorm');
  }
  if (
    options.learningRateSchedule !== 'constant' &&
    options.learningRateSchedule !== 'linear-decay'
  ) {
    throw new Error('learningRateSchedule must be constant or linear-decay.');
  }
  if (
    !Number.isFinite(options.minLearningRateRatio) ||
    options.minLearningRateRatio < 0 ||
    options.minLearningRateRatio > 1
  ) {
    throw new Error('minLearningRateRatio must be between 0 and 1.');
  }
  if (options.validationEveryEpochs !== undefined) {
    assertPositiveInteger(options.validationEveryEpochs, 'validationEveryEpochs');
  }
  if (options.earlyStoppingPatience !== undefined) {
    assertPositiveInteger(options.earlyStoppingPatience, 'earlyStoppingPatience');
  }
  if (!Number.isFinite(options.earlyStoppingMinDelta) || options.earlyStoppingMinDelta < 0) {
    throw new Error('earlyStoppingMinDelta must be a finite non-negative number.');
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

interface AdamWOptimizerState {
  readonly weightM: number[];
  readonly weightV: number[];
  readonly biasM: number[];
  readonly biasV: number[];
  step: number;
}

interface AdamWEpochOutcome {
  readonly gradientClipEvents: number;
}

function createAdamWOptimizerState(
  weightParameterCount: number,
  biasParameterCount: number,
): AdamWOptimizerState {
  return {
    weightM: new Array<number>(weightParameterCount).fill(0),
    weightV: new Array<number>(weightParameterCount).fill(0),
    biasM: new Array<number>(biasParameterCount).fill(0),
    biasV: new Array<number>(biasParameterCount).fill(0),
    step: 0,
  };
}

function createCheckpointOptimizerState(
  optimizer: FrozenFeatureTinyAdapterOptimizerKind,
  state: AdamWOptimizerState,
  epoch: number,
): FrozenFeatureTinyAdapterCheckpointOptimizerStateV1 {
  if (optimizer === 'sgd') {
    return {
      optimizer: 'sgd',
      step: epoch,
    };
  }
  return {
    optimizer: 'adamw',
    weightM: [...state.weightM],
    weightV: [...state.weightV],
    biasM: [...state.biasM],
    biasV: [...state.biasV],
    step: state.step,
  };
}

function runSgdEpoch(
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  weights: number[],
  bias: number[],
  featureDimension: number,
  outputDimension: number,
  learningRate: number,
  l2Regularization: number,
): void {
  for (const example of examples) {
    const prediction = predict(example.features, weights, bias, outputDimension);
    const exampleWeight = example.weight ?? 1;
    for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
      const error = (prediction[outputIndex] ?? 0) - (example.targetResidual[outputIndex] ?? 0);
      const gradientScale = (2 * error * exampleWeight) / outputDimension;
      for (let featureIndex = 0; featureIndex < featureDimension; featureIndex += 1) {
        const weightIndex = outputIndex * featureDimension + featureIndex;
        const weight = weights[weightIndex] ?? 0;
        const feature = example.features[featureIndex] ?? 0;
        weights[weightIndex] =
          weight - learningRate * (gradientScale * feature + l2Regularization * weight);
      }
      bias[outputIndex] = (bias[outputIndex] ?? 0) - learningRate * gradientScale;
    }
  }
}

function runAdamWEpoch(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  weights: number[],
  bias: number[],
  state: AdamWOptimizerState,
  options: FrozenFeatureTinyAdapterTrainingOptions,
  epoch: number,
  learningRate: number,
): AdamWEpochOutcome {
  let gradientClipEvents = 0;
  const batches = createBalancedEpochBatches(examples, options, epoch);
  for (const batch of batches) {
    const gradients = calculateBatchGradients(dataset, batch, weights, bias);
    const clipScale = getGradientClipScale(
      gradients.weightGradients,
      gradients.biasGradients,
      options.gradientClipNorm,
    );
    if (clipScale < 1) {
      gradientClipEvents += 1;
      scaleInPlace(gradients.weightGradients, clipScale);
      scaleInPlace(gradients.biasGradients, clipScale);
    }
    applyAdamW(
      weights,
      bias,
      gradients.weightGradients,
      gradients.biasGradients,
      state,
      learningRate,
      options.l2Regularization,
    );
    assertFiniteTrainingState(weights, bias, 'frozen-feature tiny-adapter AdamW step');
  }
  return { gradientClipEvents };
}

function calculateBatchGradients(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  weights: readonly number[],
  bias: readonly number[],
): { readonly weightGradients: number[]; readonly biasGradients: number[] } {
  const weightGradients = new Array<number>(weights.length).fill(0);
  const biasGradients = new Array<number>(bias.length).fill(0);
  let totalWeight = 0;
  for (const example of examples) {
    const prediction = predict(example.features, weights, bias, dataset.outputDimension);
    const exampleWeight = example.weight ?? 1;
    totalWeight += exampleWeight;
    for (let outputIndex = 0; outputIndex < dataset.outputDimension; outputIndex += 1) {
      const error = (prediction[outputIndex] ?? 0) - (example.targetResidual[outputIndex] ?? 0);
      const gradientScale = (2 * error * exampleWeight) / dataset.outputDimension;
      for (let featureIndex = 0; featureIndex < dataset.featureDimension; featureIndex += 1) {
        const weightIndex = outputIndex * dataset.featureDimension + featureIndex;
        weightGradients[weightIndex] =
          (weightGradients[weightIndex] ?? 0) +
          gradientScale * (example.features[featureIndex] ?? 0);
      }
      biasGradients[outputIndex] = (biasGradients[outputIndex] ?? 0) + gradientScale;
    }
  }
  const normalization = Math.max(1, totalWeight);
  scaleInPlace(weightGradients, 1 / normalization);
  scaleInPlace(biasGradients, 1 / normalization);
  return { weightGradients, biasGradients };
}

function applyAdamW(
  weights: number[],
  bias: number[],
  weightGradients: readonly number[],
  biasGradients: readonly number[],
  state: AdamWOptimizerState,
  learningRate: number,
  weightDecay: number,
): void {
  state.step += 1;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;
  const beta1Correction = 1 - beta1 ** state.step;
  const beta2Correction = 1 - beta2 ** state.step;
  for (let index = 0; index < weights.length; index += 1) {
    const gradient = weightGradients[index] ?? 0;
    state.weightM[index] = beta1 * (state.weightM[index] ?? 0) + (1 - beta1) * gradient;
    state.weightV[index] = beta2 * (state.weightV[index] ?? 0) + (1 - beta2) * gradient * gradient;
    const mHat = (state.weightM[index] ?? 0) / beta1Correction;
    const vHat = (state.weightV[index] ?? 0) / beta2Correction;
    const decayedWeight = (weights[index] ?? 0) * (1 - learningRate * weightDecay);
    weights[index] = decayedWeight - learningRate * (mHat / (Math.sqrt(vHat) + epsilon));
  }
  for (let index = 0; index < bias.length; index += 1) {
    const gradient = biasGradients[index] ?? 0;
    state.biasM[index] = beta1 * (state.biasM[index] ?? 0) + (1 - beta1) * gradient;
    state.biasV[index] = beta2 * (state.biasV[index] ?? 0) + (1 - beta2) * gradient * gradient;
    const mHat = (state.biasM[index] ?? 0) / beta1Correction;
    const vHat = (state.biasV[index] ?? 0) / beta2Correction;
    bias[index] = (bias[index] ?? 0) - learningRate * (mHat / (Math.sqrt(vHat) + epsilon));
  }
}

function calculateLoss(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  weights: readonly number[],
  bias: readonly number[],
  l2Regularization: number,
): number {
  return calculateExamplesLoss(
    dataset.examples,
    dataset.outputDimension,
    weights,
    bias,
    l2Regularization,
  );
}

function calculateValidationLoss(
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  weights: readonly number[],
  bias: readonly number[],
  l2Regularization: number,
): number | undefined {
  if (examples.length === 0) return undefined;
  const outputDimension = examples[0]?.targetResidual.length ?? 0;
  return calculateExamplesLoss(examples, outputDimension, weights, bias, l2Regularization);
}

function calculateExamplesLoss(
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  outputDimension: number,
  weights: readonly number[],
  bias: readonly number[],
  l2Regularization: number,
): number {
  let totalError = 0;
  let totalWeight = 0;
  for (const example of examples) {
    const prediction = predict(example.features, weights, bias, outputDimension);
    const exampleWeight = example.weight ?? 1;
    for (let outputIndex = 0; outputIndex < outputDimension; outputIndex += 1) {
      const error = (prediction[outputIndex] ?? 0) - (example.targetResidual[outputIndex] ?? 0);
      totalError += error * error * exampleWeight;
      totalWeight += exampleWeight;
    }
  }
  const mse = totalError / Math.max(1, totalWeight * outputDimension);
  const l2 = weights.reduce((sum, value) => sum + value * value, 0) * l2Regularization;
  return mse + l2;
}

function createSamplerDiagnostics(
  dataset: FrozenFeatureTinyAdapterDatasetV1,
  trainExamples: readonly FrozenFeatureTinyAdapterExampleV1[],
  options: FrozenFeatureTinyAdapterTrainingOptions,
): FrozenFeatureTinyAdapterSamplerDiagnosticsV1 {
  const lengthBuckets = createLengthBucketLookup(trainExamples, options.lengthBucketCount);
  const conditionExampleCounts: Record<string, number> = {};
  const lengthBucketExampleCounts: Record<string, number> = {};
  for (const example of trainExamples) {
    const conditionKey = createDiagnosticFingerprint(
      'condition',
      getConditionKey(example, options.conditionBalanced),
    );
    conditionExampleCounts[conditionKey] = (conditionExampleCounts[conditionKey] ?? 0) + 1;
    const lengthBucket = String(lengthBuckets.get(example.id) ?? 0);
    lengthBucketExampleCounts[lengthBucket] = (lengthBucketExampleCounts[lengthBucket] ?? 0) + 1;
  }
  return {
    seedFingerprint: createDiagnosticFingerprint('sampler-seed', options.samplerSeed),
    batchSize: options.batchSize,
    lengthBucketCount: options.lengthBucketCount,
    conditionBalanced: options.conditionBalanced,
    trainingExamples: trainExamples.length,
    validationExamples: dataset.examples.length - trainExamples.length,
    batchesPerEpoch: Math.ceil(trainExamples.length / options.batchSize),
    conditionExampleCounts: sortRecord(conditionExampleCounts),
    lengthBucketExampleCounts: sortRecord(lengthBucketExampleCounts),
  };
}

function createBalancedEpochBatches(
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  options: FrozenFeatureTinyAdapterTrainingOptions,
  epoch: number,
): readonly (readonly FrozenFeatureTinyAdapterExampleV1[])[] {
  const lengthBuckets = createLengthBucketLookup(examples, options.lengthBucketCount);
  const strata = new Map<string, FrozenFeatureTinyAdapterExampleV1[]>();
  for (const example of examples) {
    const conditionKey = getConditionKey(example, options.conditionBalanced);
    const lengthBucket = lengthBuckets.get(example.id) ?? 0;
    const key = `${conditionKey}\u0000${lengthBucket.toString()}`;
    const stratum = strata.get(key) ?? [];
    stratum.push(example);
    strata.set(key, stratum);
  }
  const orderedStrata = [...strata.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, stratum]) => ({
      key,
      examples: stratum
        .map((example) => ({
          example,
          key: stableHash(`${options.samplerSeed}:${epoch.toString()}:${key}:${example.id}`),
        }))
        .sort(
          (left, right) => left.key - right.key || left.example.id.localeCompare(right.example.id),
        )
        .map((entry) => entry.example),
      index: 0,
    }));
  const orderedExamples: FrozenFeatureTinyAdapterExampleV1[] = [];
  while (orderedExamples.length < examples.length) {
    let added = false;
    for (const stratum of orderedStrata) {
      const example = stratum.examples[stratum.index];
      if (example === undefined) continue;
      orderedExamples.push(example);
      stratum.index += 1;
      added = true;
    }
    if (!added) break;
  }
  const batches: FrozenFeatureTinyAdapterExampleV1[][] = [];
  for (let index = 0; index < orderedExamples.length; index += options.batchSize) {
    batches.push(orderedExamples.slice(index, index + options.batchSize));
  }
  return batches;
}

function createLengthBucketLookup(
  examples: readonly FrozenFeatureTinyAdapterExampleV1[],
  bucketCount: number,
): ReadonlyMap<string, number> {
  const lengths = examples.map((example) => getExampleLength(example));
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const lookup = new Map<string, number>();
  examples.forEach((example, index) => {
    const length = lengths[index] ?? getExampleLength(example);
    const bucket =
      maxLength === minLength
        ? 0
        : Math.min(
            bucketCount - 1,
            Math.floor(((length - minLength) / (maxLength - minLength + 1)) * bucketCount),
          );
    lookup.set(example.id, bucket);
  });
  return lookup;
}

function getExampleLength(example: FrozenFeatureTinyAdapterExampleV1): number {
  return example.frameCount ?? example.features.length;
}

function getConditionKey(
  example: FrozenFeatureTinyAdapterExampleV1,
  conditionBalanced: boolean,
): string {
  if (!conditionBalanced) return 'all';
  return example.conditionKey?.trim() || 'unspecified';
}

function getScheduledLearningRate(
  options: FrozenFeatureTinyAdapterTrainingOptions,
  epoch: number,
): number {
  if (options.learningRateSchedule === 'constant' || options.epochs <= 1) {
    return options.learningRate;
  }
  const progress = Math.min(1, Math.max(0, (epoch - 1) / Math.max(1, options.epochs - 1)));
  const ratio = 1 - progress * (1 - options.minLearningRateRatio);
  return options.learningRate * ratio;
}

function getGradientClipScale(
  weightGradients: readonly number[],
  biasGradients: readonly number[],
  clipNorm: number | undefined,
): number {
  if (clipNorm === undefined) return 1;
  const norm = Math.sqrt(
    [...weightGradients, ...biasGradients].reduce((sum, value) => sum + value * value, 0),
  );
  assertFiniteNumber(norm, 'frozen-feature tiny-adapter gradient norm');
  if (norm <= clipNorm || norm === 0) return 1;
  return clipNorm / norm;
}

function scaleInPlace(values: number[], scale: number): void {
  for (let index = 0; index < values.length; index += 1) {
    values[index] = (values[index] ?? 0) * scale;
  }
}

function assertFiniteTrainingState(
  weights: readonly number[],
  bias: readonly number[],
  name: string,
): void {
  for (const value of [...weights, ...bias]) {
    assertFiniteNumber(value, name);
  }
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function sortRecord(input: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createDiagnosticFingerprint(kind: string, value: string): string {
  return `${kind}:fnv1a32:${stableHash(`${kind}:${value}`).toString(16).padStart(8, '0')}`;
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

function createProgress(input: {
  readonly epoch: number;
  readonly epochs: number;
  readonly loss: number;
  readonly status: FrozenFeatureTinyAdapterProgressV1['status'];
  readonly validationLoss?: number;
  readonly learningRate?: number;
  readonly optimizer?: FrozenFeatureTinyAdapterOptimizerKind;
  readonly stoppedEarly?: boolean;
}): FrozenFeatureTinyAdapterProgressV1 {
  return {
    schemaVersion: 1,
    epoch: input.epoch,
    epochs: input.epochs,
    loss: roundFloat(input.loss),
    status: input.status,
    ...(input.validationLoss === undefined
      ? {}
      : { validationLoss: roundFloat(input.validationLoss) }),
    ...(input.learningRate === undefined ? {} : { learningRate: roundFloat(input.learningRate) }),
    ...(input.optimizer === undefined ? {} : { optimizer: input.optimizer }),
    ...(input.stoppedEarly === undefined ? {} : { stoppedEarly: input.stoppedEarly }),
  };
}

function createCheckpointId(
  datasetId: string,
  epoch: number,
  artifactChecksum: string,
  resumeStateChecksum: string,
): string {
  return `${datasetId}:epoch-${epoch.toString()}:${artifactChecksum}:${resumeStateChecksum}`;
}

function checksumTinyAdapter(weights: readonly number[], bias: readonly number[]): string {
  const payload = JSON.stringify({ weights, bias });
  return checksumString(payload);
}

function checksumResumeState(state: FrozenFeatureTinyAdapterCheckpointResumeStateV1): string {
  return checksumJson(state);
}

function createDatasetFingerprint(dataset: FrozenFeatureTinyAdapterDatasetV1): string {
  return checksumJson({
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    featureDimension: dataset.featureDimension,
    outputDimension: dataset.outputDimension,
    examples: dataset.examples.map((example) => ({
      id: example.id,
      features: example.features,
      targetResidual: example.targetResidual,
      weight: example.weight ?? null,
      frameCount: example.frameCount ?? null,
      conditionFingerprint:
        example.conditionKey === undefined
          ? null
          : createDiagnosticFingerprint('condition', example.conditionKey.trim()),
      split: example.split ?? 'train',
    })),
    source: dataset.source,
    privacy: dataset.privacy,
  });
}

function createTrainingConfigFingerprint(options: FrozenFeatureTinyAdapterTrainingOptions): string {
  return checksumJson({
    epochs: options.epochs,
    learningRate: options.learningRate,
    l2Regularization: options.l2Regularization,
    maxParameterCount: options.maxParameterCount,
    targetLoss: options.targetLoss ?? null,
    optimizer: options.optimizer,
    batchSize: options.batchSize,
    samplerSeedFingerprint: createDiagnosticFingerprint('sampler-seed', options.samplerSeed),
    lengthBucketCount: options.lengthBucketCount,
    conditionBalanced: options.conditionBalanced,
    gradientClipNorm: options.gradientClipNorm ?? null,
    learningRateSchedule: options.learningRateSchedule,
    minLearningRateRatio: options.minLearningRateRatio,
    validationEveryEpochs: options.validationEveryEpochs ?? null,
    earlyStoppingPatience: options.earlyStoppingPatience ?? null,
    earlyStoppingMinDelta: options.earlyStoppingMinDelta,
  });
}

function checksumJson(value: unknown): string {
  return checksumString(stableStringify(value));
}

function checksumString(payload: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
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
