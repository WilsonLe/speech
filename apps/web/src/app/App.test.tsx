import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the task-first application shell and existing workflow panels', () => {
    const html = renderToString(<App />);

    expect(html).toContain('Skip to main content');
    expect(html).toContain('aria-label="Primary destinations"');
    expect(html).toContain('href="#dictate"');
    expect(html).toContain('href="#vocabulary"');
    expect(html).toContain('href="#models"');
    expect(html).toContain('aria-label="Local status summary"');
    expect(html).not.toContain('Foundation actions');
    expect(html).not.toContain('Privacy baseline');

    expect(html).toContain('id="dictate"');
    expect(html).toContain('Focused push-to-talk dictation');
    expect(html).toContain('id="vocabulary"');
    expect(html).toContain('Local vocabulary sets');
    expect(html).toContain('id="models"');
    expect(html).toContain('Profile cards and local lifecycle');
    expect(html).toContain('Personal Models navigation');
    expect(html).toContain('Browser personal-model readiness');
    expect(html).toContain('Comparison gates and rollback');
    expect(html).toContain('Personal model profile cards');
    expect(html).toContain('Import behavior');
    expect(html).toContain('Dedupe existing profile');
    expect(html).toContain('Import as new profile');
    expect(html).toContain('Offline readiness and model lifecycle');
    expect(html).toContain('Browser capability report');
    expect(html).toContain('Benchmark and diagnostics export');
    expect(html).toContain('Permission and capture check');
    expect(html).toContain('Calibration and voice guidance');
    expect(html).toContain('Enrollment recorder and quality analyzer');
    expect(html).toContain('Durable profile storage');
    expect(html).toContain('Training readiness coverage will appear');
    expect(html).toContain('Dedicated worker ONNX Runtime loader');
    expect(html).toContain('Training progress');
    expect(html).toContain('Prepare worker');
    expect(html).toContain('Implementation roadmap');
    expect(html).toContain('Evidence-backed production claims');
    expect(html).toContain('evidence-needed');
  });
});
