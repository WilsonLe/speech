export interface VocabularyEntryV1 {
  readonly id: string;
  readonly phrase: string;
  readonly displayForm: string;
  readonly language: 'vi' | 'en' | 'mixed' | 'auto';
  readonly spokenAliases: readonly string[];
  readonly weight: number;
  readonly category?: string;
  readonly enabled: boolean;
  readonly exactCase: boolean;
  readonly promptPriority?: number;
  readonly pronunciationRecordingIds?: readonly string[];
}

export interface VocabularyError {
  readonly entryId?: string;
  readonly code:
    | 'empty'
    | 'overlong'
    | 'unknown-only'
    | 'duplicate'
    | 'limit-exceeded'
    | 'invalid-weight';
  readonly message: string;
}
