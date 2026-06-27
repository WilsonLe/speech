import { describe, expect, it } from 'vitest';
import {
  buildCreateModelReview,
  createCreateModelDraft,
  createDefaultCreateModelDraft,
  getCreateModelDraftStorageKey,
  loadCreateModelDraft,
  parseCreateModelDraft,
  resolveCreateModelEnrollmentLanguage,
  resolveCreateModelProfileDisplayName,
  saveCreateModelDraft,
} from './create-model-flow';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('create-model flow draft', () => {
  it('creates a local-only recommended bilingual draft by default', () => {
    const draft = createDefaultCreateModelDraft(new Date('2026-06-27T00:00:00.000Z'));

    expect(draft).toMatchObject({
      schemaVersion: 1,
      displayName: 'Local enrollment profile',
      languageTarget: 'both',
      includeMixedSpeech: true,
      recordingPlan: 'recommended',
      updatedAt: '2026-06-27T00:00:00.000Z',
    });
    expect(draft.privacy).toEqual({
      localOnly: true,
      uiOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsModelWeights: false,
    });
  });

  it('normalizes display names and suppresses mixed speech when not bilingual', () => {
    const draft = createCreateModelDraft(
      {
        displayName: '  Office   microphone  ',
        languageTarget: 'english',
        includeMixedSpeech: true,
        recordingPlan: 'quick',
      },
      new Date('2026-06-27T00:00:00.000Z'),
    );

    expect(draft.displayName).toBe('Office microphone');
    expect(draft.includeMixedSpeech).toBe(false);
    expect(buildCreateModelReview(draft)).toMatchObject({
      name: 'Office microphone',
      speech: 'English speech',
      mixedSpeech: 'Not needed for this choice',
      plan: 'Quick recording plan',
      initialEnrollmentLanguage: 'en',
    });
  });

  it('stores and loads only the UI draft, not profile data or model bytes', () => {
    const storage = new MemoryStorage();
    const draft = createCreateModelDraft(
      {
        displayName: 'Travel laptop',
        languageTarget: 'both',
        includeMixedSpeech: false,
        recordingPlan: 'extended',
      },
      new Date('2026-06-27T00:00:00.000Z'),
    );

    saveCreateModelDraft(storage, draft);
    expect(storage.getItem(getCreateModelDraftStorageKey())).toContain('Travel laptop');
    expect(loadCreateModelDraft(storage)).toEqual(draft);
    expect(resolveCreateModelProfileDisplayName(storage)).toBe('Travel laptop');
    expect(resolveCreateModelEnrollmentLanguage(storage)).toBe('vi');
    expect(JSON.stringify(loadCreateModelDraft(storage))).not.toMatch(
      /pcm|audioBytes|transcriptTextValue|checkpointPath|featureTensorPath/i,
    );
  });

  it('repairs malformed drafts without throwing or leaking parser details', () => {
    const storage = new MemoryStorage();
    storage.setItem(getCreateModelDraftStorageKey(), '{bad json');
    expect(loadCreateModelDraft(storage).displayName).toBe('Local enrollment profile');

    expect(parseCreateModelDraft({ schemaVersion: 1, languageTarget: '../bad' })).toBeNull();
  });
});
