import type { PersonalModelActivationDecisionV1 } from '@speech/personalization';
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

export type PersonalModelActivationReviewStatusV1 =
  | 'generic-fallback'
  | 'awaiting-evaluation'
  | 'automatic-ready'
  | 'advanced-override-required'
  | 'advanced-override-accepted'
  | 'blocked';

export interface PersonalModelActivationReviewCardV1 {
  readonly schemaVersion: 1;
  readonly status: PersonalModelActivationReviewStatusV1;
  readonly title: string;
  readonly detail: string;
  readonly activationAllowed: boolean;
  readonly automaticActivationAllowed: boolean;
  readonly advancedOverrideAvailable: boolean;
  readonly hardGatePassed: boolean;
  readonly softGatePassed: boolean;
  readonly comparison: {
    readonly personalHeldoutCases: number;
    readonly anchorCases: number;
    readonly selectedVocabularyEntryCount: number;
    readonly candidateVsGenericWerRelativeImprovement: number | null;
    readonly candidateVsP1WerDelta: number | null;
    readonly anchorWerDelta: number | null;
    readonly rtfOverheadRatioVsP1: number | null;
    readonly candidateAdapterSizeBytes: number | null;
  };
  readonly rollback: {
    readonly genericFallbackAvailable: true;
    readonly previousAdapterRetained: boolean;
    readonly previousProfileAvailable: boolean;
    readonly activationSwap: 'utterance-boundary';
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsCaseIds: false;
    readonly containsRawProfileIds: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly containsPrivateVocabularyTerms: false;
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

export function buildPersonalModelActivationReviewCard({
  profileCard,
  activeState,
  activationDecision,
}: {
  readonly profileCard: PersonalModelProfileCardV1;
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly activationDecision: PersonalModelActivationDecisionV1 | null;
}): PersonalModelActivationReviewCardV1 {
  if (profileCard.status === 'no-profile' || activationDecision === null) {
    const hasProfile = profileCard.status !== 'no-profile';
    return {
      schemaVersion: 1,
      status: hasProfile ? 'awaiting-evaluation' : 'generic-fallback',
      title: hasProfile ? 'Awaiting aggregate evaluation' : 'Generic fallback active',
      detail: hasProfile
        ? 'Run personal/anchor evaluation before activating a trained adapter. The existing profile can still be exported, deleted, or used as enrollment input.'
        : 'No local personal model is active; the generic base model remains the safe fallback.',
      activationAllowed: false,
      automaticActivationAllowed: false,
      advancedOverrideAvailable: false,
      hardGatePassed: false,
      softGatePassed: false,
      comparison: emptyActivationComparison(),
      rollback: {
        genericFallbackAvailable: true,
        previousAdapterRetained: activeState?.previousProfileId !== undefined,
        previousProfileAvailable: activeState?.previousProfileId !== undefined,
        activationSwap: 'utterance-boundary',
      },
      privacy: createAggregateActivationReviewPrivacy(),
    };
  }

  return {
    schemaVersion: 1,
    status: activationReviewStatus(activationDecision),
    title: activationReviewTitle(activationDecision),
    detail: activationReviewDetail(activationDecision),
    activationAllowed: activationDecision.activationAllowed,
    automaticActivationAllowed: activationDecision.automaticActivationAllowed,
    advancedOverrideAvailable: activationDecision.advancedOverrideAvailable,
    hardGatePassed: activationDecision.hardGatePassed,
    softGatePassed: activationDecision.softGatePassed,
    comparison: {
      personalHeldoutCases: activationDecision.comparison.personalHeldout.caseCount,
      anchorCases: activationDecision.comparison.anchor.caseCount,
      selectedVocabularyEntryCount:
        activationDecision.comparison.personalHeldout.selectedVocabularyEntryCount,
      candidateVsGenericWerRelativeImprovement:
        activationDecision.comparison.personalHeldout.candidateVsGenericWerRelativeImprovement,
      candidateVsP1WerDelta: activationDecision.comparison.personalHeldout.candidateVsP1WerDelta,
      anchorWerDelta: activationDecision.comparison.anchor.candidateVsGenericWerDelta,
      rtfOverheadRatioVsP1: activationDecision.comparison.overall.rtfOverheadRatioVsP1,
      candidateAdapterSizeBytes: activationDecision.comparison.candidateAdapterSizeBytes,
    },
    rollback: {
      genericFallbackAvailable: activationDecision.actions.genericFallbackAvailable,
      previousAdapterRetained: activationDecision.actions.retainPreviousAdapter,
      previousProfileAvailable: activeState?.previousProfileId !== undefined,
      activationSwap: activationDecision.actions.activationSwap,
    },
    privacy: createAggregateActivationReviewPrivacy(),
  };
}

function getStoredProfileBytes(summary: EnrollmentProfileSummaryV1): number {
  return Object.values(summary.checksums.files).reduce((total, file) => total + file.sizeBytes, 0);
}

function activationReviewStatus(
  decision: PersonalModelActivationDecisionV1,
): PersonalModelActivationReviewStatusV1 {
  switch (decision.status) {
    case 'automatic-activation-allowed':
      return 'automatic-ready';
    case 'advanced-override-required':
      return 'advanced-override-required';
    case 'advanced-override-accepted':
      return 'advanced-override-accepted';
    case 'blocked-by-hard-gates':
      return 'blocked';
  }
}

function activationReviewTitle(decision: PersonalModelActivationDecisionV1): string {
  switch (decision.status) {
    case 'automatic-activation-allowed':
      return 'Activation gates passed';
    case 'advanced-override-required':
      return 'Advanced override required';
    case 'advanced-override-accepted':
      return 'Advanced override accepted';
    case 'blocked-by-hard-gates':
      return 'Activation blocked by hard gates';
  }
}

function activationReviewDetail(decision: PersonalModelActivationDecisionV1): string {
  switch (decision.status) {
    case 'automatic-activation-allowed':
      return 'Candidate adapter can be activated at an utterance boundary with previous adapter retention.';
    case 'advanced-override-required':
      return 'Hard gates passed, but soft gates need an explicit advanced override before activation.';
    case 'advanced-override-accepted':
      return 'Activation is allowed by explicit advanced override; keep rollback visible.';
    case 'blocked-by-hard-gates':
      return 'Keep the generic or previous adapter active until hard regression gates pass.';
  }
}

function emptyActivationComparison(): PersonalModelActivationReviewCardV1['comparison'] {
  return {
    personalHeldoutCases: 0,
    anchorCases: 0,
    selectedVocabularyEntryCount: 0,
    candidateVsGenericWerRelativeImprovement: null,
    candidateVsP1WerDelta: null,
    anchorWerDelta: null,
    rtfOverheadRatioVsP1: null,
    candidateAdapterSizeBytes: null,
  };
}

function createAggregateActivationReviewPrivacy(): PersonalModelActivationReviewCardV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsCaseIds: false,
    containsRawProfileIds: false,
    containsFeatureTensors: false,
    containsCheckpoints: false,
    containsAdapterWeights: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  };
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
