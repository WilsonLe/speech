import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../primitives/Button';
import {
  EmptyState,
  InlineError,
  LoadingState,
  Notice,
  Progress,
  Status,
  Toast,
  getFeedbackDefaultLiveMode,
  getFeedbackDefaultRole,
  getProgressPercentage,
  speechFeedbackTones,
  speechLiveRegionModes,
  speechProgressSizes,
  speechStatusVariants,
} from './index';
import {
  speechFeedbackAccessibilityChecklist,
  speechFeedbackCssRequirements,
  speechFeedbackLiveRegionExamples,
  speechFeedbackUsageRules,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const feedbackCss = readFileSync(resolve(currentDir, 'index.css'), 'utf8');

describe('InlineError primitive', () => {
  it('renders visible field recovery text as an assertive alert by default', () => {
    const html = renderToStaticMarkup(
      <InlineError id="language-error">Choose a language before recording.</InlineError>,
    );

    expect(html).toContain('class="speech-inline-error"');
    expect(html).toContain('id="language-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('Choose a language before recording.');
  });
});

describe('Notice primitive', () => {
  it('renders a visible labelled page-level blocker with actions', () => {
    const html = renderToStaticMarkup(
      <Notice actions={<Button>Install model</Button>} title="Speech model required" tone="danger">
        Works offline after install.
      </Notice>,
    );

    expect(html).toContain('class="speech-notice"');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('Speech model required');
    expect(html).toContain('Works offline after install.');
    expect(html).toContain('Install model');
  });

  it('documents deterministic role/live defaults for tones', () => {
    expect(speechFeedbackTones).toEqual(['info', 'success', 'warning', 'danger']);
    expect(speechLiveRegionModes).toEqual(['off', 'polite', 'assertive']);
    expect(getFeedbackDefaultRole('warning')).toBe('alert');
    expect(getFeedbackDefaultLiveMode('success')).toBe('polite');
  });
});

describe('Toast primitive', () => {
  it('renders transient noncritical confirmation as a polite status', () => {
    const html = renderToStaticMarkup(
      <Toast action={<Button size="sm">Undo</Button>} title="Copied" tone="success">
        Transcript copied.
      </Toast>,
    );

    expect(html).toContain('class="speech-toast"');
    expect(html).toContain('data-tone="success"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Copied');
    expect(html).toContain('Transcript copied.');
    expect(html).toContain('Undo');
  });

  it('supports an optional dismiss action without making required recovery toast-only', () => {
    const html = renderToStaticMarkup(
      <Toast dismissLabel="Close" onDismiss={() => undefined} title="Saved">
        Changes saved.
      </Toast>,
    );

    expect(html).toContain('Close');
    expect(speechFeedbackUsageRules).toContain(
      'Use Notice, not Toast, for blockers, destructive consequences, privacy consequences, import failures, and training failures.',
    );
  });
});

describe('EmptyState and LoadingState primitives', () => {
  it('renders a labelled empty section with visible actions', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        actions={<Button>New set</Button>}
        description="Add terms the recognizer should favour."
        title="No vocabulary sets"
      />,
    );

    expect(html).toContain('class="speech-empty-state"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('No vocabulary sets');
    expect(html).toContain('Add terms the recognizer should favour.');
    expect(html).toContain('New set');
  });

  it('renders a labelled busy status with a text progress equivalent', () => {
    const html = renderToStaticMarkup(
      <LoadingState
        description="Verification runs locally."
        label="Verifying model"
        progressValue={3}
        progressMax={4}
      />,
    );

    expect(html).toContain('class="speech-loading-state"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Verifying model');
    expect(html).toContain('Verification runs locally.');
    expect(html).toContain('<progress');
    expect(html).toContain('75%');
  });
});

describe('Progress and Status primitives', () => {
  it('renders a native determinate progress element with visible label and value text', () => {
    const html = renderToStaticMarkup(
      <Progress
        description="Progress is saved on this device."
        label="Training voice model"
        max={200}
        progressId="training-progress"
        value={128}
      />,
    );

    expect(html).toContain('<progress');
    expect(html).toContain('id="training-progress"');
    expect(html).toContain('max="200"');
    expect(html).toContain('value="128"');
    expect(html).toContain('Training voice model');
    expect(html).toContain('64%');
    expect(html).toContain('Progress is saved on this device.');
    expect(getProgressPercentage(128, 200)).toBe(64);
  });

  it('renders an indeterminate progress text equivalent when no value is supplied', () => {
    const html = renderToStaticMarkup(
      <Progress label="Preparing" progressId="preparing-progress" />,
    );

    expect(html).toContain('<progress');
    expect(html).toContain('In progress');
    expect(html).not.toContain('value=');
    expect(getProgressPercentage(Number.NaN, 100)).toBeUndefined();
    expect(speechProgressSizes).toEqual(['sm', 'md', 'lg']);
  });

  it('renders compact status text without relying on colour alone', () => {
    const html = renderToStaticMarkup(
      <Status live="polite" tone="warning" variant="subtle">
        Needs recording
      </Status>,
    );

    expect(html).toContain('class="speech-status"');
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain('data-variant="subtle"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Needs recording');
    expect(speechStatusVariants).toEqual(['subtle', 'solid']);
  });
});

describe('feedback accessibility contracts', () => {
  it('documents live region, progress, hidden-content, and non-toast-only requirements', () => {
    expect(speechFeedbackAccessibilityChecklist).toContain(
      'Progress renders a native <progress> element with a visible label and text equivalent.',
    );
    expect(speechFeedbackUsageRules).toContain(
      'Every Progress and LoadingState instance must expose a text equivalent; never show an indefinite spinner without a state label.',
    );
    expect(speechFeedbackLiveRegionExamples).toEqual([
      'polite transient confirmation',
      'assertive blocking notice',
      'off decorative status chip',
    ]);
  });

  it('uses semantic tokens for feedback, progress, reduced motion, forced colours, and hidden content', () => {
    for (const requiredToken of speechFeedbackCssRequirements) {
      expect(feedbackCss).toContain(requiredToken);
    }

    expect(feedbackCss).toContain('.speech-loading-state[aria-busy');
    expect(feedbackCss).toContain('.speech-progress__bar');
    expect(feedbackCss).toContain('.speech-toast[hidden]');
    expect(feedbackCss).toContain('prefers-reduced-motion: reduce');
    expect(feedbackCss).toContain('forced-colors: active');
  });
});
