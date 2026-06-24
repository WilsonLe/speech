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
  it('classifies the pinned onnxruntime-web package as inference-only for browser training', () => {
    const report = createPinnedOnnxRuntimeWebTrainingSpikeReport();

    expect(report.schemaVersion).toBe(1);
    expect(report.packageName).toBe('onnxruntime-web');
    expect(report.packageVersion).toBe('1.27.0');
    expect(report.trainingApiAvailable).toBe(false);
    expect(report.capability).toBe('not-present-in-pinned-package');
    expect(report.recommendation).toBe('defer-browser-training-prototype');
    expect(report.evidence.publicTrainingSubpaths).toEqual([]);
    expect(report.evidence.distributionTrainingFiles).toEqual([]);
    expect(report.evidence.publicTrainingSymbols).toEqual([]);
    expect(report.evidence.publicInferenceSymbols).toContain('InferenceSession');
    expect(report.blockerReasons.join(' ')).toMatch(/does not expose a public TrainingSession/);
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

  it('detects a future public training subpath and TrainingSession symbol as a prototype candidate', () => {
    const futureSnapshot: OnnxRuntimeWebTrainingArtifactSnapshot = {
      packageName: 'onnxruntime-web',
      packageVersion: '1.28.0-future',
      packageExportSubpaths: ['.', './wasm', './training'],
      distributionFiles: ['dist/ort.wasm.min.mjs', 'dist/ort.training.wasm'],
      publicTypeDeclarationText:
        "declare module 'onnxruntime-web/training' { export class TrainingSession {} }",
      runtimeExportNames: ['InferenceSession', 'TrainingSession', 'CheckpointState'],
    };

    const report = analyzeOnnxRuntimeWebTrainingArtifact(futureSnapshot);

    expect(report.trainingApiAvailable).toBe(true);
    expect(report.capability).toBe('public-api-candidate-detected');
    expect(report.recommendation).toBe('prototype-in-dedicated-training-worker');
    expect(report.blockerReasons).toEqual([]);
    expect(report.evidence.publicTrainingSubpaths).toEqual(['./training']);
    expect(report.evidence.distributionTrainingFiles).toEqual(['dist/ort.training.wasm']);
    expect(report.evidence.publicTrainingSymbols).toEqual(['TrainingSession', 'CheckpointState']);
  });

  it('defines the future browser adaptation JS API boundary without enabling real training', () => {
    const contract = assertBrowserTrainingExperimentContract(
      browserTrainingExperimentApiContractV1,
    );

    expect(contract.owner).toBe('dedicated-training-worker');
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
});
