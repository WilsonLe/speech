import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppRouteContext } from './appRouteContext';
import { MicrophonePanel } from './MicrophonePanel';
import { resolveAppRoute } from './routeState';
import { SettingsPanel } from './SettingsPanel';

function renderSettingsRoute(pathname: string): string {
  return renderToString(
    <AppRouteContext.Provider value={resolveAppRoute({ pathname })}>
      <SettingsPanel />
    </AppRouteContext.Provider>,
  );
}

function renderSettingsIndex(): string {
  return renderSettingsRoute('/settings');
}

describe('SettingsPanel', () => {
  it('renders a short settings index with implemented destinations and no long settings page', () => {
    const html = renderSettingsIndex();

    expect(html).toContain('id="settings-title"');
    expect(html).toContain('Settings sections');
    expect(html).toContain('Audio');
    expect(html).toContain('aria-label="Open Audio"');
    expect(html).toContain('href="/settings/audio"');
    expect(html).toContain('Appearance');
    expect(html).toContain('Uses your system appearance');
    expect(html).toContain('Storage');
    expect(html).toContain('href="/settings/storage"');
    expect(html).toContain('Privacy');
    expect(html).toContain('href="/settings/privacy"');
    expect(html).toContain('Keyboard shortcuts');
    expect(html).toContain('Diagnostics');
    expect(html).toContain('About');
    expect(html).not.toContain('Theme picker');
    expect(html).not.toContain('Cosmetic');
  });

  it('renders a concise Privacy screen with visible local-only controls and consequences', () => {
    const html = renderSettingsRoute('/settings/privacy');

    expect(html).toContain('id="privacy-title"');
    expect(html).toContain(
      'Audio, transcripts, training, and personal models stay on this device.',
    );
    expect(html).toContain('Export a voice model');
    expect(html).toContain('href="/models"');
    expect(html).toContain('Delete local speech data');
    expect(html).toContain('href="/settings/storage?focus=delete-all"');
    expect(html).toContain('Download support bundle');
    expect(html).toContain('Diagnostics downloads are redacted');
    expect(html).toContain('No telemetry configured');
    expect(html).toContain(
      'no accounts, analytics, sync, crash upload, or remote support endpoint',
    );
    expect(html).toContain('Support bundles stay redacted');
    expect(html).not.toMatch(/sha256|OPFS|profile-[A-Za-z0-9]|checkpoint\//i);
    expect(html).not.toContain('tooltip');
  });

  it('renders page-scoped keyboard shortcuts without hiding required instructions in tooltips', () => {
    const html = renderSettingsRoute('/settings/shortcuts');

    expect(html).toContain('id="shortcuts-title"');
    expect(html).toContain('Recording');
    expect(html).toContain('Hold to record on Dictate');
    expect(html).toContain('<kbd>Space</kbd>');
    expect(html).toContain('Navigation');
    expect(html).toContain('<kbd>Tab</kbd>');
    expect(html).toContain('Menus, dialogs, and disclosures');
    expect(html).toContain('<kbd>Escape</kbd>');
    expect(html).toContain('Workflows');
    expect(html).toContain('Train model');
    expect(html).not.toContain('hover only');
  });

  it('does not render on non-settings routes', () => {
    const html = renderToString(
      <AppRouteContext.Provider value={resolveAppRoute({ pathname: '/' })}>
        <SettingsPanel />
      </AppRouteContext.Provider>,
    );

    expect(html).toBe('');
  });
});

describe('Audio settings screen', () => {
  it('shows microphone, recording mode, input test, reset calibration, and advanced diagnostics', () => {
    const html = renderToString(<MicrophonePanel mode="settings-audio" />);

    expect(html).toContain('id="audio-settings-title"');
    expect(html).toContain('Microphone');
    expect(html).toContain('Browser audio processing');
    expect(html).toContain('Recording interaction mode');
    expect(html).toContain('Hold to speak');
    expect(html).toContain('Input test');
    expect(html).toContain('Start input test');
    expect(html).toContain('Reset calibration');
    expect(html).toContain('Advanced audio diagnostics');
    expect(html).toContain('Actual microphone settings');
    expect(html).toContain('Input level diagnostics');
    expect(html).not.toContain('Enrollment recorder');
    expect(html).not.toContain('Stored recordings');
    expect(html).not.toContain('Read this prompt');
  });
});
