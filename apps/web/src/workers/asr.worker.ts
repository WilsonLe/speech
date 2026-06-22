/// <reference lib="webworker" />

import type { AsrWorkerToMain, MainToAsrWorker } from '@speech/protocol';

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<MainToAsrWorker>) => {
  const message = event.data;

  if (message.type === 'INIT') {
    const response: AsrWorkerToMain = {
      type: 'READY',
      capabilities: {
        secureContext: true,
        mediaDevices: false,
        audioWorklet: false,
        webWorkers: true,
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        crossOriginIsolated: false,
        webAssemblySimd: false,
        webAssemblyThreads: false,
        webGpu: false,
        persistentStorage: false,
        selectedTier: 'D',
      },
    };

    ctx.postMessage(response);
  }
});

export {};
