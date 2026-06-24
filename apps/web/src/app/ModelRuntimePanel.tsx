import { createPinnedOnnxRuntimeWebTrainingSpikeReport } from '@speech/inference/training-artifact-spike';
import type {
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/personalization';
import { useRef, useState } from 'react';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';
import {
  clearBrowserTrainingRecovery,
  readBrowserTrainingRecovery,
  startBrowserTrainingPrototype,
  type BrowserTrainingPrototypeRunController,
  type BrowserTrainingRecoveryRecordV1,
  type BrowserTrainingRuntimeWarningV1,
} from '../workers/browser-training-client';

const browserTrainingSpikeReport = createPinnedOnnxRuntimeWebTrainingSpikeReport();

type RuntimeStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | ({ readonly state: 'ready' } & AsrWorkerRuntimeCheckResult)
  | { readonly state: 'error'; readonly message: string };

type BrowserTrainingStatus =
  | { readonly state: 'idle' }
  | {
      readonly state: 'training';
      readonly latestProgress?: FrozenFeatureTinyAdapterProgressV1;
    }
  | { readonly state: 'complete'; readonly result: FrozenFeatureTinyAdapterTrainingResultV1 }
  | { readonly state: 'error'; readonly message: string };

export function ModelRuntimePanel() {
  const [status, setStatus] = useState<RuntimeStatus>({ state: 'idle' });
  const [trainingStatus, setTrainingStatus] = useState<BrowserTrainingStatus>({ state: 'idle' });
  const [trainingWarnings, setTrainingWarnings] = useState<
    readonly BrowserTrainingRuntimeWarningV1[]
  >([]);
  const [trainingRecovery, setTrainingRecovery] = useState<BrowserTrainingRecoveryRecordV1 | null>(
    () => readBrowserTrainingRecovery(),
  );
  const trainingRun = useRef<BrowserTrainingPrototypeRunController | null>(null);

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

  async function handleRunBrowserTrainingPrototype(resume: boolean = false) {
    setTrainingStatus({ state: 'training' });
    setTrainingWarnings([]);
    const checkpoint = resume ? trainingRecovery?.checkpoint : undefined;
    const resumeOptions = checkpoint === undefined ? {} : { resumeFromCheckpoint: checkpoint };
    try {
      const run = startBrowserTrainingPrototype({
        ...resumeOptions,
        training: {
          epochs: 160,
          progressEveryEpochs: 20,
          checkpointEveryEpochs: 20,
          targetLoss: 0,
          epochDelayMs: 5,
        },
        onProgress: (latestProgress) => setTrainingStatus({ state: 'training', latestProgress }),
        onCheckpoint: () => setTrainingRecovery(readBrowserTrainingRecovery()),
        onWarning: setTrainingWarnings,
        onRecoveryChange: setTrainingRecovery,
      });
      trainingRun.current = run;
      const result = await run.result;
      setTrainingStatus({ state: 'complete', result });
      setTrainingRecovery(readBrowserTrainingRecovery());
    } catch (error) {
      setTrainingStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      setTrainingRecovery(readBrowserTrainingRecovery());
    } finally {
      trainingRun.current = null;
    }
  }

  function handlePauseBrowserTrainingPrototype() {
    trainingRun.current?.pause();
  }

  function handleCancelBrowserTrainingPrototype() {
    trainingRun.current?.cancel();
  }

  function handleClearBrowserTrainingRecovery() {
    clearBrowserTrainingRecovery();
    setTrainingRecovery(null);
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
          Browser personal-model training uses the repository-owned BrowserTrainingBackend boundary.
          The pinned ORT Web package does not expose the documented training WASM artifact or public
          JS training API, so follow-on work must use the fixed adapter-math backend unless a
          reviewed ORT Training artifact passes the worker proof.
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
        <button
          type="button"
          onClick={() => void handleRunBrowserTrainingPrototype(false)}
          disabled={trainingStatus.state === 'training'}
        >
          {trainingStatus.state === 'training'
            ? 'Training tiny adapter…'
            : 'Run browser training prototype'}
        </button>
        <button
          type="button"
          onClick={handlePauseBrowserTrainingPrototype}
          disabled={trainingStatus.state !== 'training'}
        >
          Pause browser training
        </button>
        <button
          type="button"
          onClick={handleCancelBrowserTrainingPrototype}
          disabled={trainingStatus.state !== 'training'}
        >
          Cancel browser training
        </button>
        <button
          type="button"
          onClick={() => void handleRunBrowserTrainingPrototype(true)}
          disabled={trainingStatus.state === 'training' || trainingRecovery === null}
        >
          Resume browser training prototype
        </button>
        <button
          type="button"
          onClick={handleClearBrowserTrainingRecovery}
          disabled={trainingStatus.state === 'training' || trainingRecovery === null}
        >
          Clear browser training recovery
        </button>
        <TrainingSpikeStatus />
        <BrowserTrainingStatusMessage
          status={trainingStatus}
          recovery={trainingRecovery}
          warnings={trainingWarnings}
        />
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
          {browserTrainingSpikeReport.backendDecision === 'fixed-adapter-math-fallback-required'
            ? 'fixed adapter-math backend required'
            : 'ORT Training worker candidate'}
        </dd>
      </div>
      <div>
        <dt>ORT package proof</dt>
        <dd>{browserTrainingSpikeReport.tinyTrainingProof.status}</dd>
      </div>
    </dl>
  );
}

function BrowserTrainingStatusMessage({
  status,
  recovery,
  warnings,
}: {
  readonly status: BrowserTrainingStatus;
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
}) {
  const recoverySummary = formatBrowserTrainingRecovery(recovery);
  if (status.state === 'idle') {
    return (
      <>
        <p className="status-message">
          Browser-training worker prototype has not run yet. It uses synthetic frozen features and
          does not touch the active ASR worker or profile.
        </p>
        <BrowserTrainingRecoveryDetails recovery={recovery} warnings={warnings} />
      </>
    );
  }
  if (status.state === 'training') {
    const progress = status.latestProgress;
    return (
      <>
        <p className="status-message">
          Training tiny adapter in a dedicated worker…{' '}
          {progress === undefined
            ? 'starting'
            : `epoch ${progress.epoch.toString()}/${progress.epochs.toString()}, loss ${progress.loss.toFixed(6)}`}
        </p>
        <dl className="microphone-settings" aria-label="Browser training prototype status">
          <div>
            <dt>Prototype status</dt>
            <dd>training</dd>
          </div>
          <div>
            <dt>Checkpoint recovery</dt>
            <dd>{recoverySummary}</dd>
          </div>
        </dl>
        <BrowserTrainingRecoveryDetails recovery={recovery} warnings={warnings} />
      </>
    );
  }
  if (status.state === 'error') {
    return (
      <>
        <p className="status-message error-message">{status.message}</p>
        <BrowserTrainingRecoveryDetails recovery={recovery} warnings={warnings} />
      </>
    );
  }
  const { result } = status;
  return (
    <>
      <dl className="microphone-settings" aria-label="Browser training prototype status">
        <div>
          <dt>Training worker</dt>
          <dd>{result.workerOwner}</dd>
        </div>
        <div>
          <dt>Prototype status</dt>
          <dd>{result.status}</dd>
        </div>
        <div>
          <dt>Training examples</dt>
          <dd>{result.metrics.examples.toString()}</dd>
        </div>
        <div>
          <dt>Epochs completed</dt>
          <dd>{result.metrics.epochsCompleted.toString()}</dd>
        </div>
        <div>
          <dt>Checkpoint epoch</dt>
          <dd>{result.checkpoint.epoch.toString()}</dd>
        </div>
        <div>
          <dt>Checkpoint recovery</dt>
          <dd>{recoverySummary}</dd>
        </div>
        <div>
          <dt>Loss reduction</dt>
          <dd>{result.metrics.lossReduction.toFixed(6)}</dd>
        </div>
        <div>
          <dt>Adapter parameters</dt>
          <dd>{result.artifact.parameterCount.toString()}</dd>
        </div>
        <div>
          <dt>Activation gate</dt>
          <dd>
            {result.compatibility.activationGateRequired ? 'required before activation' : 'missing'}
          </dd>
        </div>
      </dl>
      <BrowserTrainingRecoveryDetails recovery={recovery} warnings={warnings} />
    </>
  );
}

function BrowserTrainingRecoveryDetails({
  recovery,
  warnings,
}: {
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
}) {
  const visibleWarnings = uniqueBrowserTrainingWarnings([
    ...warnings,
    ...(recovery?.warnings ?? []),
  ]);
  return (
    <>
      <dl className="microphone-settings" aria-label="Browser training recovery status">
        <div>
          <dt>Recovery checkpoint</dt>
          <dd>{formatBrowserTrainingRecovery(recovery)}</dd>
        </div>
        <div>
          <dt>Recovery status</dt>
          <dd>{recovery?.status ?? 'none'}</dd>
        </div>
        <div>
          <dt>Recovery epoch</dt>
          <dd>{recovery === null ? 'none' : recovery.checkpoint.epoch.toString()}</dd>
        </div>
      </dl>
      {visibleWarnings.length > 0 ? (
        <ul className="runtime-warnings" aria-label="Browser training runtime warnings">
          {visibleWarnings.map((warning) => (
            <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function formatBrowserTrainingRecovery(recovery: BrowserTrainingRecoveryRecordV1 | null): string {
  if (recovery === null) return 'none';
  return `available at epoch ${recovery.checkpoint.epoch.toString()}`;
}

function uniqueBrowserTrainingWarnings(
  warnings: readonly BrowserTrainingRuntimeWarningV1[],
): readonly BrowserTrainingRuntimeWarningV1[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
