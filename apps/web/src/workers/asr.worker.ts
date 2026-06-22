/// <reference lib="webworker" />

import { loadOnnxRuntimeWeb, type PreferredOrtProvider } from '@speech/inference';
import type { AsrWorkerToMain, MainToAsrWorker, RuntimeCapabilities } from '@speech/protocol';

const ctx = self as DedicatedWorkerGlobalScope;

let disposed = false;

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
      await initializeRuntime(message.preferredProvider);
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

async function initializeRuntime(preferredProvider: PreferredOrtProvider): Promise<void> {
  try {
    postMessage({ type: 'MODEL_PROGRESS', phase: 'loading-onnx-runtime', completed: 0, total: 1 });
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider,
      capabilities: detectWorkerCapabilities(),
    });
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

function detectWorkerCapabilities() {
  const navigatorValue = globalThis.navigator;
  return {
    webGpu: navigatorValue !== undefined && 'gpu' in navigatorValue,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === 'function',
    hardwareConcurrency: navigatorValue?.hardwareConcurrency,
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
