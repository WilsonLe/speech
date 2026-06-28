import type {
  PersonalModelActivationDecisionV1,
  PersonalModelActivationGateDecisionV1,
} from '@speech/personalization';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentProfileSummaryV1,
} from '@speech/profile-manager';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';
import { getModelReasonCopy } from '../content/reasonCodes';

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
  readonly comparison: PersonalModelActivationComparisonViewV1;
  readonly gates: {
    readonly hard: readonly PersonalModelGateSummaryV1[];
    readonly advisory: readonly PersonalModelGateSummaryV1[];
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

export interface PersonalModelActivationComparisonViewV1 {
  readonly personalHeldoutCases: number;
  readonly anchorCases: number;
  readonly overallCases: number;
  readonly selectedVocabularyEntryCount: number;
  readonly selectedVocabularyCaseCount: number;
  readonly candidateVsGenericWerRelativeImprovement: number | null;
  readonly candidateVsGenericCerRelativeImprovement: number | null;
  readonly candidateVsGenericCustomTermRecallDelta: number | null;
  readonly candidateVsP1WerDelta: number | null;
  readonly anchorWerDelta: number | null;
  readonly anchorCerDelta: number | null;
  readonly anchorFalseInsertionDelta: number | null;
  readonly overallFalseInsertionDelta: number | null;
  readonly rtfOverheadRatioVsP1: number | null;
  readonly candidateAdapterSizeBytes: number | null;
}

export interface PersonalModelGateSummaryV1 {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly severity: 'hard' | 'advisory';
  readonly passed: boolean;
  readonly detail: string;
  readonly valueCount: number;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsCaseIds: false;
    readonly containsRawProfileIds: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export type PersonalModelResultActionKindV1 =
  | 'use-model'
  | 'record-more'
  | 'train-model'
  | 'keep-draft'
  | 'none';

export interface PersonalModelResultActionV1 {
  readonly kind: PersonalModelResultActionKindV1;
  readonly label: string;
  readonly href?: string;
  readonly disabled: boolean;
  readonly tone: 'primary' | 'secondary';
}

export interface PersonalModelResultMetricV1 {
  readonly label: string;
  readonly value: string;
}

export interface PersonalModelResultMetricGroupV1 {
  readonly title:
    | 'Personal speech'
    | 'Languages'
    | 'Voice levels'
    | 'Vocabulary'
    | 'General speech'
    | 'Performance';
  readonly metrics: readonly PersonalModelResultMetricV1[];
}

export interface PersonalModelResultViewV1 {
  readonly schemaVersion: 1;
  readonly status: 'not-ready' | 'ready' | 'review-needed' | 'blocked';
  readonly title: string;
  readonly detail: string;
  readonly primaryAction: PersonalModelResultActionV1;
  readonly secondaryActions: readonly PersonalModelResultActionV1[];
  readonly metricGroups: readonly PersonalModelResultMetricGroupV1[];
  readonly gateGroups: {
    readonly hard: readonly PersonalModelGateSummaryV1[];
    readonly advisory: readonly PersonalModelGateSummaryV1[];
  };
  readonly rollback: PersonalModelActivationReviewCardV1['rollback'];
  readonly privacy: PersonalModelActivationReviewCardV1['privacy'];
}

export type PersonalModelListPrimaryActionV1 =
  | 'continue-recording'
  | 'continue-training'
  | 'review-result'
  | 'use-model'
  | 'none';

export interface PersonalModelListRowV1 {
  readonly schemaVersion: 1;
  readonly displayName: string;
  readonly activeLabel: 'Active' | 'Inactive' | 'Generic';
  readonly statusLabel: 'Ready' | 'Recording needed' | 'Draft';
  readonly primaryAction: PersonalModelListPrimaryActionV1;
  readonly primaryActionLabel: string;
  readonly primaryActionDisabled: boolean;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsModelIds: false;
    readonly containsStoragePaths: false;
    readonly containsHashes: false;
    readonly containsPrivateVocabularyTerms: false;
    readonly localOnly: true;
  };
}

export type PersonalModelDetailPrimaryActionV1 =
  | 'continue-recording'
  | 'use-model'
  | 'deactivate'
  | 'none';

export interface PersonalModelDetailSummaryV1 {
  readonly schemaVersion: 1;
  readonly displayName: string;
  readonly statusLabel: 'Active' | 'Draft' | 'Generic fallback';
  readonly nextActionSentence: string;
  readonly primaryAction: PersonalModelDetailPrimaryActionV1;
  readonly primaryActionLabel: string;
  readonly primaryActionDisabled: boolean;
  readonly lastUpdatedIso: string | null;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsModelIds: false;
    readonly containsStoragePaths: false;
    readonly containsHashes: false;
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
        label: 'Generic speech model fallback',
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
            label: 'Generic speech model fallback',
          }
        : {
            status: 'exact-bound',
            label: 'Exact speech model',
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

export function buildPersonalModelListRow(
  card: PersonalModelProfileCardV1,
): PersonalModelListRowV1 {
  if (card.status === 'no-profile') {
    return {
      schemaVersion: 1,
      displayName: card.displayName,
      activeLabel: 'Generic',
      statusLabel: 'Recording needed',
      primaryAction: 'continue-recording',
      primaryActionLabel: 'Continue recording',
      primaryActionDisabled: false,
      privacy: createAggregateListRowPrivacy(),
    };
  }

  const recordingNeeded = card.storage.acceptedUtterances === 0;
  if (recordingNeeded) {
    return {
      schemaVersion: 1,
      displayName: card.displayName,
      activeLabel: card.active ? 'Active' : 'Inactive',
      statusLabel: 'Recording needed',
      primaryAction: 'continue-recording',
      primaryActionLabel: 'Continue recording',
      primaryActionDisabled: false,
      privacy: createAggregateListRowPrivacy(),
    };
  }

  return {
    schemaVersion: 1,
    displayName: card.displayName,
    activeLabel: card.active ? 'Active' : 'Inactive',
    statusLabel: 'Ready',
    primaryAction: 'use-model',
    primaryActionLabel: card.active ? 'Using model' : 'Use model',
    primaryActionDisabled: card.active,
    privacy: createAggregateListRowPrivacy(),
  };
}

export function buildPersonalModelDetailSummary({
  card,
  row,
}: {
  readonly card: PersonalModelProfileCardV1;
  readonly row: PersonalModelListRowV1;
}): PersonalModelDetailSummaryV1 {
  if (card.status === 'no-profile') {
    return {
      schemaVersion: 1,
      displayName: card.displayName,
      statusLabel: 'Generic fallback',
      nextActionSentence: 'Record enrollment takes to create a local voice model.',
      primaryAction: 'continue-recording',
      primaryActionLabel: 'Continue recording',
      primaryActionDisabled: false,
      lastUpdatedIso: null,
      privacy: createAggregateDetailSummaryPrivacy(),
    };
  }

  if (row.statusLabel === 'Recording needed') {
    return {
      schemaVersion: 1,
      displayName: card.displayName,
      statusLabel: card.active ? 'Active' : 'Draft',
      nextActionSentence: 'Continue recording before this model can be trained or activated.',
      primaryAction: 'continue-recording',
      primaryActionLabel: 'Continue recording',
      primaryActionDisabled: false,
      lastUpdatedIso: card.storage.updatedAt ?? null,
      privacy: createAggregateDetailSummaryPrivacy(),
    };
  }

  if (card.active) {
    return {
      schemaVersion: 1,
      displayName: card.displayName,
      statusLabel: 'Active',
      nextActionSentence: 'This model is active; changes apply at the next utterance boundary.',
      primaryAction: 'deactivate',
      primaryActionLabel: 'Deactivate',
      primaryActionDisabled: false,
      lastUpdatedIso: card.storage.updatedAt ?? null,
      privacy: createAggregateDetailSummaryPrivacy(),
    };
  }

  return {
    schemaVersion: 1,
    displayName: card.displayName,
    statusLabel: 'Draft',
    nextActionSentence: 'Use this model when you are ready to make it active for dictation.',
    primaryAction: 'use-model',
    primaryActionLabel: 'Use model',
    primaryActionDisabled: row.primaryActionDisabled || !card.actions.canEnable,
    lastUpdatedIso: card.storage.updatedAt ?? null,
    privacy: createAggregateDetailSummaryPrivacy(),
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
        ? getModelReasonCopy('model-quality-awaiting-evaluation').message
        : getModelReasonCopy('model-profiles-empty').message,
      activationAllowed: false,
      automaticActivationAllowed: false,
      advancedOverrideAvailable: false,
      hardGatePassed: false,
      softGatePassed: false,
      comparison: emptyActivationComparison(),
      gates: {
        hard: [],
        advisory: [],
      },
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
      overallCases: activationDecision.comparison.overall.caseCount,
      selectedVocabularyEntryCount:
        activationDecision.comparison.personalHeldout.selectedVocabularyEntryCount,
      selectedVocabularyCaseCount:
        activationDecision.comparison.personalHeldout.selectedVocabularyCaseCount,
      candidateVsGenericWerRelativeImprovement:
        activationDecision.comparison.personalHeldout.candidateVsGenericWerRelativeImprovement,
      candidateVsGenericCerRelativeImprovement:
        activationDecision.comparison.personalHeldout.candidateVsGenericCerRelativeImprovement,
      candidateVsGenericCustomTermRecallDelta:
        activationDecision.comparison.personalHeldout.candidateVsGenericCustomTermRecallDelta,
      candidateVsP1WerDelta: activationDecision.comparison.personalHeldout.candidateVsP1WerDelta,
      anchorWerDelta: activationDecision.comparison.anchor.candidateVsGenericWerDelta,
      anchorCerDelta: activationDecision.comparison.anchor.candidateVsGenericCerDelta,
      anchorFalseInsertionDelta:
        activationDecision.comparison.anchor.candidateVsGenericFalseInsertionPer100Delta,
      overallFalseInsertionDelta:
        activationDecision.comparison.overall.candidateVsGenericFalseInsertionPer100Delta,
      rtfOverheadRatioVsP1: activationDecision.comparison.overall.rtfOverheadRatioVsP1,
      candidateAdapterSizeBytes: activationDecision.comparison.candidateAdapterSizeBytes,
    },
    gates: {
      hard: activationDecision.hardGates.map((gate) => createGateSummary(gate)),
      advisory: activationDecision.softGates.map((gate) => createGateSummary(gate)),
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
  return getModelReasonCopy(activationDecisionReasonCode(decision)).title;
}

function activationReviewDetail(decision: PersonalModelActivationDecisionV1): string {
  const copy = getModelReasonCopy(activationDecisionReasonCode(decision));
  return `${copy.message} ${copy.action}`;
}

function activationDecisionReasonCode(decision: PersonalModelActivationDecisionV1) {
  switch (decision.status) {
    case 'automatic-activation-allowed':
      return 'model-quality-automatic-ready';
    case 'advanced-override-required':
      return 'model-quality-review-required';
    case 'advanced-override-accepted':
      return 'model-quality-review-accepted';
    case 'blocked-by-hard-gates':
      return 'model-quality-blocked';
  }
}

export function buildPersonalModelResultView({
  review,
  recordingHref,
  trainingHref,
}: {
  readonly review: PersonalModelActivationReviewCardV1;
  readonly recordingHref: string;
  readonly trainingHref: string;
}): PersonalModelResultViewV1 {
  const draftAction: PersonalModelResultActionV1 = {
    kind: 'keep-draft',
    label: 'Keep as draft',
    disabled: false,
    tone: 'secondary',
  };

  if (review.status === 'automatic-ready' || review.status === 'advanced-override-accepted') {
    return {
      schemaVersion: 1,
      status: 'ready',
      title: 'Ready to use',
      detail: 'Your model improved on your held-out recordings and passed general checks.',
      primaryAction: {
        kind: 'use-model',
        label: 'Use model',
        disabled: !review.activationAllowed,
        tone: 'primary',
      },
      secondaryActions: [draftAction],
      metricGroups: createActivationMetricGroups(review),
      gateGroups: review.gates,
      rollback: review.rollback,
      privacy: review.privacy,
    };
  }

  if (review.status === 'blocked') {
    return {
      schemaVersion: 1,
      status: 'blocked',
      title: 'More recordings needed',
      detail: 'A required quality check did not meet the activation threshold.',
      primaryAction: {
        kind: 'record-more',
        label: 'Record more',
        href: recordingHref,
        disabled: false,
        tone: 'primary',
      },
      secondaryActions: [draftAction],
      metricGroups: createActivationMetricGroups(review),
      gateGroups: review.gates,
      rollback: review.rollback,
      privacy: review.privacy,
    };
  }

  if (review.status === 'advanced-override-required') {
    return {
      schemaVersion: 1,
      status: 'review-needed',
      title: 'Review advisory checks',
      detail:
        'Required quality checks passed, but advisory checks need explicit review before activation.',
      primaryAction: draftAction,
      secondaryActions: [
        {
          kind: 'record-more',
          label: 'Record more',
          href: recordingHref,
          disabled: false,
          tone: 'secondary',
        },
      ],
      metricGroups: createActivationMetricGroups(review),
      gateGroups: review.gates,
      rollback: review.rollback,
      privacy: review.privacy,
    };
  }

  return {
    schemaVersion: 1,
    status: 'not-ready',
    title: 'Results not ready',
    detail: review.detail,
    primaryAction: {
      kind: 'train-model',
      label: 'Train model',
      href: trainingHref,
      disabled: false,
      tone: 'primary',
    },
    secondaryActions: [draftAction],
    metricGroups: createActivationMetricGroups(review),
    gateGroups: review.gates,
    rollback: review.rollback,
    privacy: review.privacy,
  };
}

function createGateSummary(
  gate: PersonalModelActivationGateDecisionV1,
): PersonalModelGateSummaryV1 {
  const label = formatGateLabel(gate.name);
  return {
    schemaVersion: 1,
    label,
    severity: gate.severity === 'hard' ? 'hard' : 'advisory',
    passed: gate.passed,
    detail: gate.passed ? 'Passed' : `${label} needs review.`,
    valueCount: Object.keys(gate.values).length,
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsCaseIds: false,
      containsRawProfileIds: false,
      containsPrivateVocabularyTerms: false,
      localOnly: true,
    },
  };
}

function createActivationMetricGroups(
  review: PersonalModelActivationReviewCardV1,
): readonly PersonalModelResultMetricGroupV1[] {
  const comparison = review.comparison;
  return [
    {
      title: 'Personal speech',
      metrics: [
        { label: 'Held-out recordings', value: formatCount(comparison.personalHeldoutCases) },
        {
          label: 'Word-error improvement',
          value: formatPercent(comparison.candidateVsGenericWerRelativeImprovement),
        },
        {
          label: 'Character-error improvement',
          value: formatPercent(comparison.candidateVsGenericCerRelativeImprovement),
        },
      ],
    },
    {
      title: 'Languages',
      metrics: [
        { label: 'Evaluation recordings', value: formatCount(comparison.overallCases) },
        { label: 'General speech recordings', value: formatCount(comparison.anchorCases) },
      ],
    },
    {
      title: 'Voice levels',
      metrics: [
        {
          label: 'Previous-model word-error change',
          value: formatSignedRatio(comparison.candidateVsP1WerDelta),
        },
      ],
    },
    {
      title: 'Vocabulary',
      metrics: [
        { label: 'Selected words', value: formatCount(comparison.selectedVocabularyEntryCount) },
        {
          label: 'Vocabulary recordings',
          value: formatCount(comparison.selectedVocabularyCaseCount),
        },
        {
          label: 'Custom-word recall change',
          value: formatSignedRatio(comparison.candidateVsGenericCustomTermRecallDelta),
        },
      ],
    },
    {
      title: 'General speech',
      metrics: [
        {
          label: 'Word-error change',
          value: formatSignedRatio(comparison.anchorWerDelta),
        },
        {
          label: 'Character-error change',
          value: formatSignedRatio(comparison.anchorCerDelta),
        },
        {
          label: 'False insertions change',
          value: formatSignedRatio(comparison.anchorFalseInsertionDelta),
        },
        {
          label: 'Overall false insertions',
          value: formatSignedRatio(comparison.overallFalseInsertionDelta),
        },
      ],
    },
    {
      title: 'Performance',
      metrics: [
        {
          label: 'Processing overhead',
          value: formatRatio(comparison.rtfOverheadRatioVsP1),
        },
        {
          label: 'Model size',
          value: formatBytes(comparison.candidateAdapterSizeBytes),
        },
      ],
    },
  ];
}

function formatGateLabel(name: PersonalModelActivationGateDecisionV1['name']): string {
  switch (name) {
    case 'personal-improvement-vs-generic':
      return 'Personal speech improvement';
    case 'candidate-parity-vs-p1':
      return 'Previous model comparison';
    case 'anchor-regression-vs-generic':
      return 'General speech regression';
    case 'slice-regression-vs-generic':
      return 'Language or voice-level regression';
    case 'rtf-overhead-vs-p1':
      return 'Processing overhead';
    case 'false-insertion-regression-vs-generic':
      return 'False insertions';
    case 'candidate-adapter-size':
      return 'Model size';
    default:
      return 'Quality check';
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? 'Not measured' : `${formatSignedNumber(value * 100)}%`;
}

function formatSignedRatio(value: number | null): string {
  return value === null ? 'Not measured' : formatSignedNumber(value);
}

function formatRatio(value: number | null): string {
  return value === null ? 'Not measured' : `${value.toFixed(2)}×`;
}

function formatSignedNumber(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

function formatBytes(value: number | null): string {
  if (value === null) return 'Not measured';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyActivationComparison(): PersonalModelActivationComparisonViewV1 {
  return {
    personalHeldoutCases: 0,
    anchorCases: 0,
    overallCases: 0,
    selectedVocabularyEntryCount: 0,
    selectedVocabularyCaseCount: 0,
    candidateVsGenericWerRelativeImprovement: null,
    candidateVsGenericCerRelativeImprovement: null,
    candidateVsGenericCustomTermRecallDelta: null,
    candidateVsP1WerDelta: null,
    anchorWerDelta: null,
    anchorCerDelta: null,
    anchorFalseInsertionDelta: null,
    overallFalseInsertionDelta: null,
    rtfOverheadRatioVsP1: null,
    candidateAdapterSizeBytes: null,
  };
}

function createAggregateListRowPrivacy(): PersonalModelListRowV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsModelIds: false,
    containsStoragePaths: false,
    containsHashes: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
  };
}

function createAggregateDetailSummaryPrivacy(): PersonalModelDetailSummaryV1['privacy'] {
  return {
    aggregateOnly: true,
    containsRawAudio: false,
    containsTranscriptText: false,
    containsModelIds: false,
    containsStoragePaths: false,
    containsHashes: false,
    containsPrivateVocabularyTerms: false,
    localOnly: true,
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
