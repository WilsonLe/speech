import { describe, expect, it } from 'vitest';
import {
  InMemoryProviderPreferenceStore,
  providerBenchmarkCacheKey,
  selectProviderWithBenchmark,
  type ProviderBenchmarkRunner,
} from './provider-benchmark';
import type { OrtExecutionProvider, OrtRuntimeCapabilities } from './onnx-runtime';

const isolatedCapabilities: OrtRuntimeCapabilities = {
  webGpu: true,
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  hardwareConcurrency: 8,
};

describe('provider benchmark and fallback selection', () => {
  it('benchmarks available providers and persists the fastest provider', async () => {
    const store = new InMemoryProviderPreferenceStore();
    const calls: OrtExecutionProvider[] = [];
    const cacheKey = providerBenchmarkCacheKey({
      modelId: 'mock',
      modelVersion: '1.0.0',
      browserKey: 'chromium',
      deviceKey: 'reference-laptop',
    });

    const result = await selectProviderWithBenchmark({
      preferredProvider: 'auto',
      capabilities: isolatedCapabilities,
      cacheKey,
      preferenceStore: store,
      runsPerProvider: 3,
      benchmarkProvider: async (provider) => {
        calls.push(provider);
        return { durationMs: provider === 'webgpu' ? 9 : 15 };
      },
    });

    expect(result.selectedProvider).toBe('webgpu');
    expect(result.fromCache).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(calls).toEqual(['webgpu', 'webgpu', 'webgpu', 'wasm', 'wasm', 'wasm']);
    await expect(store.getPreferredProvider(cacheKey)).resolves.toBe('webgpu');
  });

  it('uses a cached provider when it is still allowed by capabilities', async () => {
    const store = new InMemoryProviderPreferenceStore();
    await store.setPreferredProvider('cached', 'wasm');

    const result = await selectProviderWithBenchmark({
      preferredProvider: 'auto',
      capabilities: isolatedCapabilities,
      cacheKey: 'cached',
      preferenceStore: store,
      benchmarkProvider: async () => {
        throw new Error('benchmark should not run');
      },
    });

    expect(result.selectedProvider).toBe('wasm');
    expect(result.fromCache).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['PROVIDER_FALLBACK_USED']);
  });

  it('falls back to WASM without trying WebGPU when WebGPU is unavailable', async () => {
    const calls: OrtExecutionProvider[] = [];

    const result = await selectProviderWithBenchmark({
      preferredProvider: 'webgpu',
      capabilities: { ...isolatedCapabilities, webGpu: false },
      benchmarkProvider: async (provider) => {
        calls.push(provider);
        return { durationMs: 11 };
      },
    });

    expect(result.selectedProvider).toBe('wasm');
    expect(calls).toEqual(['wasm']);
    expect(result.warnings.map((warning) => warning.code)).toContain('WEBGPU_UNAVAILABLE');
  });

  it('falls back to WASM when the WebGPU benchmark fails', async () => {
    const runner: ProviderBenchmarkRunner = async (provider) => {
      if (provider === 'webgpu') {
        throw new Error('adapter lost');
      }
      return { durationMs: 20 };
    };

    const result = await selectProviderWithBenchmark({
      preferredProvider: 'auto',
      capabilities: isolatedCapabilities,
      benchmarkProvider: runner,
    });

    expect(result.selectedProvider).toBe('wasm');
    expect(result.results.find((entry) => entry.provider === 'webgpu')).toMatchObject({
      ok: false,
      errorMessage: 'adapter lost',
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'PROVIDER_BENCHMARK_FAILED',
      'PROVIDER_FALLBACK_USED',
    ]);
  });

  it('rejects selection when no provider can complete a benchmark', async () => {
    await expect(
      selectProviderWithBenchmark({
        preferredProvider: 'auto',
        capabilities: isolatedCapabilities,
        benchmarkProvider: async () => {
          throw new Error('runtime unavailable');
        },
      }),
    ).rejects.toThrow(/No ONNX Runtime execution provider benchmark/);
  });
});
