import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  Dialog,
  getDialogTabTargetIndex,
  speechDialogKeyboardKeys,
  speechDialogSizes,
} from './index';
import {
  speechDialogAccessibilityChecklist,
  speechDialogCssRequirements,
  speechDialogFocusKeys,
  speechDialogUsageRules,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dialogCss = readFileSync(resolve(currentDir, 'dialog.css'), 'utf8');

describe('Dialog primitive', () => {
  it('renders a hidden modal dialog with persistent title and description semantics', () => {
    const html = renderToStaticMarkup(
      <Dialog
        description="This confirms the selected local action."
        descriptionId="confirm-description"
        labelId="confirm-title"
        open={false}
        title="Confirm action"
      >
        <p>Nothing is changed until you confirm.</p>
      </Dialog>,
    );

    expect(html).toContain('hidden=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="confirm-title"');
    expect(html).toContain('aria-describedby="confirm-description"');
    expect(html).toContain(
      '<h2 class="speech-dialog__title" id="confirm-title">Confirm action</h2>',
    );
    expect(html).toContain('This confirms the selected local action.');
  });

  it('supports open confirmations with explicit close and footer actions', () => {
    const html = renderToStaticMarkup(
      <Dialog
        closeLabel="Close"
        closeOnBackdrop={false}
        closeOnEscape={false}
        footer={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button variant="danger">Delete</Button>
          </>
        }
        open
        size="sm"
        title="Delete local data?"
      >
        <p>Deleting local data cannot be undone.</p>
      </Dialog>,
    );

    expect(html).not.toContain('hidden=""');
    expect(html).toContain('data-open="true"');
    expect(html).toContain('data-size="sm"');
    expect(html).toContain('data-close-on-escape="false"');
    expect(html).toContain('Close');
    expect(html).toContain('Delete local data?');
    expect(html).toContain('Deleting local data cannot be undone.');
    expect(html).toContain('data-variant="danger"');
  });

  it('exports finite sizes and keyboard contracts for examples and fixtures', () => {
    expect(speechDialogSizes).toEqual(['sm', 'md', 'lg']);
    expect(speechDialogKeyboardKeys).toEqual(['Escape', 'Tab', 'Shift+Tab']);
    expect(speechDialogFocusKeys).toEqual(['Tab', 'Shift+Tab', 'Escape']);
  });

  it('uses a deterministic focus-trap target helper', () => {
    expect(getDialogTabTargetIndex(-1, 'forward', 3)).toBe(0);
    expect(getDialogTabTargetIndex(-1, 'backward', 3)).toBe(2);
    expect(getDialogTabTargetIndex(0, 'forward', 3)).toBe(1);
    expect(getDialogTabTargetIndex(2, 'forward', 3)).toBe(0);
    expect(getDialogTabTargetIndex(0, 'backward', 3)).toBe(2);
    expect(getDialogTabTargetIndex(0, 'forward', 0)).toBe(-1);
  });
});

describe('dialog accessibility contracts', () => {
  it('documents modal focus, Escape, and usage limits', () => {
    expect(speechDialogAccessibilityChecklist).toContain(
      'Dialog renders role="dialog" with aria-modal="true" and a persistent visible title.',
    );
    expect(speechDialogAccessibilityChecklist).toContain(
      'Dialog traps Tab and Shift+Tab focus while open and restores focus on close.',
    );
    expect(speechDialogUsageRules).toContain(
      'Do not put a multi-step wizard, long form, or broad management task inside a dialog.',
    );
    expect(speechDialogUsageRules).toContain(
      'Destructive dialogs must visibly name the object and consequence before the confirming action.',
    );
  });

  it('uses semantic tokens for focus, dialog surfaces, viewport-safe layout, motion, and forced colours', () => {
    for (const requiredToken of speechDialogCssRequirements) {
      expect(dialogCss).toContain(requiredToken);
    }

    expect(dialogCss).toContain('.speech-dialog[hidden]');
    expect(dialogCss).toContain('.speech-dialog__panel:focus-visible');
    expect(dialogCss).toContain('max-block-size: min(42rem, calc(100dvh');
    expect(dialogCss).toContain('prefers-reduced-motion: reduce');
    expect(dialogCss).toContain('forced-colors: active');
  });
});
