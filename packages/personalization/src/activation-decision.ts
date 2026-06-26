import type {
  PersonalAnchorEvaluationGateCheckV1,
  PersonalAnchorEvaluationGateV1,
  PersonalAnchorEvaluationReportV1,
} from './personal-anchor-evaluation';

export type PersonalModelActivationGateSeverityV1 = 'hard' | 'soft';
export type PersonalModelActivationDecisionStatusV1 =
  | 'automatic-activation-allowed'
  | 'advanced-override-required'
  | 'advanced-override-accepted'
  | 'blocked-by-hard-gates';

export interface PersonalModelActivationOverrideInputV1 {
  readonly accepted: boolean;
  readonly reason: string;
  readonly acceptedAt: string;
}

export interface CreatePersonalModelActivationDecisionOptionsV1 {
  readonly report: PersonalAnchorEvaluationReportV1;
  readonly generatedAt: string;
  readonly advancedOverride?: PersonalModelActivationOverrideInputV1;
  readonly hardGateNames?: readonly PersonalAnchorEvaluationGateCheckV1['name'][];
}

export interface PersonalModelActivationGateDecisionV1 {
  readonly name: PersonalAnchorEvaluationGateCheckV1['name'];
  readonly severity: PersonalModelActivationGateSeverityV1;
  readonly passed: boolean;
  readonly values: Readonly<Record<string, number | null>>;
  readonly reason?: string;
}

export interface PersonalModelActivationComparisonSummaryV1 {
  readonly evaluationId: string;
  readonly profileFingerprint: string;
  readonly candidateAdapterSizeBytes: number;
  readonly candidateAdapterSha256?: string;
  readonly personalHeldout: {
    readonly caseCount: number;
    readonly selectedVocabularyEntryCount: number;
    readonly selectedVocabularyCaseCount: number;
    readonly candidateVsGenericWerRelativeImprovement: number | null;
    readonly candidateVsGenericCerRelativeImprovement: number | null;
    readonly candidateVsGenericCustomTermRecallDelta: number | null;
    readonly candidateVsP1WerDelta: number | null;
  };
  readonly anchor: {
    readonly caseCount: number;
    readonly candidateVsGenericWerDelta: number | null;
    readonly candidateVsGenericCerDelta: number | null;
    readonly candidateVsGenericFalseInsertionPer100Delta: number | null;
  };
  readonly overall: {
    readonly caseCount: number;
    readonly rtfOverheadRatioVsP1: number | null;
    readonly candidateVsGenericFalseInsertionPer100Delta: number | null;
  };
}

export interface PersonalModelActivationDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionType: 'personal-model-activation-decision';
  readonly generatedAt: string;
  readonly status: PersonalModelActivationDecisionStatusV1;
  readonly activationAllowed: boolean;
  readonly automaticActivationAllowed: boolean;
  readonly advancedOverrideAvailable: boolean;
  readonly advancedOverrideRequired: boolean;
  readonly advancedOverrideAccepted: boolean;
  readonly hardGatePassed: boolean;
  readonly softGatePassed: boolean;
  readonly comparison: PersonalModelActivationComparisonSummaryV1;
  readonly gates: readonly PersonalModelActivationGateDecisionV1[];
  readonly hardGates: readonly PersonalModelActivationGateDecisionV1[];
  readonly softGates: readonly PersonalModelActivationGateDecisionV1[];
  readonly reasons: readonly string[];
  readonly actions: {
    readonly activationSwap: 'utterance-boundary';
    readonly retainPreviousAdapter: true;
    readonly rollbackAvailable: true;
    readonly genericFallbackAvailable: true;
    readonly overrideRequiresExplicitAdvancedAction: true;
  };
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsCaseIds: false;
    readonly containsRawProfileId: false;
    readonly containsFeatureTensors: false;
    readonly containsCheckpoints: false;
    readonly containsAdapterWeights: false;
    readonly exposesRawVocabularyEntryIds: false;
    readonly networkUpload: false;
    readonly localOnly: true;
  };
}

const defaultHardGateNames = [
  'anchor-regression-vs-generic',
  'slice-regression-vs-generic',
  'candidate-adapter-size',
] as const satisfies readonly PersonalAnchorEvaluationGateCheckV1['name'][];

export function createPersonalModelActivationDecision(
  options: CreatePersonalModelActivationDecisionOptionsV1,
): PersonalModelActivationDecisionV1 {
  const hardGateNames = new Set(options.hardGateNames ?? defaultHardGateNames);
  const gates = options.report.activationGate.checks.map((check) =>
    createGateDecision(check, options.report.activationGate, hardGateNames),
  );
  const hardGates = gates.filter((gate) => gate.severity === 'hard');
  const softGates = gates.filter((gate) => gate.severity === 'soft');
  const hardGatePassed = hardGates.every((gate) => gate.passed);
  const softGatePassed = softGates.every((gate) => gate.passed);
  const automaticActivationAllowed =
    options.report.activationGate.automaticActivationAllowed && hardGatePassed && softGatePassed;
  const advancedOverrideAvailable = hardGatePassed && !softGatePassed;
  const advancedOverrideAccepted = validateAdvancedOverride(
    options.advancedOverride,
    advancedOverrideAvailable,
  );
  const activationAllowed = automaticActivationAllowed || advancedOverrideAccepted;
  const status = summarizeDecisionStatus({
    automaticActivationAllowed,
    advancedOverrideAccepted,
    advancedOverrideAvailable,
    hardGatePassed,
  });

  return {
    schemaVersion: 1,
    decisionType: 'personal-model-activation-decision',
    generatedAt: options.generatedAt,
    status,
    activationAllowed,
    automaticActivationAllowed,
    advancedOverrideAvailable,
    advancedOverrideRequired: advancedOverrideAvailable && !advancedOverrideAccepted,
    advancedOverrideAccepted,
    hardGatePassed,
    softGatePassed,
    comparison: createComparisonSummary(options.report),
    gates,
    hardGates,
    softGates,
    reasons: createActivationDecisionReasons({
      gateReasons: options.report.activationGate.reasons,
      hardGates,
      softGates,
      advancedOverrideAvailable,
      advancedOverrideAccepted,
    }),
    actions: {
      activationSwap: 'utterance-boundary',
      retainPreviousAdapter: true,
      rollbackAvailable: true,
      genericFallbackAvailable: true,
      overrideRequiresExplicitAdvancedAction: true,
    },
    privacy: {
      aggregateOnly: true,
      containsRawAudio: false,
      containsTranscriptText: false,
      containsCaseIds: false,
      containsRawProfileId: false,
      containsFeatureTensors: false,
      containsCheckpoints: false,
      containsAdapterWeights: false,
      exposesRawVocabularyEntryIds: false,
      networkUpload: false,
      localOnly: true,
    },
  };
}

function createGateDecision(
  check: PersonalAnchorEvaluationGateCheckV1,
  gate: PersonalAnchorEvaluationGateV1,
  hardGateNames: ReadonlySet<PersonalAnchorEvaluationGateCheckV1['name']>,
): PersonalModelActivationGateDecisionV1 {
  const reason = check.passed ? undefined : reasonForGate(check.name, gate.reasons);
  return {
    name: check.name,
    severity: hardGateNames.has(check.name) ? 'hard' : 'soft',
    passed: check.passed,
    values: check.values,
    ...(reason === undefined ? {} : { reason }),
  };
}

function createComparisonSummary(
  report: PersonalAnchorEvaluationReportV1,
): PersonalModelActivationComparisonSummaryV1 {
  return {
    evaluationId: report.evaluationId,
    profileFingerprint: createRedactedProfileFingerprint(report.profileId),
    candidateAdapterSizeBytes: report.artifact.candidateAdapterSizeBytes,
    ...(report.artifact.candidateAdapterSha256 === undefined
      ? {}
      : { candidateAdapterSha256: report.artifact.candidateAdapterSha256 }),
    personalHeldout: {
      caseCount: report.personalHoldout.caseCount,
      selectedVocabularyEntryCount: report.personalHoldout.selectedVocabulary.selectedEntryCount,
      selectedVocabularyCaseCount: report.personalHoldout.selectedVocabulary.selectedCaseCount,
      candidateVsGenericWerRelativeImprovement:
        report.personalHoldout.comparisons.candidateVsGeneric.wordErrorRateRelativeImprovement,
      candidateVsGenericCerRelativeImprovement:
        report.personalHoldout.comparisons.candidateVsGeneric.characterErrorRateRelativeImprovement,
      candidateVsGenericCustomTermRecallDelta:
        report.personalHoldout.comparisons.candidateVsGeneric.customTermRecallDelta,
      candidateVsP1WerDelta: report.personalHoldout.comparisons.candidateVsP1.wordErrorRateDelta,
    },
    anchor: {
      caseCount: report.anchor.caseCount,
      candidateVsGenericWerDelta: report.anchor.comparisons.candidateVsGeneric.wordErrorRateDelta,
      candidateVsGenericCerDelta:
        report.anchor.comparisons.candidateVsGeneric.characterErrorRateDelta,
      candidateVsGenericFalseInsertionPer100Delta:
        report.anchor.comparisons.candidateVsGeneric.falseInsertionPer100Delta,
    },
    overall: {
      caseCount: report.overall.caseCount,
      rtfOverheadRatioVsP1: report.overall.comparisons.candidateVsP1.realTimeFactorOverheadRatio,
      candidateVsGenericFalseInsertionPer100Delta:
        report.overall.comparisons.candidateVsGeneric.falseInsertionPer100Delta,
    },
  };
}

function validateAdvancedOverride(
  override: PersonalModelActivationOverrideInputV1 | undefined,
  advancedOverrideAvailable: boolean,
): boolean {
  if (override === undefined || !override.accepted) return false;
  if (!advancedOverrideAvailable) {
    throw new Error('Advanced activation override is available only when hard gates pass.');
  }
  if (override.reason.trim().length < 12) {
    throw new Error('Advanced activation override reason must explain the accepted risk.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(override.acceptedAt)) {
    throw new Error('Advanced activation override acceptedAt must be an ISO timestamp.');
  }
  return true;
}

function summarizeDecisionStatus({
  automaticActivationAllowed,
  advancedOverrideAccepted,
  advancedOverrideAvailable,
  hardGatePassed,
}: {
  readonly automaticActivationAllowed: boolean;
  readonly advancedOverrideAccepted: boolean;
  readonly advancedOverrideAvailable: boolean;
  readonly hardGatePassed: boolean;
}): PersonalModelActivationDecisionStatusV1 {
  if (automaticActivationAllowed) return 'automatic-activation-allowed';
  if (!hardGatePassed) return 'blocked-by-hard-gates';
  if (advancedOverrideAccepted) return 'advanced-override-accepted';
  if (advancedOverrideAvailable) return 'advanced-override-required';
  return 'blocked-by-hard-gates';
}

function createActivationDecisionReasons({
  gateReasons,
  hardGates,
  softGates,
  advancedOverrideAvailable,
  advancedOverrideAccepted,
}: {
  readonly gateReasons: readonly string[];
  readonly hardGates: readonly PersonalModelActivationGateDecisionV1[];
  readonly softGates: readonly PersonalModelActivationGateDecisionV1[];
  readonly advancedOverrideAvailable: boolean;
  readonly advancedOverrideAccepted: boolean;
}): readonly string[] {
  const reasons = new Set<string>(gateReasons);
  if (hardGates.some((gate) => !gate.passed)) {
    reasons.add('Hard activation gates failed; keep the generic or previous adapter active.');
  }
  if (advancedOverrideAvailable && !advancedOverrideAccepted) {
    reasons.add('Soft activation gates failed; explicit advanced override is required.');
  }
  if (advancedOverrideAccepted) {
    reasons.add('Advanced override accepted after hard gates passed; retain rollback fallback.');
  }
  if (softGates.length === 0) {
    reasons.add('No soft activation gates were configured.');
  }
  return [...reasons];
}

function reasonForGate(
  name: PersonalAnchorEvaluationGateCheckV1['name'],
  reasons: readonly string[],
): string | undefined {
  const normalized = name.replaceAll('-', ' ');
  return reasons.find((reason) =>
    reason.toLocaleLowerCase('en-US').includes(normalized.split(' ')[0] ?? normalized),
  );
}

function createRedactedProfileFingerprint(profileId: string): string {
  return `redacted-fnv1a32:${fnv1a32(profileId)}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
