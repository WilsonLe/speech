import type { VocabularyEntryLanguage } from './model-manifest';

export type { VocabularyEntryLanguage } from './model-manifest';

export type VocabularySetSource = 'manual' | 'csv' | 'json' | 'imported' | 'system';

export const vocabularyEntryLanguageValues = ['vi', 'en', 'mixed', 'auto'] as const;

export interface VocabularyEntryV1 {
  readonly id: string;
  readonly phrase: string;
  readonly displayForm: string;
  readonly language: VocabularyEntryLanguage;
  readonly spokenAliases: readonly string[];
  readonly weight: number;
  readonly category?: string;
  readonly enabled: boolean;
  readonly exactCase: boolean;
  readonly promptPriority?: number;
  readonly pronunciationRecordingIds?: readonly string[];
}

export interface VocabularySetV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly revision: number;
  readonly entries: readonly VocabularyEntryV1[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly source?: VocabularySetSource;
}

export interface VocabularyStoreSnapshotV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly sets: readonly VocabularySetV1[];
  readonly activeSetIds: readonly string[];
  readonly updatedAt: string;
}

export type VocabularyErrorCode =
  | 'empty'
  | 'overlong'
  | 'unknown-only'
  | 'duplicate'
  | 'limit-exceeded'
  | 'invalid-schema-version'
  | 'invalid-id'
  | 'invalid-language'
  | 'invalid-weight'
  | 'invalid-priority'
  | 'invalid-revision'
  | 'invalid-timestamp'
  | 'invalid-field'
  | 'unsupported-language'
  | 'unsupported-context-biasing';

export interface VocabularyError {
  readonly setId?: string;
  readonly entryId?: string;
  readonly field?: string;
  readonly code: VocabularyErrorCode;
  readonly message: string;
}

export interface VocabularyRevisionV1 {
  readonly revision: number;
  readonly activeSetIds: readonly string[];
  readonly entries: readonly VocabularyEntryV1[];
}
