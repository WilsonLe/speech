import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Accordion,
  Disclosure,
  getAccordionKeyboardTargetIndex,
  speechAccordionHeadingLevels,
  speechAccordionKeyboardKeys,
  speechAccordionVariants,
  speechDisclosureVariants,
} from './index';
import {
  speechAccordionAccessibilityChecklist,
  speechAccordionFocusKeys,
  speechDisclosureAccessibilityChecklist,
  speechDisclosureCssRequirements,
  speechDisclosureUsageRules,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const disclosureCss = readFileSync(resolve(currentDir, 'disclosure.css'), 'utf8');

const accordionItems = [
  {
    id: 'coverage',
    title: 'Recording coverage',
    children: <p>Language, condition, and prompt coverage.</p>,
  },
  {
    id: 'quality',
    title: 'Quality results',
    children: <p>Personal, vocabulary, and general speech checks.</p>,
  },
  {
    id: 'storage',
    title: 'Storage',
    children: <button type="button">Delete training data</button>,
  },
] as const;

describe('Disclosure primitive', () => {
  it('renders native details and summary semantics with stable panel association', () => {
    const html = renderToStaticMarkup(
      <Disclosure
        panelId="recording-details-panel"
        summaryId="recording-details-summary"
        title="Recording details"
      >
        <p>SNR, clipping, and VAD details.</p>
      </Disclosure>,
    );

    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="recording-details-panel"');
    expect(html).toContain('id="recording-details-summary"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="recording-details-summary"');
    expect(html).toContain('SNR, clipping, and VAD details.');
  });

  it('supports open state without requiring app code to manage ARIA manually', () => {
    const html = renderToStaticMarkup(
      <Disclosure defaultOpen title="Training details" variant="card">
        <p>Epoch, batch, loss, backend, and checkpoint data.</p>
      </Disclosure>,
    );

    expect(html).toContain('<details class="speech-disclosure" data-variant="card" open=""');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Training details');
  });

  it('exports finite disclosure variants for examples and fixtures', () => {
    expect(speechDisclosureVariants).toEqual(['plain', 'card']);
  });
});

describe('Accordion primitive', () => {
  it('renders one labelled heading button per panel and hides collapsed panel content', () => {
    const html = renderToStaticMarkup(
      <Accordion defaultOpenIds={['coverage']} headingLevel={2} items={accordionItems} />,
    );

    expect(html).toContain('<h2 class="speech-accordion__heading"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('role="region"');
    expect(html).toContain('Recording coverage');
    expect(html).toContain('Quality results');
    expect(html).toContain('hidden=""');
    expect(html).toContain('<button type="button">Delete training data</button>');
  });

  it('supports single-open accordion groups for dense detail screens', () => {
    const html = renderToStaticMarkup(
      <Accordion
        allowMultiple={false}
        defaultOpenIds={['coverage', 'quality']}
        items={accordionItems}
      />,
    );

    const expandedMatches = html.match(/aria-expanded="true"/g) ?? [];

    expect(expandedMatches).toHaveLength(1);
    expect(html).toContain('Recording coverage');
    expect(html).toContain('Quality results');
  });

  it('sanitizes item identifiers before using them in DOM IDs', () => {
    const html = renderToStaticMarkup(
      <Accordion
        defaultOpenIds={['unsafe id segment / spaces']}
        items={[
          {
            id: 'unsafe id segment / spaces',
            title: 'Compatibility',
            children: <p>Base model and tokenizer requirements.</p>,
          },
        ]}
      />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('unsafe-id-segment-spaces-panel');
    expect(html).not.toContain('unsafe id segment / spaces-panel');
  });

  it('exports finite variants, heading levels, and keyboard keys', () => {
    expect(speechAccordionVariants).toEqual(['plain', 'card']);
    expect(speechAccordionHeadingLevels).toEqual([2, 3, 4, 5, 6]);
    expect(speechAccordionKeyboardKeys).toEqual(['ArrowDown', 'ArrowUp', 'Home', 'End']);
  });

  it('uses a deterministic keyboard focus helper for Arrow, Home, and End keys', () => {
    expect(getAccordionKeyboardTargetIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(getAccordionKeyboardTargetIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(getAccordionKeyboardTargetIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(getAccordionKeyboardTargetIndex(1, 'Home', 3)).toBe(0);
    expect(getAccordionKeyboardTargetIndex(1, 'End', 3)).toBe(2);
    expect(getAccordionKeyboardTargetIndex(1, 'End', 0)).toBe(-1);
  });
});

describe('disclosure and accordion accessibility contracts', () => {
  it('documents required accessibility checklist items and usage limits', () => {
    expect(speechDisclosureAccessibilityChecklist).toContain(
      'Disclosure renders a native <details> with a <summary> trigger.',
    );
    expect(speechAccordionAccessibilityChecklist).toContain(
      'Collapsed accordion panels use hidden so their contents are not focusable.',
    );
    expect(speechAccordionFocusKeys).toEqual(['ArrowDown', 'ArrowUp', 'Home', 'End']);
    expect(speechDisclosureUsageRules).toContain(
      'Do not nest Accordion patterns or place long forms inside accordion panels.',
    );
    expect(speechDisclosureUsageRules).toContain(
      'Keep required blockers, required fields, destructive consequences, and privacy consent visible outside collapsed content.',
    );
  });

  it('uses semantic tokens for focus, touch target, motion, forced colours, and hidden panels', () => {
    for (const requiredToken of speechDisclosureCssRequirements) {
      expect(disclosureCss).toContain(requiredToken);
    }

    expect(disclosureCss).toContain('.speech-disclosure__summary:focus-visible');
    expect(disclosureCss).toContain('.speech-accordion__button:focus-visible');
    expect(disclosureCss).toContain('min-block-size: var(--speech-size-touch-target)');
    expect(disclosureCss).toContain('.speech-accordion__panel[hidden]');
    expect(disclosureCss).toContain('prefers-reduced-motion: reduce');
    expect(disclosureCss).toContain('forced-colors: active');
  });
});
