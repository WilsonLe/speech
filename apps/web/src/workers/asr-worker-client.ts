import { createMockResidualAdapterRuntimeInputs } from '@speech/inference/mock-adapter-fixture';
import type {
  AdaptationType,
  AsrWorkerToMain,
  LanguageModeDiagnostics,
  MainToAsrWorker,
  RuntimeMetrics,
} from '@speech/protocol';
import asrWorkerUrl from './asr.worker.ts?worker&url';

export interface AsrWorkerAdapterBenchmarkResult {
  readonly profileId: string;
  readonly adaptationType: AdaptationType;
  readonly adapterRunMedianMs: number;
  readonly adapterRtfOverheadRatio: number;
  readonly adapterSizeBytes: number;
}

export interface AsrWorkerRuntimeCheckResult {
  readonly provider: RuntimeMetrics['provider'];
  readonly wasmThreads?: number;
  readonly languageDiagnostics?: LanguageModeDiagnostics;
  readonly adapterBenchmark?: AsrWorkerAdapterBenchmarkResult;
  readonly warnings: readonly string[];
}

export interface AsrWorkerRuntimeCheckOptions {
  readonly modelId?: string;
  readonly preferredProvider?: Extract<
    MainToAsrWorker,
    { readonly type: 'INIT' }
  >['preferredProvider'];
  readonly timeoutMs?: number;
  readonly adapterSmokeTest?: boolean;
}

export function createAsrWorker(): Worker {
  return new Worker(asrWorkerUrl, { type: 'module', name: 'speech-asr-worker' });
}

export function checkAsrWorkerRuntime(
  options: AsrWorkerRuntimeCheckOptions = {},
): Promise<AsrWorkerRuntimeCheckResult> {
  const worker = createAsrWorker();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const preferredProvider = options.preferredProvider ?? 'wasm';
  const modelId = options.modelId ?? 'runtime-smoke';

  return new Promise((resolve, reject) => {
    let latestMetrics: RuntimeMetrics | undefined;
    let latestLanguageDiagnostics: LanguageModeDiagnostics | undefined;
    let latestAdapterBenchmark: AsrWorkerAdapterBenchmarkResult | undefined;
    let runtimeReady = false;
    const warnings: string[] = [];
    const timeout = globalThis.setTimeout(() => {
      worker.terminate();
      reject(new Error('Timed out while loading ONNX Runtime Web in the ASR worker.'));
    }, timeoutMs);

    worker.addEventListener('message', (event: MessageEvent<AsrWorkerToMain>) => {
      const message = event.data;
      if (message.type === 'METRICS') {
        latestMetrics = message.metrics;
        if (
          message.metrics.adapterRunMedianMs !== undefined &&
          message.metrics.adapterRtfOverheadRatio !== undefined &&
          message.metrics.adapterSizeBytes !== undefined &&
          latestAdapterBenchmark !== undefined
        ) {
          latestAdapterBenchmark = {
            ...latestAdapterBenchmark,
            adapterRunMedianMs: message.metrics.adapterRunMedianMs,
            adapterRtfOverheadRatio: message.metrics.adapterRtfOverheadRatio,
            adapterSizeBytes: message.metrics.adapterSizeBytes,
          };
        }
        return;
      }
      if (message.type === 'WARNING') {
        warnings.push(message.message);
        return;
      }
      if (message.type === 'LANGUAGE_MODE_READY') {
        latestLanguageDiagnostics = message.diagnostics;
        return;
      }
      if (message.type === 'READY') {
        runtimeReady = true;
        if (options.adapterSmokeTest === true) {
          postAdapterSmokeTest(worker);
          return;
        }
        resolveRuntimeCheck();
        return;
      }
      if (message.type === 'PROFILE_READY') {
        latestAdapterBenchmark = {
          profileId: message.profileId,
          adaptationType: message.adaptationType,
          adapterRunMedianMs: latestMetrics?.adapterRunMedianMs ?? 0,
          adapterRtfOverheadRatio: latestMetrics?.adapterRtfOverheadRatio ?? 0,
          adapterSizeBytes: latestMetrics?.adapterSizeBytes ?? 0,
        };
        if (runtimeReady) resolveRuntimeCheck();
        return;
      }
      if (message.type === 'ERROR') {
        globalThis.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(message.message));
      }
    });

    worker.addEventListener('error', (event) => {
      globalThis.clearTimeout(timeout);
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    });

    function resolveRuntimeCheck() {
      globalThis.clearTimeout(timeout);
      worker.postMessage({ type: 'DISPOSE' } satisfies MainToAsrWorker);
      worker.terminate();
      resolve({
        provider: latestMetrics?.provider,
        warnings,
        ...(latestMetrics?.wasmThreads === undefined
          ? {}
          : { wasmThreads: latestMetrics.wasmThreads }),
        ...(latestLanguageDiagnostics === undefined
          ? {}
          : { languageDiagnostics: latestLanguageDiagnostics }),
        ...(latestAdapterBenchmark === undefined
          ? {}
          : { adapterBenchmark: latestAdapterBenchmark }),
      });
    }

    worker.postMessage({ type: 'INIT', modelId, preferredProvider } satisfies MainToAsrWorker);
  });
}

function postAdapterSmokeTest(worker: Worker): void {
  const inputs = createMockResidualAdapterRuntimeInputs();
  const adapterGraphBytes = inputs.adapterBytes.buffer.slice(0);
  worker.postMessage(
    {
      type: 'LOAD_PROFILE',
      profileId: inputs.profileManifest.id,
      expectedBaseModel: inputs.activeBaseModel,
      profileManifest: inputs.profileManifest,
      baseModelManifest: inputs.baseModelManifest,
      adapterGraphBytes,
      adapterBenchmark: { runs: 2, warmupRuns: 1, audioChunkDurationMs: 160 },
    } satisfies MainToAsrWorker,
    [adapterGraphBytes],
  );
}
