import { createPinnedOnnxRuntimeWebTrainingSpikeReport } from '@speech/inference/training-artifact-spike';
import type {
  FrozenFeatureTinyAdapterProgressV1,
  FrozenFeatureTinyAdapterTrainingResultV1,
} from '@speech/browser-training';
import { useEffect, useId, useRef, useState } from 'react';
import {
  buildBrowserTrainingProgressView,
  summarizeBrowserTrainingResourceWarnings,
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
        <p className="eyebrow">Training support</p>
        <h2 id="runtime-title">Check this browser</h2>
        <p>
          Run a local support check before training a voice model. The check stays on this device
          and does not use audio or transcript data.
        </p>
      </div>

      <div className="runtime-actions">
        <button
          type="button"
          onClick={() => void handleCheckRuntime()}
          disabled={status.state === 'loading'}
        >
          {status.state === 'loading' ? 'Checking support…' : 'Check training support'}
        </button>
        <div className="browser-training-controls" aria-label="Browser training controls">
          <p id="browser-training-start-help" className="sr-only">
            Starts the local training support check without changing the active voice model.
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
            {trainingStatus.state === 'training' ? 'Checking training…' : 'Run training check'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Restart training check? This clears local recovery for the test run only. The active voice model is unchanged.',
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
            Restart training check
          </button>
          <button
            type="button"
            onClick={handlePauseBrowserTrainingPrototype}
            disabled={trainingStatus.state !== 'training'}
            aria-describedby="browser-training-pause-help"
          >
            {trainingControlIntent === 'pause-requested'
              ? 'Pause requested…'
              : 'Pause training check'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Cancel training check at the next safe point? Local recovery may remain, and the active voice model is unchanged.',
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
              : 'Cancel training check'}
          </button>
          <button
            type="button"
            onClick={() => void handleRunBrowserTrainingPrototype(true)}
            disabled={trainingStatus.state === 'training' || trainingRecovery === null}
            aria-describedby="browser-training-resume-help"
          >
            Resume training check
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (
                confirmBrowserTrainingAction(
                  'Clear local training-check recovery? This cannot be undone, but the active voice model is unchanged.',
                )
              ) {
                handleClearBrowserTrainingRecovery();
              }
            }}
            disabled={trainingStatus.state === 'training' || trainingRecovery === null}
            aria-describedby="browser-training-clear-help"
          >
            Clear recovery
          </button>
        </div>
        <details className="training-details-disclosure">
          <summary>Training support details</summary>
          <TrainingSpikeStatus />
        </details>
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
  const statusMessage = formatBrowserTrainingStatusMessage(status, recoverySummary);
  return (
    <>
      <BrowserTrainingProgressDetails view={progressView} />
      {status.state === 'error' ? (
        <p role="alert" className="status-message error-message">
          {formatBrowserTrainingErrorMessage(status.message)}
        </p>
      ) : (
        <p className="status-message">{statusMessage}</p>
      )}
      <BrowserTrainingDetailsDisclosure
        view={progressView}
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
      aria-label="Training progress"
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
          <p className="eyebrow">Training</p>
          <h3 id={titleId}>{view.title}</h3>
          <p>{view.summary}</p>
        </div>
        <strong aria-label={`${view.progressPercent.toString()} percent complete`}>
          {view.progressPercent.toString()}%
        </strong>
      </div>
      <div className="browser-training-stage" aria-label="Current training stage">
        <span>{view.currentStageLabel}</span>
        <small>{view.progressValueText}</small>
      </div>
      <div
        className="browser-training-progress__bar"
        role="progressbar"
        aria-label="Training overall progress"
        aria-describedby={`${phaseDescriptionId} ${liveRegionId}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.progressPercent}
        aria-valuetext={view.progressValueText}
      >
        <span style={{ width: `${view.progressPercent.toString()}%` }} />
      </div>
      <ol className="training-phase-list" aria-label="Training stage details">
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
      {view.recovery.resumable ? <p className="status-message">{view.recovery.label}</p> : null}
      <p id={localOnlyId} className="status-message">
        {view.localOnlyDisclosure}
      </p>
      {view.resourceWarnings.length > 0 ? (
        <ul className="runtime-warnings" aria-label="Training resource guidance">
          {view.resourceWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BrowserTrainingDetailsDisclosure({
  view,
  recovery,
  coordination,
  warnings,
}: {
  readonly view: BrowserTrainingProgressViewV1;
  readonly recovery: BrowserTrainingRecoveryRecordV1 | null;
  readonly coordination: BrowserTrainingCoordinationEventV1 | null;
  readonly warnings: readonly BrowserTrainingRuntimeWarningV1[];
}) {
  return (
    <details className="training-details-disclosure">
      <summary>Training details</summary>
      <BrowserTrainingTechnicalDetails view={view} />
      <BrowserTrainingRecoveryDetails
        recovery={recovery}
        coordination={coordination}
        warnings={warnings}
      />
    </details>
  );
}

function BrowserTrainingTechnicalDetails({
  view,
}: {
  readonly view: BrowserTrainingProgressViewV1;
}) {
  return (
    <dl className="microphone-settings" aria-label="Training technical details">
      {view.technicalDetails.map((detail) => (
        <div key={detail.label}>
          <dt>{detail.label}</dt>
          <dd>{detail.value}</dd>
        </div>
      ))}
    </dl>
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
  const visibleWarnings = summarizeBrowserTrainingResourceWarnings([
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
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function formatBrowserTrainingStatusMessage(
  status: BrowserTrainingStatus,
  recoverySummary: string,
): string {
  if (status.state === 'idle') {
    return recoverySummary === 'none'
      ? 'Training has not started.'
      : 'Training can resume from the saved checkpoint.';
  }
  if (status.state === 'training') {
    return 'Training is running locally.';
  }
  if (status.state === 'complete') {
    switch (status.result.status) {
      case 'completed':
        return 'Training finished. Review results before using the model.';
      case 'paused':
        return 'Training paused. Progress is saved on this device.';
      case 'cancelled':
        return 'Training cancelled. Start again or resume if recovery is available.';
    }
  }
  return 'Training needs attention.';
}

function confirmBrowserTrainingAction(message: string): boolean {
  return typeof globalThis.confirm !== 'function' || globalThis.confirm(message);
}

function formatBrowserTrainingErrorMessage(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('another tab')) {
    return 'Another tab is already training this voice model. Pause or cancel that run, then try again.';
  }
  return 'Training stopped before it finished. Retry or resume from recovery.';
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

function RuntimeStatusMessage({ status }: { readonly status: RuntimeStatus }) {
  if (status.state === 'idle') {
    return <p className="status-message">Training support has not been checked yet.</p>;
  }
  if (status.state === 'loading') {
    return <p className="status-message">Checking local training support…</p>;
  }
  if (status.state === 'error') {
    return <p className="status-message error-message">{status.message}</p>;
  }
  return (
    <>
      <p className="status-message">Training support check completed on this device.</p>
      <details className="training-details-disclosure">
        <summary>Runtime details</summary>
        <dl className="microphone-settings" aria-label="Runtime details">
          <div>
            <dt>Processing mode</dt>
            <dd>{status.provider ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Thread support</dt>
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
            <dt>Personal-model profile</dt>
            <dd>{formatAdapterProfile(status.adapterBenchmark)}</dd>
          </div>
          <div>
            <dt>Personal-model run time</dt>
            <dd>{formatAdapterMedian(status.adapterBenchmark)}</dd>
          </div>
          <div>
            <dt>Personal-model overhead</dt>
            <dd>{formatAdapterRtf(status.adapterBenchmark)}</dd>
          </div>
        </dl>
        {status.warnings.length > 0 ? (
          <ul className="runtime-warnings" aria-label="Runtime warnings">
            {status.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </>
  );
}

function formatAdapterProfile(adapter: AsrWorkerRuntimeCheckResult['adapterBenchmark']): string {
  if (adapter === undefined) return 'not loaded';
  return 'profile loaded';
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
