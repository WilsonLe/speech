import { describe, expect, it, vi } from 'vitest';
import {
  createOrtInferenceSession,
  executionProvidersForImportTarget,
  loadOnnxRuntimeWeb,
  selectOrtImportTarget,
  type OrtRuntimeModule,
} from './onnx-runtime';

describe('ONNX Runtime Web loader', () => {
  it('loads the WASM runtime by default and clamps threads without cross-origin isolation', async () => {
    const wasm = fakeOrtModule();
    const webgpu = fakeOrtModule();

    const loaded = await loadOnnxRuntimeWeb({
      wasm: { numThreads: 4, initTimeoutMs: 3_000 },
      capabilities: {
        crossOriginIsolated: false,
        sharedArrayBuffer: false,
        webGpu: true,
      },
      importers: {
        wasm: async () => wasm,
        webgpu: async () => webgpu,
      },
    });

    expect(loaded.importTarget).toBe('wasm');
    expect(loaded.executionProviders).toEqual(['wasm']);
    expect(loaded.wasmThreads).toBe(1);
    expect(wasm.env.wasm.numThreads).toBe(1);
    expect(wasm.env.wasm.initTimeout).toBe(3_000);
    expect(webgpu.InferenceSession.create).not.toHaveBeenCalled();
  });

  it('selects WebGPU for auto only when capability probing reports WebGPU', () => {
    expect(
      selectOrtImportTarget('auto', {
        webGpu: true,
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
      }),
    ).toBe('webgpu');
    expect(
      selectOrtImportTarget('auto', {
        webGpu: false,
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
      }),
    ).toBe('wasm');
  });

  it('loads the WebGPU import target with WASM fallback providers when requested', async () => {
    const webgpu = fakeOrtModule();

    const loaded = await loadOnnxRuntimeWeb({
      preferredProvider: 'webgpu',
      wasm: { numThreads: 2, wasmPaths: '/ort/' },
      capabilities: {
        webGpu: false,
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
      },
      importers: {
        wasm: async () => fakeOrtModule(),
        webgpu: async () => webgpu,
      },
    });

    expect(loaded.importTarget).toBe('webgpu');
    expect(loaded.executionProviders).toEqual(['webgpu', 'wasm']);
    expect(webgpu.env.wasm.numThreads).toBe(2);
    expect(webgpu.env.wasm.wasmPaths).toBe('/ort/');
  });

  it('creates inference sessions with the selected provider list', async () => {
    const wasm = fakeOrtModule();
    const loaded = await loadOnnxRuntimeWeb({
      importers: {
        wasm: async () => wasm,
        webgpu: async () => fakeOrtModule(),
      },
    });
    const modelBytes = new Uint8Array([1, 2, 3]);

    const session = await createOrtInferenceSession(loaded, modelBytes, {
      sessionOptions: { enableMemPattern: false },
    });

    expect(session).toEqual({ dispose: expect.any(Function) });
    expect(wasm.InferenceSession.create).toHaveBeenCalledWith(modelBytes, {
      graphOptimizationLevel: 'all',
      executionProviders: ['wasm'],
      enableMemPattern: false,
    });
  });

  it('maps import targets to provider lists deterministically', () => {
    expect(executionProvidersForImportTarget('wasm')).toEqual(['wasm']);
    expect(executionProvidersForImportTarget('webgpu')).toEqual(['webgpu', 'wasm']);
  });
});

function fakeOrtModule(): OrtRuntimeModule {
  return {
    env: {
      wasm: {},
    },
    InferenceSession: {
      create: vi.fn(async () => ({ dispose: vi.fn() })),
    },
    Tensor: vi.fn(),
  } as unknown as OrtRuntimeModule;
}
