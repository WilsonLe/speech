import { useEffect, useMemo, useRef, useState } from 'react';
import pcmCaptureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import {
  MicrophoneCaptureController,
  attachPcmCaptureWorklet,
  getDefaultMicrophoneProcessingOptions,
  type MicrophoneCaptureFailure,
  type MicrophoneCaptureSnapshot,
  type MicrophoneProcessingOptions,
  type PcmCaptureWorkletController,
  type PcmCaptureWorkletFailure,
  type PcmCaptureWorkletMessage,
} from '@speech/audio';
import {
  evaluateVoiceConditionGuidance,
  formatDb,
  formatDbRange,
  type EnrollmentVoiceCondition,
} from '@speech/enrollment';

interface ToggleConfig {
  readonly key: keyof MicrophoneProcessingOptions;
  readonly label: string;
  readonly description: string;
}

interface WorkletCaptureSummary {
  readonly status: 'idle' | 'loading' | 'capturing' | 'stopped' | 'error';
  readonly chunks: number;
  readonly samples: number;
  readonly sampleRateHz: number | null;
  readonly lastChunkSamples: number;
  readonly peak: number;
  readonly rms: number;
  readonly clippingRatio: number;
  readonly message: string;
}

const toggles: readonly ToggleConfig[] = [
  {
    key: 'echoCancellation',
    label: 'Echo cancellation',
    description: 'Useful for speakers/headsets, but can color raw enrollment audio.',
  },
  {
    key: 'noiseSuppression',
    label: 'Noise suppression',
    description: 'Reduces background noise at the cost of less raw acoustic detail.',
  },
  {
    key: 'autoGainControl',
    label: 'Automatic gain control',
    description:
      'Levels volume automatically; enrollment will later prefer this off when supported.',
  },
];

const idleCaptureSummary: WorkletCaptureSummary = {
  status: 'idle',
  chunks: 0,
  samples: 0,
  sampleRateHz: null,
  lastChunkSamples: 0,
  peak: 0,
  rms: 0,
  clippingRatio: 0,
  message: 'AudioWorklet capture is idle until you start a microphone check.',
};

const enrollmentProcessingOptions: MicrophoneProcessingOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const voiceConditions: readonly EnrollmentVoiceCondition[] = ['whisper', 'normal', 'projected'];

export function MicrophonePanel() {
  const controller = useMemo(() => new MicrophoneCaptureController(), []);
  const workletController = useRef<PcmCaptureWorkletController | null>(null);
  const [processing, setProcessing] = useState<MicrophoneProcessingOptions>(() =>
    getDefaultMicrophoneProcessingOptions(),
  );
  const [status, setStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [snapshot, setSnapshot] = useState<MicrophoneCaptureSnapshot | null>(null);
  const [error, setError] = useState<MicrophoneCaptureFailure | PcmCaptureWorkletFailure | null>(
    null,
  );
  const [captureSummary, setCaptureSummary] = useState<WorkletCaptureSummary>(idleCaptureSummary);
  const [roomNoiseRms, setRoomNoiseRms] = useState<number | null>(null);
  const [normalBaselineRms, setNormalBaselineRms] = useState<number | null>(null);
  const [voiceCondition, setVoiceCondition] = useState<EnrollmentVoiceCondition>('normal');
  const calibrationBaseline = normalBaselineRms
    ? {
        normalRms: normalBaselineRms,
        ...(roomNoiseRms !== null ? { roomNoiseRms } : {}),
      }
    : null;
  const voiceGuidance = evaluateVoiceConditionGuidance(
    {
      rms: captureSummary.rms,
      peak: captureSummary.peak,
      clippingRatio: captureSummary.clippingRatio,
    },
    calibrationBaseline,
    voiceCondition,
  );

  useEffect(() => {
    return () => {
      workletController.current?.dispose();
      workletController.current = null;
      void controller.stop();
    };
  }, [controller]);

  async function startMicrophoneCheck() {
    setStatus('requesting');
    setError(null);
    setCaptureSummary({
      ...idleCaptureSummary,
      status: 'loading',
      message: 'Loading AudioWorklet…',
    });

    try {
      const session = await controller.start({ processing });
      setSnapshot({
        requestedConstraints: session.requestedConstraints,
        actualSettings: session.actualSettings,
        audioContextSampleRateHz: session.audioContextSampleRateHz,
        trackLabel: session.trackLabel,
        trackState: session.trackState,
        startedAt: session.startedAt,
      });

      const captureWorklet = await attachPcmCaptureWorklet({
        audioContext: session.audioContext,
        sourceNode: session.sourceNode,
        workletModuleUrl: pcmCaptureWorkletUrl,
        onMessage: handleWorkletMessage,
      });
      workletController.current = captureWorklet;
      captureWorklet.start();
      setStatus('active');
      setCaptureSummary((current) => ({
        ...current,
        status: 'capturing',
        sampleRateHz: session.audioContextSampleRateHz,
        message: 'AudioWorklet is capturing device-rate PCM and posting local metrics.',
      }));
    } catch (captureError) {
      workletController.current?.dispose();
      workletController.current = null;
      await controller.stop();
      setSnapshot(null);
      setError(toCaptureFailure(captureError));
      setStatus('error');
      setCaptureSummary({
        ...idleCaptureSummary,
        status: 'error',
        message: 'AudioWorklet capture could not start.',
      });
    }
  }

  async function stopMicrophoneCheck() {
    workletController.current?.stop();
    workletController.current?.dispose();
    workletController.current = null;
    await controller.stop();
    setStatus('idle');
    setSnapshot(null);
    setCaptureSummary((current) => ({
      ...current,
      status: 'stopped',
      message: 'Capture stopped and microphone resources were released.',
    }));
  }

  function useEnrollmentProcessingDefaults() {
    setProcessing(enrollmentProcessingOptions);
  }

  function saveRoomNoiseSample() {
    if (captureSummary.rms > 0) {
      setRoomNoiseRms(captureSummary.rms);
    }
  }

  function saveNormalBaseline() {
    if (captureSummary.rms > 0) {
      setNormalBaselineRms(captureSummary.rms);
    }
  }

  function handleWorkletMessage(message: PcmCaptureWorkletMessage) {
    switch (message.type) {
      case 'CAPTURE_STARTED':
        setCaptureSummary((current) => ({
          ...current,
          status: 'capturing',
          sampleRateHz: message.sampleRateHz,
          message: 'AudioWorklet capture started.',
        }));
        break;
      case 'CAPTURE_STOPPED':
        setCaptureSummary((current) => ({
          ...current,
          status: 'stopped',
          message: 'AudioWorklet capture stopped.',
        }));
        break;
      case 'LEVEL':
        setCaptureSummary((current) => ({
          ...current,
          sampleRateHz: message.sampleRateHz,
          peak: message.metrics.peak,
          rms: message.metrics.rms,
          clippingRatio: message.metrics.clippingRatio,
        }));
        break;
      case 'PCM_CHUNK':
        setCaptureSummary((current) => ({
          ...current,
          chunks: current.chunks + 1,
          samples: current.samples + message.sampleCount,
          sampleRateHz: message.sampleRateHz,
          lastChunkSamples: message.sampleCount,
          peak: message.metrics.peak,
          rms: message.metrics.rms,
          clippingRatio: message.metrics.clippingRatio,
        }));
        workletController.current?.releaseTransferredBuffer(message);
        break;
      case 'RING_BUFFER_STATUS':
        setCaptureSummary((current) => ({
          ...current,
          sampleRateHz: message.sampleRateHz,
          samples: message.state.writeSequence,
          message: `Shared ring buffer queued ${message.state.availableSamples} samples with ${message.state.overrunCount} overruns.`,
        }));
        break;
      case 'CAPTURE_ERROR':
        setError({
          code: message.code,
          message: message.message,
          recoveryStep: 'Stop capture, refresh the PWA, and try again.',
        });
        setStatus('error');
        setCaptureSummary((current) => ({ ...current, status: 'error', message: message.message }));
        break;
    }
  }

  return (
    <section className="microphone panel" aria-labelledby="microphone-title">
      <div className="section-heading">
        <p className="eyebrow">Microphone</p>
        <h2 id="microphone-title">Permission and capture check</h2>
        <p>
          Microphone access is requested only when you press start. The app asks for mono audio,
          attaches an AudioWorklet capture processor, and reports actual browser track settings
          because browsers may not honor every constraint.
        </p>
      </div>

      <fieldset className="toggle-list" disabled={status === 'requesting' || status === 'active'}>
        <legend>Browser audio processing</legend>
        {toggles.map((toggle) => (
          <label key={toggle.key}>
            <input
              type="checkbox"
              checked={processing[toggle.key]}
              onChange={(event) =>
                setProcessing((current) => ({ ...current, [toggle.key]: event.target.checked }))
              }
            />
            <span>
              <strong>{toggle.label}</strong>
              <small>{toggle.description}</small>
            </span>
          </label>
        ))}
        <button type="button" className="secondary" onClick={useEnrollmentProcessingDefaults}>
          Use enrollment defaults: browser processing off
        </button>
      </fieldset>

      <div className="hero-actions" aria-label="Microphone controls">
        <button type="button" onClick={startMicrophoneCheck} disabled={status === 'requesting'}>
          {status === 'requesting' ? 'Requesting microphone…' : 'Start microphone check'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={stopMicrophoneCheck}
          disabled={status !== 'active'}
        >
          Stop microphone
        </button>
      </div>

      {error ? (
        <p role="alert" className="status-message error-message">
          {error.message} {error.recoveryStep}
        </p>
      ) : null}

      <dl className="probe-list microphone-settings" aria-label="AudioWorklet capture metrics">
        <div>
          <dt>AudioWorklet status</dt>
          <dd>{captureSummary.status}</dd>
        </div>
        <div>
          <dt>Captured chunks</dt>
          <dd>{captureSummary.chunks}</dd>
        </div>
        <div>
          <dt>Captured samples</dt>
          <dd>{captureSummary.samples}</dd>
        </div>
        <div>
          <dt>Worklet sample rate</dt>
          <dd>
            {captureSummary.sampleRateHz ? `${captureSummary.sampleRateHz} Hz` : 'not started'}
          </dd>
        </div>
        <div>
          <dt>Peak level</dt>
          <dd>{captureSummary.peak.toFixed(3)}</dd>
        </div>
        <div>
          <dt>RMS level</dt>
          <dd>{captureSummary.rms.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Clipping</dt>
          <dd>{formatPercent(captureSummary.clippingRatio)}</dd>
        </div>
      </dl>
      <p className="status-message">{captureSummary.message}</p>

      <div
        className="status-message enrollment-calibration"
        aria-label="Enrollment calibration guidance"
      >
        <h3>Calibration and voice guidance</h3>
        <p>
          For enrollment, capture a short room-noise sample, then set a normal speaking baseline.
          Guidance uses only local RMS, peak, and clipping metrics from the AudioWorklet; no
          calibration audio is persisted.
        </p>
        <p>
          Enrollment requests should prefer browser processing off when supported. Current track AGC
          setting:{' '}
          {snapshot ? formatSetting(snapshot.actualSettings.autoGainControl) : 'not reported'}.
        </p>
        <div className="hero-actions" aria-label="Enrollment calibration controls">
          <button
            type="button"
            className="secondary"
            onClick={saveRoomNoiseSample}
            disabled={status !== 'active' || captureSummary.rms <= 0}
          >
            Use current level as room-noise sample
          </button>
          <button
            type="button"
            className="secondary"
            onClick={saveNormalBaseline}
            disabled={status !== 'active' || captureSummary.rms <= 0}
          >
            Set normal baseline from current level
          </button>
        </div>
        <label className="select-field">
          <span>Voice condition</span>
          <select
            value={voiceCondition}
            onChange={(event) => setVoiceCondition(event.target.value as EnrollmentVoiceCondition)}
          >
            {voiceConditions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </label>
        <dl className="probe-list microphone-settings" aria-label="Enrollment calibration metrics">
          <div>
            <dt>Room noise RMS</dt>
            <dd>{roomNoiseRms !== null ? roomNoiseRms.toFixed(3) : 'not set'}</dd>
          </div>
          <div>
            <dt>Normal baseline RMS</dt>
            <dd>{normalBaselineRms !== null ? normalBaselineRms.toFixed(3) : 'not set'}</dd>
          </div>
          <div>
            <dt>Current relative level</dt>
            <dd>{formatDb(voiceGuidance.relativeDb)}</dd>
          </div>
          <div>
            <dt>Advisory band</dt>
            <dd>{formatDbRange(voiceGuidance.target)}</dd>
          </div>
          <div>
            <dt>Estimated SNR</dt>
            <dd>{formatDb(voiceGuidance.snrDb)}</dd>
          </div>
          <div>
            <dt>Guidance status</dt>
            <dd>{voiceGuidance.status}</dd>
          </div>
        </dl>
        <p className="status-message">{voiceGuidance.message}</p>
        {voiceCondition === 'projected' ? (
          <p className="status-message">
            Projected means loud and clear, like addressing a room. Do not strain, scream, or
            sustain a shout.
          </p>
        ) : null}
      </div>

      {snapshot ? (
        <dl className="probe-list microphone-settings" aria-label="Actual microphone settings">
          <div>
            <dt>Track</dt>
            <dd>{snapshot.trackLabel || 'Microphone'}</dd>
          </div>
          <div>
            <dt>AudioContext sample rate</dt>
            <dd>{snapshot.audioContextSampleRateHz} Hz</dd>
          </div>
          <div>
            <dt>Track sample rate</dt>
            <dd>{snapshot.actualSettings.sampleRate ?? 'not reported'} Hz</dd>
          </div>
          <div>
            <dt>Channels</dt>
            <dd>{snapshot.actualSettings.channelCount ?? 'not reported'}</dd>
          </div>
          <div>
            <dt>Echo cancellation</dt>
            <dd>{formatSetting(snapshot.actualSettings.echoCancellation)}</dd>
          </div>
          <div>
            <dt>Noise suppression</dt>
            <dd>{formatSetting(snapshot.actualSettings.noiseSuppression)}</dd>
          </div>
          <div>
            <dt>Automatic gain control</dt>
            <dd>{formatSetting(snapshot.actualSettings.autoGainControl)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function formatSetting(value: boolean | undefined): string {
  if (typeof value !== 'boolean') {
    return 'not reported';
  }

  return value ? 'enabled' : 'disabled';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function toCaptureFailure(error: unknown): MicrophoneCaptureFailure | PcmCaptureWorkletFailure {
  if (isCaptureFailure(error)) {
    return error;
  }

  return {
    code: 'AUDIO_CONTEXT_FAILED',
    message: error instanceof Error ? error.message : 'Microphone capture failed.',
    recoveryStep: 'Stop capture, refresh the PWA, and try again.',
  };
}

function isCaptureFailure(
  error: unknown,
): error is MicrophoneCaptureFailure | PcmCaptureWorkletFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'recoveryStep' in error
  );
}
