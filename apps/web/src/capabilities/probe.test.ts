import { describe, expect, it } from 'vitest';
import { probeRuntimeCapabilities, selectExecutionTier } from '.';
import type { CapabilityProbeEnvironment, WorkerBenchmarkResult } from './types';

const benchmark: WorkerBenchmarkResult = {
  supported: true,
  iterations: 3,
  medianRoundTripMs: 1.2,
  minRoundTripMs: 1,
  maxRoundTripMs: 1.6,
};

function makeEnv(overrides: Partial<CapabilityProbeEnvironment> = {}): CapabilityProbeEnvironment {
  return {
    isSecureContext: true,
    crossOriginIsolated: true,
    hasSharedArrayBuffer: true,
    hasAtomics: true,
    hasAudioWorklet: true,
    hasWebWorkers: true,
    hasBroadcastChannel: true,
    hasLocalStorage: true,
    navigator: {
      mediaDevices: { getUserMedia: () => undefined },
      locks: { request: () => undefined },
      storage: {
        persisted: async () => true,
        persist: async () => true,
        estimate: async () => ({ quota: 1024, usage: 256 }),
      },
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => ({ destroy: () => undefined }),
        }),
      },
    },
    detectWebAssemblySimd: async () => true,
    detectWebAssemblyThreads: async () => true,
    now: () => 0,
    toIsoString: () => '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('capability probing', () => {
  it('selects Tier A when shared memory and WebGPU are available', async () => {
    const report = await probeRuntimeCapabilities(benchmark, makeEnv());

    expect(report.capabilities.selectedTier).toBe('A');
    expect(report.recommendedProvider).toBe('webgpu');
    expect(report.webGpu).toMatchObject({ adapterAvailable: true, deviceAvailable: true });
    expect(report.storage).toMatchObject({ persisted: true, quotaBytes: 1024, usageBytes: 256 });
    expect(report.browserTraining).toEqual({
      webLocks: true,
      broadcastChannel: true,
      localStorage: true,
    });
  });

  it('falls back to Tier C when cross-origin isolation is missing', async () => {
    const report = await probeRuntimeCapabilities(
      benchmark,
      makeEnv({ crossOriginIsolated: false, hasSharedArrayBuffer: false }),
    );

    expect(report.capabilities.selectedTier).toBe('C');
    expect(report.recommendedProvider).toBe('webgpu');
    expect(report.warnings).toContain(
      'Cross-origin isolation or SharedArrayBuffer is unavailable; using transferable buffers.',
    );
  });

  it('warns when browser-training coordination and recovery APIs are missing', async () => {
    const report = await probeRuntimeCapabilities(
      benchmark,
      makeEnv({
        hasBroadcastChannel: false,
        hasLocalStorage: false,
        navigator: {
          mediaDevices: { getUserMedia: () => undefined },
          storage: {
            persisted: async () => true,
            persist: async () => true,
            estimate: async () => ({ quota: 1024, usage: 256 }),
          },
          gpu: {
            requestAdapter: async () => ({
              requestDevice: async () => ({ destroy: () => undefined }),
            }),
          },
        },
      }),
    );

    expect(report.browserTraining).toEqual({
      webLocks: false,
      broadcastChannel: false,
      localStorage: false,
    });
    expect(report.warnings).toContain(
      'Web Locks API unavailable; cross-tab training coordination will use warnings only.',
    );
    expect(report.warnings).toContain(
      'BroadcastChannel unavailable; cross-tab training status will not sync live.',
    );
    expect(report.warnings).toContain(
      'localStorage unavailable; browser-training recovery checkpoints cannot persist.',
    );
  });

  it('selects Tier D when microphone capture requirements are missing', () => {
    expect(
      selectExecutionTier({
        secureContext: false,
        mediaDevices: false,
        audioWorklet: false,
        webWorkers: true,
        sharedArrayBuffer: false,
        crossOriginIsolated: false,
        webAssemblySimd: true,
        webAssemblyThreads: false,
        webGpu: false,
        persistentStorage: false,
      }),
    ).toBe('D');
  });
});
