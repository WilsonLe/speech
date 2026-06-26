import { describe, expect, it } from 'vitest';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileSummaryV1,
} from '@speech/profile-manager';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';
import {
  buildPersonalModelProfileCard,
  defaultPersonalProfileDisplayName,
  summarizeActiveVocabulary,
} from './personal-models';

describe('personal model card summaries', () => {
  it('summarizes active vocabulary without exposing terms or entry ids', () => {
    const summary = summarizeActiveVocabulary(createVocabularySnapshot());

    expect(summary.activeSetCount).toBe(1);
    expect(summary.activeEntryCount).toBe(1);
    expect(summary.enabledEntryCount).toBe(2);
    expect(summary.totalEntryCount).toBe(3);
    expect(summary.privacy.containsVocabularyTerms).toBe(false);
    expect(summary.privacy.containsVocabularyEntryIds).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('Secret Launch Name');
    expect(JSON.stringify(summary)).not.toContain('term-secret');
  });

  it('builds a generic fallback card when no local profile is stored', () => {
    const card = buildPersonalModelProfileCard({
      summary: null,
      activeState: null,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });

    expect(card.displayName).toBe(defaultPersonalProfileDisplayName);
    expect(card.status).toBe('no-profile');
    expect(card.baseModel.status).toBe('generic-fallback');
    expect(card.actions.canImport).toBe(true);
    expect(card.actions.canExport).toBe(false);
    expect(card.privacy.containsRawAudio).toBe(false);
    expect(card.privacy.containsPrivateVocabularyTerms).toBe(false);
  });

  it('builds an active exact-bound profile card without transcript text or raw vocabulary terms', () => {
    const profileSummary = createProfileSummary();
    const activeState: ActiveEnrollmentProfileStateV1 = {
      schemaVersion: 1,
      activeProfileId: profileSummary.profile.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const card = buildPersonalModelProfileCard({
      summary: profileSummary,
      activeState,
      activeVocabulary: summarizeActiveVocabulary(createVocabularySnapshot()),
    });

    expect(card.status).toBe('active');
    expect(card.active).toBe(true);
    expect(card.baseModel).toEqual({
      status: 'exact-bound',
      label: 'vietasr-local',
      version: '2026.01',
    });
    expect(card.storage.acceptedUtterances).toBe(2);
    expect(card.storage.storedBytes).toBe(6400);
    expect(card.actions.canEnable).toBe(false);
    expect(card.actions.canExport).toBe(true);
    expect(JSON.stringify(card)).not.toContain('private prompt text');
    expect(JSON.stringify(card)).not.toContain('Secret Launch Name');
  });
});

function createVocabularySnapshot(): VocabularyStoreSnapshotV1 {
  return {
    schemaVersion: 1,
    revision: 7,
    activeSetIds: ['set-private'],
    updatedAt: '2026-01-01T00:00:00.000Z',
    sets: [
      {
        schemaVersion: 1,
        id: 'set-private',
        displayName: 'Private Work Terms',
        enabled: true,
        revision: 3,
        entries: [
          {
            id: 'term-secret',
            phrase: 'Secret Launch Name',
            displayForm: 'Secret Launch Name',
            language: 'en',
            spokenAliases: ['secret launch'],
            weight: 7,
            enabled: true,
            exactCase: true,
          },
          {
            id: 'term-disabled',
            phrase: 'Disabled Secret',
            displayForm: 'Disabled Secret',
            language: 'en',
            spokenAliases: [],
            weight: 4,
            enabled: false,
            exactCase: false,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'manual',
      },
      {
        schemaVersion: 1,
        id: 'set-inactive',
        displayName: 'Inactive Terms',
        enabled: false,
        revision: 1,
        entries: [
          {
            id: 'term-inactive',
            phrase: 'Inactive Secret',
            displayForm: 'Inactive Secret',
            language: 'en',
            spokenAliases: [],
            weight: 4,
            enabled: true,
            exactCase: false,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'manual',
      },
    ],
  };
}

function createProfileSummary(): EnrollmentProfileSummaryV1 {
  return {
    profile: {
      schemaVersion: 1,
      id: 'local-enrollment-profile',
      displayName: 'Local enrollment profile',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      baseModel: {
        id: 'vietasr-local',
        version: '2026.01',
        manifestSha256: 'manifest-sha',
        graphContractSha256: 'graph-sha',
      },
      enrollment: {
        acceptedUtterances: 2,
        acceptedSeconds: 6.5,
        languageCounts: { vi: 1, en: 1, mixed: 0 },
        voiceConditionCounts: { whisper: 0, normal: 2, projected: 0 },
        sentenceBankVersion: 'synthetic-v1',
      },
      privacy: {
        containsRawAudio: true,
        exportEncrypted: false,
        localOnly: true,
      },
    },
    utterances: [],
    checksums: {
      schemaVersion: 1,
      profileId: 'local-enrollment-profile',
      updatedAt: '2026-01-02T00:00:00.000Z',
      files: {
        'profiles/local-enrollment-profile/profile.json': { sha256: 'profile', sizeBytes: 1400 },
        'profiles/local-enrollment-profile/recordings/take-1.wav': {
          sha256: 'audio-1',
          sizeBytes: 5000,
        },
      },
    },
  };
}
