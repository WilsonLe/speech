import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  IconButton,
  speechButtonSizes,
  speechButtonVariants,
  speechIconButtonVariants,
} from './index';
import {
  speechButtonAccessibilityChecklist,
  speechButtonActivationKeys,
  speechButtonCssRequirements,
  speechButtonPointerExpectations,
  speechButtonStateExamples,
  speechIconButtonAccessibilityChecklist,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const buttonCss = readFileSync(resolve(currentDir, 'button.css'), 'utf8');

function svgIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" />;
}

describe('Button primitive', () => {
  it('renders a native visible-label button with safe defaults', () => {
    const html = renderToStaticMarkup(<Button>Install model</Button>);

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
    expect(html).toContain('<span class="speech-button__label">Install model</span>');
    expect(html).not.toContain('aria-label=');
  });

  it('uses native disabled and busy semantics while keeping visible loading text', () => {
    const html = renderToStaticMarkup(
      <Button loading loadingLabel="Saving">
        Save
      </Button>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-loading="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-hidden="true" class="speech-button__spinner"');
    expect(html).toContain('<span class="speech-button__label">Saving</span>');
    expect(html).not.toContain('type="submit"');
  });

  it('supports destructive and secondary state variants without changing semantics', () => {
    const danger = renderToStaticMarkup(<Button variant="danger">Delete model</Button>);
    const secondary = renderToStaticMarkup(<Button variant="secondary">Keep draft</Button>);

    expect(danger).toContain('data-variant="danger"');
    expect(danger).toContain('Delete model');
    expect(secondary).toContain('data-variant="secondary"');
    expect(secondary).toContain('Keep draft');
  });
});

describe('IconButton primitive', () => {
  it('renders a native icon-only button with an accessible name and hidden glyph', () => {
    const html = renderToStaticMarkup(<IconButton label="Copy transcript">{svgIcon()}</IconButton>);

    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Copy transcript"');
    expect(html).toContain('type="button"');
    expect(html).toContain('class="speech-icon-button__glyph"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="tooltip"');
  });

  it('connects optional tooltip text with aria-describedby for non-obvious controls', () => {
    const html = renderToStaticMarkup(
      <IconButton
        label="Training details"
        tooltip="Show epoch, batch, and backend diagnostics."
        tooltipId="training-details-tip"
      >
        {svgIcon()}
      </IconButton>,
    );

    expect(html).toContain('aria-label="Training details"');
    expect(html).toContain('aria-describedby="training-details-tip"');
    expect(html).toContain('id="training-details-tip"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('Show epoch, batch, and backend diagnostics.');
  });

  it('supports disabled, loading, and destructive icon button states', () => {
    const html = renderToStaticMarkup(
      <IconButton disabled label="Delete model" loading variant="danger">
        {svgIcon()}
      </IconButton>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Delete model"');
    expect(html).toContain('data-variant="danger"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('class="speech-icon-button__spinner"');
  });
});

describe('button accessibility and interaction contracts', () => {
  it('keeps the primitive contract narrow and keyboard-native', () => {
    expect(speechButtonActivationKeys).toEqual(['Enter', 'Space']);
    expect(speechButtonStateExamples).toEqual([
      'default',
      'hover',
      'focus-visible',
      'disabled',
      'loading',
      'destructive',
      'forced-colours',
      'reduced-motion',
      'touch-target',
    ]);
    expect(speechButtonPointerExpectations).toContain(
      'Use native button semantics for click, pointer, Enter, and Space activation.',
    );
  });

  it('exports finite variant and size registries for examples and app fixtures', () => {
    expect(speechButtonVariants).toEqual(['primary', 'secondary', 'ghost', 'danger']);
    expect(speechIconButtonVariants).toEqual(['secondary', 'ghost', 'danger']);
    expect(speechButtonSizes).toEqual(['sm', 'md', 'lg']);
  });

  it('documents required accessibility checklist items', () => {
    expect(speechButtonAccessibilityChecklist).toContain(
      'Button renders a native <button> with a visible label.',
    );
    expect(speechIconButtonAccessibilityChecklist).toContain(
      'IconButton renders a native <button> with an aria-label.',
    );
  });

  it('uses semantic tokens for focus, touch target, motion, and forced colours', () => {
    for (const requiredToken of speechButtonCssRequirements) {
      expect(buttonCss).toContain(requiredToken);
    }

    expect(buttonCss).toContain('.speech-button:focus-visible');
    expect(buttonCss).toContain('.speech-icon-button:focus-visible');
    expect(buttonCss).toContain('min-block-size: var(--speech-size-touch-target)');
    expect(buttonCss).toContain('inline-size: var(--speech-size-icon-button)');
    expect(buttonCss).toContain('disabled');
    expect(buttonCss).toContain("[data-variant='danger']");
  });
});
