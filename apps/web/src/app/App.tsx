import { RUNTIME_STATES } from '@speech/protocol';
import { BenchmarkPanel } from './BenchmarkPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { MicrophonePanel } from './MicrophonePanel';
import { ModelRuntimePanel } from './ModelRuntimePanel';
import { OfflineModelPanel } from './OfflineModelPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { roadmap } from './milestones';

const privacyPoints = [
  'Audio and transcripts remain local unless you explicitly export them.',
  'Model downloads and app updates are lifecycle events, not live transcription telemetry.',
  'Voice enrollment data is treated as sensitive personal data.',
];

export function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">wilsonle/speech</p>
        <h1 id="hero-title">Local-first bilingual dictation</h1>
        <p className="hero-copy">
          Installable Vietnamese/English streaming speech-to-text PWA with on-device inference,
          low-flicker partials, private vocabulary steering, and guided voice personalization.
        </p>
        <div className="hero-actions" aria-label="Foundation actions">
          <a className="button" href="#offline-model-title">
            Manage offline model
          </a>
          <a className="button secondary" href="#diagnostics">
            View diagnostics
          </a>
          <a className="button secondary" href="#benchmark">
            Run benchmark
          </a>
        </div>
      </section>

      <section className="panel-grid" aria-label="Project baseline">
        <article className="panel">
          <h2>Runtime contract</h2>
          <p>
            The first implementation stage keeps the UI separate from worker-owned audio, model,
            decoder, and profile state.
          </p>
          <p className="state-count">{RUNTIME_STATES.length} state-machine states defined</p>
        </article>

        <article className="panel">
          <h2>Privacy baseline</h2>
          <ul>
            {privacyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      </section>

      <TranscriptPanel />
      <OfflineModelPanel />
      <DiagnosticsPanel />
      <BenchmarkPanel />
      <MicrophonePanel />
      <ModelRuntimePanel />

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">Implementation roadmap</h2>
        <div className="roadmap-list">
          {roadmap.map((item) => (
            <article className="roadmap-card" key={item.label}>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
              <span data-status={item.status}>{item.status}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
