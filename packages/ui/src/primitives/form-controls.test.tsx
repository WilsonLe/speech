import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RadioGroup,
  Select,
  speechFieldSizes,
  speechRadioGroupKeyboardKeys,
  speechRadioGroupOrientations,
  speechSelectKeyboardKeys,
} from './index';
import {
  speechFormControlAccessibilityChecklist,
  speechFormControlCssRequirements,
  speechFormControlFocusKeys,
  speechFormControlUsageRules,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const formCss = readFileSync(resolve(currentDir, 'form-controls.css'), 'utf8');

const languageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'mixed', label: 'Mixed', disabled: true },
] as const;

const recordingPlanOptions = [
  { value: 'quick', label: 'Quick', description: 'Fewer prompts for a first draft.' },
  { value: 'recommended', label: 'Recommended', description: 'Balanced coverage for normal use.' },
  { value: 'extended', label: 'Extended', description: 'More prompts for varied speech.' },
] as const;

describe('Select primitive', () => {
  it('renders a native select with a persistent visible label, hint, and invalid state', () => {
    const html = renderToStaticMarkup(
      <Select
        error="Choose a language before recording."
        hint="Applies next recording."
        label="Language"
        options={languageOptions}
        selectId="language-mode"
        value="auto"
      />,
    );

    expect(html).toContain(
      '<label class="speech-field__label" for="language-mode">Language</label>',
    );
    expect(html).toContain('<select');
    expect(html).toContain('id="language-mode"');
    expect(html).toContain('aria-describedby="language-mode-hint language-mode-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Choose a language before recording.');
    expect(html).toContain('<option value="vi">Tiếng Việt</option>');
    expect(html).toContain('<option disabled="" value="mixed">Mixed</option>');
  });

  it('merges existing descriptions and supports finite field sizes', () => {
    const html = renderToStaticMarkup(
      <Select
        aria-describedby="existing-help"
        controlSize="lg"
        hint="Used for the next utterance."
        label="Voice model"
        options={[{ value: 'generic', label: 'Generic' }]}
        selectId="voice-model"
      />,
    );

    expect(html).toContain('data-size="lg"');
    expect(html).toContain('aria-describedby="existing-help voice-model-hint"');
    expect(speechFieldSizes).toEqual(['sm', 'md', 'lg']);
    expect(speechSelectKeyboardKeys).toEqual(['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
  });
});

describe('RadioGroup primitive', () => {
  it('renders a native fieldset and legend with labelled radio choices', () => {
    const html = renderToStaticMarkup(
      <RadioGroup
        defaultValue="recommended"
        hint="You can record more later."
        label="Recording plan"
        name="recording-plan"
        options={recordingPlanOptions}
      />,
    );

    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend class="speech-field__label">Recording plan</legend>');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('name="recording-plan"');
    expect(html).toContain('type="radio"');
    expect(html).toContain('checked=""');
    expect(html).toContain('Fewer prompts for a first draft.');
    expect(html).toContain('Balanced coverage for normal use.');
  });

  it('supports controlled horizontal choices and error descriptions', () => {
    const html = renderToStaticMarkup(
      <RadioGroup
        error="Choose speech to learn."
        label="Which speech should it learn?"
        options={[
          { value: 'vi', label: 'Vietnamese' },
          { value: 'en', label: 'English' },
          { value: 'both', label: 'Both', disabled: true },
        ]}
        orientation="horizontal"
        value="vi"
      />,
    );

    expect(html).toContain('data-orientation="horizontal"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Choose speech to learn.');
    expect(html).toContain('checked=""');
    expect(html).toContain('disabled=""');
    expect(speechRadioGroupOrientations).toEqual(['vertical', 'horizontal']);
    expect(speechRadioGroupKeyboardKeys).toEqual([
      'Tab',
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
      'Space',
    ]);
  });

  it('sanitizes radio values before using them in DOM IDs', () => {
    const html = renderToStaticMarkup(
      <RadioGroup
        id="choice"
        label="Choice"
        options={[{ value: 'unsafe value / spaces', label: 'Safe label' }]}
      />,
    );

    expect(html).toContain('id="choice-option-0-unsafe-value-spaces"');
    expect(html).toContain('value="unsafe value / spaces"');
    expect(html).not.toContain('id="choice-option-0-unsafe value / spaces"');
  });
});

describe('form-control accessibility contracts', () => {
  it('documents native labels, invalid state, keyboard, and usage limits', () => {
    expect(speechFormControlAccessibilityChecklist).toContain(
      'Select renders a native <select> with a persistent visible <label>.',
    );
    expect(speechFormControlAccessibilityChecklist).toContain(
      'RadioGroup renders a native <fieldset> and <legend> with native radio inputs.',
    );
    expect(speechFormControlFocusKeys).toEqual([
      'Tab',
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
      'Space',
    ]);
    expect(speechFormControlUsageRules).toContain(
      'Every Select and RadioGroup must have a visible persistent label; placeholders are not labels.',
    );
  });

  it('uses semantic tokens for touch target, focus, invalid, motion, and forced-colours states', () => {
    for (const requiredToken of speechFormControlCssRequirements) {
      expect(formCss).toContain(requiredToken);
    }

    expect(formCss).toContain('.speech-select-field__control:focus-visible');
    expect(formCss).toContain('.speech-radio-group__input:focus-visible');
    expect(formCss).toContain('min-block-size: var(--speech-size-touch-target)');
    expect(formCss).toContain("[aria-invalid='true']");
    expect(formCss).toContain('prefers-reduced-motion: reduce');
    expect(formCss).toContain('forced-colors: active');
  });
});
