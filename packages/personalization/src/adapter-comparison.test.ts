import { describe, expect, it } from 'vitest';

import {
  createBrowserPythonAdapterComparisonReport,
  createSyntheticFrozenFeatureTinyAdapterDataset,
  trainFrozenFeatureTinyAdapter,
  type AdapterComparisonMetricV1,
  type AdapterComparisonQualityInputV1,
  type FrozenFeatureTinyAdapterTrainingResultV1,
} from './index';

describe('browser-vs-Python adapter comparison reports', () => {
  it('creates an aggregate-only comparison report when browser evidence matches the Python trainer', () => {
    const report = createBrowserPythonAdapterComparisonReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      comparisonId: 'synthetic-browser-python-comparison',
      browser: {
        trainingResult: browserTrainingResult(),
        trainingDurationMs: 900,
        evaluation: browserQuality({
          wordErrorRate: 0.08,
          characterErrorRate: 0.035,
          customTermRecall: 0.96,
          customTermFalseInsertionRate: 0,
          realTimeFactor: 0.115,
        }),
      },
      python: {
        trainingMetadata: pythonTrainingMetadata(),
        evaluationReport: pythonEvaluationReport({ activationGatePassed: true }),
        trainingDurationMs: 1_000,
      },
      thresholds: {
        maxRelativeQualityRegression: 0.1,
        maxRelativeRtfRegression: 0.2,
        maxTrainingDurationRatio: 1.5,
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      reportType: 'browser-python-adapter-comparison',
      baseModelCompatible: true,
      verdict: {
        status: 'browser-comparable-experimental',
      },
      privacy: {
        containsRawAudio: false,
        containsTranscriptText: false,
        containsCaseIds: false,
        containsFrozenFeatureValues: false,
        containsAdapterWeights: false,
        aggregateOnly: true,
        localOnly: true,
        networkUpload: false,
      },
    });
    expect(report.browser.workerOwner).toBe('dedicated-training-worker');
    expect(report.browser.adapter.sizeBytes).toBe(report.browser.adapter.parameterCount * 4);
    expect(metric(report.qualityMetrics, 'wordErrorRate')).toMatchObject({
      browser: 0.08,
      python: 0.08,
      status: 'within-tolerance',
    });
    expect(metric(report.qualityMetrics, 'customTermRecall')).toMatchObject({
      browser: 0.96,
      python: 0.95,
      status: 'within-tolerance',
    });
    expect(metric(report.performanceMetrics, 'trainingDurationMs')).toMatchObject({
      browser: 900,
      python: 1000,
      status: 'within-tolerance',
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('referenceText');
    expect(serialized).not.toContain('case-personal');
    expect(serialized).not.toContain('features');
    expect(serialized).not.toContain('weights');
  });

  it('prefers the Python trainer when quality or performance regress beyond tolerance', () => {
    const report = createBrowserPythonAdapterComparisonReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      comparisonId: 'regressed-browser-comparison',
      browser: {
        trainingResult: browserTrainingResult(),
        trainingDurationMs: 4_000,
        evaluation: browserQuality({
          wordErrorRate: 0.12,
          characterErrorRate: 0.06,
          customTermRecall: 0.6,
          customTermFalseInsertionRate: 0.3,
          realTimeFactor: 0.2,
        }),
      },
      python: {
        trainingMetadata: pythonTrainingMetadata(),
        evaluationReport: pythonEvaluationReport({ activationGatePassed: true }),
        trainingDurationMs: 1_000,
      },
      thresholds: {
        maxRelativeQualityRegression: 0.05,
        maxCustomTermRecallAbsoluteRegression: 0.05,
        maxCustomTermFalseInsertionAbsoluteRegression: 0,
        maxRelativeRtfRegression: 0.1,
        maxTrainingDurationRatio: 2,
      },
    });

    expect(report.verdict.status).toBe('prefer-python-trainer');
    expect(report.verdict.reasons).toEqual(
      expect.arrayContaining([
        'Browser adapter quality is worse than the Python trainer beyond tolerance.',
        'Browser adapter training or artifact size is worse than the Python trainer beyond tolerance.',
      ]),
    );
    expect(metric(report.qualityMetrics, 'wordErrorRate').status).toBe('python-better');
    expect(metric(report.qualityMetrics, 'customTermRecall').status).toBe('python-better');
    expect(metric(report.performanceMetrics, 'trainingDurationMs').status).toBe('python-better');
  });

  it('classifies missing browser held-out quality as insufficient evidence', () => {
    const report = createBrowserPythonAdapterComparisonReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      comparisonId: 'missing-browser-quality',
      browser: {
        trainingResult: browserTrainingResult(),
        trainingDurationMs: 500,
      },
      python: {
        trainingMetadata: pythonTrainingMetadata(),
        evaluationReport: pythonEvaluationReport({ activationGatePassed: true }),
        trainingDurationMs: 1_000,
      },
    });

    expect(report.verdict.status).toBe('insufficient-browser-evidence');
    expect(report.verdict.reasons).toEqual(
      expect.arrayContaining([
        'Browser adapter has not passed an activation gate.',
        'Browser quality evidence is incomplete for parity comparison.',
      ]),
    );
    expect(report.qualityMetrics.every((entry) => entry.status === 'missing')).toBe(true);
  });

  it('rejects non-aggregate Python evaluation reports and flags base-model mismatches', () => {
    expect(() =>
      createBrowserPythonAdapterComparisonReport({
        generatedAt: '2026-06-23T00:00:00.000Z',
        comparisonId: 'private-python-report',
        browser: {
          trainingResult: browserTrainingResult(),
          trainingDurationMs: 500,
          evaluation: browserQuality({}),
        },
        python: {
          trainingMetadata: pythonTrainingMetadata(),
          evaluationReport: privatePythonEvaluationReport(),
          trainingDurationMs: 1_000,
        },
      }),
    ).toThrow(/aggregate-only/);

    const mismatch = createBrowserPythonAdapterComparisonReport({
      generatedAt: '2026-06-23T00:00:00.000Z',
      comparisonId: 'base-model-mismatch',
      browser: {
        trainingResult: browserTrainingResult(),
        trainingDurationMs: 500,
        evaluation: browserQuality({}),
      },
      python: {
        trainingMetadata: pythonTrainingMetadata({ graphContractSha256: '1'.repeat(64) }),
        evaluationReport: pythonEvaluationReport({ activationGatePassed: true }),
        trainingDurationMs: 1_000,
      },
    });

    expect(mismatch.baseModelCompatible).toBe(false);
    expect(mismatch.verdict.status).toBe('prefer-python-trainer');
    expect(mismatch.verdict.reasons).toContain(
      'Browser and Python adapters target different base-model identities.',
    );
  });
});

function browserTrainingResult(): FrozenFeatureTinyAdapterTrainingResultV1 {
  return trainFrozenFeatureTinyAdapter(createSyntheticFrozenFeatureTinyAdapterDataset(), {
    epochs: 80,
    targetLoss: 0,
  });
}

function browserQuality(
  overrides: Partial<Omit<AdapterComparisonQualityInputV1, 'activationGatePassed'>>,
): AdapterComparisonQualityInputV1 {
  return {
    wordErrorRate: 0.08,
    characterErrorRate: 0.035,
    customTermRecall: 0.96,
    customTermFalseInsertionRate: 0,
    realTimeFactor: 0.115,
    activationGatePassed: true,
    ...overrides,
  };
}

function pythonTrainingMetadata(
  overrides: Partial<{ readonly graphContractSha256: string }> = {},
): Record<string, unknown> {
  const graphContractSha256 = overrides.graphContractSha256 ?? '0'.repeat(64);
  return {
    softwareVersions: {
      speechProfileTrainer: '0.1.0-test',
    },
    baseModel: {
      id: 'mock-browser-training-base',
      version: '0.0.0-ci',
      graphContractSha256,
    },
    adapter: {
      parameterCount: 10,
      sizeBytes: 40,
      sha256: 'a'.repeat(64),
    },
    optimization: {
      objective: 'deterministic-ci-residual-adapter-baseline',
    },
  };
}

function pythonEvaluationReport({
  activationGatePassed,
}: {
  readonly activationGatePassed: boolean;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    adapter: {
      sha256: 'a'.repeat(64),
      sizeBytes: 40,
    },
    evaluation: {
      overall: {
        wer: { base: 0.12, adapted: 0.08, delta: -0.04 },
        cer: { base: 0.05, adapted: 0.035, delta: -0.015 },
        customTermRecall: { base: 0.75, adapted: 0.95, delta: 0.2 },
        falseInsertionRate: { base: 0, adapted: 0, delta: 0 },
        rtf: { base: 0.1, adapted: 0.11, overheadRatio: 0.1 },
      },
    },
    activationGate: {
      passed: activationGatePassed,
      automaticActivationAllowed: activationGatePassed,
    },
    privacy: {
      containsRawAudio: false,
      containsTranscriptText: false,
      containsCaseIds: false,
      containsBaseModelWeights: false,
      containsAdapterWeights: false,
    },
  };
}

function privatePythonEvaluationReport(): Record<string, unknown> {
  return {
    ...pythonEvaluationReport({ activationGatePassed: true }),
    privacy: {
      containsRawAudio: false,
      containsTranscriptText: true,
      containsCaseIds: false,
      containsBaseModelWeights: false,
      containsAdapterWeights: false,
    },
  };
}

function metric(
  metrics: readonly AdapterComparisonMetricV1[],
  name: string,
): AdapterComparisonMetricV1 {
  const found = metrics.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`Missing metric ${name}`);
  return found;
}
