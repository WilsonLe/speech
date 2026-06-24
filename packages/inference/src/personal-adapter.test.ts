import { describe, expect, it } from 'vitest';
import { createMockResidualAdapterRuntimeInputs } from './mock-adapter-fixture';
import {
  loadAndBenchmarkPersonalAdapterRuntime,
  loadOnnxRuntimeWeb,
  loadPersonalAdapterRuntime,
  benchmarkPersonalAdapterRuntime,
  disposePersonalAdapterRuntime,
} from './index';

const wasmCapabilities = {
  webGpu: false,
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
};

describe('personal residual-adapter runtime', () => {
  it('loads and benchmarks a browser-compatible residual adapter graph through ONNX Runtime Web WASM', async () => {
    const inputs = createMockResidualAdapterRuntimeInputs();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: wasmCapabilities,
      wasm: { numThreads: 1 },
    });

    const result = await loadAndBenchmarkPersonalAdapterRuntime({
      loadedRuntime: runtime,
      ...inputs,
      runs: 3,
      warmupRuns: 1,
      audioChunkDurationMs: 160,
    });

    expect(result.profileId).toBe('profile-local-adapter-smoke');
    expect(result.provider).toBe('wasm');
    expect(result.adapterSizeBytes).toBe(inputs.adapterBytes.byteLength);
    expect(result.graphInputNames).toEqual(['encoder.block11.input']);
    expect(result.graphOutputNames).toEqual(['encoder.block11.output']);
    expect(result.runDurationsMs).toHaveLength(3);
    expect(result.medianRunMs).toBeGreaterThanOrEqual(0);
    expect(result.adapterRtfOverheadRatio).toBeGreaterThanOrEqual(0);
    expect(result.privacy).toEqual({
      containsAudio: false,
      containsTranscript: false,
      containsRawProfileData: false,
      networkUpload: false,
      localOnly: true,
    });
  });

  it('keeps the loaded adapter session disposable after benchmark runs', async () => {
    const inputs = createMockResidualAdapterRuntimeInputs();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: wasmCapabilities,
      wasm: { numThreads: 1 },
    });
    const adapterRuntime = await loadPersonalAdapterRuntime({ loadedRuntime: runtime, ...inputs });

    const result = await benchmarkPersonalAdapterRuntime(adapterRuntime, runtime, { runs: 1 });
    await disposePersonalAdapterRuntime(adapterRuntime);

    expect(result.runDurationsMs).toHaveLength(1);
  });

  it('rejects adapter bytes that do not match the profile manifest checksum', async () => {
    const inputs = createMockResidualAdapterRuntimeInputs();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: wasmCapabilities,
      wasm: { numThreads: 1 },
    });

    await expect(
      loadPersonalAdapterRuntime({
        loadedRuntime: runtime,
        ...inputs,
        adapterBytes: new Uint8Array([...inputs.adapterBytes, 0]),
      }),
    ).rejects.toThrow(/checksum/);
  });

  it('rejects adapter profiles for a different base model identity', async () => {
    const inputs = createMockResidualAdapterRuntimeInputs();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: wasmCapabilities,
      wasm: { numThreads: 1 },
    });

    await expect(
      loadPersonalAdapterRuntime({
        loadedRuntime: runtime,
        ...inputs,
        activeBaseModel: { ...inputs.activeBaseModel, graphContractSha256: '9'.repeat(64) },
      }),
    ).rejects.toThrow(/base-model identity/);
  });

  it('rejects adapter insertion points that the base graph does not expose', async () => {
    const inputs = createMockResidualAdapterRuntimeInputs();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: wasmCapabilities,
      wasm: { numThreads: 1 },
    });
    const adapterGraph = inputs.baseModelManifest.graphs.adapter;
    if (adapterGraph === undefined) throw new Error('mock adapter graph missing');
    const baseModelManifest = {
      ...inputs.baseModelManifest,
      graphs: {
        ...inputs.baseModelManifest.graphs,
        adapter: {
          ...adapterGraph,
          inputs: [
            {
              name: 'different.input',
              dataType: 'float32' as const,
              shape: [1, 4],
              description: 'mismatched adapter input',
            },
          ],
        },
      },
    };

    await expect(
      loadPersonalAdapterRuntime({ loadedRuntime: runtime, ...inputs, baseModelManifest }),
    ).rejects.toThrow(/Adapter graph input/);
  });
});
