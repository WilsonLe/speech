import type { InferenceSession } from 'onnxruntime-web';

type OrtWebModule = typeof import('onnxruntime-web');

export type OrtRuntimeModule = Pick<OrtWebModule, 'env' | 'InferenceSession' | 'Tensor'>;
export type OrtInferenceSession = InferenceSession;
export type OrtSessionOptions = InferenceSession.SessionOptions;

export type OrtExecutionProvider = 'wasm' | 'webgpu';
export type PreferredOrtProvider = 'auto' | OrtExecutionProvider;
export type OrtImportTarget = 'wasm' | 'webgpu';

export interface OrtRuntimeCapabilities {
  readonly webGpu: boolean;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly hardwareConcurrency?: number;
}

export interface OrtWasmRuntimeOptions {
  readonly numThreads?: number;
  readonly wasmPaths?: string | Record<string, string>;
  readonly proxy?: boolean;
  readonly initTimeoutMs?: number;
}

export interface OrtRuntimeImporters {
  readonly wasm: () => Promise<OrtRuntimeModule>;
  readonly webgpu: () => Promise<OrtRuntimeModule>;
}

export interface LoadOnnxRuntimeWebOptions {
  readonly preferredProvider?: PreferredOrtProvider;
  readonly capabilities?: Partial<OrtRuntimeCapabilities>;
  readonly wasm?: OrtWasmRuntimeOptions;
  readonly importers?: Partial<OrtRuntimeImporters>;
}

export interface LoadedOnnxRuntimeWeb {
  readonly ort: OrtRuntimeModule;
  readonly importTarget: OrtImportTarget;
  readonly executionProviders: readonly OrtExecutionProvider[];
  readonly wasmThreads: number;
}

export interface CreateOrtSessionOptions {
  readonly sessionOptions?: OrtSessionOptions;
}

export async function loadOnnxRuntimeWeb(
  options: LoadOnnxRuntimeWebOptions = {},
): Promise<LoadedOnnxRuntimeWeb> {
  const capabilities = normalizeCapabilities(options.capabilities);
  const importTarget = selectOrtImportTarget(options.preferredProvider ?? 'wasm', capabilities);
  const importers = { ...defaultOrtImporters, ...options.importers };
  const ort = await importers[importTarget]();
  const wasmThreads = configureWasmEnvironment(ort, options.wasm, capabilities);
  return {
    ort,
    importTarget,
    executionProviders: executionProvidersForImportTarget(importTarget),
    wasmThreads,
  };
}

export function selectOrtImportTarget(
  preferredProvider: PreferredOrtProvider,
  capabilities: OrtRuntimeCapabilities = detectOrtRuntimeCapabilities(),
): OrtImportTarget {
  if (preferredProvider === 'webgpu') return 'webgpu';
  if (preferredProvider === 'wasm') return 'wasm';
  return capabilities.webGpu ? 'webgpu' : 'wasm';
}

export function executionProvidersForImportTarget(
  importTarget: OrtImportTarget,
): readonly OrtExecutionProvider[] {
  return importTarget === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
}

export async function createOrtInferenceSession(
  loadedRuntime: LoadedOnnxRuntimeWeb,
  modelBytes: ArrayBuffer | Uint8Array | string,
  options: CreateOrtSessionOptions = {},
): Promise<OrtInferenceSession> {
  const sessionOptions: OrtSessionOptions = {
    graphOptimizationLevel: 'all',
    executionProviders: [...loadedRuntime.executionProviders],
    ...options.sessionOptions,
  };
  if (typeof modelBytes === 'string') {
    return loadedRuntime.ort.InferenceSession.create(modelBytes, sessionOptions);
  }
  if (modelBytes instanceof Uint8Array) {
    return loadedRuntime.ort.InferenceSession.create(modelBytes, sessionOptions);
  }
  return loadedRuntime.ort.InferenceSession.create(modelBytes, sessionOptions);
}

export function detectOrtRuntimeCapabilities(): OrtRuntimeCapabilities {
  const navigatorValue = globalThis.navigator;
  const hardwareConcurrency = navigatorValue?.hardwareConcurrency;
  return {
    webGpu: navigatorValue !== undefined && 'gpu' in navigatorValue,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === 'function',
    ...(typeof hardwareConcurrency === 'number' ? { hardwareConcurrency } : {}),
  };
}

function normalizeCapabilities(
  overrides: Partial<OrtRuntimeCapabilities> | undefined,
): OrtRuntimeCapabilities {
  return { ...detectOrtRuntimeCapabilities(), ...overrides };
}

function configureWasmEnvironment(
  ort: OrtRuntimeModule,
  options: OrtWasmRuntimeOptions | undefined,
  capabilities: OrtRuntimeCapabilities,
): number {
  const requestedThreads = options?.numThreads ?? defaultWasmThreadCount(capabilities);
  const wasmThreads = clampWasmThreadCount(requestedThreads, capabilities);
  ort.env.wasm.numThreads = wasmThreads;
  if (options?.wasmPaths !== undefined) {
    ort.env.wasm.wasmPaths = options.wasmPaths;
  }
  if (options?.proxy !== undefined) {
    ort.env.wasm.proxy = options.proxy;
  }
  if (options?.initTimeoutMs !== undefined) {
    ort.env.wasm.initTimeout = options.initTimeoutMs;
  }
  return wasmThreads;
}

function defaultWasmThreadCount(capabilities: OrtRuntimeCapabilities): number {
  if (!capabilities.crossOriginIsolated || !capabilities.sharedArrayBuffer) {
    return 1;
  }
  return Math.max(1, Math.min(4, capabilities.hardwareConcurrency ?? 1));
}

function clampWasmThreadCount(
  requestedThreads: number,
  capabilities: OrtRuntimeCapabilities,
): number {
  if (!Number.isFinite(requestedThreads) || requestedThreads < 1) {
    return 1;
  }
  if (!capabilities.crossOriginIsolated || !capabilities.sharedArrayBuffer) {
    return 1;
  }
  return Math.floor(requestedThreads);
}

const defaultOrtImporters: OrtRuntimeImporters = {
  wasm: () => import('onnxruntime-web/wasm'),
  webgpu: () => import('onnxruntime-web/webgpu'),
};
