import {
  createDiagnosticsExport,
  createMissingDictatePerformanceParityReport,
  createMissingPersonalModelReleaseBenchmarkReport,
  serializeBenchmarkJson,
  type BenchmarkMetricName,
  type BenchmarkMetricSummary,
  type BenchmarkReportV1,
  type CustomTermBenchmarkScore,
} from '@speech/benchmark';
import { useMemo, useState } from 'react';
import {
  probeRuntimeCapabilities,
  runCapabilityWorkerBenchmark,
  type CapabilityReport,
} from '../capabilities';
import {
  runSyntheticBenchmarkInWorker,
  type BenchmarkProgress,
} from '../workers/benchmark-worker-client';

type BenchmarkStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'running'; readonly progress: BenchmarkProgress | null }
  | {
      readonly state: 'ready';
      readonly report: BenchmarkReportV1;
      readonly capabilityReport: CapabilityReport;
      readonly exportStatus?: string;
    }
  | { readonly state: 'error'; readonly message: string };

const featuredMetrics: readonly BenchmarkMetricName[] = [
  'firstPartialLatencyMs',
  'stableTokenLatencyMs',
  'finalizationLatencyMs',
  'realTimeFactor',
  'customTermRecall',
  'customTermFalseInsertionRate',
  'queueDepthFrames',
  'audioOverruns',
  'jsHeapUsedBytes',
];

const metricLabels: Record<BenchmarkMetricName, string> = {
  firstPartialLatencyMs: 'First partial latency',
  stableTokenLatencyMs: 'Stable token latency',
  finalizationLatencyMs: 'Finalization latency',
  encoderChunkMs: 'Encoder time per chunk',
  decoderChunkMs: 'Decoder time per chunk',
  realTimeFactor: 'Real-time factor',
  customTermRecall: 'Custom-term recall',
  customTermFalseInsertionRate: 'Custom-term false insertion rate',
  queueDepthFrames: 'Queue depth',
  audioOverruns: 'Audio overruns',
  jsHeapUsedBytes: 'JS heap used',
  modelSessionMemoryBytes: 'Model/session memory estimate',
};

export function BenchmarkPanel() {
  const [status, setStatus] = useState<BenchmarkStatus>({ state: 'idle' });
  const readyStatus = status.state === 'ready' ? status : null;
  const report = readyStatus?.report ?? null;
  const featuredSummaries = useMemo(
    () => (report ? summariesByName(report, featuredMetrics) : []),
    [report],
  );

  async function handleRunBenchmark() {
    setStatus({ state: 'running', progress: null });
    try {
      const capabilityReport = await probeRuntimeCapabilities(
        await runCapabilityWorkerBenchmark(7),
      );
      const benchmarkReport = await runSyntheticBenchmarkInWorker({
        chunkCount: 24,
        chunkDurationMs: 160,
        repetitions: 2,
        workScale: 2,
        provider: capabilityReport.recommendedProvider,
        wasmThreads: capabilityReport.capabilities.webAssemblyThreads
          ? navigator.hardwareConcurrency
          : 1,
        onProgress: (progress) => setStatus({ state: 'running', progress }),
      });
      setStatus({ state: 'ready', report: benchmarkReport, capabilityReport });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleDownloadDiagnostics() {
    if (!readyStatus) {
      return;
    }
    setStatus({
      state: 'ready',
      report: readyStatus.report,
      capabilityReport: readyStatus.capabilityReport,
      exportStatus: 'Preparing diagnostics bundle…',
    });
    try {
      const generatedAt = new Date().toISOString();
      const diagnostics = createDiagnosticsExport({
        generatedAt,
        benchmark: readyStatus.report,
        personalModelReleaseBenchmark: createMissingPersonalModelReleaseBenchmarkReport({
          generatedAt,
          warnings: [
            'The synthetic worker benchmark in this diagnostics bundle is not a declared reference-hardware v0.5.0 personal-model benchmark run.',
          ],
        }),
        dictatePerformanceParity: createMissingDictatePerformanceParityReport({
          generatedAt,
          warnings: [
            'The synthetic worker benchmark in this diagnostics bundle is not a declared reference-hardware v0.6.0 Dictate UI parity run.',
          ],
        }),
        capabilities: readyStatus.capabilityReport,
        notes: [
          'Generated locally in the browser.',
          'No audio, transcript text, telemetry, or remote upload is included.',
          'Synthetic benchmark results are informational until measured with real model packs on declared reference hardware.',
        ],
      });
      downloadJson(
        `speech-diagnostics-${diagnostics.generatedAt.replace(/[:.]/g, '-')}.json`,
        serializeBenchmarkJson(diagnostics),
      );
      setStatus({
        state: 'ready',
        report: readyStatus.report,
        capabilityReport: readyStatus.capabilityReport,
        exportStatus: 'Diagnostics bundle downloaded.',
      });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className="panel benchmark" id="benchmark" aria-labelledby="benchmark-title">
      <div className="section-heading">
        <p className="eyebrow">Benchmark</p>
        <h2 id="benchmark-title">Benchmark and diagnostics export</h2>
        <p>
          Run a repeatable synthetic benchmark in a dedicated worker and export local diagnostics as
          JSON. This page records timing, queue, memory, provider metadata, and privacy flags
          without capturing microphone audio or transcript content.
        </p>
      </div>

      <div className="benchmark-actions">
        <button
          type="button"
          onClick={() => void handleRunBenchmark()}
          disabled={status.state === 'running'}
        >
          {status.state === 'running' ? 'Running benchmark…' : 'Run synthetic benchmark'}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            if (report) {
              downloadJson(
                `speech-benchmark-${report.generatedAt.replace(/[:.]/g, '-')}.json`,
                serializeBenchmarkJson(report),
              );
            }
          }}
          disabled={!report || status.state === 'running'}
        >
          Download benchmark JSON
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void handleDownloadDiagnostics()}
          disabled={!report || status.state === 'running'}
        >
          Download diagnostics bundle
        </button>
      </div>

      <BenchmarkStatusMessage status={status} />

      {report ? (
        <>
          <dl className="benchmark-metadata" aria-label="Benchmark metadata">
            <div>
              <dt>Scenario</dt>
              <dd>{report.configuration.scenario}</dd>
            </div>
            <div>
              <dt>Audio represented</dt>
              <dd>{(report.configuration.syntheticAudioMs / 1_000).toFixed(2)} s synthetic</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{report.environment.provider ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>No audio, transcript, or network upload</dd>
            </div>
          </dl>

          {report.customTermEvaluation ? (
            <dl className="benchmark-metadata" aria-label="Custom-term benchmark results">
              <div>
                <dt>Custom-term suite</dt>
                <dd>{report.customTermEvaluation.caseCount} synthetic cases</dd>
              </div>
              <div>
                <dt>Custom-term recall</dt>
                <dd>{formatScore(report.customTermEvaluation.recall)}</dd>
              </div>
              <div>
                <dt>False insertions</dt>
                <dd>{formatScore(report.customTermEvaluation.falseInsertion)}</dd>
              </div>
              <div>
                <dt>Display replacements</dt>
                <dd>{report.customTermEvaluation.displayReplacementCount}</dd>
              </div>
            </dl>
          ) : null}

          <div className="benchmark-summary-grid" aria-label="Benchmark summary metrics">
            {featuredSummaries.map((summary) => (
              <article className="benchmark-metric" key={summary.name}>
                <span>{metricLabels[summary.name]}</span>
                <strong>{formatSummaryValue(summary)}</strong>
                <small>
                  median; p95 {formatMetricValue(summary.p95, summary.unit)} across {summary.count}{' '}
                  sample{summary.count === 1 ? '' : 's'}
                </small>
              </article>
            ))}
          </div>

          <article className="benchmark-note" aria-label="Benchmark warnings">
            <h3>Interpretation notes</h3>
            <ul>
              {report.configuration.notes.concat(report.warnings).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </article>
        </>
      ) : null}
    </section>
  );
}

function BenchmarkStatusMessage({ status }: { readonly status: BenchmarkStatus }) {
  if (status.state === 'idle') {
    return (
      <p className="status-message">
        Benchmark has not run yet. Run it after closing other heavy local workloads for more stable
        timing.
      </p>
    );
  }
  if (status.state === 'running') {
    const progress = status.progress;
    return (
      <p className="status-message" aria-live="polite">
        {progress
          ? `Processed ${progress.completedChunks} of ${progress.totalChunks} synthetic chunks…`
          : 'Starting benchmark worker…'}
      </p>
    );
  }
  if (status.state === 'error') {
    return <p className="status-message error-message">{status.message}</p>;
  }
  return (
    <p className="status-message" aria-live="polite">
      Benchmark complete. {status.exportStatus ?? 'Download JSON when you need to keep the report.'}
    </p>
  );
}

function summariesByName(
  report: BenchmarkReportV1,
  names: readonly BenchmarkMetricName[],
): readonly BenchmarkMetricSummary[] {
  const summaries = new Map(report.summaries.map((summary) => [summary.name, summary]));
  return names.flatMap((name) => {
    const summary = summaries.get(name);
    return summary === undefined ? [] : [summary];
  });
}

function formatSummaryValue(summary: BenchmarkMetricSummary): string {
  return formatMetricValue(summary.median, summary.unit);
}

function formatScore(score: CustomTermBenchmarkScore): string {
  const rate = score.rate === null ? 'n/a' : `${(score.rate * 100).toFixed(1)}%`;
  return `${score.numerator}/${score.denominator} (${rate})`;
}

function formatMetricValue(value: number, unit: BenchmarkMetricSummary['unit']): string {
  if (unit === 'bytes') {
    return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  }
  if (unit === 'ratio') {
    return value > 0 && value < 0.001 ? '<0.001' : value.toFixed(3);
  }
  if (unit === 'ms') {
    return `${value > 0 && value < 1 ? value.toFixed(3) : value.toFixed(2)} ms`;
  }
  if (unit === 'frames') {
    return `${value.toFixed(0)} frames`;
  }
  return value.toFixed(0);
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
