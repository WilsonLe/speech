import { createPinnedOnnxRuntimeWebTrainingSpikeReport } from '@speech/inference/training-artifact-spike';
import type {
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/browser-training';
import { useEffect, useId, useRef, useState } from 'react';
import {
  buildBrowserTrainingProgressView,
  type BrowserTrainingControlIntent,
  type BrowserTrainingProgressViewV1,
} from './browser-training-ui';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';
import {
  clearBrowserTrainingRecovery,
  readBrowserTrainingRecovery,
  startBrowserTrainingPrototype,
  subscribeBrowserTrainingCoordination,
  type BrowserTrainingCoordinationEventV1,
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
  const [trainingCoordination, setTrainingCoordination] =
    useState<BrowserTrainingCoordinationEventV1 | null>(null);
  const [trainingControlIntent, setTrainingControlIntent] =
    useState<BrowserTrainingControlIntent>('none');
  const trainingRun = useRef<BrowserTrainingPrototypeRunController | null>(null);
  const latestTrainingCoordination = trainingCoordination ?? trainingRecovery?.coordination ?? null;
  const trainingProgressView = buildBrowserTrainingProgressView({
    status: trainingStatus,
    recovery: trainingRecovery,
    coordination: latestTrainingCoordination,
    warnings: trainingWarnings,
    controlIntent: trainingControlIntent,
  });

  useEffect(() => subscribeBrowserTrainingCoordination(setTrainingCoordination), []);

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
    if (!resume) {
      clearBrowserTrainingRecovery();
      setTrainingRecovery(null);
    }
    setTrainingStatus({ state: 'training' });
    setTrainingControlIntent('none');
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
          epochDelayMs: 25,
        },
        onProgress: (latestProgress) => setTrainingStatus({ state: 'training', latestProgress }),
        onCheckpoint: () => setTrainingRecovery(readBrowserTrainingRecovery()),
        onWarning: setTrainingWarnings,
        onCoordination: setTrainingCoordination,
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
      setTrainingControlIntent('none');
      trainingRun.current = null;
    }
  }

  function handlePauseBrowserTrainingPrototype() {
    setTrainingControlIntent('pause-requested');
    trainingRun.current?.pause();
  }

  function handleCancelBrowserTrainingPrototype() {
    setTrainingControlIntent('cancel-requested');
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
        <div className="browser-training-controls" aria-label="Browser training controls">
          <p id="browser-training-start-help" className="sr-only">
            Starts the synthetic browser-training worker locally without changing the active
            profile.
          </p>
          <p id="browser-training-restart-help" className="sr-only">
            Restarts the local prototype after confirmation and clears reload recovery for this
            synthetic run only.
          </p>
          <p id="browser-training-pause-help" className="sr-only">
            Requests a pause at the next safe checkpoint so reload recovery can resume later.
          </p>
          <p id="browser-training-cancel-help" className="sr-only">
            Requests cancellation at the next safe checkpoint after confirmation; active profiles
            stay unchanged.
          </p>
          <p id="browser-training-resume-help" className="sr-only">
            Resumes the local synthetic prototype from the stored reload recovery checkpoint.
          </p>
          <p id="browser-training-clear-help" className="sr-only">
            Clears the local synthetic reload recovery checkpoint after confirmation.
          </p>
          <button
            type="button"
            onClick={() => void handleRunBrowserTrainingPrototype(false)}
            disabled={trainingStatus.state === 'training'}
            aria-describedby="browser-training-start-help"
          >
            {trainingStatus.state === 'training'
              ? 'Training tiny adapter…'
              : 'Run browser training prototype'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Restart browser training prototype? This clears local reload recovery for the synthetic run only. The active profile is unchanged.',
                )
              ) {
                void handleRunBrowserTrainingPrototype(false);
              }
            }}
            disabled={
              trainingStatus.state === 'training' ||
              (trainingStatus.state === 'idle' && trainingRecovery === null)
            }
            aria-describedby="browser-training-restart-help"
          >
            Restart browser training prototype
          </button>
          <button
            type="button"
            onClick={handlePauseBrowserTrainingPrototype}
            disabled={trainingStatus.state !== 'training'}
            aria-describedby="browser-training-pause-help"
          >
            {trainingControlIntent === 'pause-requested'
              ? 'Pause requested…'
              : 'Pause browser training'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Cancel browser training at the next safe checkpoint? A local recovery checkpoint may remain, and the active profile is unchanged.',
                )
              ) {
                handleCancelBrowserTrainingPrototype();
              }
            }}
            disabled={trainingStatus.state !== 'training'}
            aria-describedby="browser-training-cancel-help"
          >
            {trainingControlIntent === 'cancel-requested'
              ? 'Cancel requested…'
              : 'Cancel browser training'}
          </button>
          <button
            type="button"
            onClick={() => void handleRunBrowserTrainingPrototype(true)}
            disabled={trainingStatus.state === 'training' || trainingRecovery === null}
            aria-describedby="browser-training-resume-help"
          >
            Resume browser training prototype
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Clear the browser training reload recovery checkpoint? This cannot be undone, but the active profile is unchanged.',
                )
              ) {
                handleClearBrowserTrainingRecovery();
              }
            }}
            disabled={trainingStatus.state === 'training' || trainingRecovery === null}
            aria-describedby="browser-training-clear-help"
          >
            Clear browser training recovery
          </button>
        </div>
        <TrainingSpikeStatus />
        <BrowserTrainingStatusMessage
          status={trainingStatus}
          recovery={trainingRecovery}
          coordination={latestTrainingCoordination}
          warnings={trainingWarnings}
          progressView={trainingProgressView}
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
  coordination,
  warnings,
  progressView,
}: {
  readonly status: BrowserTrainingStatus;
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly coordination: BrowserTrainingCoordinationEventV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
  readonly progressView: BrowserTrainingProgressViewV1;
}) {
  const recoverySummary = formatBrowserTrainingRecovery(recovery);
  const latestCoordination = coordination ?? recovery?.coordination ?? null;
  if (status.state === 'idle') {
    return (
      <>
        <BrowserTrainingProgressDetails view={progressView} />
        <p className="status-message">
          Browser-training worker prototype has not run yet. It uses synthetic frozen features and
          does not touch the active ASR worker or profile.
        </p>
        <BrowserTrainingRecoveryDetails
          recovery={recovery}
          coordination={latestCoordination}
          warnings={warnings}
        />
      </>
    );
  }
  if (status.state === 'training') {
    const progress = status.latestProgress;
    return (
      <>
        <BrowserTrainingProgressDetails view={progressView} />
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
        <BrowserTrainingRecoveryDetails
          recovery={recovery}
          coordination={latestCoordination}
          warnings={warnings}
        />
      </>
    );
  }
  if (status.state === 'error') {
    return (
      <>
        <BrowserTrainingProgressDetails view={progressView} />
        <p role="alert" className="status-message error-message">
          {status.message}
        </p>
        <BrowserTrainingRecoveryDetails
          recovery={recovery}
          coordination={latestCoordination}
          warnings={warnings}
        />
      </>
    );
  }
  const { result } = status;
  return (
    <>
      <BrowserTrainingProgressDetails view={progressView} />
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
      <BrowserTrainingRecoveryDetails
        recovery={recovery}
        coordination={latestCoordination}
        warnings={warnings}
      />
    </>
  );
}

function BrowserTrainingProgressDetails({
  view,
}: {
  readonly view: BrowserTrainingProgressViewV1;
}) {
  const titleId = useId();
  const phaseDescriptionId = useId();
  const localOnlyId = useId();
  const liveRegionId = useId();
  return (
    <section
      className="browser-training-progress"
      aria-label="Browser training named-phase progress"
      aria-describedby={`${phaseDescriptionId} ${localOnlyId}`}
      aria-busy={view.isBusy}
    >
      <p id={liveRegionId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {view.liveRegionText}
      </p>
      <p id={phaseDescriptionId} className="sr-only">
        {view.phaseTextEquivalent}
      </p>
      <div className="browser-training-progress__header">
        <div>
          <p className="eyebrow">Training progress</p>
          <h3 id={titleId}>{view.currentPhaseLabel}</h3>
        </div>
        <strong>{view.progressPercent.toString()}%</strong>
      </div>
      <div
        className="browser-training-progress__bar"
        role="progressbar"
        aria-label="Browser training overall progress"
        aria-describedby={`${phaseDescriptionId} ${liveRegionId}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.progressPercent}
        aria-valuetext={view.progressValueText}
      >
        <span style={{ width: `${view.progressPercent.toString()}%` }} />
      </div>
      <ol className="training-phase-list" aria-label="Browser training phase details">
        {view.phases.map((phase, index) => (
          <li
            key={phase.id}
            data-status={phase.status}
            aria-current={phase.status === 'active' ? 'step' : undefined}
            aria-label={`Step ${(index + 1).toString()}: ${phase.label}; ${formatBrowserTrainingPhaseStatus(phase.status)}; ${phase.detail}`}
          >
            <span aria-hidden="true">{(index + 1).toString()}</span>
            <div>
              <strong>{phase.label}</strong>
              <em className="phase-status-label">
                {formatBrowserTrainingPhaseStatus(phase.status)}
              </em>
              <small>{phase.detail}</small>
            </div>
          </li>
        ))}
      </ol>
      <dl className="microphone-settings" aria-label="Browser training reload recovery summary">
        <div>
          <dt>Reload recovery</dt>
          <dd>{view.recovery.label}</dd>
        </div>
        <div>
          <dt>Recovery updated</dt>
          <dd>{view.recovery.updatedAt ?? 'not stored'}</dd>
        </div>
      </dl>
      <p id={localOnlyId} className="status-message">
        {view.localOnlyDisclosure}
      </p>
      {view.resourceWarnings.length > 0 ? (
        <ul className="runtime-warnings" aria-label="Browser training resource guidance">
          {view.resourceWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BrowserTrainingRecoveryDetails({
  recovery,
  coordination,
  warnings,
}: {
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly coordination: BrowserTrainingCoordinationEventV1 | null;
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
        <div>
          <dt>Cross-tab lock</dt>
          <dd>{formatBrowserTrainingCoordination(coordination)}</dd>
        </div>
        <div>
          <dt>Lock scope</dt>
          <dd>{coordination?.scope.scopeFingerprint ?? 'none'}</dd>
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

function confirmBrowserTrainingAction(message: string): boolean {
  return typeof globalThis.confirm !== 'function' || globalThis.confirm(message);
}

function formatBrowserTrainingPhaseStatus(
  status: BrowserTrainingProgressViewV1['phases'][number]['status'],
): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'active':
      return 'Active';
    case 'complete':
      return 'Complete';
    case 'attention':
      return 'Needs attention';
    case 'blocked':
      return 'Blocked';
  }
}

function formatBrowserTrainingRecovery(recovery: BrowserTrainingRecoveryRecordV1 | null): string {
  if (recovery === null) return 'none';
  return `available at epoch ${recovery.checkpoint.epoch.toString()}`;
}

function formatBrowserTrainingCoordination(
  coordination: BrowserTrainingCoordinationEventV1 | null,
): string {
  if (coordination === null) return 'idle';
  switch (coordination.eventType) {
    case 'lock-requested':
      return 'requesting local training lock';
    case 'lock-acquired':
      return 'training lock held in this browser';
    case 'lock-busy':
      return 'another tab is training this profile';
    case 'lock-released':
      return 'training lock released';
    case 'lock-unavailable':
      return 'Web Locks unavailable';
  }
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
