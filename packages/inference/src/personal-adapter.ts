import {
  parseSpeechProfileManifest,
  type GraphContract,
  type ModelIdentity,
  type ProfileFileRef,
  type ResidualAdapterAdaptationV1,
  type ResidualAdapterInsertionPointContract,
  type SpeechModelManifestV2,
  type SpeechProfileManifest,
  type TensorContract,
  type TensorDataType,
} from '@speech/protocol';
import {
  createOrtInferenceSession,
  type LoadedOnnxRuntimeWeb,
  type OrtInferenceSession,
  type OrtRuntimeModule,
  type OrtSessionOptions,
} from './onnx-runtime';

export interface LoadPersonalAdapterRuntimeOptions {
  readonly loadedRuntime: LoadedOnnxRuntimeWeb;
  readonly baseModelManifest: SpeechModelManifestV2;
  readonly activeBaseModel: ModelIdentity;
  readonly profileManifest: SpeechProfileManifest | unknown;
  readonly adapterBytes: ArrayBuffer | Uint8Array;
  readonly sessionOptions?: OrtSessionOptions;
  readonly digest?: (bytes: ArrayBuffer) => Promise<string>;
}

export interface LoadedPersonalAdapterRuntime {
  readonly profileId: string;
  readonly adaptationType: 'residual-adapter';
  readonly provider: 'webgpu' | 'wasm';
  readonly wasmThreads: number;
  readonly session: OrtInferenceSession;
  readonly graph: GraphContract;
  readonly adapterSha256: string;
  readonly adapterSizeBytes: number;
  readonly insertionPointIds: readonly string[];
}

export interface PersonalAdapterBenchmarkOptions {
  readonly runs?: number;
  readonly warmupRuns?: number;
  readonly audioChunkDurationMs?: number;
  readonly maxSyntheticElementsPerTensor?: number;
}

export interface PersonalAdapterBenchmarkResult {
  readonly profileId: string;
  readonly adaptationType: 'residual-adapter';
  readonly provider: 'webgpu' | 'wasm';
  readonly wasmThreads: number;
  readonly adapterSizeBytes: number;
  readonly adapterSha256: string;
  readonly graphInputNames: readonly string[];
  readonly graphOutputNames: readonly string[];
  readonly runDurationsMs: readonly number[];
  readonly medianRunMs: number;
  readonly p95RunMs: number;
  readonly adapterRtfOverheadRatio: number;
  readonly privacy: {
    readonly containsAudio: false;
    readonly containsTranscript: false;
    readonly containsRawProfileData: false;
    readonly networkUpload: false;
    readonly localOnly: true;
  };
}

export async function loadPersonalAdapterRuntime(
  options: LoadPersonalAdapterRuntimeOptions,
): Promise<LoadedPersonalAdapterRuntime> {
  const profileManifest = parseSpeechProfileManifest(options.profileManifest);
  const adapterBytes = toOwnedUint8Array(options.adapterBytes);
  const adaptation = residualAdapterAdaptation(profileManifest);
  const adapterSha256 = await digestAdapterBytes(adapterBytes, options.digest);
  const adapterFileRef = validatePersonalAdapterCompatibility({
    profileManifest,
    baseModelManifest: options.baseModelManifest,
    activeBaseModel: options.activeBaseModel,
    adapterSha256,
    adapterSizeBytes: adapterBytes.byteLength,
  });
  const graph = options.baseModelManifest.graphs.adapter;
  if (graph === undefined) {
    throw new Error('Base model manifest does not declare an adapter graph contract.');
  }
  if (adapterFileRef.mediaType !== 'application/onnx') {
    throw new Error('Residual adapter graph file must use application/onnx mediaType.');
  }
  const session = await createOrtInferenceSession(options.loadedRuntime, adapterBytes, {
    ...(options.sessionOptions === undefined ? {} : { sessionOptions: options.sessionOptions }),
  });
  return {
    profileId: profileManifest.id,
    adaptationType: 'residual-adapter',
    provider: options.loadedRuntime.importTarget === 'webgpu' ? 'webgpu' : 'wasm',
    wasmThreads: options.loadedRuntime.wasmThreads,
    session,
    graph,
    adapterSha256,
    adapterSizeBytes: adapterBytes.byteLength,
    insertionPointIds: adaptation.adapter.insertionPointIds,
  };
}

export async function benchmarkPersonalAdapterRuntime(
  runtime: LoadedPersonalAdapterRuntime,
  loadedRuntime: LoadedOnnxRuntimeWeb,
  options: PersonalAdapterBenchmarkOptions = {},
): Promise<PersonalAdapterBenchmarkResult> {
  const warmupRuns = clampPositiveInteger(options.warmupRuns ?? 1, 'warmupRuns');
  const runs = clampPositiveInteger(options.runs ?? 5, 'runs');
  const audioChunkDurationMs = clampPositiveNumber(
    options.audioChunkDurationMs ?? 160,
    'audioChunkDurationMs',
  );
  const maxSyntheticElementsPerTensor = clampPositiveInteger(
    options.maxSyntheticElementsPerTensor ?? 65_536,
    'maxSyntheticElementsPerTensor',
  );
  const feeds = createSyntheticAdapterFeeds(
    loadedRuntime.ort,
    runtime.graph.inputs,
    maxSyntheticElementsPerTensor,
  );

  for (let index = 0; index < warmupRuns; index += 1) {
    await runAdapterOnce(runtime, feeds);
  }

  const runDurationsMs: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    await runAdapterOnce(runtime, feeds);
    runDurationsMs.push(Math.max(0, performance.now() - startedAt));
  }

  const medianRunMs = percentile(runDurationsMs, 0.5);
  return {
    profileId: runtime.profileId,
    adaptationType: runtime.adaptationType,
    provider: runtime.provider,
    wasmThreads: runtime.wasmThreads,
    adapterSizeBytes: runtime.adapterSizeBytes,
    adapterSha256: runtime.adapterSha256,
    graphInputNames: runtime.graph.inputs.map((input) => input.name),
    graphOutputNames: runtime.graph.outputs.map((output) => output.name),
    runDurationsMs,
    medianRunMs,
    p95RunMs: percentile(runDurationsMs, 0.95),
    adapterRtfOverheadRatio: medianRunMs / audioChunkDurationMs,
    privacy: adapterBenchmarkPrivacyStatement,
  };
}

export async function loadAndBenchmarkPersonalAdapterRuntime(
  options: LoadPersonalAdapterRuntimeOptions & PersonalAdapterBenchmarkOptions,
): Promise<PersonalAdapterBenchmarkResult> {
  const runtime = await loadPersonalAdapterRuntime(options);
  try {
    return await benchmarkPersonalAdapterRuntime(runtime, options.loadedRuntime, options);
  } finally {
    await disposePersonalAdapterRuntime(runtime);
  }
}

export async function disposePersonalAdapterRuntime(
  runtime: LoadedPersonalAdapterRuntime,
): Promise<void> {
  const releasable = runtime.session as {
    readonly release?: () => Promise<void> | void;
    readonly dispose?: () => Promise<void> | void;
  };
  if (releasable.release !== undefined) {
    await releasable.release();
    return;
  }
  await releasable.dispose?.();
}

function validatePersonalAdapterCompatibility(input: {
  readonly profileManifest: SpeechProfileManifest;
  readonly baseModelManifest: SpeechModelManifestV2;
  readonly activeBaseModel: ModelIdentity;
  readonly adapterSha256: string;
  readonly adapterSizeBytes: number;
}): ProfileFileRef {
  const { profileManifest, baseModelManifest, activeBaseModel } = input;
  const adaptation = residualAdapterAdaptation(profileManifest);
  assertBaseModelIdentity(profileManifest.baseModel, activeBaseModel);
  if (
    activeBaseModel.id !== baseModelManifest.id ||
    activeBaseModel.version !== baseModelManifest.version
  ) {
    throw new Error('Active base model identity does not match the provided model manifest.');
  }
  if (profileManifest.evaluation.activationGatePassed !== true) {
    throw new Error('Residual adapter profile activation gate has not passed.');
  }
  if (profileManifest.privacy.containsRawAudio !== false) {
    throw new Error('Residual adapter profile manifest must not contain raw audio.');
  }
  const residualAdapter = baseModelManifest.personalization?.residualAdapter;
  if (residualAdapter?.supported !== true) {
    throw new Error('Base model manifest does not support residual adapters.');
  }
  if (residualAdapter.contractVersion !== adaptation.contractVersion) {
    throw new Error('Residual adapter contract version does not match the base model.');
  }
  if (residualAdapter.activationSwap !== adaptation.adapter.activationSwap) {
    throw new Error('Residual adapter activation-swap policy does not match the base model.');
  }
  if (!residualAdapter.allowedPrecisions.includes(adaptation.adapter.precision)) {
    throw new Error('Residual adapter precision is not allowed by the base model.');
  }
  if (adaptation.adapter.parameterCount > residualAdapter.maxParameters) {
    throw new Error('Residual adapter parameter count exceeds the base model limit.');
  }
  if (input.adapterSizeBytes > residualAdapter.maxAdapterSizeBytes) {
    throw new Error('Residual adapter file size exceeds the base model limit.');
  }
  const graph = baseModelManifest.graphs.adapter;
  if (graph === undefined) {
    throw new Error('Base model manifest does not declare an adapter graph contract.');
  }
  validateInsertionPointBindings(profileManifest, residualAdapter.insertionPoints, graph);
  const graphFileKey = adaptation.adapter.graphFileKey;
  const adapterFileRef = adaptation.files[graphFileKey];
  if (adapterFileRef === undefined) {
    throw new Error('Residual adapter profile graphFileKey must reference adaptation.files.');
  }
  if (adapterFileRef.sha256 !== input.adapterSha256) {
    throw new Error('Residual adapter bytes do not match the profile manifest checksum.');
  }
  if (adapterFileRef.sizeBytes !== input.adapterSizeBytes) {
    throw new Error('Residual adapter bytes do not match the profile manifest size.');
  }
  return adapterFileRef;
}

function residualAdapterAdaptation(
  profileManifest: SpeechProfileManifest,
): ResidualAdapterAdaptationV1 {
  if (profileManifest.adaptation.type !== 'residual-adapter') {
    throw new Error('Only residual-adapter profiles can be loaded into the adapter runtime.');
  }
  return profileManifest.adaptation;
}

function assertBaseModelIdentity(actual: ModelIdentity, expected: ModelIdentity): void {
  if (
    actual.id !== expected.id ||
    actual.version !== expected.version ||
    actual.manifestSha256 !== expected.manifestSha256 ||
    actual.graphContractSha256 !== expected.graphContractSha256
  ) {
    throw new Error(
      'Residual adapter profile base-model identity does not match the active model.',
    );
  }
}

function validateInsertionPointBindings(
  profileManifest: SpeechProfileManifest,
  insertionPoints: readonly ResidualAdapterInsertionPointContract[],
  graph: GraphContract,
): void {
  const supported = new Map(insertionPoints.map((point) => [point.id, point] as const));
  const inputNames = new Set(graph.inputs.map((input) => input.name));
  const outputNames = new Set(graph.outputs.map((output) => output.name));
  const adaptation = residualAdapterAdaptation(profileManifest);
  for (const insertionPointId of adaptation.adapter.insertionPointIds) {
    const insertionPoint = supported.get(insertionPointId);
    if (insertionPoint === undefined) {
      throw new Error(`Residual adapter insertion point ${insertionPointId} is not supported.`);
    }
    if (!inputNames.has(insertionPoint.inputTensor)) {
      throw new Error(`Adapter graph input is missing insertion point ${insertionPointId}.`);
    }
    if (!outputNames.has(insertionPoint.outputTensor)) {
      throw new Error(`Adapter graph output is missing insertion point ${insertionPointId}.`);
    }
  }
}

async function runAdapterOnce(
  runtime: LoadedPersonalAdapterRuntime,
  feeds: Record<string, unknown>,
): Promise<void> {
  const outputs = await runtime.session.run(feeds as Parameters<OrtInferenceSession['run']>[0]);
  for (const output of runtime.graph.outputs) {
    if (outputs[output.name] === undefined) {
      throw new Error(`Residual adapter graph did not produce output ${output.name}.`);
    }
  }
}

function createSyntheticAdapterFeeds(
  ort: OrtRuntimeModule,
  inputs: readonly TensorContract[],
  maxSyntheticElementsPerTensor: number,
): Record<string, unknown> {
  const feeds: Record<string, unknown> = {};
  for (const input of inputs) {
    const shape = runtimeShape(input.shape);
    const elementCount = shape.reduce((total, dimension) => total * dimension, 1);
    if (elementCount > maxSyntheticElementsPerTensor) {
      throw new Error(`Adapter input ${input.name} exceeds the synthetic benchmark size limit.`);
    }
    feeds[input.name] = new ort.Tensor(
      input.dataType,
      syntheticTensorData(input.dataType, elementCount),
      shape,
    );
  }
  return feeds;
}

function syntheticTensorData(
  dataType: TensorDataType,
  elementCount: number,
): Float32Array | Uint16Array | Int32Array | BigInt64Array | Uint8Array | Int8Array {
  switch (dataType) {
    case 'float32': {
      const data = new Float32Array(elementCount);
      for (let index = 0; index < data.length; index += 1) data[index] = (index + 1) / 10;
      return data;
    }
    case 'float16':
      return new Uint16Array(elementCount);
    case 'int32':
      return new Int32Array(elementCount);
    case 'int64':
      return new BigInt64Array(elementCount);
    case 'uint8':
    case 'bool':
      return new Uint8Array(elementCount);
    case 'int8':
      return new Int8Array(elementCount);
  }
}

function runtimeShape(shape: readonly (number | string)[]): number[] {
  if (shape.length === 0) {
    throw new Error('Adapter tensor shape must not be scalar for synthetic benchmarking.');
  }
  return shape.map((dimension) => {
    if (typeof dimension === 'number' && Number.isInteger(dimension) && dimension > 0) {
      return dimension;
    }
    return 1;
  });
}

function clampPositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return Math.floor(value);
}

function clampPositiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive.`);
  }
  return value;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) {
    throw new Error('Cannot summarize an empty adapter benchmark sample set.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  const value = sorted[index];
  if (value === undefined) throw new Error('Cannot summarize adapter benchmark samples.');
  return value;
}

async function digestAdapterBytes(
  bytes: Uint8Array,
  digest: ((bytes: ArrayBuffer) => Promise<string>) | undefined,
): Promise<string> {
  const owned = toOwnedArrayBuffer(bytes);
  if (digest !== undefined) return digest(owned);
  const cryptoLike = globalThis.crypto;
  if (cryptoLike?.subtle?.digest === undefined) {
    throw new Error('SHA-256 digest is unavailable for adapter verification.');
  }
  const digestBytes = await cryptoLike.subtle.digest('SHA-256', owned);
  return bytesToHex(new Uint8Array(digestBytes));
}

function toOwnedUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes instanceof Uint8Array) {
    return new Uint8Array(bytes.slice());
  }
  return new Uint8Array(bytes.slice(0));
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const adapterBenchmarkPrivacyStatement: PersonalAdapterBenchmarkResult['privacy'] = {
  containsAudio: false,
  containsTranscript: false,
  containsRawProfileData: false,
  networkUpload: false,
  localOnly: true,
};
