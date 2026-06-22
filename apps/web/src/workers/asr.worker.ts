/// <reference lib="webworker" />

import {
  InMemoryProviderPreferenceStore,
  loadOnnxRuntimeWeb,
  providerBenchmarkCacheKey,
  selectProviderWithBenchmark,
  type LoadedOnnxRuntimeWeb,
  type OrtExecutionProvider,
  type OrtRuntimeCapabilities,
  type PreferredOrtProvider,
  type ProviderBenchmarkWarning,
  type ProviderPreferenceStore,
} from '@speech/inference';
import type { AsrWorkerToMain, MainToAsrWorker, RuntimeCapabilities } from '@speech/protocol';

const ctx = self as DedicatedWorkerGlobalScope;

let disposed = false;
let providerPreferenceStore: ProviderPreferenceStore | undefined;

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
      await initializeRuntime(message.preferredProvider, message.modelId);
      return;
    case 'DISPOSE':
      disposed = true;
      ctx.close();
      return;
    case 'RESET':
    case 'SET_LANGUAGE_MODE':
    case 'SET_VOCABULARY':
    case 'LOAD_PROFILE':
    case 'UNLOAD_PROFILE':
    case 'START_UTTERANCE':
    case 'AUDIO_AVAILABLE':
    case 'AUDIO_CHUNK':
    case 'END_UTTERANCE':
      postError(
        'INFERENCE_FAILED',
        true,
        `ASR worker runtime loaded, but ${message.type} is not implemented until later ASR issues.`,
      );
      return;
  }
}

async function initializeRuntime(
  preferredProvider: PreferredOrtProvider,
  modelId: string,
): Promise<void> {
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
    postMessage({
      type: 'READY',
      capabilities: runtimeCapabilities(runtime.importTarget === 'webgpu'),
    });
  } catch (error) {
    postError('INFERENCE_FAILED', true, errorMessage(error));
  }
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
