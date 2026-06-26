import { describe, expect, it } from 'vitest';

import {
  addDismissedHint,
  createDefaultUiPreferences,
  dismissedHintRegistry,
  legacyUiPreferenceKeys,
  loadUiPreferences,
  parseUiPreferencesV1,
  removeDismissedHint,
  resetUiPreferences,
  saveUiPreferences,
  uiPreferencesStorageKey,
  updateUiPreferences,
  type UiPreferencesV1,
} from './uiPreferences';

describe('UiPreferencesV1', () => {
  it('defaults every UI-only preference field', () => {
    expect(createDefaultUiPreferences()).toEqual({
      schemaVersion: 1,
      onboardingRevision: 1,
      transcriptTextScale: 'default',
      reducedMotion: 'system',
      dismissedHintIds: [],
      lastPrimaryDestination: 'dictate',
    });
  });

  it('parses valid preferences and repairs invalid values without throwing', () => {
    const valid = parseUiPreferencesV1({
      schemaVersion: 1,
      onboardingRevision: 3,
      transcriptTextScale: 'large',
      reducedMotion: 'reduce',
      dismissedHintIds: ['models-local-only', 'models-local-only', 'not-registered'],
      lastPrimaryDestination: 'models',
      rawProfileId: 'profile-wilson',
    });

    expect(valid.status).toBe('repaired');
    expect(valid.preferences).toMatchObject({
      onboardingRevision: 3,
      transcriptTextScale: 'large',
      reducedMotion: 'reduce',
      lastPrimaryDestination: 'models',
    });
    expect(valid.preferences.dismissedHintIds).toEqual(['models-local-only']);
    expect(JSON.stringify(valid.preferences)).not.toContain('profile-wilson');

    const repaired = parseUiPreferencesV1({ schemaVersion: 2, dismissedHintIds: 'bad' });
    expect(repaired.status).toBe('repaired');
    expect(repaired.preferences).toEqual(createDefaultUiPreferences());
    expect(repaired.errors).toContain('schemaVersion must be 1.');
  });

  it('caps dismissed hint ids to the finite registry and keeps helper updates idempotent', () => {
    const parsed = parseUiPreferencesV1({
      ...createDefaultUiPreferences(),
      dismissedHintIds: [
        ...dismissedHintRegistry,
        ...dismissedHintRegistry,
        'external-profile-hint',
      ],
    });

    expect(parsed.preferences.dismissedHintIds).toEqual([...dismissedHintRegistry]);
    expect(parsed.preferences.dismissedHintIds).toHaveLength(dismissedHintRegistry.length);

    const added = addDismissedHint(createDefaultUiPreferences(), 'dictate-space-shortcut');
    expect(addDismissedHint(added, 'dictate-space-shortcut')).toBe(added);
    expect(removeDismissedHint(added, 'dictate-space-shortcut').dismissedHintIds).toEqual([]);
  });

  it('stores preferences under an independent namespace and leaves domain data untouched on reset', () => {
    const storage = new MemoryStorage();
    storage.setItem('speech:vocabulary-store:v1', '{"domain":true}');
    storage.setItem('speech:profile-store:v1', '{"domain":true}');
    const preferences = updateUiPreferences(createDefaultUiPreferences(), {
      transcriptTextScale: 'large',
      reducedMotion: 'full',
      lastPrimaryDestination: 'vocabulary',
    });

    saveUiPreferences(storage, preferences);
    expect(storage.getItem(uiPreferencesStorageKey)).toContain(
      '"lastPrimaryDestination":"vocabulary"',
    );
    expect(loadUiPreferences(storage).preferences).toEqual(preferences);

    resetUiPreferences(storage);
    expect(storage.getItem(uiPreferencesStorageKey)).toBeNull();
    expect(storage.getItem('speech:vocabulary-store:v1')).toBe('{"domain":true}');
    expect(storage.getItem('speech:profile-store:v1')).toBe('{"domain":true}');
  });

  it('migrates legacy UI-only keys without coupling to voice data or exports', () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyUiPreferenceKeys.transcriptTextScale, 'large');
    storage.setItem(legacyUiPreferenceKeys.reducedMotion, 'reduce');
    storage.setItem(legacyUiPreferenceKeys.lastPrimaryDestination, 'models');
    storage.setItem(
      legacyUiPreferenceKeys.dismissedHintIds,
      JSON.stringify(['training-progress-saved-on-device', 'profile-private-audio']),
    );
    storage.setItem('speech:profile-store:v1', '{"profiles":["profile-local"]}');

    const migrated = loadUiPreferences(storage);
    expect(migrated.status).toBe('repaired');
    expect(migrated.preferences).toMatchObject({
      transcriptTextScale: 'large',
      reducedMotion: 'reduce',
      lastPrimaryDestination: 'models',
      dismissedHintIds: ['training-progress-saved-on-device'],
    });
    expect(JSON.stringify(migrated.preferences)).not.toContain('profile-local');
    expect(storage.getItem('speech:profile-store:v1')).toContain('profile-local');
  });

  it('falls back to defaults when stored JSON is corrupt for rollback-safe recovery', () => {
    const storage = new MemoryStorage();
    storage.setItem(uiPreferencesStorageKey, '{not json');

    const loaded = loadUiPreferences(storage);
    expect(loaded.status).toBe('repaired');
    expect(loaded.preferences).toEqual(createDefaultUiPreferences());
  });
});

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const _typecheck: UiPreferencesV1 = createDefaultUiPreferences();
void _typecheck;
