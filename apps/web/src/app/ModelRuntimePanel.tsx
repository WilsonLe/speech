import { useState } from 'react';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';

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
      const result = await checkAsrWorkerRuntime({ preferredProvider: 'wasm' });
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
          lightweight runtime check, but it does not import ORT or instantiate model sessions.
        </p>
      </div>

      <div className="runtime-actions">
        <button
          type="button"
          onClick={() => void handleCheckRuntime()}
          disabled={status.state === 'loading'}
        >
          {status.state === 'loading' ? 'Checking runtime…' : 'Check worker runtime'}
        </button>
        <RuntimeStatusMessage status={status} />
      </div>
    </section>
  );
}

function RuntimeStatusMessage({ status }: { readonly status: RuntimeStatus }) {
  if (status.state === 'idle') {
    return <p className="status-message">Worker runtime check has not run yet.</p>;
  }
  if (status.state === 'loading') {
    return <p className="status-message">Loading ONNX Runtime Web in a dedicated worker…</p>;
  }
  if (status.state === 'error') {
    return <p className="status-message error-message">{status.message}</p>;
  }
  return (
    <dl className="microphone-settings" aria-label="ONNX Runtime worker status">
      <div>
        <dt>Provider</dt>
        <dd>{status.provider ?? 'unknown'}</dd>
      </div>
      <div>
        <dt>WASM threads</dt>
        <dd>{status.wasmThreads ?? 'unknown'}</dd>
      </div>
    </dl>
  );
}
