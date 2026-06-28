import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

describe('App', () => {
  it('renders the task-first application shell and existing workflow panels', () => {
    const html = renderToString(<App />);

    expect(html).toContain('Skip to main content');
    expect(html).toContain('aria-label="Primary destinations"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/vocabulary"');
    expect(html).toContain('href="/models"');
    expect(html).toMatch(/Local status: (check|offline|ready|setup|update)\./i);
    expect(html).toContain('Local status details');
    expect(html).toContain('Model downloads');
    expect(html).toContain('Audio, vocabulary, and personal models stay in this browser.');
    expect(html).toContain('Application menu');
    expect(html).toContain('Settings');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('Storage');
    expect(html).toContain('href="/settings/storage"');
    expect(html).toContain('Privacy');
    expect(html).toContain('href="/settings/privacy"');
    expect(html).toContain('Keyboard shortcuts');
    expect(html).toContain('href="/settings/shortcuts"');
    expect(html).toContain('Diagnostics');
    expect(html).toContain('href="/settings/diagnostics"');
    expect(html).toContain('About');
    expect(html).toContain('href="/about"');
    const shellOnlyMarkup = html.slice(0, html.indexOf('id="dictate"'));
    expect(shellOnlyMarkup).not.toMatch(/sha256|WebGPU|WASM|OPFS|provider/i);
    expect(html).not.toContain('Foundation actions');
    expect(html).not.toContain('Privacy baseline');

    expect(html).toContain('id="dictate"');
    expect(html).toContain('Dictate');
    expect(html).toContain('Checking speech model');
    expect(html).toContain('Checking download size');
    expect(html).toContain('Model details');
    expect(html).not.toContain('Hold to speak');
    expect(html).not.toContain('Dictation details');
    expect(html).not.toContain('Download .txt');
    expect(html).not.toContain('Clear transcript');
    expect(html).toContain('id="vocabulary"');
    expect(html).toContain('Vocabulary sets');
    expect(html).toContain('New set');
    expect(html).toContain('Import and export');
    expect(html).toContain('id="models"');
    expect(html).toContain('Voice models');
    expect(html).toContain('Personal Models navigation');
    expect(html).toContain('Model detail');
    expect(html).toContain('Recording coverage');
    expect(html).toContain('Quality results');
    expect(html).toContain('Compatibility');
    expect(html).toContain('Storage');
    expect(html).toContain('Technical details');
    expect(html).toContain('Candidate result');
    expect(html).toContain('Results');
    expect(html).toContain('Required checks');
    expect(html).toContain('Advisory checks');
    expect(html).toContain('Personal voice model rows');
    expect(html).toContain('href="/models/import"');
    expect(html).not.toContain('Model import options');
    expect(html).not.toContain('Dedupe');
    expect(html).not.toContain('Import as new');
    expect(html).toContain('Offline and updates');
    expect(html).toContain('Offline is normal after app files and the speech model are installed.');
    expect(html).toContain('Model lifecycle details');
    expect(html).not.toContain('Browser capability report');
    expect(html).not.toContain('Benchmark and diagnostics export');
    expect(html).toContain('Permission and capture check');
    expect(html).toContain('Enrollment recorder');
    expect(html).toContain('Read this prompt');
    expect(html).toContain('Recording details');
    expect(html).toContain('Recording setup');
    expect(html).toContain('Stored recordings');
    expect(html).toContain('Training readiness coverage will appear');
    expect(html).toContain('Dedicated worker ONNX Runtime loader');
    expect(html).toContain('Training progress');
    expect(html).toContain('Preparing');
    expect(html).toContain('Training details');
    expect(html).toContain('local fixed adapter math in a worker');
    expect(html).not.toContain('Prepare worker');
    expect(html).toContain('Implementation roadmap');
    expect(html).toContain('Evidence-backed production claims');
    expect(html).toContain('evidence-needed');
  });

  it('keeps Local status tone styles attached to the button implementation', () => {
    expect(globalCss).toContain(
      ".app-local-status[data-tone='ready'] .app-local-status__button strong",
    );
    expect(globalCss).not.toContain(".app-local-status[data-tone='ready'] summary strong");
  });
});
