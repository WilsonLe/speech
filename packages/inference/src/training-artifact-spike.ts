export type OnnxRuntimeWebTrainingCapability =
  | 'not-present-in-pinned-package'
  | 'documented-artifact-not-packaged'
  | 'public-api-candidate-detected';

export type OnnxRuntimeWebTrainingRecommendation =
  | 'use-fixed-adapter-math-backend'
  | 'prototype-ort-training-in-dedicated-worker';

export type BrowserTrainingBackendDecision =
  | 'fixed-adapter-math-fallback-required'
  | 'ort-training-wasm-candidate';

export type BrowserTrainingProofStatus =
  | 'blocked-no-public-js-api-or-package-artifact'
  | 'not-run'
  | 'passed';

export interface OnnxRuntimeWebTrainingArtifactSnapshot {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly packageDescription?: string;
  readonly packageExportSubpaths: readonly string[];
  readonly distributionFiles: readonly string[];
  readonly publicTypeDeclarationText?: string;
  readonly runtimeExportNames?: readonly string[];
  readonly documentationEvidence?: readonly string[];
  readonly internalTrainingMentions?: readonly string[];
  readonly officialDeploymentDocs?: {
    readonly listsTrainingWasmArtifact: boolean;
    readonly trainingWasmArtifactName?: string;
    readonly separatesTrainingFromJsepArtifact: boolean;
  };
  readonly onDeviceTrainingDocs?: {
    readonly offlineArtifactGenerationRequired: boolean;
    readonly requiredArtifacts: readonly string[];
  };
}

export interface OnnxRuntimeWebTrainingSpikeEvidenceV1 {
  readonly publicExportSubpaths: readonly string[];
  readonly publicTrainingSubpaths: readonly string[];
  readonly distributionTrainingFiles: readonly string[];
  readonly publicTrainingSymbols: readonly string[];
  readonly publicInferenceSymbols: readonly string[];
  readonly ignoredInternalTrainingMentions: readonly string[];
  readonly documentationEvidence: readonly string[];
  readonly officialDeploymentDocs: {
    readonly listsTrainingWasmArtifact: boolean;
    readonly trainingWasmArtifactName?: string;
    readonly separatesTrainingFromJsepArtifact: boolean;
  };
  readonly onDeviceTrainingDocs: {
    readonly offlineArtifactGenerationRequired: boolean;
    readonly requiredArtifacts: readonly string[];
  };
}

export interface BrowserTrainingTinyProofV1 {
  readonly status: BrowserTrainingProofStatus;
  readonly forward: boolean;
  readonly backward: boolean;
  readonly optimizerStep: boolean;
  readonly checkpointSaveLoad: boolean;
  readonly weightExport: boolean;
  readonly reason?: string;
}

export interface OnnxRuntimeWebTrainingSpikeReportV1 {
  readonly schemaVersion: 1;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly packageDescription?: string;
  readonly trainingApiAvailable: boolean;
  readonly packageIncludesTrainingWasm: boolean;
  readonly officialDocsListTrainingWasm: boolean;
  readonly capability: OnnxRuntimeWebTrainingCapability;
  readonly recommendation: OnnxRuntimeWebTrainingRecommendation;
  readonly backendDecision: BrowserTrainingBackendDecision;
  readonly tinyTrainingProof: BrowserTrainingTinyProofV1;
  readonly evidence: OnnxRuntimeWebTrainingSpikeEvidenceV1;
  readonly blockerReasons: readonly string[];
  readonly followOnIssues: readonly string[];
  readonly privacy: {
    readonly inspectedPackageMetadataOnly: true;
    readonly containsAudio: false;
    readonly containsTranscript: false;
    readonly containsProfileData: false;
    readonly networkRequiredForProbe: false;
    readonly localOnly: true;
  };
}

export interface BrowserTrainingExperimentApiContractV1 {
  readonly schemaVersion: 1;
  readonly experiment: 'browser-frozen-feature-tiny-adapter';
  readonly owner: 'dedicated-training-worker';
  readonly forbiddenOwners: readonly ['main-ui-thread', 'audio-worklet', 'asr-worker'];
  readonly allowedTrainableScopes: readonly BrowserTrainingTrainableScope[];
  readonly lifecycleMessages: readonly BrowserTrainingLifecycleMessage[];
  readonly requiredControls: readonly BrowserTrainingRequiredControl[];
  readonly requiredGates: readonly BrowserTrainingRequiredGate[];
  readonly backendInterface: 'BrowserTrainingBackend';
  readonly artifactRules: {
    readonly baseModelImmutable: true;
    readonly previousActiveProfileUntouchedUntilGatePasses: true;
    readonly checkpointStorage: 'private-opfs-profile-directory';
    readonly exportFormat: 'PortableSpeechModelManifestV1-browser-top-adapter';
  };
  readonly privacy: {
    readonly localOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly networkUpload: false;
    readonly telemetry: false;
  };
}

export type BrowserTrainingTrainableScope =
  | 'conditioning-vector'
  | 'lhuc-affine-layer'
  | 'top-residual-adapter'
  | 'ctc-calibration-head';

export type BrowserTrainingLifecycleMessage =
  | 'PRECOMPUTE_FROZEN_FEATURES'
  | 'START_TRAINING'
  | 'PAUSE_TRAINING'
  | 'CANCEL_TRAINING'
  | 'SAVE_CHECKPOINT'
  | 'RESUME_FROM_CHECKPOINT'
  | 'COMPLETE_TRAINING'
  | 'DISPOSE_TRAINING';

export type BrowserTrainingRequiredControl =
  | 'pause'
  | 'cancel'
  | 'checkpoint'
  | 'reload-recovery'
  | 'thermal-warning'
  | 'battery-warning';

export type BrowserTrainingRequiredGate =
  | 'base-model-identity'
  | 'graph-contract-hash'
  | 'adapter-checksum'
  | 'profile-regression-gate'
  | 'generic-anchor-regression-budget'
  | 'adapter-size-budget'
  | 'rtf-overhead-budget';

const PUBLIC_TRAINING_SYMBOLS = [
  'TrainingSession',
  'CheckpointState',
  'TrainingParameters',
  'AdamWOptimizer',
  'LinearLRScheduler',
];

const PUBLIC_INFERENCE_SYMBOLS = ['InferenceSession', 'Tensor', 'env'];

const DEFAULT_OFFICIAL_DEPLOYMENT_DOCS = {
  listsTrainingWasmArtifact: true,
  trainingWasmArtifactName: 'ort-training-wasm-simd-threaded.wasm',
  separatesTrainingFromJsepArtifact: true,
} as const;

const DEFAULT_ON_DEVICE_TRAINING_DOCS = {
  offlineArtifactGenerationRequired: true,
  requiredArtifacts: [
    'training onnx model',
    'checkpoint state',
    'optimizer onnx model',
    'eval onnx model',
  ],
} as const;

export const pinnedOnnxRuntimeWebTrainingArtifactSnapshot: OnnxRuntimeWebTrainingArtifactSnapshot =
  {
    packageName: 'onnxruntime-web',
    packageVersion: '1.27.0',
    packageDescription: 'A Javascript library for running ONNX models on browsers',
    packageExportSubpaths: [
      '.',
      './all',
      './wasm',
      './webgl',
      './webgpu',
      './jspi',
      './ort-wasm-simd-threaded.wasm',
      './ort-wasm-simd-threaded.jsep.wasm',
      './ort-wasm-simd-threaded.jspi.wasm',
      './ort-wasm-simd-threaded.asyncify.wasm',
      './ort-wasm-simd-threaded.mjs',
      './ort-wasm-simd-threaded.jsep.mjs',
      './ort-wasm-simd-threaded.jspi.mjs',
      './ort-wasm-simd-threaded.asyncify.mjs',
    ],
    distributionFiles: [
      'dist/ort.min.mjs',
      'dist/ort.bundle.min.mjs',
      'dist/ort.wasm.min.mjs',
      'dist/ort.wasm.bundle.min.mjs',
      'dist/ort.webgpu.min.mjs',
      'dist/ort.webgpu.bundle.min.mjs',
      'dist/ort.all.min.mjs',
      'dist/ort.all.bundle.min.mjs',
      'dist/ort-wasm-simd-threaded.wasm',
      'dist/ort-wasm-simd-threaded.jsep.wasm',
      'dist/ort-wasm-simd-threaded.jspi.wasm',
      'dist/ort-wasm-simd-threaded.asyncify.wasm',
    ],
    publicTypeDeclarationText: [
      "declare module 'onnxruntime-web' { export * from 'onnxruntime-common'; }",
      "declare module 'onnxruntime-web/wasm' { export * from 'onnxruntime-web'; }",
      "declare module 'onnxruntime-web/webgpu' { export * from 'onnxruntime-web'; }",
    ].join('\n'),
    runtimeExportNames: ['env', 'InferenceSession', 'Tensor'],
    documentationEvidence: [
      'ONNX Runtime Web deployment docs list a training-enabled artifact named ort-training-wasm-simd-threaded.wasm.',
      'The same deployment docs distinguish that artifact from the JSEP/WebGPU artifact; training and WebGPU are not the same WASM binary.',
      'ON-device training docs require offline generation of training, checkpoint, optimizer, and optional eval artifacts before edge-device training can run.',
      'Pinned npm package exports inference-oriented root/all/wasm/webgl/webgpu/jspi subpaths and no public training subpath.',
    ],
    internalTrainingMentions: [
      'ONNX protobuf TrainingInfoProto schema is bundled as model-format metadata, not a public browser training API.',
      'WebGPU BatchNormalization trainingMode path throws unsupported in the pinned package sources.',
    ],
    officialDeploymentDocs: DEFAULT_OFFICIAL_DEPLOYMENT_DOCS,
    onDeviceTrainingDocs: DEFAULT_ON_DEVICE_TRAINING_DOCS,
  };

export const browserTrainingExperimentApiContractV1: BrowserTrainingExperimentApiContractV1 = {
  schemaVersion: 1,
  experiment: 'browser-frozen-feature-tiny-adapter',
  owner: 'dedicated-training-worker',
  forbiddenOwners: ['main-ui-thread', 'audio-worklet', 'asr-worker'],
  allowedTrainableScopes: [
    'conditioning-vector',
    'lhuc-affine-layer',
    'top-residual-adapter',
    'ctc-calibration-head',
  ],
  lifecycleMessages: [
    'PRECOMPUTE_FROZEN_FEATURES',
    'START_TRAINING',
    'PAUSE_TRAINING',
    'CANCEL_TRAINING',
    'SAVE_CHECKPOINT',
    'RESUME_FROM_CHECKPOINT',
    'COMPLETE_TRAINING',
    'DISPOSE_TRAINING',
  ],
  requiredControls: [
    'pause',
    'cancel',
    'checkpoint',
    'reload-recovery',
    'thermal-warning',
    'battery-warning',
  ],
  requiredGates: [
    'base-model-identity',
    'graph-contract-hash',
    'adapter-checksum',
    'profile-regression-gate',
    'generic-anchor-regression-budget',
    'adapter-size-budget',
    'rtf-overhead-budget',
  ],
  backendInterface: 'BrowserTrainingBackend',
  artifactRules: {
    baseModelImmutable: true,
    previousActiveProfileUntouchedUntilGatePasses: true,
    checkpointStorage: 'private-opfs-profile-directory',
    exportFormat: 'PortableSpeechModelManifestV1-browser-top-adapter',
  },
  privacy: {
    localOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    networkUpload: false,
    telemetry: false,
  },
};

export function analyzeOnnxRuntimeWebTrainingArtifact(
  snapshot: OnnxRuntimeWebTrainingArtifactSnapshot,
): OnnxRuntimeWebTrainingSpikeReportV1 {
  const officialDeploymentDocs = snapshot.officialDeploymentDocs ?? {
    listsTrainingWasmArtifact: false,
    separatesTrainingFromJsepArtifact: false,
  };
  const onDeviceTrainingDocs = snapshot.onDeviceTrainingDocs ?? {
    offlineArtifactGenerationRequired: false,
    requiredArtifacts: [],
  };
  const publicTrainingSubpaths = snapshot.packageExportSubpaths.filter(isTrainingSubpath);
  const distributionTrainingFiles = snapshot.distributionFiles.filter(isTrainingDistributionFile);
  const publicTrainingSymbols = detectSymbols(snapshot, PUBLIC_TRAINING_SYMBOLS);
  const publicInferenceSymbols = detectSymbols(snapshot, PUBLIC_INFERENCE_SYMBOLS);
  const publicTrainingApiCandidate =
    publicTrainingSubpaths.length > 0 || publicTrainingSymbols.length > 0;
  const packageIncludesTrainingWasm = distributionTrainingFiles.some((file) =>
    /ort-training-wasm-simd-threaded\.wasm$/i.test(file),
  );
  const trainingApiAvailable = publicTrainingApiCandidate && packageIncludesTrainingWasm;
  const documentedArtifactIsMissing =
    officialDeploymentDocs.listsTrainingWasmArtifact && !packageIncludesTrainingWasm;
  const backendDecision: BrowserTrainingBackendDecision = trainingApiAvailable
    ? 'ort-training-wasm-candidate'
    : 'fixed-adapter-math-fallback-required';

  return {
    schemaVersion: 1,
    packageName: snapshot.packageName,
    packageVersion: snapshot.packageVersion,
    ...(snapshot.packageDescription === undefined
      ? {}
      : { packageDescription: snapshot.packageDescription }),
    trainingApiAvailable,
    packageIncludesTrainingWasm,
    officialDocsListTrainingWasm: officialDeploymentDocs.listsTrainingWasmArtifact,
    capability: trainingApiAvailable
      ? 'public-api-candidate-detected'
      : documentedArtifactIsMissing
        ? 'documented-artifact-not-packaged'
        : 'not-present-in-pinned-package',
    recommendation: trainingApiAvailable
      ? 'prototype-ort-training-in-dedicated-worker'
      : 'use-fixed-adapter-math-backend',
    backendDecision,
    tinyTrainingProof: trainingApiAvailable
      ? {
          status: 'not-run',
          forward: false,
          backward: false,
          optimizerStep: false,
          checkpointSaveLoad: false,
          weightExport: false,
          reason:
            'A public training artifact/API candidate was detected; run the dedicated worker proof before enabling production training.',
        }
      : {
          status: 'blocked-no-public-js-api-or-package-artifact',
          forward: false,
          backward: false,
          optimizerStep: false,
          checkpointSaveLoad: false,
          weightExport: false,
          reason:
            'The pinned npm package lacks both ort-training-wasm-simd-threaded.wasm and public TrainingSession/CheckpointState symbols.',
        },
    evidence: {
      publicExportSubpaths: [...snapshot.packageExportSubpaths],
      publicTrainingSubpaths,
      distributionTrainingFiles,
      publicTrainingSymbols,
      publicInferenceSymbols,
      ignoredInternalTrainingMentions: [...(snapshot.internalTrainingMentions ?? [])],
      documentationEvidence: [...(snapshot.documentationEvidence ?? [])],
      officialDeploymentDocs,
      onDeviceTrainingDocs,
    },
    blockerReasons: trainingApiAvailable
      ? []
      : [
          'ONNX Runtime Web deployment docs describe a training WASM artifact, but the pinned npm package does not ship or export it.',
          'The pinned package does not expose a public TrainingSession, CheckpointState, optimizer, or training subpath in its package exports/types/runtime surface.',
          'The required tiny forward/backward/optimizer/checkpoint/export proof cannot run against the pinned package without vendoring or custom-building a training artifact and JS API.',
        ],
    followOnIssues:
      backendDecision === 'fixed-adapter-math-fallback-required'
        ? [
            '#144 must keep BrowserTrainingBackend implementation-agnostic.',
            '#145 must implement the fixed adapter-math backend or first add a proven custom/updated ORT Training artifact.',
            '#134 must not promise npm-provided ORT training artifacts until the artifact/API proof passes.',
          ]
        : [
            '#144 must wrap the detected ORT Training surface behind BrowserTrainingBackend.',
            '#145 must run the full worker proof before production activation.',
          ],
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

export function createPinnedOnnxRuntimeWebTrainingSpikeReport(): OnnxRuntimeWebTrainingSpikeReportV1 {
  return analyzeOnnxRuntimeWebTrainingArtifact(pinnedOnnxRuntimeWebTrainingArtifactSnapshot);
}

export function assertBrowserTrainingExperimentContract(
  contract: BrowserTrainingExperimentApiContractV1,
): BrowserTrainingExperimentApiContractV1 {
  if (contract.schemaVersion !== 1) {
    throw new Error('Browser training experiment contract schemaVersion must be 1.');
  }
  if (contract.owner !== 'dedicated-training-worker') {
    throw new Error('Browser training must be owned by a dedicated training worker.');
  }
  if (contract.backendInterface !== 'BrowserTrainingBackend') {
    throw new Error('Browser training must be hidden behind BrowserTrainingBackend.');
  }
  for (const forbiddenOwner of ['main-ui-thread', 'audio-worklet', 'asr-worker'] as const) {
    if (!contract.forbiddenOwners.includes(forbiddenOwner)) {
      throw new Error(`Browser training contract must forbid ${forbiddenOwner}.`);
    }
  }
  for (const control of [
    'pause',
    'cancel',
    'checkpoint',
    'reload-recovery',
    'thermal-warning',
    'battery-warning',
  ] as const) {
    if (!contract.requiredControls.includes(control)) {
      throw new Error(`Browser training contract must require ${control}.`);
    }
  }
  for (const gate of [
    'base-model-identity',
    'graph-contract-hash',
    'adapter-checksum',
    'profile-regression-gate',
  ] as const) {
    if (!contract.requiredGates.includes(gate)) {
      throw new Error(`Browser training contract must require ${gate}.`);
    }
  }
  if (contract.privacy.localOnly !== true || contract.privacy.networkUpload !== false) {
    throw new Error('Browser training contract must remain local-only with no network upload.');
  }
  if (
    contract.artifactRules.baseModelImmutable !== true ||
    contract.artifactRules.previousActiveProfileUntouchedUntilGatePasses !== true
  ) {
    throw new Error(
      'Browser training artifacts must not mutate the base model or active profile before gates pass.',
    );
  }
  return contract;
}

function isTrainingSubpath(subpath: string): boolean {
  return /(^|[./-])(train|training)([./-]|$)/i.test(subpath);
}

function isTrainingDistributionFile(file: string): boolean {
  return /(^|[./-])(train|training)([./-]|$)/i.test(file);
}

function detectSymbols(
  snapshot: OnnxRuntimeWebTrainingArtifactSnapshot,
  candidateSymbols: readonly string[],
): readonly string[] {
  const runtimeExportNames = new Set(snapshot.runtimeExportNames ?? []);
  const typeDeclarations = snapshot.publicTypeDeclarationText ?? '';
  return candidateSymbols.filter(
    (symbol) => runtimeExportNames.has(symbol) || typeDeclarations.includes(symbol),
  );
}
