import type { BrowserTrainingContractV1, TensorContract } from '@speech/protocol';

export const residualBottleneckLhucArchitecture = 'residual-bottleneck-lhuc-v1' as const;
export const residualBottleneckLhucTensorNames = [
  'w_down',
  'b_down',
  'w_up',
  'b_up',
  'lhuc',
] as const;

export type ResidualBottleneckLhucArchitecture = typeof residualBottleneckLhucArchitecture;
export type ResidualBottleneckLhucTensorName = (typeof residualBottleneckLhucTensorNames)[number];
export type ResidualBottleneckLhucPrecision = 'float32' | 'float16';

export interface ResidualBottleneckLhucAdapterConfigV1 {
  readonly inputDimension: number;
  readonly rank: number;
  readonly residualScale: number;
  readonly precision?: ResidualBottleneckLhucPrecision;
}

export interface ResidualBottleneckLhucAdapterBudgetV1 {
  readonly maxParameterCount: number;
  readonly hardMaxBytes: number;
  readonly preferredMaxBytes?: number;
}

export interface ResidualBottleneckLhucBudgetReportV1 {
  readonly parameterCount: number;
  readonly byteSize: number;
  readonly bytesPerParameter: number;
  readonly maxParameterCount: number;
  readonly hardMaxBytes: number;
  readonly preferredMaxBytes?: number;
  readonly withinParameterBudget: boolean;
  readonly withinHardByteBudget: boolean;
  readonly withinPreferredByteBudget: boolean | null;
}

export interface ResidualBottleneckLhucParameterTensorsV1 {
  /** Down projection, row-major [inputDimension, rank]. */
  readonly w_down: readonly number[];
  /** Down-projection bias, [rank]. */
  readonly b_down: readonly number[];
  /** Up projection, row-major [rank, inputDimension]. */
  readonly w_up: readonly number[];
  /** Up-projection/residual bias, [inputDimension]. */
  readonly b_up: readonly number[];
  /** LHUC logit parameters, [inputDimension]. Zero maps to unit scale. */
  readonly lhuc: readonly number[];
}

export interface ResidualBottleneckLhucAdapterParametersV1 {
  readonly schemaVersion: 1;
  readonly architecture: ResidualBottleneckLhucArchitecture;
  readonly inputDimension: number;
  readonly rank: number;
  readonly residualScale: number;
  readonly precision: ResidualBottleneckLhucPrecision;
  readonly parameterCount: number;
  readonly byteSize: number;
  readonly tensors: ResidualBottleneckLhucParameterTensorsV1;
  readonly initialization: {
    readonly kind: 'identity-zero';
    readonly preservesInput: true;
    readonly lhucIdentityParameterValue: 0;
  };
}

export interface ResidualBottleneckLhucForwardResultV1 {
  readonly schemaVersion: 1;
  readonly architecture: ResidualBottleneckLhucArchitecture;
  readonly inputDimension: number;
  readonly rank: number;
  readonly bottleneck: readonly number[];
  readonly residual: readonly number[];
  readonly lhucScale: readonly number[];
  readonly output: readonly number[];
}

export function calculateResidualBottleneckLhucParameterCount(
  inputDimension: number,
  rank: number,
): number {
  const normalized = validateResidualBottleneckLhucConfig({
    inputDimension,
    rank,
    residualScale: 1,
  });
  return calculateParameterCountUnchecked(normalized.inputDimension, normalized.rank);
}

export function calculateResidualBottleneckLhucByteSize(
  config: ResidualBottleneckLhucAdapterConfigV1,
): number {
  const normalized = validateResidualBottleneckLhucConfig(config);
  return (
    calculateParameterCountUnchecked(normalized.inputDimension, normalized.rank) *
    bytesPerParameter(normalized.precision)
  );
}

export function createResidualBottleneckLhucParameterTensorContracts(
  config: ResidualBottleneckLhucAdapterConfigV1,
): readonly TensorContract[] {
  const normalized = validateResidualBottleneckLhucConfig(config);
  return [
    {
      name: 'w_down',
      dataType: normalized.precision,
      shape: [normalized.inputDimension, normalized.rank],
      description: 'Residual bottleneck down projection, row-major [inputDimension, rank].',
    },
    {
      name: 'b_down',
      dataType: normalized.precision,
      shape: [normalized.rank],
      description: 'Residual bottleneck down-projection bias.',
    },
    {
      name: 'w_up',
      dataType: normalized.precision,
      shape: [normalized.rank, normalized.inputDimension],
      description: 'Residual bottleneck up projection, row-major [rank, inputDimension].',
    },
    {
      name: 'b_up',
      dataType: normalized.precision,
      shape: [normalized.inputDimension],
      description: 'Residual bottleneck output bias before residual scaling.',
    },
    {
      name: 'lhuc',
      dataType: normalized.precision,
      shape: [normalized.inputDimension],
      description: 'LHUC logit parameters; zero maps to unit hidden-unit contribution scale.',
    },
  ];
}

export function createIdentityResidualBottleneckLhucAdapter(
  config: ResidualBottleneckLhucAdapterConfigV1,
  budget?: ResidualBottleneckLhucAdapterBudgetV1,
): ResidualBottleneckLhucAdapterParametersV1 {
  const normalized = validateResidualBottleneckLhucConfig(config);
  if (budget !== undefined) {
    assertResidualBottleneckLhucBudget(normalized, budget);
  }
  const parameterCount = calculateParameterCountUnchecked(
    normalized.inputDimension,
    normalized.rank,
  );
  const byteSize = parameterCount * bytesPerParameter(normalized.precision);
  const tensors: ResidualBottleneckLhucParameterTensorsV1 = {
    w_down: createZeroArray(normalized.inputDimension * normalized.rank),
    b_down: createZeroArray(normalized.rank),
    w_up: createZeroArray(normalized.rank * normalized.inputDimension),
    b_up: createZeroArray(normalized.inputDimension),
    lhuc: createZeroArray(normalized.inputDimension),
  };
  return validateResidualBottleneckLhucAdapterParameters({
    schemaVersion: 1,
    architecture: residualBottleneckLhucArchitecture,
    inputDimension: normalized.inputDimension,
    rank: normalized.rank,
    residualScale: normalized.residualScale,
    precision: normalized.precision,
    parameterCount,
    byteSize,
    tensors,
    initialization: {
      kind: 'identity-zero',
      preservesInput: true,
      lhucIdentityParameterValue: 0,
    },
  });
}

export function residualBottleneckLhucConfigFromBrowserTrainingContract(
  adapterContract: BrowserTrainingContractV1['adapter'],
): ResidualBottleneckLhucAdapterConfigV1 {
  if (adapterContract.architecture !== residualBottleneckLhucArchitecture) {
    throw new Error('Browser-training adapter architecture must be residual-bottleneck-lhuc-v1.');
  }
  const precision = validateManifestParameterTensorContracts(
    adapterContract.parameterTensors,
    adapterContract.inputDimension,
    adapterContract.rank,
  );
  const config = validateResidualBottleneckLhucConfig({
    inputDimension: adapterContract.inputDimension,
    rank: adapterContract.rank,
    residualScale: adapterContract.residualScale,
    precision,
  });
  assertResidualBottleneckLhucBudget(config, {
    maxParameterCount: Number.MAX_SAFE_INTEGER,
    preferredMaxBytes: adapterContract.preferredMaxBytes,
    hardMaxBytes: adapterContract.hardMaxBytes,
  });
  return config;
}

export function analyzeResidualBottleneckLhucBudget(
  config: ResidualBottleneckLhucAdapterConfigV1,
  budget: ResidualBottleneckLhucAdapterBudgetV1,
): ResidualBottleneckLhucBudgetReportV1 {
  const normalized = validateResidualBottleneckLhucConfig(config);
  validateBudget(budget);
  const parameterCount = calculateParameterCountUnchecked(
    normalized.inputDimension,
    normalized.rank,
  );
  const perParameter = bytesPerParameter(normalized.precision);
  const byteSize = parameterCount * perParameter;
  return {
    parameterCount,
    byteSize,
    bytesPerParameter: perParameter,
    maxParameterCount: budget.maxParameterCount,
    hardMaxBytes: budget.hardMaxBytes,
    ...(budget.preferredMaxBytes === undefined
      ? {}
      : { preferredMaxBytes: budget.preferredMaxBytes }),
    withinParameterBudget: parameterCount <= budget.maxParameterCount,
    withinHardByteBudget: byteSize <= budget.hardMaxBytes,
    withinPreferredByteBudget:
      budget.preferredMaxBytes === undefined ? null : byteSize <= budget.preferredMaxBytes,
  };
}

export function assertResidualBottleneckLhucBudget(
  config: ResidualBottleneckLhucAdapterConfigV1,
  budget: ResidualBottleneckLhucAdapterBudgetV1,
): ResidualBottleneckLhucBudgetReportV1 {
  const report = analyzeResidualBottleneckLhucBudget(config, budget);
  if (!report.withinParameterBudget) {
    throw new Error(
      `Residual bottleneck/LHUC parameter count ${report.parameterCount.toString()} exceeds budget ${report.maxParameterCount.toString()}.`,
    );
  }
  if (!report.withinHardByteBudget) {
    throw new Error(
      `Residual bottleneck/LHUC byte size ${report.byteSize.toString()} exceeds hard budget ${report.hardMaxBytes.toString()}.`,
    );
  }
  return report;
}

export function validateResidualBottleneckLhucAdapterParameters(
  adapter: ResidualBottleneckLhucAdapterParametersV1,
): ResidualBottleneckLhucAdapterParametersV1 {
  if (adapter.schemaVersion !== 1) {
    throw new Error('Residual bottleneck/LHUC adapter schemaVersion must be 1.');
  }
  if (adapter.architecture !== residualBottleneckLhucArchitecture) {
    throw new Error('Residual bottleneck/LHUC adapter architecture is invalid.');
  }
  const config = validateResidualBottleneckLhucConfig(adapter);
  const expectedParameterCount = calculateParameterCountUnchecked(
    config.inputDimension,
    config.rank,
  );
  const expectedByteSize = expectedParameterCount * bytesPerParameter(config.precision);
  if (adapter.parameterCount !== expectedParameterCount) {
    throw new Error('Residual bottleneck/LHUC adapter parameterCount is invalid.');
  }
  if (adapter.byteSize !== expectedByteSize) {
    throw new Error('Residual bottleneck/LHUC adapter byteSize is invalid.');
  }
  assertTensorLength(adapter.tensors.w_down, config.inputDimension * config.rank, 'w_down');
  assertTensorLength(adapter.tensors.b_down, config.rank, 'b_down');
  assertTensorLength(adapter.tensors.w_up, config.rank * config.inputDimension, 'w_up');
  assertTensorLength(adapter.tensors.b_up, config.inputDimension, 'b_up');
  assertTensorLength(adapter.tensors.lhuc, config.inputDimension, 'lhuc');
  if (
    adapter.initialization.kind !== 'identity-zero' ||
    adapter.initialization.preservesInput !== true ||
    adapter.initialization.lhucIdentityParameterValue !== 0
  ) {
    throw new Error('Residual bottleneck/LHUC adapter initialization metadata is invalid.');
  }
  return adapter;
}

export function applyResidualBottleneckLhucAdapterFrame(
  inputFrame: Float32Array | readonly number[],
  adapter: ResidualBottleneckLhucAdapterParametersV1,
): ResidualBottleneckLhucForwardResultV1 {
  const validated = validateResidualBottleneckLhucAdapterParameters(adapter);
  if (inputFrame.length !== validated.inputDimension) {
    throw new Error('Residual bottleneck/LHUC input frame dimension does not match adapter.');
  }
  const input = new Array<number>(validated.inputDimension);
  for (let index = 0; index < inputFrame.length; index += 1) {
    input[index] = assertFiniteNumber(inputFrame[index] ?? 0, 'input frame value');
  }

  const { w_down, b_down, w_up, b_up, lhuc } = validated.tensors;
  const bottleneck = new Array<number>(validated.rank).fill(0);
  for (let rankIndex = 0; rankIndex < validated.rank; rankIndex += 1) {
    let activation = b_down[rankIndex] ?? 0;
    for (let inputIndex = 0; inputIndex < validated.inputDimension; inputIndex += 1) {
      activation +=
        (input[inputIndex] ?? 0) * (w_down[inputIndex * validated.rank + rankIndex] ?? 0);
    }
    bottleneck[rankIndex] = Math.tanh(activation);
  }

  const residual = new Array<number>(validated.inputDimension).fill(0);
  const lhucScale = new Array<number>(validated.inputDimension).fill(1);
  const output = new Array<number>(validated.inputDimension).fill(0);
  for (let outputIndex = 0; outputIndex < validated.inputDimension; outputIndex += 1) {
    let residualValue = b_up[outputIndex] ?? 0;
    for (let rankIndex = 0; rankIndex < validated.rank; rankIndex += 1) {
      residualValue +=
        (bottleneck[rankIndex] ?? 0) *
        (w_up[rankIndex * validated.inputDimension + outputIndex] ?? 0);
    }
    residual[outputIndex] = residualValue;
    const scale = lhucLogitToScale(lhuc[outputIndex] ?? 0);
    lhucScale[outputIndex] = scale;
    output[outputIndex] =
      ((input[outputIndex] ?? 0) + validated.residualScale * residualValue) * scale;
  }

  return {
    schemaVersion: 1,
    architecture: residualBottleneckLhucArchitecture,
    inputDimension: validated.inputDimension,
    rank: validated.rank,
    bottleneck,
    residual,
    lhucScale,
    output,
  };
}

export function applyResidualBottleneckLhucAdapterFrames(
  inputFrames: readonly (Float32Array | readonly number[])[],
  adapter: ResidualBottleneckLhucAdapterParametersV1,
): readonly ResidualBottleneckLhucForwardResultV1[] {
  return inputFrames.map((frame) => applyResidualBottleneckLhucAdapterFrame(frame, adapter));
}

function validateResidualBottleneckLhucConfig(
  config: ResidualBottleneckLhucAdapterConfigV1,
): Required<ResidualBottleneckLhucAdapterConfigV1> {
  const inputDimension = assertPositiveInteger(config.inputDimension, 'inputDimension');
  const rank = assertPositiveInteger(config.rank, 'rank');
  const residualScale = assertPositiveFinite(config.residualScale, 'residualScale');
  if (residualScale > 1) {
    throw new Error('Residual bottleneck/LHUC residualScale must be less than or equal to 1.');
  }
  const precision = config.precision ?? 'float32';
  if (precision !== 'float32' && precision !== 'float16') {
    throw new Error('Residual bottleneck/LHUC precision must be float32 or float16.');
  }
  return { inputDimension, rank, residualScale, precision };
}

function validateManifestParameterTensorContracts(
  tensors: readonly TensorContract[],
  inputDimension: number,
  rank: number,
): ResidualBottleneckLhucPrecision {
  const expected = createResidualBottleneckLhucParameterTensorContracts({
    inputDimension,
    rank,
    residualScale: 1,
  });
  const expectedByName = new Map(expected.map((tensor) => [tensor.name, tensor]));
  const seen = new Set<string>();
  let precision: ResidualBottleneckLhucPrecision | undefined;
  for (const tensor of tensors) {
    if (!isResidualBottleneckLhucTensorName(tensor.name)) continue;
    if (seen.has(tensor.name)) {
      throw new Error(`Duplicate residual bottleneck/LHUC tensor contract: ${tensor.name}`);
    }
    seen.add(tensor.name);
    if (tensor.dataType !== 'float32' && tensor.dataType !== 'float16') {
      throw new Error(`Residual bottleneck/LHUC tensor ${tensor.name} must be float32 or float16.`);
    }
    precision ??= tensor.dataType;
    if (tensor.dataType !== precision) {
      throw new Error('Residual bottleneck/LHUC tensor contracts must use one precision.');
    }
    const expectedTensor = expectedByName.get(tensor.name);
    if (expectedTensor === undefined || !shapeEquals(tensor.shape, expectedTensor.shape)) {
      throw new Error(`Residual bottleneck/LHUC tensor ${tensor.name} has an invalid shape.`);
    }
  }
  for (const tensorName of residualBottleneckLhucTensorNames) {
    if (!seen.has(tensorName)) {
      throw new Error(`Residual bottleneck/LHUC tensor contract must include ${tensorName}.`);
    }
  }
  return precision ?? 'float32';
}

function validateBudget(budget: ResidualBottleneckLhucAdapterBudgetV1): void {
  assertPositiveInteger(budget.maxParameterCount, 'maxParameterCount');
  assertPositiveInteger(budget.hardMaxBytes, 'hardMaxBytes');
  if (budget.preferredMaxBytes !== undefined) {
    assertPositiveInteger(budget.preferredMaxBytes, 'preferredMaxBytes');
    if (budget.preferredMaxBytes > budget.hardMaxBytes) {
      throw new Error('preferredMaxBytes must not exceed hardMaxBytes.');
    }
  }
}

function calculateParameterCountUnchecked(inputDimension: number, rank: number): number {
  return inputDimension * rank + rank + rank * inputDimension + inputDimension + inputDimension;
}

function bytesPerParameter(precision: ResidualBottleneckLhucPrecision): number {
  return precision === 'float16' ? 2 : 4;
}

function createZeroArray(length: number): number[] {
  return new Array<number>(length).fill(0);
}

function assertTensorLength(
  tensor: readonly number[],
  expectedLength: number,
  tensorName: ResidualBottleneckLhucTensorName,
): void {
  if (tensor.length !== expectedLength) {
    throw new Error(`Residual bottleneck/LHUC tensor ${tensorName} length is invalid.`);
  }
  for (const value of tensor) {
    assertFiniteNumber(value, `Residual bottleneck/LHUC tensor ${tensorName} value`);
  }
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function assertPositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function assertFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function lhucLogitToScale(value: number): number {
  assertFiniteNumber(value, 'LHUC logit');
  if (value >= 0) {
    const z = Math.exp(-value);
    return 2 / (1 + z);
  }
  const z = Math.exp(value);
  return (2 * z) / (1 + z);
}

function isResidualBottleneckLhucTensorName(
  value: string,
): value is ResidualBottleneckLhucTensorName {
  return (residualBottleneckLhucTensorNames as readonly string[]).includes(value);
}

function shapeEquals(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
