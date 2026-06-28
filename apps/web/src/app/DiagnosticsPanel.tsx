import { useEffect, useMemo, useState } from 'react';
import { Accordion } from '@speech/ui';
import { probeRuntimeCapabilities, runCapabilityWorkerBenchmark } from '../capabilities';
import type { CapabilityReport } from '../capabilities';
import {
  createModelLifecycleWorker,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';
import {
  getTrainingDataStorageSummary,
  listEnrollmentProfiles,
} from '../workers/profile-store-client';
import {
  buildDiagnosticsScreenSummary,
  buildSupportBundlePayload,
  createEmptyModelDiagnosticsSummary,
  createEmptyProfileDiagnosticsSummary,
  createVocabularyDiagnosticsSummary,
  type DiagnosticsModelSummaryV1,
  type DiagnosticsProfileSummaryV1,
} from './diagnostics-screen';
import { loadVocabularyStore } from './vocabulary-storage';
import { getPwaLifecycleSnapshot, subscribePwaLifecycle } from './pwa-lifecycle';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';

const browserTrainingRecoveryStorageKey = 'speech:browser-training-recovery:v1';

export function DiagnosticsPanel() {
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelSummary, setModelSummary] = useState<DiagnosticsModelSummaryV1>(() =>
    createEmptyModelDiagnosticsSummary(),
  );
  const [profileSummary, setProfileSummary] = useState<DiagnosticsProfileSummaryV1>(() =>
    createEmptyProfileDiagnosticsSummary(),
  );
  const [pwa, setPwa] = useState<PwaLifecycleSnapshot>(() => getPwaLifecycleSnapshot());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => subscribePwaLifecycle(setPwa), []);

  useEffect(() => {
    let disposed = false;

    async function runProbe() {
      try {
        const workerBenchmark = await runCapabilityWorkerBenchmark();
        const capabilityReport = await probeRuntimeCapabilities(workerBenchmark);
        if (!disposed) {
          setReport(capabilityReport);
        }
      } catch {
        if (!disposed) {
          setError('Diagnostics need attention. Retry after the browser finishes loading.');
        }
      }
    }

    void runProbe();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const worker = createModelLifecycleWorker();
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'INIT' });

    function handleWorkerMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      if (message.type === 'READY') {
        setModelSummary({
          status: 'ready',
          installableModelCount: message.catalog.models.length,
          installedModelCount: message.installed.length,
          backendKind: message.backendKind,
        });
      } else if (message.type === 'ERROR') {
        setModelSummary((current) => ({ ...current, status: 'error' }));
      }
    }

    function handleWorkerError() {
      setModelSummary((current) => ({ ...current, status: 'error' }));
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadProfiles() {
      try {
        const [profiles, trainingStorage] = await Promise.all([
          listEnrollmentProfiles({ timeoutMs: 5000 }),
          getTrainingDataStorageSummary({ timeoutMs: 5000 }),
        ]);
        if (disposed) return;
        setProfileSummary({
          status: 'ready',
          profileCount: profiles.summaries.length,
          acceptedRecordingCount: profiles.summaries.reduce(
            (total, summary) => total + summary.utterances.length,
            0,
          ),
          trainingJobBytes: trainingStorage.summary.trainingJobBytes,
          browserTrainingRecoveryBytes: getBrowserTrainingRecoveryBytes(),
        });
      } catch {
        if (!disposed) {
          setProfileSummary((current) => ({ ...current, status: 'error' }));
        }
      }
    }

    void loadProfiles();

    return () => {
      disposed = true;
    };
  }, []);

  const vocabularySummary = useMemo(() => {
    if (typeof window === 'undefined') {
      return createVocabularyDiagnosticsSummary(null);
    }
    try {
      return createVocabularyDiagnosticsSummary(loadVocabularyStore(window.localStorage).snapshot);
    } catch {
      return createVocabularyDiagnosticsSummary(null);
    }
  }, []);

  const generatedAt = useMemo(() => report?.generatedAt ?? new Date().toISOString(), [report]);
  const diagnosticsSummary = useMemo(
    () =>
      buildDiagnosticsScreenSummary({
        generatedAt,
        capabilityReport: report,
        pwa,
        modelSummary,
        profileSummary,
        vocabularySummary,
        recentErrors: error === null ? [] : [error],
      }),
    [error, generatedAt, modelSummary, profileSummary, pwa, report, vocabularySummary],
  );
  const diagnosticsJson = useMemo(
    () => JSON.stringify(diagnosticsSummary, null, 2),
    [diagnosticsSummary],
  );
  const supportBundleJson = useMemo(
    () => JSON.stringify(buildSupportBundlePayload(diagnosticsSummary), null, 2),
    [diagnosticsSummary],
  );

  async function copyDiagnostics() {
    await navigator.clipboard.writeText(diagnosticsJson);
    setCopyStatus('Diagnostics copied.');
    window.setTimeout(() => setCopyStatus(null), 2500);
  }

  return (
    <section
      className="diagnostics diagnostics-screen"
      id="diagnostics"
      aria-labelledby="diagnostics-title"
    >
      <div className="section-heading">
        <p className="eyebrow">Support</p>
        <h2 id="diagnostics-title">Diagnostics</h2>
        <p>Dense local compatibility details. Open only when you need support data.</p>
      </div>

      {error ? (
        <p role="alert" className="status-message error-message">
          {error}
        </p>
      ) : null}
      {!report && !error ? <p aria-live="polite">Checking diagnostics…</p> : null}

      <div className="diagnostics-actions" aria-label="Diagnostics actions">
        <button type="button" onClick={() => void copyDiagnostics()}>
          Copy diagnostics
        </button>
        <button
          type="button"
          onClick={() =>
            downloadJson(
              `speech-diagnostics-${diagnosticsSummary.generatedAt.replace(/[:.]/g, '-')}.json`,
              supportBundleJson,
            )
          }
        >
          Download support bundle
        </button>
        {copyStatus ? <span role="status">{copyStatus}</span> : null}
      </div>

      <Accordion
        headingLevel={3}
        variant="card"
        allowMultiple
        defaultOpenIds={['browser-capabilities']}
        items={diagnosticsSummary.sections.map((section) => ({
          id: section.id,
          title: section.title,
          children: (
            <div className="diagnostics-section-body">
              <p>{section.summary}</p>
              <dl className="diagnostics-row-list">
                {section.rows.map((row) => (
                  <div key={`${section.id}-${row.label}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {section.notes && section.notes.length > 0 ? (
                <ul className="diagnostics-notes">
                  {section.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ),
        }))}
      />

      <p className="privacy-note">
        Diagnostics are local and aggregate-only. Support bundles exclude audio, transcript text,
        vocabulary terms, profile identifiers, model weights, and storage paths.
      </p>
    </section>
  );
}

function getBrowserTrainingRecoveryBytes(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return window.localStorage.getItem(browserTrainingRecoveryStorageKey)?.length ?? 0;
  } catch {
    return 0;
  }
}

function downloadJson(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
