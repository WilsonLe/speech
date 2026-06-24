import type { RuntimeCapabilities } from '@speech/protocol';

export type ExecutionProvider = 'webgpu' | 'wasm' | 'none';

export interface StorageCapabilityDetails {
  readonly persisted: boolean | null;
  readonly persistenceRequestAvailable: boolean;
  readonly quotaBytes?: number;
  readonly usageBytes?: number;
}

export interface WebGpuCapabilityDetails {
  readonly adapterAvailable: boolean;
  readonly deviceAvailable: boolean;
  readonly error?: string;
}

export interface WorkerBenchmarkResult {
  readonly supported: boolean;
  readonly iterations: number;
  readonly medianRoundTripMs?: number;
  readonly minRoundTripMs?: number;
  readonly maxRoundTripMs?: number;
  readonly error?: string;
}

export interface CapabilityReport {
  readonly generatedAt: string;
  readonly capabilities: RuntimeCapabilities;
  readonly recommendedProvider: ExecutionProvider;
  readonly storage: StorageCapabilityDetails;
  readonly webGpu: WebGpuCapabilityDetails;
  readonly workerBenchmark: WorkerBenchmarkResult;
  readonly warnings: readonly string[];
}

export interface StorageEstimateLike {
  readonly quota?: number;
  readonly usage?: number;
}

export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<StorageEstimateLike>;
}

export interface MediaDevicesLike {
  getUserMedia?: unknown;
}

export interface GpuDeviceLike {
  destroy?: () => void;
}

export interface GpuAdapterLike {
  requestDevice: () => Promise<GpuDeviceLike>;
}

export interface GpuLike {
  requestAdapter: () => Promise<GpuAdapterLike | null>;
}

export interface NavigatorCapabilityLike {
  readonly mediaDevices?: MediaDevicesLike;
  readonly storage?: StorageManagerLike;
  readonly gpu?: GpuLike;
}

export interface CapabilityProbeEnvironment {
  readonly isSecureContext: boolean;
  readonly crossOriginIsolated: boolean;
  readonly hasSharedArrayBuffer: boolean;
  readonly hasAtomics: boolean;
  readonly hasAudioWorklet: boolean;
  readonly hasWebWorkers: boolean;
  readonly navigator?: NavigatorCapabilityLike;
  readonly detectWebAssemblySimd: () => Promise<boolean>;
  readonly detectWebAssemblyThreads: () => Promise<boolean>;
  readonly now: () => number;
  readonly toIsoString: () => string;
}
