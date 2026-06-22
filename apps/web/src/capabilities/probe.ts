import type { RuntimeCapabilities } from '@speech/protocol';
import { selectExecutionTier, selectRecommendedProvider } from './execution-tier';
import { detectWebAssemblySimd, detectWebAssemblyThreads } from './wasm';
import type {
  CapabilityProbeEnvironment,
  CapabilityReport,
  GpuDeviceLike,
  NavigatorCapabilityLike,
  StorageCapabilityDetails,
  WebGpuCapabilityDetails,
  WorkerBenchmarkResult,
} from './types';

const emptyWorkerBenchmark: WorkerBenchmarkResult = { supported: false, iterations: 0 };

export function createBrowserCapabilityEnvironment(): CapabilityProbeEnvironment {
  const audioContextGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const audioContextConstructor = globalThis.AudioContext ?? audioContextGlobal.webkitAudioContext;
  const navigatorLike =
    typeof navigator === 'undefined' ? undefined : (navigator as NavigatorCapabilityLike);

  return {
    isSecureContext: globalThis.isSecureContext === true,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hasAtomics: typeof Atomics !== 'undefined',
    hasAudioWorklet: Boolean(
      audioContextConstructor && 'audioWorklet' in audioContextConstructor.prototype,
    ),
    hasWebWorkers: typeof Worker !== 'undefined',
    ...(navigatorLike ? { navigator: navigatorLike } : {}),
    detectWebAssemblySimd,
    detectWebAssemblyThreads,
    now: () => performance.now(),
    toIsoString: () => new Date().toISOString(),
  };
}

export async function probeRuntimeCapabilities(
  workerBenchmark: WorkerBenchmarkResult = emptyWorkerBenchmark,
  env: CapabilityProbeEnvironment = createBrowserCapabilityEnvironment(),
): Promise<CapabilityReport> {
  const [webAssemblySimd, webAssemblyThreads, storage, webGpu] = await Promise.all([
    env.detectWebAssemblySimd(),
    env.detectWebAssemblyThreads(),
    probeStorage(env.navigator?.storage),
    probeWebGpu(env.navigator?.gpu),
  ]);

  const baseCapabilities: Omit<RuntimeCapabilities, 'selectedTier'> = {
    secureContext: env.isSecureContext,
    mediaDevices: typeof env.navigator?.mediaDevices?.getUserMedia === 'function',
    audioWorklet: env.hasAudioWorklet,
    webWorkers: env.hasWebWorkers,
    sharedArrayBuffer: env.hasSharedArrayBuffer,
    crossOriginIsolated: env.crossOriginIsolated,
    webAssemblySimd,
    webAssemblyThreads: webAssemblyThreads && env.hasSharedArrayBuffer && env.hasAtomics,
    webGpu: webGpu.deviceAvailable,
    persistentStorage: storage.persisted === true,
  };

  const capabilities: RuntimeCapabilities = {
    ...baseCapabilities,
    selectedTier: selectExecutionTier(baseCapabilities),
  };

  return {
    generatedAt: env.toIsoString(),
    capabilities,
    recommendedProvider: selectRecommendedProvider(capabilities),
    storage,
    webGpu,
    workerBenchmark,
    warnings: buildWarnings(capabilities, webGpu, workerBenchmark),
  };
}

async function probeStorage(
  storage: NavigatorCapabilityLike['storage'],
): Promise<StorageCapabilityDetails> {
  if (!storage) {
    return { persisted: null, persistenceRequestAvailable: false };
  }

  const [persisted, estimate] = await Promise.all([
    storage.persisted?.().catch(() => null) ?? Promise.resolve(null),
    storage.estimate?.().catch(() => undefined) ?? Promise.resolve(undefined),
  ]);

  return {
    persisted,
    persistenceRequestAvailable: typeof storage.persist === 'function',
    ...(typeof estimate?.quota === 'number' ? { quotaBytes: estimate.quota } : {}),
    ...(typeof estimate?.usage === 'number' ? { usageBytes: estimate.usage } : {}),
  };
}

async function probeWebGpu(gpu: NavigatorCapabilityLike['gpu']): Promise<WebGpuCapabilityDetails> {
  if (!gpu) {
    return { adapterAvailable: false, deviceAvailable: false };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { adapterAvailable: false, deviceAvailable: false };
    }

    const device: GpuDeviceLike = await adapter.requestDevice();
    device.destroy?.();
    return { adapterAvailable: true, deviceAvailable: true };
  } catch (error) {
    return {
      adapterAvailable: true,
      deviceAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown WebGPU device error',
    };
  }
}

function buildWarnings(
  capabilities: RuntimeCapabilities,
  webGpu: WebGpuCapabilityDetails,
  workerBenchmark: WorkerBenchmarkResult,
): string[] {
  const warnings: string[] = [];

  if (!capabilities.crossOriginIsolated || !capabilities.sharedArrayBuffer) {
    warnings.push(
      'Cross-origin isolation or SharedArrayBuffer is unavailable; using transferable buffers.',
    );
  }

  if (!capabilities.webGpu) {
    warnings.push(
      webGpu.error ? `WebGPU unavailable: ${webGpu.error}` : 'WebGPU unavailable; using WASM.',
    );
  }

  if (!capabilities.webAssemblySimd) {
    warnings.push('WebAssembly SIMD was not detected; inference may be slower.');
  }

  if (capabilities.selectedTier === 'D') {
    warnings.push('Microphone, secure context, AudioWorklet, or Worker support is missing.');
  }

  if (!workerBenchmark.supported) {
    warnings.push(workerBenchmark.error ?? 'Worker round-trip benchmark did not run.');
  }

  return warnings;
}
