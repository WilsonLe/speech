import { lazy, Suspense } from 'react';
import { AboutPanel } from './AboutPanel';
import { AppShell } from './AppShell';
import { useAppRoute } from './appRouteContext';
import { BenchmarkPanel } from './BenchmarkPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { MicrophonePanel } from './MicrophonePanel';
import { ModelRuntimePanel } from './ModelRuntimePanel';
import { OfflineModelPanel } from './OfflineModelPanel';
import { PersonalModelsPanel } from './PersonalModelsPanel';
import { SettingsPanel } from './SettingsPanel';
import { StoragePanel } from './StoragePanel';
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
      <RoutedAppContent />
    </AppShell>
  );
}

function RoutedAppContent() {
  const route = useAppRoute();

  if (
    route.routeId === 'settings-index' ||
    route.routeId === 'settings-privacy' ||
    route.routeId === 'settings-shortcuts'
  ) {
    return <SettingsPanel />;
  }

  if (route.routeId === 'settings-audio') {
    return <MicrophonePanel mode="settings-audio" />;
  }

  if (route.routeId === 'settings-storage') {
    return <StoragePanel />;
  }

  if (route.routeId === 'settings-diagnostics') {
    return (
      <>
        <DiagnosticsPanel />
        <BenchmarkPanel />
      </>
    );
  }

  if (route.routeId === 'about') {
    return <AboutPanel />;
  }

  return (
    <>
      <TranscriptPanel />
      <VocabularyPanel />
      <PersonalModelsPanel />
      <OfflineModelPanel />
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
    </>
  );
}
