import { useEffect, useState } from 'react';
import {
  explainTier,
  probeRuntimeCapabilities,
  runCapabilityWorkerBenchmark,
} from '../capabilities';
import type { CapabilityReport } from '../capabilities';

function formatBytes(value?: number): string {
  if (typeof value !== 'number') {
    return 'unknown';
  }

  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

export function DiagnosticsPanel() {
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function runProbe() {
      try {
        const workerBenchmark = await runCapabilityWorkerBenchmark();
        const capabilityReport = await probeRuntimeCapabilities(workerBenchmark);
        if (!disposed) {
          setReport(capabilityReport);
        }
      } catch (probeError) {
        if (!disposed) {
          setError(probeError instanceof Error ? probeError.message : 'Capability probe failed.');
        }
      }
    }

    void runProbe();

    return () => {
      disposed = true;
    };
  }, []);

  return (
    <section className="diagnostics" id="diagnostics" aria-labelledby="diagnostics-title">
      <div className="section-heading">
        <p className="eyebrow">Runtime diagnostics</p>
        <h2 id="diagnostics-title">Browser capability report</h2>
        <p>
          Probes browser APIs directly instead of sniffing user-agent strings. The report is local
          and downloadable as JSON.
        </p>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {!report && !error ? <p aria-live="polite">Checking browser capabilities…</p> : null}

      {report ? (
        <div className="diagnostics-grid">
          <article className="panel diagnostics-summary">
            <h3>Selected execution tier</h3>
            <strong>{report.capabilities.selectedTier}</strong>
            <p>{explainTier(report.capabilities.selectedTier)}</p>
            <dl>
              <div>
                <dt>Recommended provider</dt>
                <dd>{report.recommendedProvider}</dd>
              </div>
              <div>
                <dt>Worker median round trip</dt>
                <dd>
                  {typeof report.workerBenchmark.medianRoundTripMs === 'number'
                    ? `${report.workerBenchmark.medianRoundTripMs.toFixed(2)} ms`
                    : 'unavailable'}
                </dd>
              </div>
              <div>
                <dt>Storage quota</dt>
                <dd>{formatBytes(report.storage.quotaBytes)}</dd>
              </div>
            </dl>
            <button type="button" onClick={() => downloadCapabilityReport(report)}>
              Download capability report
            </button>
          </article>

          <article className="panel">
            <h3>API probes</h3>
            <dl className="probe-list">
              {Object.entries(report.capabilities).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{typeof value === 'boolean' ? formatBoolean(value) : value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="panel warnings-panel">
            <h3>Warnings and recovery</h3>
            {report.warnings.length > 0 ? (
              <ul>
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>No capability warnings detected.</p>
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}

function downloadCapabilityReport(report: CapabilityReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `speech-capabilities-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
