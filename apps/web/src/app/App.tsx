import { lazy, Suspense } from 'react';
import { AppShell } from './AppShell';
import { BenchmarkPanel } from './BenchmarkPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { MicrophonePanel } from './MicrophonePanel';
import { ModelRuntimePanel } from './ModelRuntimePanel';
import { OfflineModelPanel } from './OfflineModelPanel';
import { PersonalModelsPanel } from './PersonalModelsPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { VocabularyPanel } from './VocabularyPanel';
import { getBrowserHash, shouldRenderComponentGalleryRoute } from './component-gallery-route';
import { roadmap } from './milestones';

const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./ComponentGallery')) : null;

export function App() {
  const galleryRoute = shouldRenderComponentGalleryRoute(getBrowserHash(), import.meta.env.DEV);

  if (galleryRoute.shouldRender && ComponentGallery) {
    return (
      <Suspense fallback={<main className="app-shell">Loading component gallery</main>}>
        <ComponentGallery />
      </Suspense>
    );
  }

  return (
    <AppShell>
      <TranscriptPanel />
      <VocabularyPanel />
      <PersonalModelsPanel />
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
    </AppShell>
  );
}
