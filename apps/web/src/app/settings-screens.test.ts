import { describe, expect, it } from 'vitest';
import { buildPrivacyScreenSummary, buildShortcutGroups } from './settings-screens';

describe('settings screen data models', () => {
  it('keeps the Privacy screen local-only and aggregate by construction', () => {
    const summary = buildPrivacyScreenSummary();

    expect(summary.statement).toBe(
      'Audio, transcripts, training, and personal models stay on this device.',
    );
    expect(summary.networkIsolation.privacy).toEqual({
      telemetryEnabled: false,
      remoteUploadConfigured: false,
      accountRequired: false,
    });
    expect(summary.controls.map((control) => control.kind)).toEqual([
      'export',
      'delete',
      'diagnostics',
      'docs',
    ]);
    expect(summary.controls.find((control) => control.kind === 'delete')).toMatchObject({
      href: '/settings/storage?focus=delete-all',
      description: expect.stringContaining('removed'),
    });
    expect(summary.visibleBoundaries.join(' ')).toContain('Support bundles stay redacted');
    expect(JSON.stringify(summary)).not.toMatch(/sha256|OPFS|profile-[A-Za-z0-9]|checkpoint\//i);
  });

  it('documents recording, navigation, overlay, and workflow shortcuts without hover-only requirements', () => {
    const groups = buildShortcutGroups();

    expect(groups.map((group) => group.title)).toEqual([
      'Recording',
      'Navigation',
      'Menus, dialogs, and disclosures',
      'Workflows',
    ]);
    expect(groups.flatMap((group) => group.shortcuts.flatMap((shortcut) => shortcut.keys))).toEqual(
      expect.arrayContaining(['Space', 'Tab', 'Shift', 'Escape', 'Arrow Down', 'Home', 'End']),
    );
    expect(groups.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.scope))).toEqual(
      expect.arrayContaining(['Dictate', 'App', 'Menu', 'Accordion', 'Workflow screen']),
    );
    expect(JSON.stringify(groups)).not.toMatch(/hover|tooltip-only/i);
  });
});
