import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppRouteContext } from './appRouteContext';
import { MicrophonePanel } from './MicrophonePanel';
import { resolveAppRoute } from './routeState';
import { SettingsPanel } from './SettingsPanel';

function renderSettingsIndex(): string {
  return renderToString(
    <AppRouteContext.Provider value={resolveAppRoute({ pathname: '/settings' })}>
      <SettingsPanel />
    </AppRouteContext.Provider>,
  );
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

  it('does not render on non-settings-index routes', () => {
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
