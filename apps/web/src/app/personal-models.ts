import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileSummaryV1,
} from '@speech/profile-manager';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';

export const defaultPersonalProfileId = 'local-enrollment-profile';
export const defaultPersonalProfileDisplayName = 'Local enrollment profile';
export const defaultPersonalSentenceBankVersion = 'synthetic-v1';

export type PersonalModelCardStatus = 'no-profile' | 'available' | 'active';

export interface ActiveVocabularySummaryV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly activeSetCount: number;
  readonly activeEntryCount: number;
  readonly enabledEntryCount: number;
  readonly totalEntryCount: number;
  readonly updatedAt: string;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsVocabularyTerms: false;
    readonly containsVocabularyEntryIds: false;
    readonly localOnly: true;
  };
}

export interface PersonalModelProfileCardV1 {
  readonly schemaVersion: 1;
  readonly displayName: string;
  readonly status: PersonalModelCardStatus;
  readonly active: boolean;
  readonly storage: {
    readonly acceptedUtterances: number;
    readonly acceptedSeconds: number;
    readonly storedBytes: number;
    readonly updatedAt?: string;
  };
  readonly baseModel: {
    readonly status: 'exact-bound' | 'generic-fallback';
    readonly label: string;
    readonly version?: string;
  };
  readonly activeVocabulary: ActiveVocabularySummaryV1;
  readonly actions: {
    readonly canEnable: boolean;
    readonly canExport: boolean;
    readonly canDelete: boolean;
    readonly canImport: true;
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export function summarizeActiveVocabulary(
  snapshot: VocabularyStoreSnapshotV1,
): ActiveVocabularySummaryV1 {
  const activeSets = snapshot.sets.filter(
    (set) => set.enabled && snapshot.activeSetIds.includes(set.id),
  );
  const activeEntryCount = activeSets.reduce(
    (count, set) => count + set.entries.filter((entry) => entry.enabled).length,
    0,
  );
  const enabledEntryCount = snapshot.sets.reduce(
    (count, set) => count + set.entries.filter((entry) => entry.enabled).length,
    0,
  );
  const totalEntryCount = snapshot.sets.reduce((count, set) => count + set.entries.length, 0);
  return {
    schemaVersion: 1,
    revision: snapshot.revision,
    activeSetCount: activeSets.length,
    activeEntryCount,
    enabledEntryCount,
    totalEntryCount,
    updatedAt: snapshot.updatedAt,
    privacy: {
      aggregateOnly: true,
      containsVocabularyTerms: false,
      containsVocabularyEntryIds: false,
      localOnly: true,
    },
  };
}

export function buildPersonalModelProfileCard({
  summary,
  activeState,
  activeVocabulary,
  fallbackDisplayName = defaultPersonalProfileDisplayName,
}: {
  readonly summary: EnrollmentProfileSummaryV1 | null;
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly activeVocabulary: ActiveVocabularySummaryV1;
  readonly fallbackDisplayName?: string;
}): PersonalModelProfileCardV1 {
  if (summary === null) {
    return {
      schemaVersion: 1,
      displayName: fallbackDisplayName,
      status: 'no-profile',
      active: false,
      storage: {
        acceptedUtterances: 0,
        acceptedSeconds: 0,
        storedBytes: 0,
      },
      baseModel: {
        status: 'generic-fallback',
        label: 'Generic base model fallback',
      },
      activeVocabulary,
      actions: {
        canEnable: false,
        canExport: false,
        canDelete: false,
        canImport: true,
      },
      privacy: createAggregateCardPrivacy(),
    };
  }

  const active = activeState?.activeProfileId === summary.profile.id;
  const baseModel = summary.profile.baseModel;
  return {
    schemaVersion: 1,
    displayName: summary.profile.displayName,
    status: active ? 'active' : 'available',
    active,
    storage: {
      acceptedUtterances: summary.profile.enrollment.acceptedUtterances,
      acceptedSeconds: summary.profile.enrollment.acceptedSeconds,
      storedBytes: getStoredProfileBytes(summary),
      updatedAt: summary.profile.updatedAt,
    },
    baseModel:
      baseModel === undefined
        ? {
            status: 'generic-fallback',
            label: 'Generic base model fallback',
          }
        : {
            status: 'exact-bound',
            label: baseModel.id,
            version: baseModel.version,
          },
    activeVocabulary,
    actions: {
      canEnable: !active,
      canExport: true,
      canDelete: true,
      canImport: true,
    },
    privacy: createAggregateCardPrivacy(),
  };
}

function getStoredProfileBytes(summary: EnrollmentProfileSummaryV1): number {
  return Object.values(summary.checksums.files).reduce((total, file) => total + file.sizeBytes, 0);
}

function createAggregateCardPrivacy(): PersonalModelProfileCardV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  };
}
