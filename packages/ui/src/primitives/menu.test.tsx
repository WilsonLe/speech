import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  MenuButton,
  Tooltip,
  getMenuKeyboardTargetIndex,
  speechMenuKeyboardKeys,
  speechMenuPlacements,
  speechTooltipPlacements,
} from './index';
import {
  speechMenuButtonAccessibilityChecklist,
  speechMenuCssRequirements,
  speechMenuFocusKeys,
  speechMenuUsageRules,
  speechTooltipAccessibilityChecklist,
  speechTooltipUsageRules,
} from '../testing/index';

const currentDir = dirname(fileURLToPath(import.meta.url));
const menuCss = readFileSync(resolve(currentDir, 'menu.css'), 'utf8');

const menuItems = [
  { id: 'rename', label: 'Rename' },
  { id: 'export-model', label: 'Export…', kind: 'link', href: '/models/demo/export' },
  { id: 'delete', label: 'Delete…', destructive: true },
] as const;

describe('MenuButton primitive', () => {
  it('renders a native menu trigger and an initially hidden role=menu action list', () => {
    const html = renderToStaticMarkup(
      <MenuButton
        buttonId="model-actions-button"
        items={menuItems}
        label="More"
        menuId="model-actions"
      />,
    );

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="model-actions"');
    expect(html).toContain('id="model-actions-button"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('<button');
    expect(html).toContain('href="/models/demo/export"');
    expect(html).toContain('data-destructive="true"');
    expect(html).not.toContain('role="submenu"');
  });

  it('supports an open menu with a custom menu label and disabled item semantics', () => {
    const html = renderToStaticMarkup(
      <MenuButton
        defaultOpen
        items={[
          { id: 'copy', label: 'Copy' },
          { id: 'blocked', label: 'Unavailable', disabled: true },
        ]}
        label="Transcript actions"
        menuLabel="Transcript actions menu"
        placement="bottom-start"
      />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Transcript actions menu"');
    expect(html).toContain('data-placement="bottom-start"');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('disabled=""');
  });

  it('sanitizes item identifiers before using them in DOM IDs', () => {
    const html = renderToStaticMarkup(
      <MenuButton
        defaultOpen
        items={[{ id: 'unsafe id segment / spaces', label: 'Compatibility' }]}
        label="More"
        menuId="actions-menu"
      />,
    );

    expect(html).toContain('actions-menu-item-0-unsafe-id-segment-spaces');
    expect(html).not.toContain('unsafe id segment / spaces');
  });

  it('exports finite placements and keyboard keys for examples and fixtures', () => {
    expect(speechMenuPlacements).toEqual(['bottom-start', 'bottom-end']);
    expect(speechMenuKeyboardKeys).toEqual(['ArrowDown', 'ArrowUp', 'Home', 'End']);
  });

  it('uses a deterministic keyboard focus helper that skips disabled menu items', () => {
    const disabledIndexes = [1];

    expect(getMenuKeyboardTargetIndex(-1, 'ArrowDown', 4, { disabledIndexes })).toBe(0);
    expect(getMenuKeyboardTargetIndex(0, 'ArrowDown', 4, { disabledIndexes })).toBe(2);
    expect(getMenuKeyboardTargetIndex(0, 'ArrowUp', 4, { disabledIndexes })).toBe(3);
    expect(getMenuKeyboardTargetIndex(2, 'Home', 4, { disabledIndexes })).toBe(0);
    expect(getMenuKeyboardTargetIndex(2, 'End', 4, { disabledIndexes })).toBe(3);
    expect(getMenuKeyboardTargetIndex(0, 'ArrowDown', 2, { disabledIndexes: [0, 1] })).toBe(-1);
  });
});

describe('Tooltip primitive', () => {
  it('connects plain supplemental text to a trigger with role=tooltip', () => {
    const html = renderToStaticMarkup(
      <Tooltip content="Shows local storage and offline status." id="local-status-tip">
        <button type="button">Local</button>
      </Tooltip>,
    );

    expect(html).toContain('aria-describedby="local-status-tip"');
    expect(html).toContain('id="local-status-tip"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('Shows local storage and offline status.');
    expect(html).not.toContain('<a');
  });

  it('preserves existing descriptions and can render an initially open tooltip for examples', () => {
    const html = renderToStaticMarkup(
      <Tooltip
        content="Copied text stays on this device."
        defaultOpen
        id="copy-tip"
        placement="bottom"
      >
        <button aria-describedby="existing-help" type="button">
          Copy
        </button>
      </Tooltip>,
    );

    expect(html).toContain('aria-describedby="existing-help copy-tip"');
    expect(html).toContain('data-placement="bottom"');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('Copied text stays on this device.');
  });

  it('can describe existing primitives without moving focus away from the trigger', () => {
    const html = renderToStaticMarkup(
      <Tooltip content="Deletes after a confirmation screen." id="delete-tip">
        <Button variant="danger">Delete…</Button>
      </Tooltip>,
    );

    expect(html).toContain('aria-describedby="delete-tip"');
    expect(html).toContain('Delete…');
    expect(html).toContain('Deletes after a confirmation screen.');
  });

  it('exports finite tooltip placements for examples and fixtures', () => {
    expect(speechTooltipPlacements).toEqual(['top', 'bottom', 'inline-start', 'inline-end']);
  });
});

describe('menu and tooltip accessibility contracts', () => {
  it('documents keyboard, disclosure, and usage limits', () => {
    expect(speechMenuButtonAccessibilityChecklist).toContain(
      'MenuButton trigger renders a native <button> with aria-haspopup="menu".',
    );
    expect(speechMenuButtonAccessibilityChecklist).toContain(
      'MenuButton supports ArrowDown, ArrowUp, Home, and End movement without nested submenus.',
    );
    expect(speechTooltipAccessibilityChecklist).toContain(
      'Tooltip opens on focus and pointer hover, dismisses on Escape, and keeps focus on the trigger.',
    );
    expect(speechMenuFocusKeys).toEqual(['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']);
    expect(speechMenuUsageRules).toContain(
      'Do not place forms, nested submenus, required privacy terms, blockers, or destructive consequences only in a menu.',
    );
    expect(speechTooltipUsageRules).toContain(
      'Do not put links, buttons, forms, required instructions, errors, privacy terms, or destructive consequences inside a tooltip.',
    );
  });

  it('uses semantic tokens for focus, touch target, motion, forced colours, popovers, and hidden state', () => {
    for (const requiredToken of speechMenuCssRequirements) {
      expect(menuCss).toContain(requiredToken);
    }

    expect(menuCss).toContain('.speech-menu-button__item-control:focus-visible');
    expect(menuCss).toContain('.speech-menu-button__menu[hidden]');
    expect(menuCss).toContain('.speech-tooltip__content[hidden]');
    expect(menuCss).toContain('min-block-size: var(--speech-size-touch-target)');
    expect(menuCss).toContain('pointer-events: none');
    expect(menuCss).toContain('prefers-reduced-motion: reduce');
    expect(menuCss).toContain('forced-colors: active');
  });
});
