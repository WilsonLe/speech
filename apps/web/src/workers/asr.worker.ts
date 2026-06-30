/// <reference lib="webworker" />

import { resamplePcmLinear } from '@speech/audio';
import { GreedyRnntDecoder, type GreedyRnntDecodeContext } from '@speech/decoder';
import { StreamingLogMelExtractor } from '@speech/features';
import { detokenizePieces } from '@speech/formatter';
import {
  createOrtInferenceSession,
  InMemoryProviderPreferenceStore,
  loadAndBenchmarkPersonalAdapterRuntime,
  loadOnnxRuntimeWeb,
  providerBenchmarkCacheKey,
  selectProviderWithBenchmark,
  type LoadedOnnxRuntimeWeb,
  type OrtExecutionProvider,
  type OrtInferenceSession,
  type OrtRuntimeCapabilities,
  type PreferredOrtProvider,
  type ProviderBenchmarkWarning,
  type ProviderPreferenceStore,
} from '@speech/inference';
import {
  createDefaultModelStorageBackend,
  getInstalledModelRecord,
  type InstalledModelRecord,
  type ModelStorageBackend,
} from '@speech/model-manager';
import {
  createLanguageModeDiagnostics,
  type AsrWorkerToMain,
  type LanguageModeDiagnostics,
  type MainToAsrWorker,
  type RuntimeCapabilities,
  type SpeechLanguageMode,
} from '@speech/protocol';
import { createAsrRuntimePriorityPublisher } from './asr-runtime-priority';

const ctx = self as DedicatedWorkerGlobalScope;

const supportedLanguageModes = [
  'vi',
  'en',
  'auto',
  'mixed',
] as const satisfies readonly SpeechLanguageMode[];

let disposed = false;
let currentRuntime: LoadedOnnxRuntimeWeb | undefined;
let currentAsrModel: LoadedAsrModel | undefined;
let activeUtterance: ActiveUtterance | undefined;
let modelStoragePromise: Promise<ModelStorageBackend> | undefined;
let providerPreferenceStore: ProviderPreferenceStore | undefined;
let asrPriority = createAsrRuntimePriorityPublisher();
let languageModeDiagnostics: LanguageModeDiagnostics = createLanguageModeDiagnostics({
  requestedMode: 'auto',
  supportedLanguageModes,
});

interface LoadedAsrModel {
  readonly record: InstalledModelRecord;
  readonly encoder: OrtInferenceSession;
  readonly predictor: OrtInferenceSession;
  readonly joiner: OrtInferenceSession;
  readonly tokenPieces: readonly string[];
}

interface ActiveUtterance {
  readonly utteranceId: string;
  readonly startedAtMs: number;
  readonly chunks: Float32Array[];
  sampleRateHz: number | null;
  sampleCount: number;
}

ctx.addEventListener('message', (event: MessageEvent<MainToAsrWorker>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: MainToAsrWorker): Promise<void> {
  if (disposed && message.type !== 'INIT') {
    postError('INFERENCE_FAILED', true, 'ASR worker has already been disposed.');
    return;
  }

  switch (message.type) {
    case 'INIT':
      disposed = false;
      resetAsrPriorityPublisher();
      await initializeRuntime(message.preferredProvider, message.modelId);
      return;
    case 'DISPOSE':
      disposed = true;
      disposeRuntimeResources();
      ctx.close();
      return;
    case 'SET_LANGUAGE_MODE':
      setLanguageMode(message.mode);
      return;
    case 'LOAD_PROFILE':
      await loadProfileAdapter(message);
      return;
    case 'START_UTTERANCE':
      startAsrUtterance(message);
      return;
    case 'AUDIO_AVAILABLE':
      asrPriority.markActive('audio-available');
      postZeroQueueMetrics();
      return;
    case 'AUDIO_CHUNK':
      appendAsrAudioChunk(message);
      return;
    case 'END_UTTERANCE':
      await finishAsrUtterance(message);
      return;
    case 'RESET':
      releaseRuntimeResources('reset');
      postZeroQueueMetrics();
      return;
    case 'UNLOAD_PROFILE':
      asrPriority.markIdle('profile-ready');
      postZeroQueueMetrics();
      return;
    case 'SET_VOCABULARY':
      postError(
        'INFERENCE_FAILED',
        true,
        'Vocabulary updates are not available in the dictation runtime yet.',
      );
      return;
  }
}

async function initializeRuntime(
  preferredProvider: PreferredOrtProvider,
  modelId: string,
): Promise<void> {
  asrPriority.markActive('runtime-initializing');
  try {
    const capabilities = detectWorkerCapabilities();
    const loadedRuntimes = new Map<OrtExecutionProvider, LoadedOnnxRuntimeWeb>();
    postMessage({ type: 'MODEL_PROGRESS', phase: 'selecting-provider', completed: 0, total: 1 });
    const selection = await selectProviderWithBenchmark({
      preferredProvider,
      capabilities,
      cacheKey: providerBenchmarkCacheKey({
        modelId,
        modelVersion: 'runtime-loader',
        browserKey: workerBrowserKey(),
        deviceKey: workerDeviceKey(capabilities),
      }),
      preferenceStore: getProviderPreferenceStore(),
      benchmarkProvider: async (provider) => {
        postMessage({
          type: 'MODEL_PROGRESS',
          phase: `benchmark-${provider}-provider`,
          completed: 0,
          total: 1,
        });
        const startedAt = performance.now();
        const runtime = await loadOnnxRuntimeWeb({ preferredProvider: provider, capabilities });
        loadedRuntimes.set(provider, runtime);
        const durationMs = performance.now() - startedAt;
        postMessage({
          type: 'MODEL_PROGRESS',
          phase: `benchmark-${provider}-provider`,
          completed: 1,
          total: 1,
        });
        return { durationMs };
      },
    });

    postProviderWarnings(selection.warnings);
    const runtime =
      loadedRuntimes.get(selection.selectedProvider) ??
      (await loadOnnxRuntimeWeb({ preferredProvider: selection.selectedProvider, capabilities }));
    currentRuntime = runtime;
    currentAsrModel = await tryLoadInstalledAsrModel(modelId, runtime);
    postMessage({ type: 'MODEL_PROGRESS', phase: 'onnx-runtime-loaded', completed: 1, total: 1 });
    postMessage({
      type: 'METRICS',
      metrics: {
        queueDepthFrames: 0,
        audioOverruns: 0,
        provider: runtime.importTarget === 'webgpu' ? 'webgpu' : 'wasm',
        wasmThreads: runtime.wasmThreads,
      },
    });
    postLanguageModeReady();
    postMessage({
      type: 'READY',
      capabilities: runtimeCapabilities(runtime.importTarget === 'webgpu'),
    });
    asrPriority.markIdle('runtime-ready');
  } catch (error) {
    asrPriority.markIdle('error');
    postError('INFERENCE_FAILED', true, errorMessage(error));
  }
}

async function tryLoadInstalledAsrModel(
  modelId: string,
  runtime: LoadedOnnxRuntimeWeb,
): Promise<LoadedAsrModel | undefined> {
  try {
    return await loadInstalledAsrModel(modelId, runtime);
  } catch {
    return undefined;
  }
}

async function loadInstalledAsrModel(
  modelId: string,
  runtime: LoadedOnnxRuntimeWeb,
): Promise<LoadedAsrModel | undefined> {
  const storage = await getModelStorage();
  const record = await getInstalledModelRecord(storage, modelId);
  if (record === undefined) {
    return undefined;
  }

  postMessage({ type: 'MODEL_PROGRESS', phase: 'loading-model-graphs', completed: 0, total: 3 });
  const [encoderBytes, predictorBytes, joinerBytes, tokensBytes] = await Promise.all([
    readInstalledModelFile(storage, record, 'encoder'),
    readInstalledModelFile(storage, record, 'predictor'),
    readInstalledModelFile(storage, record, 'joiner'),
    readInstalledModelFile(storage, record, 'tokens'),
  ]);
  const [encoder, predictor, joiner] = await Promise.all([
    createOrtInferenceSession(runtime, encoderBytes),
    createOrtInferenceSession(runtime, predictorBytes),
    createOrtInferenceSession(runtime, joinerBytes),
  ]);
  postMessage({ type: 'MODEL_PROGRESS', phase: 'loading-model-graphs', completed: 3, total: 3 });
  return {
    record,
    encoder,
    predictor,
    joiner,
    tokenPieces: parseTokenPieces(new TextDecoder().decode(tokensBytes)),
  };
}

async function readInstalledModelFile(
  storage: ModelStorageBackend,
  record: InstalledModelRecord,
  fileKey: string,
): Promise<ArrayBuffer> {
  const bytes = await storage.getFile({
    modelId: record.modelId,
    version: record.activeVersion,
    fileKey,
  });
  if (bytes === undefined) {
    throw new Error(`Installed speech model file ${fileKey} is missing.`);
  }
  return bytes;
}

function startAsrUtterance(
  message: Extract<MainToAsrWorker, { readonly type: 'START_UTTERANCE' }>,
): void {
  asrPriority.markActive('utterance-started');
  activeUtterance = {
    utteranceId: message.utteranceId,
    startedAtMs: message.startedAtMs,
    chunks: [],
    sampleRateHz: null,
    sampleCount: 0,
  };
  postZeroQueueMetrics();
}

function appendAsrAudioChunk(
  message: Extract<MainToAsrWorker, { readonly type: 'AUDIO_CHUNK' }>,
): void {
  asrPriority.markActive('audio-available');
  if (activeUtterance?.utteranceId !== message.utteranceId) {
    return;
  }
  const samples = new Float32Array(message.pcm);
  const copy = new Float32Array(samples.length);
  copy.set(samples);
  activeUtterance.chunks.push(copy);
  activeUtterance.sampleCount += copy.length;
  activeUtterance.sampleRateHz = message.sampleRateHz;
  postZeroQueueMetrics();
}

async function finishAsrUtterance(
  message: Extract<MainToAsrWorker, { readonly type: 'END_UTTERANCE' }>,
): Promise<void> {
  const utterance = activeUtterance;
  activeUtterance = undefined;
  if (utterance === undefined || utterance.utteranceId !== message.utteranceId) {
    asrPriority.markIdle('utterance-ended');
    postZeroQueueMetrics();
    return;
  }
  if (currentAsrModel === undefined) {
    asrPriority.markIdle('utterance-ended');
    postError('INFERENCE_FAILED', true, 'Speech model files are not ready for dictation.');
    return;
  }
  if (utterance.sampleRateHz === null || utterance.sampleCount === 0) {
    asrPriority.markIdle('utterance-ended');
    postError('AUDIO_CONTEXT_FAILED', true, 'No microphone audio was captured for this utterance.');
    return;
  }

  const startedAt = performance.now();
  try {
    const text = await decodeUtterance(utterance, currentAsrModel);
    const finalEmittedAtMs = performance.now();
    postMessage({
      type: 'FINAL',
      utteranceId: utterance.utteranceId,
      text,
      timings: {
        audioTimestampMs: message.endedAtMs,
        workerReceivedAtMs: startedAt,
        finalEmittedAtMs,
        featureMs: 0,
        encoderMs: 0,
        decoderMs: Math.max(0, finalEmittedAtMs - startedAt),
      },
    });
  } catch (error) {
    postError('INFERENCE_FAILED', true, errorMessage(error));
  } finally {
    asrPriority.markIdle('utterance-ended');
    postZeroQueueMetrics();
  }
}

async function decodeUtterance(utterance: ActiveUtterance, model: LoadedAsrModel): Promise<string> {
  const pcm = concatenatePcm(utterance.chunks, utterance.sampleCount);
  const resampled =
    utterance.sampleRateHz === model.record.manifest.sampleRateHz
      ? pcm
      : resamplePcmLinear(pcm, {
          sourceSampleRateHz: utterance.sampleRateHz ?? model.record.manifest.sampleRateHz,
          targetSampleRateHz: model.record.manifest.sampleRateHz,
        });
  const extractor = new StreamingLogMelExtractor({
    sampleRateHz: model.record.manifest.sampleRateHz,
    melBinCount: model.record.manifest.feature.bins,
    frameLengthMs: model.record.manifest.feature.frameLengthMs,
    frameShiftMs: model.record.manifest.feature.frameShiftMs,
    fftSize: model.record.manifest.feature.fftSize,
    lowFreqHz: model.record.manifest.feature.lowFreqHz,
    highFreqHz: model.record.manifest.feature.highFreqHz,
    dither: model.record.manifest.feature.dither,
    snipEdges: model.record.manifest.feature.snipEdges,
  });
  const features = extractor.process(resampled);
  const finalFeatures = extractor.finish();
  const mergedFeatures = concatenateFeatureBatches(
    features,
    finalFeatures,
    model.record.manifest.feature.bins,
  );
  if (mergedFeatures.frameCount === 0) {
    return '';
  }
  const runtime = currentRuntime;
  if (runtime === undefined) {
    throw new Error('ONNX Runtime is not loaded.');
  }
  const encoderInput = new runtime.ort.Tensor('float32', mergedFeatures.frames, [
    1,
    mergedFeatures.frameCount,
    model.record.manifest.feature.bins,
  ]);
  const lengthInput = new runtime.ort.Tensor(
    'int64',
    BigInt64Array.from([BigInt(mergedFeatures.frameCount)]),
    [1],
  );
  const encoderStarted = performance.now();
  const encoderOutputs = await model.encoder.run({ x: encoderInput, x_lens: lengthInput });
  const encoderTensor = encoderOutputs['encoder_out'];
  if (encoderTensor === undefined || !(encoderTensor.data instanceof Float32Array)) {
    throw new Error('Encoder output tensor is missing or has an unsupported type.');
  }
  const encoderFrameCount = Number(encoderTensor.dims[1] ?? mergedFeatures.frameCount);
  const encoderWidth = Number(encoderTensor.dims[2] ?? 512);
  const encoderMs = performance.now() - encoderStarted;
  const decodedTokenIds = await greedyDecodeEncoderOutput(model, encoderTensor.data, {
    frameCount: encoderFrameCount,
    frameWidth: encoderWidth,
  });
  const pieces = decodedTokenIds.map((tokenId) => model.tokenPieces[tokenId] ?? '').filter(Boolean);
  const text = detokenizePieces(pieces, {
    wordBoundaryMarker: model.record.manifest.tokenizer.wordBoundaryMarker ?? '▁',
  }).trim();
  const runtimeForMetrics = currentRuntime;
  postMessage({
    type: 'METRICS',
    metrics: {
      queueDepthFrames: 0,
      audioOverruns: 0,
      ...(runtimeForMetrics !== undefined
        ? {
            provider: runtimeForMetrics.importTarget === 'webgpu' ? 'webgpu' : 'wasm',
            ...(runtimeForMetrics.wasmThreads !== undefined
              ? { wasmThreads: runtimeForMetrics.wasmThreads }
              : {}),
          }
        : {}),
      realTimeFactor:
        encoderMs / Math.max(1, (utterance.sampleCount / (utterance.sampleRateHz ?? 1)) * 1_000),
    },
  });
  return text;
}

async function greedyDecodeEncoderOutput(
  model: LoadedAsrModel,
  encoderOutput: Float32Array,
  shape: { readonly frameCount: number; readonly frameWidth: number },
): Promise<readonly number[]> {
  const runtime = currentRuntime;
  if (runtime === undefined) throw new Error('ONNX Runtime is not loaded.');
  const decoder = new GreedyRnntDecoder({
    blankId: model.record.manifest.tokenizer.blankId,
    vocabularySize: model.record.manifest.tokenizer.vocabularySize,
    maxSymbolsPerFrame: model.record.manifest.streaming.maxSymbolsPerFrame,
    initialTokenId: model.record.manifest.tokenizer.blankId,
    maxTotalSymbols: 256,
  });
  await decoder.decodeChunk({
    frameCount: shape.frameCount,
    logitsForStep: async (context: GreedyRnntDecodeContext) => {
      const decoderOut = await runPredictor(
        model,
        runtime,
        predictorContextTokens(context.emittedTokens, model.record.manifest.tokenizer.blankId),
      );
      return runJoiner(model, runtime, encoderOutput, shape, context.frameOffset, decoderOut);
    },
  });
  return decoder.snapshotState().tokens;
}

function predictorContextTokens(
  emittedTokens: readonly number[],
  blankId: number,
): readonly [number, number] {
  const previous = emittedTokens.at(-2) ?? blankId;
  const current = emittedTokens.at(-1) ?? blankId;
  return [previous, current];
}

async function runPredictor(
  model: LoadedAsrModel,
  runtime: LoadedOnnxRuntimeWeb,
  contextTokens: readonly number[],
): Promise<Float32Array> {
  const tokenTensor = new runtime.ort.Tensor(
    'int64',
    BigInt64Array.from(contextTokens.map((tokenId) => BigInt(tokenId))),
    [1, contextTokens.length],
  );
  const outputs = await model.predictor.run({ y: tokenTensor });
  const output = outputs['decoder_out'];
  if (output === undefined || !(output.data instanceof Float32Array)) {
    throw new Error('Predictor output tensor is missing or has an unsupported type.');
  }
  return output.data;
}

async function runJoiner(
  model: LoadedAsrModel,
  runtime: LoadedOnnxRuntimeWeb,
  encoderOutput: Float32Array,
  shape: { readonly frameCount: number; readonly frameWidth: number },
  frameOffset: number,
  decoderOut: Float32Array,
): Promise<Float32Array> {
  if (frameOffset >= shape.frameCount) {
    return new Float32Array(model.record.manifest.tokenizer.vocabularySize);
  }
  const frame = encoderOutput.slice(
    frameOffset * shape.frameWidth,
    (frameOffset + 1) * shape.frameWidth,
  );
  const outputs = await model.joiner.run({
    encoder_out: new runtime.ort.Tensor('float32', frame, [1, shape.frameWidth]),
    decoder_out: new runtime.ort.Tensor('float32', decoderOut, [1, decoderOut.length]),
  });
  const output = outputs['logit'];
  if (output === undefined || !(output.data instanceof Float32Array)) {
    throw new Error('Joiner output tensor is missing or has an unsupported type.');
  }
  return output.data;
}

function concatenatePcm(chunks: readonly Float32Array[], sampleCount: number): Float32Array {
  const output = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function concatenateFeatureBatches(
  first: { readonly frames: Float32Array; readonly frameCount: number },
  second: { readonly frames: Float32Array; readonly frameCount: number },
  melBinCount: number,
): { readonly frames: Float32Array; readonly frameCount: number } {
  const frameCount = first.frameCount + second.frameCount;
  const frames = new Float32Array(frameCount * melBinCount);
  frames.set(first.frames, 0);
  frames.set(second.frames, first.frames.length);
  return { frames, frameCount };
}

function parseTokenPieces(tokensText: string): readonly string[] {
  const pieces: string[] = [];
  for (const rawLine of tokensText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const tabParts = line.split(/\s+/);
    if (tabParts.length < 2) continue;
    const maybeId = Number(tabParts.at(-1));
    if (!Number.isInteger(maybeId) || maybeId < 0) continue;
    pieces[maybeId] = tabParts.slice(0, -1).join(' ');
  }
  return pieces;
}

async function getModelStorage(): Promise<ModelStorageBackend> {
  modelStoragePromise ??= createDefaultModelStorageBackend();
  return modelStoragePromise;
}

async function loadProfileAdapter(
  message: Extract<MainToAsrWorker, { readonly type: 'LOAD_PROFILE' }>,
): Promise<void> {
  if (currentRuntime === undefined) {
    postError(
      'PROFILE_BASE_MODEL_MISMATCH',
      true,
      'Initialize the ASR worker before loading a profile.',
    );
    return;
  }
  if (
    message.profileManifest === undefined ||
    message.baseModelManifest === undefined ||
    message.adapterGraphBytes === undefined
  ) {
    postError(
      'INFERENCE_FAILED',
      true,
      'LOAD_PROFILE requires a residual-adapter profile manifest, base model manifest, and adapter graph bytes.',
    );
    return;
  }
  try {
    asrPriority.markActive('profile-loading');
    postMessage({
      type: 'MODEL_PROGRESS',
      phase: 'loading-adapter-profile',
      completed: 0,
      total: 1,
    });
    const benchmark = await loadAndBenchmarkPersonalAdapterRuntime({
      loadedRuntime: currentRuntime,
      baseModelManifest: message.baseModelManifest,
      activeBaseModel: message.expectedBaseModel,
      profileManifest: message.profileManifest,
      adapterBytes: message.adapterGraphBytes,
      runs: message.adapterBenchmark?.runs ?? 3,
      warmupRuns: message.adapterBenchmark?.warmupRuns ?? 1,
      audioChunkDurationMs: message.adapterBenchmark?.audioChunkDurationMs ?? 160,
    });
    postMessage({
      type: 'MODEL_PROGRESS',
      phase: 'loading-adapter-profile',
      completed: 1,
      total: 1,
    });
    postMessage({
      type: 'METRICS',
      metrics: {
        queueDepthFrames: 0,
        audioOverruns: 0,
        provider: benchmark.provider,
        wasmThreads: benchmark.wasmThreads,
        adapterRunMedianMs: benchmark.medianRunMs,
        adapterRtfOverheadRatio: benchmark.adapterRtfOverheadRatio,
        adapterSizeBytes: benchmark.adapterSizeBytes,
      },
    });
    postMessage({
      type: 'PROFILE_READY',
      profileId: benchmark.profileId,
      adaptationType: benchmark.adaptationType,
    });
    asrPriority.markIdle('profile-ready');
  } catch (error) {
    asrPriority.markIdle('error');
    postError('PROFILE_CHECKSUM_MISMATCH', true, errorMessage(error));
  }
}

function setLanguageMode(mode: SpeechLanguageMode): void {
  languageModeDiagnostics = createLanguageModeDiagnostics({
    requestedMode: mode,
    supportedLanguageModes,
    languageSpans: languageModeDiagnostics.spans,
  });
  postLanguageModeReady();
}

function postLanguageModeReady(): void {
  postMessage({ type: 'LANGUAGE_MODE_READY', diagnostics: languageModeDiagnostics });
}

function postZeroQueueMetrics(): void {
  postMessage({
    type: 'METRICS',
    metrics: {
      queueDepthFrames: 0,
      audioOverruns: 0,
      ...(currentRuntime === undefined
        ? {}
        : {
            provider: currentRuntime.importTarget === 'webgpu' ? 'webgpu' : 'wasm',
            ...(currentRuntime.wasmThreads !== undefined
              ? { wasmThreads: currentRuntime.wasmThreads }
              : {}),
          }),
    },
  });
}

function releaseRuntimeResources(reason: 'reset'): void {
  releaseAsrModelSessions(currentAsrModel);
  currentRuntime = undefined;
  currentAsrModel = undefined;
  activeUtterance = undefined;
  providerPreferenceStore = undefined;
  asrPriority.markIdle(reason);
}

function disposeRuntimeResources(): void {
  releaseAsrModelSessions(currentAsrModel);
  currentRuntime = undefined;
  currentAsrModel = undefined;
  activeUtterance = undefined;
  providerPreferenceStore = undefined;
  asrPriority.markIdle('dispose');
  asrPriority.close();
}

function releaseAsrModelSessions(model: LoadedAsrModel | undefined): void {
  if (model === undefined) return;
  void releaseOrtSession(model.encoder);
  void releaseOrtSession(model.predictor);
  void releaseOrtSession(model.joiner);
}

async function releaseOrtSession(session: OrtInferenceSession): Promise<void> {
  const maybeRelease = (session as { release?: () => Promise<void> | void }).release;
  if (typeof maybeRelease !== 'function') return;
  try {
    await maybeRelease.call(session);
  } catch {
    // Releasing sessions is best-effort during worker teardown/reset.
  }
}

function resetAsrPriorityPublisher(): void {
  asrPriority.close();
  asrPriority = createAsrRuntimePriorityPublisher();
}

function detectWorkerCapabilities(): OrtRuntimeCapabilities {
  const navigatorValue = globalThis.navigator;
  const hardwareConcurrency = navigatorValue?.hardwareConcurrency;
  return {
    webGpu: navigatorValue !== undefined && 'gpu' in navigatorValue,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === 'function',
    ...(typeof hardwareConcurrency === 'number' ? { hardwareConcurrency } : {}),
  };
}

function runtimeCapabilities(webGpuSelected: boolean): RuntimeCapabilities {
  const workerCapabilities = detectWorkerCapabilities();
  const selectedTier = webGpuSelected
    ? 'A'
    : workerCapabilities.sharedArrayBuffer && workerCapabilities.crossOriginIsolated
      ? 'B'
      : 'C';
  return {
    secureContext: globalThis.isSecureContext === true,
    mediaDevices: false,
    audioWorklet: false,
    webWorkers: true,
    sharedArrayBuffer: workerCapabilities.sharedArrayBuffer,
    crossOriginIsolated: workerCapabilities.crossOriginIsolated,
    webAssemblySimd: typeof WebAssembly === 'object',
    webAssemblyThreads:
      workerCapabilities.sharedArrayBuffer && workerCapabilities.crossOriginIsolated,
    webGpu: workerCapabilities.webGpu,
    persistentStorage: false,
    selectedTier,
  };
}

function postProviderWarnings(warnings: readonly ProviderBenchmarkWarning[]): void {
  for (const warning of warnings) {
    postMessage({ type: 'WARNING', code: warning.code, message: warning.message });
  }
}

function getProviderPreferenceStore(): ProviderPreferenceStore {
  providerPreferenceStore ??= createProviderPreferenceStore();
  return providerPreferenceStore;
}

function createProviderPreferenceStore(): ProviderPreferenceStore {
  return typeof globalThis.caches === 'undefined'
    ? new InMemoryProviderPreferenceStore()
    : new CacheProviderPreferenceStore('speech-provider-preferences-v1');
}

class CacheProviderPreferenceStore implements ProviderPreferenceStore {
  constructor(private readonly cacheName: string) {}

  async getPreferredProvider(cacheKey: string): Promise<OrtExecutionProvider | undefined> {
    try {
      const cache = await globalThis.caches.open(this.cacheName);
      const response = await cache.match(providerPreferenceRequest(cacheKey));
      if (response === undefined) return undefined;
      const provider = await response.text();
      return isOrtExecutionProvider(provider) ? provider : undefined;
    } catch {
      return undefined;
    }
  }

  async setPreferredProvider(cacheKey: string, provider: OrtExecutionProvider): Promise<void> {
    try {
      const cache = await globalThis.caches.open(this.cacheName);
      await cache.put(providerPreferenceRequest(cacheKey), new Response(provider));
    } catch {
      // Provider caching is an optimization; runtime selection must still succeed without it.
    }
  }
}

function providerPreferenceRequest(cacheKey: string): Request {
  return new Request(
    new URL(`/__speech/provider-preferences/${encodeURIComponent(cacheKey)}`, ctx.location.origin),
  );
}

function isOrtExecutionProvider(value: string): value is OrtExecutionProvider {
  return value === 'webgpu' || value === 'wasm';
}

function workerBrowserKey(): string {
  return globalThis.navigator?.userAgent ?? 'unknown-browser';
}

function workerDeviceKey(capabilities: OrtRuntimeCapabilities): string {
  return [
    `cores:${capabilities.hardwareConcurrency ?? 'unknown'}`,
    `isolated:${capabilities.crossOriginIsolated}`,
    `sab:${capabilities.sharedArrayBuffer}`,
    `webgpu:${capabilities.webGpu}`,
  ].join(';');
}

function postMessage(message: AsrWorkerToMain): void {
  ctx.postMessage(message);
}

function postError(
  code: Extract<AsrWorkerToMain, { readonly type: 'ERROR' }>['code'],
  recoverable: boolean,
  message: string,
): void {
  postMessage({ type: 'ERROR', code, recoverable, message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export {};
