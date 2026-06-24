import { describe, expect, it } from 'vitest';
import {
  analyzeOnnxRuntimeWebTrainingArtifact,
  assertBrowserTrainingExperimentContract,
  browserTrainingExperimentApiContractV1,
  createPinnedOnnxRuntimeWebTrainingSpikeReport,
  pinnedOnnxRuntimeWebTrainingArtifactSnapshot,
  type BrowserTrainingExperimentApiContractV1,
  type OnnxRuntimeWebTrainingArtifactSnapshot,
} from './training-artifact-spike';

describe('ONNX Runtime Web browser-training artifact spike', () => {
  it('classifies the pinned onnxruntime-web package as documented upstream but absent from npm artifacts', () => {
    const report = createPinnedOnnxRuntimeWebTrainingSpikeReport();

    expect(report.schemaVersion).toBe(1);
    expect(report.packageName).toBe('onnxruntime-web');
    expect(report.packageVersion).toBe('1.27.0');
    expect(report.trainingApiAvailable).toBe(false);
    expect(report.packageIncludesTrainingWasm).toBe(false);
    expect(report.officialDocsListTrainingWasm).toBe(true);
    expect(report.capability).toBe('documented-artifact-not-packaged');
    expect(report.recommendation).toBe('use-fixed-adapter-math-backend');
    expect(report.backendDecision).toBe('fixed-adapter-math-fallback-required');
    expect(report.tinyTrainingProof).toMatchObject({
      status: 'blocked-no-public-js-api-or-package-artifact',
      forward: false,
      backward: false,
      optimizerStep: false,
      checkpointSaveLoad: false,
      weightExport: false,
    });
    expect(report.evidence.publicTrainingSubpaths).toEqual([]);
    expect(report.evidence.distributionTrainingFiles).toEqual([]);
    expect(report.evidence.publicTrainingSymbols).toEqual([]);
    expect(report.evidence.publicInferenceSymbols).toContain('InferenceSession');
    expect(report.evidence.officialDeploymentDocs).toMatchObject({
      listsTrainingWasmArtifact: true,
      trainingWasmArtifactName: 'ort-training-wasm-simd-threaded.wasm',
      separatesTrainingFromJsepArtifact: true,
    });
    expect(report.evidence.onDeviceTrainingDocs.requiredArtifacts).toContain(
      'optimizer onnx model',
    );
    expect(report.blockerReasons.join(' ')).toMatch(/does not expose a public TrainingSession/);
    expect(report.followOnIssues.join(' ')).toContain('#145');
    expect(report.privacy).toEqual({
      inspectedPackageMetadataOnly: true,
      containsAudio: false,
      containsTranscript: false,
      containsProfileData: false,
      networkRequiredForProbe: false,
      localOnly: true,
    });
  });

  it('does not treat internal ONNX TrainingInfoProto schema mentions as a public JS training API', () => {
    const report = analyzeOnnxRuntimeWebTrainingArtifact({
      ...pinnedOnnxRuntimeWebTrainingArtifactSnapshot,
      publicTypeDeclarationText:
        "declare module 'onnxruntime-web' { export const InferenceSession: unknown; }",
      runtimeExportNames: ['InferenceSession', 'Tensor'],
      internalTrainingMentions: [
        'onnx.TrainingInfoProto exists in protobuf model schema bindings.',
        'BatchNormalization trainingMode is not supported yet.',
      ],
    });

    expect(report.trainingApiAvailable).toBe(false);
    expect(report.evidence.publicTrainingSymbols).toEqual([]);
    expect(report.evidence.ignoredInternalTrainingMentions).toHaveLength(2);
  });

  it('rejects a packaged training WASM without a public JS training API', () => {
    const artifactOnlySnapshot: OnnxRuntimeWebTrainingArtifactSnapshot = {
      packageName: 'onnxruntime-web',
      packageVersion: '1.28.0-artifact-only',
      packageExportSubpaths: ['.', './wasm'],
      distributionFiles: ['dist/ort.wasm.min.mjs', 'dist/ort-training-wasm-simd-threaded.wasm'],
      publicTypeDeclarationText:
        "declare module 'onnxruntime-web' { export class InferenceSession {} }",
      runtimeExportNames: ['InferenceSession', 'Tensor'],
      officialDeploymentDocs: {
        listsTrainingWasmArtifact: true,
        trainingWasmArtifactName: 'ort-training-wasm-simd-threaded.wasm',
        separatesTrainingFromJsepArtifact: true,
      },
      onDeviceTrainingDocs: {
        offlineArtifactGenerationRequired: true,
        requiredArtifacts: ['training onnx model', 'checkpoint state', 'optimizer onnx model'],
      },
    };

    const report = analyzeOnnxRuntimeWebTrainingArtifact(artifactOnlySnapshot);

    expect(report.packageIncludesTrainingWasm).toBe(true);
    expect(report.trainingApiAvailable).toBe(false);
    expect(report.backendDecision).toBe('fixed-adapter-math-fallback-required');
    expect(report.tinyTrainingProof.status).toBe('blocked-no-public-js-api-or-package-artifact');
  });

  it('detects a future public training subpath and TrainingSession symbol as a prototype candidate', () => {
    const futureSnapshot: OnnxRuntimeWebTrainingArtifactSnapshot = {
      packageName: 'onnxruntime-web',
      packageVersion: '1.28.0-future',
      packageExportSubpaths: ['.', './wasm', './training'],
      distributionFiles: ['dist/ort.wasm.min.mjs', 'dist/ort-training-wasm-simd-threaded.wasm'],
      publicTypeDeclarationText:
        "declare module 'onnxruntime-web/training' { export class TrainingSession {} }",
      runtimeExportNames: ['InferenceSession', 'TrainingSession', 'CheckpointState'],
      officialDeploymentDocs: {
        listsTrainingWasmArtifact: true,
        trainingWasmArtifactName: 'ort-training-wasm-simd-threaded.wasm',
        separatesTrainingFromJsepArtifact: true,
      },
      onDeviceTrainingDocs: {
        offlineArtifactGenerationRequired: true,
        requiredArtifacts: ['training onnx model', 'checkpoint state', 'optimizer onnx model'],
      },
    };

    const report = analyzeOnnxRuntimeWebTrainingArtifact(futureSnapshot);

    expect(report.trainingApiAvailable).toBe(true);
    expect(report.packageIncludesTrainingWasm).toBe(true);
    expect(report.capability).toBe('public-api-candidate-detected');
    expect(report.recommendation).toBe('prototype-ort-training-in-dedicated-worker');
    expect(report.backendDecision).toBe('ort-training-wasm-candidate');
    expect(report.tinyTrainingProof.status).toBe('not-run');
    expect(report.blockerReasons).toEqual([]);
    expect(report.evidence.publicTrainingSubpaths).toEqual(['./training']);
    expect(report.evidence.distributionTrainingFiles).toEqual([
      'dist/ort-training-wasm-simd-threaded.wasm',
    ]);
    expect(report.evidence.publicTrainingSymbols).toEqual(['TrainingSession', 'CheckpointState']);
  });

  it('defines the future browser adaptation API boundary without enabling fake ORT training', () => {
    const contract = assertBrowserTrainingExperimentContract(
      browserTrainingExperimentApiContractV1,
    );

    expect(contract.owner).toBe('dedicated-training-worker');
    expect(contract.backendInterface).toBe('BrowserTrainingBackend');
    expect(contract.forbiddenOwners).toEqual(['main-ui-thread', 'audio-worklet', 'asr-worker']);
    expect(contract.allowedTrainableScopes).toEqual([
      'conditioning-vector',
      'lhuc-affine-layer',
      'top-residual-adapter',
      'ctc-calibration-head',
    ]);
    expect(contract.lifecycleMessages).toContain('CANCEL_TRAINING');
    expect(contract.lifecycleMessages).toContain('SAVE_CHECKPOINT');
    expect(contract.requiredControls).toContain('reload-recovery');
    expect(contract.requiredGates).toContain('profile-regression-gate');
    expect(contract.artifactRules.exportFormat).toBe(
      'PortableSpeechModelManifestV1-browser-top-adapter',
    );
    expect(contract.artifactRules.previousActiveProfileUntouchedUntilGatePasses).toBe(true);
    expect(contract.privacy).toEqual({
      localOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      networkUpload: false,
      telemetry: false,
    });
  });

  it('rejects browser-training contracts that try to train in the ASR worker', () => {
    const invalidContract = {
      ...browserTrainingExperimentApiContractV1,
      owner: 'dedicated-training-worker',
      forbiddenOwners: ['main-ui-thread', 'audio-worklet', 'main-ui-thread'],
    } as unknown as BrowserTrainingExperimentApiContractV1;

    expect(() => assertBrowserTrainingExperimentContract(invalidContract)).toThrow(/asr-worker/);
  });

  it('rejects browser-training contracts that expose a concrete backend instead of the interface', () => {
    const invalidContract = {
      ...browserTrainingExperimentApiContractV1,
      backendInterface: 'onnxruntime-web/training',
    } as unknown as BrowserTrainingExperimentApiContractV1;

    expect(() => assertBrowserTrainingExperimentContract(invalidContract)).toThrow(
      /BrowserTrainingBackend/,
    );
  });
});
