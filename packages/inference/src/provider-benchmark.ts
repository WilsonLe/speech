import type {
  OrtExecutionProvider,
  OrtRuntimeCapabilities,
  PreferredOrtProvider,
} from './onnx-runtime';

export type ProviderBenchmarkWarningCode =
  | 'WEBGPU_UNAVAILABLE'
  | 'PROVIDER_BENCHMARK_FAILED'
  | 'PROVIDER_FALLBACK_USED';

export interface ProviderBenchmarkCacheKey {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly browserKey: string;
  readonly deviceKey: string;
}

export interface ProviderPreferenceStore {
  getPreferredProvider(cacheKey: string): Promise<OrtExecutionProvider | undefined>;
  setPreferredProvider(cacheKey: string, provider: OrtExecutionProvider): Promise<void>;
}

export interface ProviderBenchmarkSample {
  readonly durationMs: number;
}

export type ProviderBenchmarkRunner = (
  provider: OrtExecutionProvider,
) => Promise<ProviderBenchmarkSample>;

export interface ProviderBenchmarkResult {
  readonly provider: OrtExecutionProvider;
  readonly ok: boolean;
  readonly medianDurationMs?: number;
  readonly samples: readonly number[];
  readonly errorMessage?: string;
}

export interface ProviderBenchmarkWarning {
  readonly code: ProviderBenchmarkWarningCode;
  readonly message: string;
}

export interface SelectProviderWithBenchmarkOptions {
  readonly preferredProvider: PreferredOrtProvider;
  readonly capabilities: OrtRuntimeCapabilities;
  readonly benchmarkProvider: ProviderBenchmarkRunner;
  readonly cacheKey?: ProviderBenchmarkCacheKey | string;
  readonly preferenceStore?: ProviderPreferenceStore;
  readonly runsPerProvider?: number;
}

export interface ProviderSelectionResult {
  readonly selectedProvider: OrtExecutionProvider;
  readonly fromCache: boolean;
  readonly cacheKey?: string;
  readonly results: readonly ProviderBenchmarkResult[];
  readonly warnings: readonly ProviderBenchmarkWarning[];
}

export class InMemoryProviderPreferenceStore implements ProviderPreferenceStore {
  private readonly providers = new Map<string, OrtExecutionProvider>();

  async getPreferredProvider(cacheKey: string): Promise<OrtExecutionProvider | undefined> {
    return this.providers.get(cacheKey);
  }

  async setPreferredProvider(cacheKey: string, provider: OrtExecutionProvider): Promise<void> {
    this.providers.set(cacheKey, provider);
  }
}

export async function selectProviderWithBenchmark(
  options: SelectProviderWithBenchmarkOptions,
): Promise<ProviderSelectionResult> {
  const warnings: ProviderBenchmarkWarning[] = [];
  const candidates = providerCandidates(options.preferredProvider, options.capabilities, warnings);
  const cacheKey = normalizeCacheKey(options.cacheKey);
  const cachedProvider = await readUsableCachedProvider(
    options.preferenceStore,
    cacheKey,
    candidates,
  );
  if (cachedProvider !== undefined) {
    if (cachedProvider === 'wasm' && candidates.includes('webgpu')) {
      warnings.push(
        wasmFallbackWarning('Using cached WASM provider selection for this runtime check.'),
      );
    }
    return {
      selectedProvider: cachedProvider,
      fromCache: true,
      ...(cacheKey === undefined ? {} : { cacheKey }),
      results: [],
      warnings,
    };
  }

  const results: ProviderBenchmarkResult[] = [];
  for (const candidate of candidates) {
    results.push(
      await benchmarkCandidate(candidate, options.benchmarkProvider, options.runsPerProvider ?? 1),
    );
  }

  const successfulResults = results.filter(hasMedianDuration);
  if (successfulResults.length === 0) {
    throw new Error('No ONNX Runtime execution provider benchmark completed successfully.');
  }

  const selected = [...successfulResults].sort(
    (left, right) => left.medianDurationMs - right.medianDurationMs,
  )[0];
  if (selected === undefined) {
    throw new Error('No ONNX Runtime execution provider benchmark completed successfully.');
  }

  const failedCandidates = results.filter((result) => !result.ok);
  for (const failed of failedCandidates) {
    warnings.push({
      code: 'PROVIDER_BENCHMARK_FAILED',
      message: `${failed.provider} benchmark failed: ${failed.errorMessage ?? 'unknown error'}`,
    });
  }

  if (selected.provider === 'wasm' && results.some((result) => result.provider === 'webgpu')) {
    warnings.push(
      wasmFallbackWarning('WASM provider selected as the safe fallback for this runtime check.'),
    );
  }

  if (options.preferenceStore !== undefined && cacheKey !== undefined) {
    await options.preferenceStore.setPreferredProvider(cacheKey, selected.provider);
  }

  return {
    selectedProvider: selected.provider,
    fromCache: false,
    ...(cacheKey === undefined ? {} : { cacheKey }),
    results,
    warnings,
  };
}

export function providerBenchmarkCacheKey(input: ProviderBenchmarkCacheKey): string {
  return [input.modelId, input.modelVersion, input.browserKey, input.deviceKey]
    .map(encodeURIComponent)
    .join('|');
}

function wasmFallbackWarning(message: string): ProviderBenchmarkWarning {
  return { code: 'PROVIDER_FALLBACK_USED', message };
}

function providerCandidates(
  preferredProvider: PreferredOrtProvider,
  capabilities: OrtRuntimeCapabilities,
  warnings: ProviderBenchmarkWarning[],
): readonly OrtExecutionProvider[] {
  if (preferredProvider === 'wasm') return ['wasm'];
  if (!capabilities.webGpu) {
    warnings.push({
      code: 'WEBGPU_UNAVAILABLE',
      message: 'WebGPU was not available during provider selection; using WASM fallback.',
    });
    return ['wasm'];
  }
  return ['webgpu', 'wasm'];
}

async function readUsableCachedProvider(
  store: ProviderPreferenceStore | undefined,
  cacheKey: string | undefined,
  candidates: readonly OrtExecutionProvider[],
): Promise<OrtExecutionProvider | undefined> {
  if (store === undefined || cacheKey === undefined) return undefined;
  const cached = await store.getPreferredProvider(cacheKey);
  return cached !== undefined && candidates.includes(cached) ? cached : undefined;
}

async function benchmarkCandidate(
  provider: OrtExecutionProvider,
  benchmarkProvider: ProviderBenchmarkRunner,
  runsPerProvider: number,
): Promise<ProviderBenchmarkResult> {
  const runs = Math.max(1, Math.floor(runsPerProvider));
  const samples: number[] = [];
  try {
    for (let index = 0; index < runs; index += 1) {
      const sample = await benchmarkProvider(provider);
      if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
        throw new Error(`${provider} benchmark returned an invalid duration.`);
      }
      samples.push(sample.durationMs);
    }
    return {
      provider,
      ok: true,
      medianDurationMs: median(samples),
      samples,
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      samples,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasMedianDuration(
  result: ProviderBenchmarkResult,
): result is ProviderBenchmarkResult & { readonly medianDurationMs: number } {
  return result.ok && result.medianDurationMs !== undefined;
}

function median(samples: readonly number[]): number {
  if (samples.length === 0) {
    throw new Error('Cannot calculate median without samples.');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) {
    throw new Error('Cannot calculate median without samples.');
  }
  if (sorted.length % 2 === 1) {
    return upper;
  }
  const lower = sorted[middle - 1];
  if (lower === undefined) {
    throw new Error('Cannot calculate median without samples.');
  }
  return (lower + upper) / 2;
}

function normalizeCacheKey(
  cacheKey: ProviderBenchmarkCacheKey | string | undefined,
): string | undefined {
  if (cacheKey === undefined) return undefined;
  return typeof cacheKey === 'string' ? cacheKey : providerBenchmarkCacheKey(cacheKey);
}
