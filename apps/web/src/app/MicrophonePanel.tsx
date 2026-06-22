import { useEffect, useMemo, useState } from 'react';
import {
  MicrophoneCaptureController,
  getDefaultMicrophoneProcessingOptions,
  type MicrophoneCaptureFailure,
  type MicrophoneCaptureSnapshot,
  type MicrophoneProcessingOptions,
} from '@speech/audio';

interface ToggleConfig {
  readonly key: keyof MicrophoneProcessingOptions;
  readonly label: string;
  readonly description: string;
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

export function MicrophonePanel() {
  const controller = useMemo(() => new MicrophoneCaptureController(), []);
  const [processing, setProcessing] = useState<MicrophoneProcessingOptions>(() =>
    getDefaultMicrophoneProcessingOptions(),
  );
  const [status, setStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [snapshot, setSnapshot] = useState<MicrophoneCaptureSnapshot | null>(null);
  const [error, setError] = useState<MicrophoneCaptureFailure | null>(null);

  useEffect(() => {
    return () => {
      void controller.stop();
    };
  }, [controller]);

  async function startMicrophoneCheck() {
    setStatus('requesting');
    setError(null);

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
      setStatus('active');
    } catch (captureError) {
      setSnapshot(null);
      setError(captureError as MicrophoneCaptureFailure);
      setStatus('error');
    }
  }

  async function stopMicrophoneCheck() {
    await controller.stop();
    setStatus('idle');
    setSnapshot(null);
  }

  return (
    <section className="microphone panel" aria-labelledby="microphone-title">
      <div className="section-heading">
        <p className="eyebrow">Microphone</p>
        <h2 id="microphone-title">Permission and capture check</h2>
        <p>
          Microphone access is requested only when you press start. The app asks for mono audio and
          reports the actual browser track settings because browsers may not honor every constraint.
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
