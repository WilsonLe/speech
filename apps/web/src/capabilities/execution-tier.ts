import type { RuntimeCapabilities } from '@speech/protocol';
import type { ExecutionProvider } from './types';

export function selectExecutionTier(
  capabilities: Omit<RuntimeCapabilities, 'selectedTier'>,
): RuntimeCapabilities['selectedTier'] {
  if (
    !capabilities.secureContext ||
    !capabilities.mediaDevices ||
    !capabilities.audioWorklet ||
    !capabilities.webWorkers
  ) {
    return 'D';
  }

  const hasSharedMemory = capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer;

  if (hasSharedMemory && capabilities.webGpu) {
    return 'A';
  }

  if (hasSharedMemory && capabilities.webAssemblyThreads && capabilities.webAssemblySimd) {
    return 'B';
  }

  return 'C';
}

export function selectRecommendedProvider(capabilities: RuntimeCapabilities): ExecutionProvider {
  if (capabilities.selectedTier === 'D') {
    return 'none';
  }

  return capabilities.webGpu ? 'webgpu' : 'wasm';
}

export function explainTier(tier: RuntimeCapabilities['selectedTier']): string {
  switch (tier) {
    case 'A':
      return 'Tier A: SharedArrayBuffer audio transport with WebGPU inference and WASM fallback.';
    case 'B':
      return 'Tier B: SharedArrayBuffer audio transport with multithreaded WASM SIMD inference.';
    case 'C':
      return 'Tier C: transferable audio buffers with single-threaded WASM fallback; latency may be higher.';
    case 'D':
      return 'Tier D: microphone, secure context, AudioWorklet, or Worker support is missing.';
  }
}
