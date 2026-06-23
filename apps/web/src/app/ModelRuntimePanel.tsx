import { createPinnedOnnxRuntimeWebTrainingSpikeReport } from '@speech/inference/training-artifact-spike';
import { useState } from 'react';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';

const browserTrainingSpikeReport = createPinnedOnnxRuntimeWebTrainingSpikeReport();

type RuntimeStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | ({ readonly state: 'ready' } & AsrWorkerRuntimeCheckResult)
  | { readonly state: 'error'; readonly message: string };

export function ModelRuntimePanel() {
  const [status, setStatus] = useState<RuntimeStatus>({ state: 'idle' });

  async function handleCheckRuntime() {
    setStatus({ state: 'loading' });
    try {
      const result = await checkAsrWorkerRuntime({
        preferredProvider: 'auto',
        adapterSmokeTest: true,
      });
      setStatus({ state: 'ready', ...result });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className="panel runtime" aria-labelledby="runtime-title">
      <div className="section-heading">
        <p className="eyebrow">Model runtime</p>
        <h2 id="runtime-title">Dedicated worker ONNX Runtime loader</h2>
        <p>
          ONNX Runtime Web is loaded only inside the ASR worker. The UI thread can request a
          lightweight provider benchmark and fallback check, but it does not import ORT or
          instantiate model sessions. The check also loads a tiny generated residual-adapter graph
          in the worker and records aggregate adapter overhead without audio or transcript data.
          Browser-only adapter training remains a blocked experiment for the pinned ORT Web package
          until a public training artifact and JS API are available.
        </p>
      </div>

      <div className="runtime-actions">
        <button
          type="button"
          onClick={() => void handleCheckRuntime()}
          disabled={status.state === 'loading'}
        >
          {status.state === 'loading' ? 'Benchmarking provider…' : 'Benchmark worker provider'}
        </button>
        <TrainingSpikeStatus />
        <RuntimeStatusMessage status={status} />
      </div>
    </section>
  );
}

function TrainingSpikeStatus() {
  return (
    <dl className="microphone-settings" aria-label="ONNX Runtime Web training spike status">
      <div>
        <dt>Training artifact</dt>
        <dd>
          {browserTrainingSpikeReport.packageName} {browserTrainingSpikeReport.packageVersion}
        </dd>
      </div>
      <div>
        <dt>Browser training API</dt>
        <dd>
          {browserTrainingSpikeReport.trainingApiAvailable ? 'candidate detected' : 'not exposed'}
        </dd>
      </div>
      <div>
        <dt>Training decision</dt>
        <dd>
          {browserTrainingSpikeReport.recommendation === 'defer-browser-training-prototype'
            ? 'defer; use local trainer'
            : 'prototype in training worker'}
        </dd>
      </div>
    </dl>
  );
}

function RuntimeStatusMessage({ status }: { readonly status: RuntimeStatus }) {
  if (status.state === 'idle') {
    return <p className="status-message">Worker provider benchmark has not run yet.</p>;
  }
  if (status.state === 'loading') {
    return (
      <p className="status-message">Benchmarking ONNX Runtime providers in a dedicated worker…</p>
    );
  }
  if (status.state === 'error') {
    return <p className="status-message error-message">{status.message}</p>;
  }
  return (
    <>
      <dl className="microphone-settings" aria-label="ONNX Runtime worker status">
        <div>
          <dt>Provider</dt>
          <dd>{status.provider ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>WASM threads</dt>
          <dd>{status.wasmThreads ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Language mode</dt>
          <dd>{formatLanguageModeDiagnostics(status.languageDiagnostics)}</dd>
        </div>
        <div>
          <dt>Language spans</dt>
          <dd>{formatLanguageSpanDiagnostics(status.languageDiagnostics)}</dd>
        </div>
        <div>
          <dt>Adapter profile</dt>
          <dd>{formatAdapterProfile(status.adapterBenchmark)}</dd>
        </div>
        <div>
          <dt>Adapter median run</dt>
          <dd>{formatAdapterMedian(status.adapterBenchmark)}</dd>
        </div>
        <div>
          <dt>Adapter RTF overhead</dt>
          <dd>{formatAdapterRtf(status.adapterBenchmark)}</dd>
        </div>
      </dl>
      {status.warnings.length > 0 ? (
        <ul className="runtime-warnings" aria-label="Provider fallback warnings">
          {status.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function formatAdapterProfile(adapter: AsrWorkerRuntimeCheckResult['adapterBenchmark']): string {
  if (adapter === undefined) return 'not loaded';
  return `${adapter.profileId} (${adapter.adaptationType})`;
}

function formatAdapterMedian(adapter: AsrWorkerRuntimeCheckResult['adapterBenchmark']): string {
  if (adapter === undefined) return 'not measured';
  return `${adapter.adapterRunMedianMs.toFixed(3)} ms · ${(adapter.adapterSizeBytes / 1024).toFixed(1)} KiB`;
}

function formatAdapterRtf(adapter: AsrWorkerRuntimeCheckResult['adapterBenchmark']): string {
  if (adapter === undefined) return 'not measured';
  return adapter.adapterRtfOverheadRatio > 0 && adapter.adapterRtfOverheadRatio < 0.001
    ? '<0.001'
    : adapter.adapterRtfOverheadRatio.toFixed(3);
}

function formatLanguageModeDiagnostics(
  diagnostics: AsrWorkerRuntimeCheckResult['languageDiagnostics'],
): string {
  if (diagnostics === undefined) return 'unknown';
  if (diagnostics.requestedMode === diagnostics.effectiveMode) return diagnostics.effectiveMode;
  return `${diagnostics.effectiveMode} (${diagnostics.requestedMode} requested)`;
}

function formatLanguageSpanDiagnostics(
  diagnostics: AsrWorkerRuntimeCheckResult['languageDiagnostics'],
): string {
  if (diagnostics === undefined) return 'pending';
  const { spanSummary } = diagnostics;
  if (spanSummary.spanCount === 0) return 'no spans yet';
  return `${spanSummary.spanCount.toString()} spans · ${spanSummary.switchCount.toString()} switches`;
}
