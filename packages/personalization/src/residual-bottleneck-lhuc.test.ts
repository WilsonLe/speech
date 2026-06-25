import { describe, expect, it } from 'vitest';
import type { BrowserTrainingContractV1 } from '@speech/protocol';
import {
  analyzeResidualBottleneckLhucBudget,
  applyResidualBottleneckLhucAdapterFrame,
  applyResidualBottleneckLhucAdapterFrames,
  calculateResidualBottleneckLhucByteSize,
  calculateResidualBottleneckLhucParameterCount,
  createIdentityResidualBottleneckLhucAdapter,
  createResidualBottleneckLhucParameterTensorContracts,
  residualBottleneckLhucConfigFromBrowserTrainingContract,
  validateResidualBottleneckLhucAdapterParameters,
  type ResidualBottleneckLhucAdapterParametersV1,
} from './residual-bottleneck-lhuc';

function expectNumbersClose(
  actual: Float32Array | readonly number[],
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? 0, 9);
  });
}

describe('residual bottleneck/LHUC adapter reference math', () => {
  it('initializes as an identity-preserving residual/LHUC adapter', () => {
    const adapter = createIdentityResidualBottleneckLhucAdapter(
      { inputDimension: 4, rank: 2, residualScale: 0.25 },
      { maxParameterCount: 26, preferredMaxBytes: 104, hardMaxBytes: 104 },
    );

    expect(adapter).toMatchObject({
      schemaVersion: 1,
      architecture: 'residual-bottleneck-lhuc-v1',
      inputDimension: 4,
      rank: 2,
      residualScale: 0.25,
      precision: 'float32',
      parameterCount: 26,
      byteSize: 104,
      initialization: {
        kind: 'identity-zero',
        preservesInput: true,
        lhucIdentityParameterValue: 0,
      },
    });
    expect(adapter.tensors.w_down).toHaveLength(8);
    expect(adapter.tensors.b_down).toHaveLength(2);
    expect(adapter.tensors.w_up).toHaveLength(8);
    expect(adapter.tensors.b_up).toHaveLength(4);
    expect(adapter.tensors.lhuc).toHaveLength(4);
    expect([...adapter.tensors.w_down, ...adapter.tensors.b_down, ...adapter.tensors.w_up]).toEqual(
      new Array(18).fill(0),
    );

    const input = [1, -0.5, 0.25, 0];
    const forward = applyResidualBottleneckLhucAdapterFrame(input, adapter);
    expect(forward).toMatchObject({
      schemaVersion: 1,
      architecture: 'residual-bottleneck-lhuc-v1',
      inputDimension: 4,
      rank: 2,
    });
    expectNumbersClose(forward.bottleneck, [0, 0]);
    expectNumbersClose(forward.residual, [0, 0, 0, 0]);
    expectNumbersClose(forward.lhucScale, [1, 1, 1, 1]);
    expectNumbersClose(forward.output, input);
  });

  it('applies residual bottleneck projections and LHUC scale deterministically', () => {
    const base = createIdentityResidualBottleneckLhucAdapter({
      inputDimension: 3,
      rank: 1,
      residualScale: 0.5,
    });
    const adapter: ResidualBottleneckLhucAdapterParametersV1 = {
      ...base,
      tensors: {
        w_down: [0.5, 0.25, -0.75],
        b_down: [0.1],
        w_up: [0.2, -0.4, 0.1],
        b_up: [0.05, -0.02, 0],
        lhuc: [0, Math.log(3), -Math.log(3)],
      },
    };

    const input = [0.4, -0.2, 0.6];
    const hidden = Math.tanh(0.1 + 0.4 * 0.5 - 0.2 * 0.25 + 0.6 * -0.75);
    const residual = [0.05 + hidden * 0.2, -0.02 + hidden * -0.4, hidden * 0.1];
    const lhucScale = [1, 1.5, 0.5];
    const expectedOutput = input.map((value, index) => {
      const expectedResidual = residual[index] ?? 0;
      const scale = lhucScale[index] ?? 1;
      return (value + expectedResidual * 0.5) * scale;
    });

    const forward = applyResidualBottleneckLhucAdapterFrame(input, adapter);

    expectNumbersClose(forward.bottleneck, [hidden]);
    expectNumbersClose(forward.residual, residual);
    expectNumbersClose(forward.lhucScale, lhucScale);
    expectNumbersClose(forward.output, expectedOutput);
  });

  it('runs frame batches without mutating inputs or parameters', () => {
    const adapter = createIdentityResidualBottleneckLhucAdapter({
      inputDimension: 2,
      rank: 1,
      residualScale: 1,
    });
    const frameA = new Float32Array([0.25, -0.75]);
    const frameB = [1, 2] as const;
    const results = applyResidualBottleneckLhucAdapterFrames([frameA, frameB], adapter);

    expect(results).toHaveLength(2);
    expectNumbersClose(results[0]?.output ?? [], [0.25, -0.75]);
    expectNumbersClose(results[1]?.output ?? [], [1, 2]);
    expectNumbersClose(frameA, [0.25, -0.75]);
    expect(adapter.tensors.lhuc).toEqual([0, 0]);
  });

  it('reports and enforces parameter and byte budgets', () => {
    const config = { inputDimension: 4, rank: 2, residualScale: 0.25 };

    expect(calculateResidualBottleneckLhucParameterCount(4, 2)).toBe(26);
    expect(calculateResidualBottleneckLhucByteSize(config)).toBe(104);
    expect(
      analyzeResidualBottleneckLhucBudget(config, {
        maxParameterCount: 26,
        preferredMaxBytes: 100,
        hardMaxBytes: 104,
      }),
    ).toMatchObject({
      parameterCount: 26,
      byteSize: 104,
      withinParameterBudget: true,
      withinPreferredByteBudget: false,
      withinHardByteBudget: true,
    });

    expect(() =>
      createIdentityResidualBottleneckLhucAdapter(config, {
        maxParameterCount: 25,
        hardMaxBytes: 104,
      }),
    ).toThrow(/parameter count/);
    expect(() =>
      createIdentityResidualBottleneckLhucAdapter(config, {
        maxParameterCount: 26,
        hardMaxBytes: 103,
      }),
    ).toThrow(/hard budget/);
    expect(() =>
      analyzeResidualBottleneckLhucBudget(config, {
        maxParameterCount: 26,
        preferredMaxBytes: 105,
        hardMaxBytes: 104,
      }),
    ).toThrow(/preferredMaxBytes/);
  });

  it('matches the SpeechModelManifestV3 browser-training tensor contract', () => {
    const parameterTensors = createResidualBottleneckLhucParameterTensorContracts({
      inputDimension: 256,
      rank: 8,
      residualScale: 0.25,
    });
    expect(parameterTensors.map(({ name, shape }) => [name, shape])).toEqual([
      ['w_down', [256, 8]],
      ['b_down', [8]],
      ['w_up', [8, 256]],
      ['b_up', [256]],
      ['lhuc', [256]],
    ]);

    const contract = createAdapterContract({ parameterTensors });
    expect(residualBottleneckLhucConfigFromBrowserTrainingContract(contract)).toEqual({
      inputDimension: 256,
      rank: 8,
      residualScale: 0.25,
      precision: 'float32',
    });

    expect(() =>
      residualBottleneckLhucConfigFromBrowserTrainingContract(
        createAdapterContract({
          parameterTensors: parameterTensors.filter(({ name }) => name !== 'lhuc'),
        }),
      ),
    ).toThrow(/include lhuc/);
    expect(() =>
      residualBottleneckLhucConfigFromBrowserTrainingContract(
        createAdapterContract({
          parameterTensors: parameterTensors.map((tensor) =>
            tensor.name === 'w_up' ? { ...tensor, shape: [256, 8] } : tensor,
          ),
        }),
      ),
    ).toThrow(/w_up.*shape/);
    expect(() =>
      residualBottleneckLhucConfigFromBrowserTrainingContract(
        createAdapterContract({ preferredMaxBytes: 18_000, hardMaxBytes: 18_000 }),
      ),
    ).toThrow(/hard budget/);
  });

  it('rejects malformed adapter parameters and frame dimensions', () => {
    const adapter = createIdentityResidualBottleneckLhucAdapter({
      inputDimension: 2,
      rank: 1,
      residualScale: 1,
    });

    expect(() =>
      validateResidualBottleneckLhucAdapterParameters({
        ...adapter,
        tensors: { ...adapter.tensors, w_down: [0] },
      }),
    ).toThrow(/w_down/);
    expect(() =>
      validateResidualBottleneckLhucAdapterParameters({
        ...adapter,
        tensors: { ...adapter.tensors, lhuc: [Number.NaN, 0] },
      }),
    ).toThrow(/lhuc value/);
    expect(() => applyResidualBottleneckLhucAdapterFrame([1], adapter)).toThrow(/dimension/);
    expect(() =>
      createIdentityResidualBottleneckLhucAdapter({ inputDimension: 2, rank: 1, residualScale: 2 }),
    ).toThrow(/residualScale/);
  });
});

function createAdapterContract(
  overrides: Partial<BrowserTrainingContractV1['adapter']> = {},
): BrowserTrainingContractV1['adapter'] {
  return {
    architecture: 'residual-bottleneck-lhuc-v1',
    inputDimension: 256,
    rank: 8,
    residualScale: 0.25,
    parameterTensors: createResidualBottleneckLhucParameterTensorContracts({
      inputDimension: 256,
      rank: 8,
      residualScale: 0.25,
    }),
    runtimeGraph: {
      fileKey: 'adapter-runtime',
      role: 'runtime-adapter',
      license: { spdx: 'Apache-2.0', name: 'Synthetic fixture', redistributionAllowed: true },
      provenance: { source: 'test', generatedBy: 'vitest' },
    },
    preferredMaxBytes: 2_000_000,
    hardMaxBytes: 10_000_000,
    ...overrides,
  };
}
