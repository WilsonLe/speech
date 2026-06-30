import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Accordion, MenuButton, RadioGroup, type MenuButtonItem } from '@speech/ui';
import type { TrainingReadinessCoverageReportV1 } from '@speech/enrollment';
import {
  buildTrainingReadinessCoverageReportForProfile,
  type ActiveEnrollmentProfileStateV1,
  type EnrollmentProfileExportPackageV1,
  type EnrollmentProfileImportMode,
  type EnrollmentProfileImportResultV1,
  type EnrollmentProfileSummaryV1,
  type PortableSpeechModelExportSummaryV1,
  type PortableSpeechModelImportSummaryV1,
  type ProfileStorageBackendKind,
} from '@speech/profile-manager';
import type { InstalledModelRecord } from '@speech/model-manager';
import {
  deactivateEnrollmentProfile,
  deleteEnrollmentProfile,
  enableEnrollmentProfile,
  exportEnrollmentProfile,
  exportPortableSpeechModel,
  importEnrollmentProfile,
  importPortableSpeechModel,
  listEnrollmentProfiles,
  renameEnrollmentProfile,
  rollbackEnrollmentProfile,
} from '../workers/profile-store-client';
import {
  checkAsrWorkerRuntime,
  type AsrWorkerRuntimeCheckResult,
} from '../workers/asr-worker-client';
import {
  createModelLifecycleWorker,
  type ManifestInspectionResult,
  type ModelLifecycleModel,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';
import {
  probeRuntimeCapabilities,
  runCapabilityWorkerBenchmark,
  type CapabilityReport,
} from '../capabilities';
import { useAppRoute } from './appRouteContext';
import {
  buildCreateModelReview,
  createCreateModelDraft,
  loadCreateModelDraft,
  saveCreateModelDraft,
  type CreateModelDraftV1,
  type CreateModelLanguageTargetV1,
  type CreateModelRecordingPlanV1,
} from './create-model-flow';
import { createDefaultVocabularyStore, loadVocabularyStore } from './vocabulary-storage';
import { formatModelReasonMessage, getModelReasonCopy } from '../content/reasonCodes';
import {
  buildPersonalModelActivationReviewCard,
  buildPersonalModelDetailSummary,
  buildPersonalModelListRow,
  buildPersonalModelProfileCard,
  buildPersonalModelResultView,
  defaultPersonalProfileId,
  summarizeActiveVocabulary,
  type ActiveVocabularySummaryV1,
  type PersonalModelActivationReviewCardV1,
  type PersonalModelDetailSummaryV1,
  type PersonalModelListRowV1,
  type PersonalModelGateSummaryV1,
  type PersonalModelProfileCardV1,
  type PersonalModelResultActionV1,
  type PersonalModelResultViewV1,
} from './personal-models';
import {
  buildPersonalModelCapabilityChecks,
  buildPersonalModelReadinessTasks,
  buildPersonalModelTrainingReadinessView,
  formatPreflightBytes,
  summarizePersonalModelTrainingCompanion,
  type PersonalModelPreflightCheckV1,
  type PersonalModelPreflightStatus,
  type PersonalModelReadinessTaskV1,
  type PersonalModelTrainingCompanionSummaryV1,
  type PersonalModelTrainingReadinessViewV1,
} from './personal-models-preflight';
import {
  buildPortableExportBaseModelReview,
  buildPortableExportReview,
  buildPortableExportStepView,
  formatPortableExportError,
  validatePortableExportPassphrase,
} from './personal-model-export-flow';
import {
  buildPortableImportBaseModelReview,
  buildPortableImportReview,
  buildPortableImportStepView,
  formatPortableImportError,
  inspectPortableImportEnvelope,
  type PortableImportBaseModelReviewV1,
  type PortableImportEnvelopePreviewV1,
  type PortableImportStepViewV1,
} from './personal-model-import-flow';

type PersonalModelsStatus =
  | 'loading'
  | 'ready'
  | 'activating'
  | 'exporting'
  | 'importing'
  | 'deleting'
  | 'error';

interface PersonalModelsUiState {
  readonly status: PersonalModelsStatus;
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly persistentStorageGranted: boolean | null;
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly summaries: readonly EnrollmentProfileSummaryV1[];
  readonly activeVocabulary: ActiveVocabularySummaryV1;
  readonly message: string;
}

type RuntimeSelfTestStatus = 'idle' | 'checking' | 'ready' | 'error';

interface RuntimeSelfTestUiState {
  readonly status: RuntimeSelfTestStatus;
  readonly result: AsrWorkerRuntimeCheckResult | null;
  readonly message: string;
}

interface PersonalModelsPreflightState {
  readonly capabilityReport: CapabilityReport | null;
  readonly capabilityError: string | null;
  readonly modelStatus: 'loading' | 'ready' | 'error';
  readonly modelBackendKind: string | null;
  readonly models: readonly ModelLifecycleModel[];
  readonly installed: readonly InstalledModelRecord[];
  readonly inspections: Readonly<Record<string, ManifestInspectionResult>>;
  readonly modelError: string | null;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
}

type PortableExportStatus = 'idle' | 'exporting' | 'ready' | 'error';

type PortableImportStatus = 'idle' | 'selected' | 'validating' | 'staged' | 'error';

interface PortableExportUiState {
  readonly status: PortableExportStatus;
  readonly profileId: string | null;
  readonly encrypted: boolean;
  readonly passphrase: string;
  readonly confirmPassphrase: string;
  readonly summary: PortableSpeechModelExportSummaryV1 | null;
  readonly envelopeBytes: ArrayBuffer | null;
  readonly error: string | null;
  readonly technicalError: string | null;
}

interface PortableImportUiState {
  readonly status: PortableImportStatus;
  readonly envelopeBytes: ArrayBuffer | null;
  readonly preview: PortableImportEnvelopePreviewV1 | null;
  readonly passphrase: string;
  readonly summary: PortableSpeechModelImportSummaryV1 | null;
  readonly error: string | null;
}

const initialPortableExportState: PortableExportUiState = {
  status: 'idle',
  profileId: null,
  encrypted: true,
  passphrase: '',
  confirmPassphrase: '',
  summary: null,
  envelopeBytes: null,
  error: null,
  technicalError: null,
};

const initialVocabularySummary = summarizeActiveVocabulary(createDefaultVocabularyStore());

const initialPersonalModelsState: PersonalModelsUiState = {
  status: 'loading',
  backendKind: null,
  persistentStorageGranted: null,
  activeState: null,
  summaries: [],
  activeVocabulary: initialVocabularySummary,
  message: formatModelReasonMessage('model-profiles-loading'),
};

const initialPreflightState: PersonalModelsPreflightState = {
  capabilityReport: null,
  capabilityError: null,
  modelStatus: 'loading',
  modelBackendKind: null,
  models: [],
  installed: [],
  inspections: {},
  modelError: null,
  runtimeSelfTest: {
    status: 'idle',
    result: null,
    message: getModelReasonCopy('model-runtime-check-idle').message,
  },
};

const initialPortableImportState: PortableImportUiState = {
  status: 'idle',
  envelopeBytes: null,
  preview: null,
  passphrase: '',
  summary: null,
  error: null,
};

type CreateModelWizardStep = 'name' | 'speech' | 'mixed' | 'plan' | 'review';

const allCreateModelSteps: readonly CreateModelWizardStep[] = [
  'name',
  'speech',
  'mixed',
  'plan',
  'review',
];

const createModelLanguageOptions = [
  {
    value: 'vietnamese',
    label: 'Vietnamese',
    description: 'Record Vietnamese prompts for this voice model.',
  },
  {
    value: 'english',
    label: 'English',
    description: 'Record English prompts for this voice model.',
  },
  {
    value: 'both',
    label: 'Vietnamese and English',
    description: 'Use a bilingual recording plan.',
  },
] as const;

const createModelMixedOptions = [
  {
    value: 'include',
    label: 'Include mixed speech',
    description: 'Add prompts that combine Vietnamese and English.',
  },
  {
    value: 'separate',
    label: 'Keep languages separate',
    description: 'Record Vietnamese and English prompts separately.',
  },
] as const;

const createModelPlanOptions = [
  {
    value: 'quick',
    label: 'Quick',
    description: 'Shorter recording plan for a fast draft.',
  },
  {
    value: 'recommended',
    label: 'Recommended',
    description: 'Balanced coverage for the best default result.',
  },
  {
    value: 'extended',
    label: 'Extended',
    description: 'More recording coverage when you have time.',
  },
] as const;

export function PersonalModelsPanel() {
  const currentRoute = useAppRoute();
  const [state, setState] = useState<PersonalModelsUiState>(initialPersonalModelsState);
  const [preflight, setPreflight] = useState<PersonalModelsPreflightState>(initialPreflightState);
  const [importMode, setImportMode] = useState<EnrollmentProfileImportMode>('dedupe');
  const [portableExport, setPortableExport] = useState<PortableExportUiState>(
    initialPortableExportState,
  );
  const [portableImport, setPortableImport] = useState<PortableImportUiState>(
    initialPortableImportState,
  );
  const [createModelDraft, setCreateModelDraft] = useState<CreateModelDraftV1>(() =>
    loadCreateModelDraft(typeof window === 'undefined' ? null : window.localStorage),
  );
  const [createModelStep, setCreateModelStep] = useState<CreateModelWizardStep>('name');
  const modelLifecycleWorkerRef = useRef<Worker | null>(null);
  const isCreateModelRoute = currentRoute.routeId === 'models-new';
  const isImportModelRoute = currentRoute.routeId === 'models-import';
  const isExportModelRoute = currentRoute.routeId === 'model-export';
  const isTrainingReadinessRoute = currentRoute.routeId === 'model-train';
  const isModelResultsRoute = currentRoute.routeId === 'model-results';
  const routeProfileId = currentRoute.params['profileId'];
  const primarySummary = useMemo(() => {
    if (routeProfileId !== undefined) {
      return state.summaries.find((summary) => summary.profile.id === routeProfileId) ?? null;
    }
    return (
      state.summaries.find(
        (summary) => summary.profile.id === state.activeState?.activeProfileId,
      ) ??
      state.summaries[0] ??
      null
    );
  }, [routeProfileId, state.activeState?.activeProfileId, state.summaries]);
  const cardRows = useMemo(() => {
    if (state.summaries.length === 0) {
      const card = buildPersonalModelProfileCard({
        summary: null,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      });
      return [
        {
          profileId: null,
          summary: null,
          card,
          row: buildPersonalModelListRow(card),
        },
      ];
    }
    return state.summaries.map((summary) => {
      const card = buildPersonalModelProfileCard({
        summary,
        activeState: state.activeState,
        activeVocabulary: state.activeVocabulary,
      });
      return {
        profileId: summary.profile.id,
        summary,
        card,
        row: buildPersonalModelListRow(card),
      };
    });
  }, [state.activeState, state.activeVocabulary, state.summaries]);
  const primaryCard = buildPersonalModelProfileCard({
    summary: primarySummary,
    activeState: state.activeState,
    activeVocabulary: state.activeVocabulary,
  });
  const primaryRow = useMemo(() => buildPersonalModelListRow(primaryCard), [primaryCard]);
  const detailSummary = useMemo(
    () => buildPersonalModelDetailSummary({ card: primaryCard, row: primaryRow }),
    [primaryCard, primaryRow],
  );
  const activationReview = useMemo(
    () =>
      buildPersonalModelActivationReviewCard({
        profileCard: primaryCard,
        activeState: state.activeState,
        activationDecision: null,
      }),
    [primaryCard, state.activeState],
  );
  const readinessReport = useMemo(
    () =>
      primarySummary === null
        ? null
        : buildTrainingReadinessCoverageReportForProfile(primarySummary),
    [primarySummary],
  );
  const capabilityChecks = useMemo(
    () => buildPersonalModelCapabilityChecks(preflight.capabilityReport),
    [preflight.capabilityReport],
  );
  const preferredBaseModelId = primarySummary?.profile.baseModel?.id;
  const trainingCompanion = useMemo(
    () =>
      summarizePersonalModelTrainingCompanion({
        models: preflight.models,
        installed: preflight.installed,
        inspections: preflight.inspections,
        ...(preferredBaseModelId === undefined ? {} : { preferredModelId: preferredBaseModelId }),
      }),
    [preflight.inspections, preflight.installed, preflight.models, preferredBaseModelId],
  );
  const portableExportBaseModel = useMemo(
    () =>
      buildPortableExportBaseModelReview(preflight.installed, primarySummary?.profile.baseModel),
    [preflight.installed, primarySummary?.profile.baseModel],
  );
  const portableExportMatchesRoute =
    portableExport.profileId === null || portableExport.profileId === primarySummary?.profile.id;
  const currentPortableExport: PortableExportUiState = portableExportMatchesRoute
    ? portableExport
    : {
        ...portableExport,
        status: 'idle',
        summary: null,
        envelopeBytes: null,
        error: null,
        technicalError: null,
      };
  const portableExportSteps = useMemo(
    () =>
      buildPortableExportStepView({
        baseModelReady: portableExportBaseModel.exactBaseModel !== undefined,
        encrypted: currentPortableExport.encrypted,
        passphrase: currentPortableExport.passphrase,
        confirmPassphrase: currentPortableExport.confirmPassphrase,
        exporting: currentPortableExport.status === 'exporting',
        summary: currentPortableExport.summary,
        error: currentPortableExport.error,
      }),
    [
      currentPortableExport.confirmPassphrase,
      currentPortableExport.encrypted,
      currentPortableExport.error,
      currentPortableExport.passphrase,
      currentPortableExport.status,
      currentPortableExport.summary,
      portableExportBaseModel.exactBaseModel,
    ],
  );
  const portableExportReview = useMemo(
    () =>
      currentPortableExport.summary === null
        ? null
        : buildPortableExportReview(currentPortableExport.summary),
    [currentPortableExport.summary],
  );
  const portableImportBaseModel = useMemo(
    () => buildPortableImportBaseModelReview(preflight.installed),
    [preflight.installed],
  );
  const portableImportSteps = useMemo(
    () =>
      buildPortableImportStepView({
        preview: portableImport.preview,
        passphrase: portableImport.passphrase,
        validating: portableImport.status === 'validating',
        summary: portableImport.summary,
        error: portableImport.error,
      }),
    [
      portableImport.error,
      portableImport.passphrase,
      portableImport.preview,
      portableImport.status,
      portableImport.summary,
    ],
  );
  const readinessTasks = useMemo(
    () => buildPersonalModelReadinessTasks(readinessReport),
    [readinessReport],
  );
  const readinessProfileId =
    primarySummary?.profile.id ?? routeProfileId ?? defaultPersonalProfileId;
  const modelResultView = useMemo(
    () =>
      buildPersonalModelResultView({
        review: activationReview,
        recordingHref: `/models/${encodeURIComponent(readinessProfileId)}/enroll`,
        trainingHref: `/models/${encodeURIComponent(readinessProfileId)}/train`,
      }),
    [activationReview, readinessProfileId],
  );
  const trainingReadinessView = useMemo(
    () =>
      buildPersonalModelTrainingReadinessView({
        card: primaryCard,
        readinessReport,
        readinessTasks,
        capabilityChecks,
        trainingCompanion,
        recordingHref: `/models/${encodeURIComponent(readinessProfileId)}/enroll`,
        trainingHref: `/models/${encodeURIComponent(readinessProfileId)}/train`,
      }),
    [
      capabilityChecks,
      primaryCard,
      readinessProfileId,
      readinessReport,
      readinessTasks,
      trainingCompanion,
    ],
  );
  const detailBlockers = useMemo(
    () =>
      buildModelDetailBlockers({
        activationReview,
        capabilityChecks,
        readinessTasks,
        trainingCompanion,
      }),
    [activationReview, capabilityChecks, readinessTasks, trainingCompanion],
  );
  const isBusy =
    state.status === 'loading' ||
    state.status === 'activating' ||
    state.status === 'exporting' ||
    state.status === 'importing' ||
    state.status === 'deleting';

  useEffect(() => {
    let cancelled = false;
    void refreshPersonalModels({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function runCapabilityPreflight() {
      try {
        const report = await probeRuntimeCapabilities(await runCapabilityWorkerBenchmark(5));
        if (cancelled) return;
        setPreflight((current) => ({
          ...current,
          capabilityReport: report,
          capabilityError: null,
        }));
      } catch {
        if (cancelled) return;
        setPreflight((current) => ({
          ...current,
          capabilityError: formatModelReasonMessage('model-capability-check-failed'),
        }));
      }
    }
    void runCapabilityPreflight();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const worker = createModelLifecycleWorker();
    modelLifecycleWorkerRef.current = worker;
    worker.addEventListener('message', handleModelLifecycleMessage);
    worker.addEventListener('error', handleModelLifecycleError);
    worker.postMessage({ type: 'INIT' });

    function handleModelLifecycleMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      setPreflight((current) => reduceModelLifecyclePreflight(current, message));
      if (message.type === 'READY') {
        for (const model of message.catalog.models) {
          if (model.manifestUrl !== undefined) {
            worker.postMessage({ type: 'INSPECT_MODEL', modelId: model.id });
          }
        }
      }
    }

    function handleModelLifecycleError(_event: ErrorEvent) {
      setPreflight((current) => ({
        ...current,
        modelStatus: 'error',
        modelError: formatModelReasonMessage('model-companion-check-failed'),
      }));
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleModelLifecycleMessage);
      worker.removeEventListener('error', handleModelLifecycleError);
      worker.terminate();
      if (modelLifecycleWorkerRef.current === worker) {
        modelLifecycleWorkerRef.current = null;
      }
    };
  }, []);

  async function refreshPersonalModels({
    cancelled = () => false,
    nextMessage,
  }: {
    readonly cancelled?: () => boolean;
    readonly nextMessage?: string;
  } = {}) {
    setState((current) => ({
      ...current,
      status: 'loading',
      message: nextMessage ?? formatModelReasonMessage('model-profile-refresh-started'),
    }));
    try {
      const vocabulary = summarizeActiveVocabulary(
        loadVocabularyStore(window.localStorage).snapshot,
      );
      const result = await listEnrollmentProfiles();
      if (cancelled()) return;
      setState({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summaries: result.summaries,
        activeVocabulary: vocabulary,
        message:
          nextMessage ??
          (result.summaries.length === 0
            ? formatModelReasonMessage('model-profiles-empty')
            : formatModelReasonMessage('model-profiles-loaded')),
      });
    } catch {
      if (cancelled()) return;
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-profiles-load-failed'),
      }));
    }
  }

  async function runRuntimeSelfTest() {
    setPreflight((current) => ({
      ...current,
      runtimeSelfTest: {
        status: 'checking',
        result: current.runtimeSelfTest.result,
        message: formatModelReasonMessage('model-runtime-check-started'),
      },
    }));
    try {
      const result = await checkAsrWorkerRuntime({
        preferredProvider: 'auto',
        adapterSmokeTest: true,
        timeoutMs: 15_000,
      });
      setPreflight((current) => ({
        ...current,
        runtimeSelfTest: {
          status: 'ready',
          result,
          message: formatModelReasonMessage('model-runtime-check-passed'),
        },
      }));
    } catch {
      setPreflight((current) => ({
        ...current,
        runtimeSelfTest: {
          status: 'error',
          result: null,
          message: formatModelReasonMessage('model-runtime-check-failed'),
        },
      }));
    }
  }

  function updateCreateModelDraft(
    patch: Partial<
      Pick<
        CreateModelDraftV1,
        'displayName' | 'languageTarget' | 'includeMixedSpeech' | 'recordingPlan'
      >
    >,
  ) {
    setCreateModelDraft((current) =>
      createCreateModelDraft(
        {
          displayName: patch.displayName ?? current.displayName,
          languageTarget: patch.languageTarget ?? current.languageTarget,
          includeMixedSpeech: patch.includeMixedSpeech ?? current.includeMixedSpeech,
          recordingPlan: patch.recordingPlan ?? current.recordingPlan,
        },
        new Date(),
      ),
    );
  }

  function moveCreateModelStep(direction: 'next' | 'back') {
    const steps = getCreateModelSteps(createModelDraft);
    const currentIndex = steps.indexOf(createModelStep);
    const nextIndex =
      direction === 'next'
        ? Math.min(currentIndex + 1, steps.length - 1)
        : Math.max(currentIndex - 1, 0);
    setCreateModelStep(steps[nextIndex] ?? 'name');
  }

  function handleStartRecording() {
    if (typeof window === 'undefined') return;
    saveCreateModelDraft(window.localStorage, createModelDraft);
    window.dispatchEvent(new Event('speech-create-model-draft-updated'));
  }

  async function enableProfile(profileId: string) {
    await runLifecycleAction('activating', formatModelReasonMessage('model-enable-started'), () =>
      enableEnrollmentProfile({ profileId }),
    );
  }

  async function enablePrimaryProfile() {
    if (primarySummary === null) return;
    await enableProfile(primarySummary.profile.id);
  }

  async function deactivateProfile(profileId: string) {
    if (!window.confirm('Deactivate this voice model and use the generic fallback instead?')) {
      return;
    }
    await runLifecycleAction(
      'activating',
      formatModelReasonMessage('model-deactivate-started'),
      () => deactivateEnrollmentProfile({ profileId }),
    );
  }

  async function rollbackProfile() {
    if (!window.confirm('Roll back to the previously active voice model?')) {
      return;
    }
    await runLifecycleAction('activating', formatModelReasonMessage('model-rollback-started'), () =>
      rollbackEnrollmentProfile(),
    );
  }

  async function exportLegacyProfile(profileId: string) {
    setState((current) => ({
      ...current,
      status: 'exporting',
      message: formatModelReasonMessage('model-export-started'),
    }));
    try {
      const result = await exportEnrollmentProfile({
        profileId,
        timeoutMs: 15_000,
      });
      downloadProfilePackage(result.profilePackage);
      await refreshPersonalModels({
        nextMessage: formatModelReasonMessage('model-export-complete'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-export-failed'),
      }));
    }
  }

  async function exportPortableModel() {
    if (primarySummary === null) return;
    if (portableExportBaseModel.exactBaseModel === undefined) {
      const error = portableExportBaseModel.detail;
      setPortableExport((current) => ({
        ...current,
        status: 'error',
        error,
        technicalError: null,
      }));
      setState((current) => ({ ...current, status: 'error', message: error }));
      return;
    }
    const passphraseError = validatePortableExportPassphrase(
      portableExport.encrypted,
      portableExport.passphrase,
      portableExport.confirmPassphrase,
    );
    if (passphraseError !== null) {
      setPortableExport((current) => ({
        ...current,
        status: 'error',
        error: passphraseError,
        technicalError: null,
      }));
      setState((current) => ({ ...current, status: 'error', message: passphraseError }));
      return;
    }
    setPortableExport((current) => ({
      ...current,
      status: 'exporting',
      profileId: primarySummary.profile.id,
      summary: null,
      envelopeBytes: null,
      error: null,
      technicalError: null,
    }));
    setState((current) => ({
      ...current,
      status: 'exporting',
      message: 'Preparing encrypted voice model export on this device.',
    }));
    try {
      const result = await exportPortableSpeechModel({
        profileId: primarySummary.profile.id,
        exactBaseModel: portableExportBaseModel.exactBaseModel,
        sourceAppVersion: '0.6.3',
        mode: portableExport.encrypted ? 'encrypted' : 'unencrypted',
        timeoutMs: 60_000,
        ...(portableExport.encrypted ? { passphrase: portableExport.passphrase } : {}),
      });
      setPortableExport((current) => ({
        ...current,
        status: 'ready',
        profileId: primarySummary.profile.id,
        summary: result.summary,
        envelopeBytes: result.envelopeBytes,
        passphrase: '',
        confirmPassphrase: '',
        error: null,
        technicalError: null,
      }));
      setState((current) => ({
        ...current,
        status: 'ready',
        message: `${result.summary.displayName} is ready to save.`,
      }));
    } catch (error) {
      const safeError = formatPortableExportError(error instanceof Error ? error.message : '');
      setPortableExport((current) => ({
        ...current,
        status: 'error',
        error: safeError,
        technicalError: error instanceof Error ? error.message : null,
      }));
      setState((current) => ({ ...current, status: 'error', message: safeError }));
    }
  }

  function savePortableExport() {
    if (
      currentPortableExport.envelopeBytes === null ||
      currentPortableExport.summary === null ||
      currentPortableExport.profileId !== primarySummary?.profile.id
    ) {
      return;
    }
    downloadPortableSpeechModel(
      currentPortableExport.envelopeBytes,
      currentPortableExport.summary.fileName,
    );
  }

  async function importProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setState((current) => ({
      ...current,
      status: 'importing',
      message: formatModelReasonMessage('model-import-started'),
    }));
    try {
      const profilePackage = JSON.parse(await file.text()) as EnrollmentProfileExportPackageV1;
      const result = await importEnrollmentProfile({
        profilePackage,
        mode: importMode,
        overwriteExisting: importMode === 'replace',
        timeoutMs: 15_000,
      });
      await refreshPersonalModels({
        nextMessage: formatImportResultMessage(result.importResult),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-import-failed'),
      }));
    }
  }

  async function handlePortableImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    try {
      const envelopeBytes = await file.arrayBuffer();
      const preview = inspectPortableImportEnvelope(new Uint8Array(envelopeBytes), file.name);
      setPortableImport({
        status: 'selected',
        envelopeBytes,
        preview,
        passphrase: '',
        summary: null,
        error: null,
      });
      setState((current) => ({
        ...current,
        status: 'ready',
        message: preview.passphraseRequired
          ? 'Enter the passphrase to unlock this voice model on this device.'
          : 'File selected. Validate it locally before import.',
      }));
    } catch (error) {
      setPortableImport({
        ...initialPortableImportState,
        status: 'error',
        error: formatPortableImportError(error),
      });
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatPortableImportError(error),
      }));
    }
  }

  async function stagePortableImport() {
    if (portableImport.envelopeBytes === null || portableImport.preview === null) return;
    if (portableImportBaseModel.expectedBaseModel === undefined) {
      const error = portableImportBaseModel.detail;
      setPortableImport((current) => ({ ...current, status: 'error', error }));
      setState((current) => ({ ...current, status: 'error', message: error }));
      return;
    }
    if (
      portableImport.preview.passphraseRequired &&
      portableImport.passphrase.trim().length === 0
    ) {
      const error = 'Enter the passphrase to unlock this voice model.';
      setPortableImport((current) => ({ ...current, status: 'error', error }));
      setState((current) => ({ ...current, status: 'error', message: error }));
      return;
    }
    setPortableImport((current) => ({ ...current, status: 'validating', error: null }));
    setState((current) => ({
      ...current,
      status: 'importing',
      message: 'Validating this voice model locally. Nothing is active yet.',
    }));
    try {
      const result = await importPortableSpeechModel({
        envelopeBytes: portableImport.envelopeBytes.slice(0),
        expectedBaseModel: portableImportBaseModel.expectedBaseModel,
        overwriteExisting: false,
        timeoutMs: 60_000,
        ...(portableImport.preview.passphraseRequired
          ? { passphrase: portableImport.passphrase }
          : {}),
      });
      setPortableImport({
        ...portableImport,
        status: 'staged',
        envelopeBytes: null,
        passphrase: '',
        summary: result.summary,
        error: null,
      });
      await refreshPersonalModels({
        nextMessage: 'Import checks passed. Review the staged voice model before using it.',
      });
    } catch (error) {
      const message = formatPortableImportError(error);
      setPortableImport((current) => ({ ...current, status: 'error', error: message }));
      setState((current) => ({ ...current, status: 'error', message }));
    }
  }

  function resetPortableImport() {
    setPortableImport(initialPortableImportState);
    setState((current) => ({
      ...current,
      status: 'ready',
      message: 'Choose a local .speechmodel file to import.',
    }));
  }

  async function duplicateProfile(profileId: string, displayName: string) {
    setState((current) => ({
      ...current,
      status: 'importing',
      message: formatModelReasonMessage('model-duplicate-started'),
    }));
    try {
      const exportResult = await exportEnrollmentProfile({ profileId, timeoutMs: 15_000 });
      const result = await importEnrollmentProfile({
        profilePackage: exportResult.profilePackage,
        mode: 'import-as-new',
        targetDisplayName: `${displayName} copy`,
        timeoutMs: 15_000,
      });
      await refreshPersonalModels({
        nextMessage: formatImportResultMessage(result.importResult),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-duplicate-failed'),
      }));
    }
  }

  async function renameProfile(profileId: string, currentDisplayName: string) {
    const displayName = window.prompt('Rename this voice model', currentDisplayName)?.trim();
    if (
      displayName === undefined ||
      displayName.length === 0 ||
      displayName === currentDisplayName
    ) {
      return;
    }
    setState((current) => ({
      ...current,
      status: 'loading',
      message: formatModelReasonMessage('model-rename-started'),
    }));
    try {
      await renameEnrollmentProfile({ profileId, displayName, timeoutMs: 15_000 });
      await refreshPersonalModels({
        nextMessage: formatModelReasonMessage('model-rename-complete'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-rename-failed'),
      }));
    }
  }

  async function deleteProfile(profileId: string, displayName: string) {
    if (
      !window.confirm(
        `Delete ${displayName}? Recordings, training data, and local model files for this voice model will be removed from this device.`,
      )
    ) {
      return;
    }
    await runLifecycleAction('deleting', formatModelReasonMessage('model-delete-started'), () =>
      deleteEnrollmentProfile({ profileId }),
    );
  }

  async function runLifecycleAction(
    status: Extract<PersonalModelsStatus, 'activating' | 'deleting'>,
    message: string,
    action: () => Promise<unknown>,
  ) {
    setState((current) => ({ ...current, status, message }));
    try {
      await action();
      await refreshPersonalModels({
        nextMessage:
          status === 'deleting'
            ? formatModelReasonMessage('model-delete-complete')
            : formatModelReasonMessage('model-lifecycle-refreshed'),
      });
    } catch {
      setState((current) => ({
        ...current,
        status: 'error',
        message: formatModelReasonMessage('model-lifecycle-failed'),
      }));
    }
  }

  return (
    <section className="panel personal-models" id="models" aria-labelledby="personal-models-title">
      <div className="section-heading">
        <p className="eyebrow">Personal models</p>
        <h2 id="personal-models-title">Voice models</h2>
        <p>
          Choose the active local model, continue recording or training, and keep import/export
          actions private on this device.
        </p>
      </div>

      <nav className="personal-models-nav" aria-label="Personal Models navigation">
        <a className="button secondary" href="#microphone-title">
          Record enrollment
        </a>
        <a className="button secondary" href="#vocabulary-title">
          Edit vocabulary
        </a>
        <a
          className="button secondary"
          href={`/models/${encodeURIComponent(readinessProfileId)}/train`}
        >
          Train or resume
        </a>
        <a className="button secondary" href="#offline-model-title">
          Speech model lifecycle
        </a>
      </nav>

      <div className="personal-models-summary" aria-label="Personal Models summary">
        <StatusPill
          label="Voice models"
          value={`${state.summaries.length.toString()} local voice model${
            state.summaries.length === 1 ? '' : 's'
          }`}
        />
        <StatusPill label="Storage" value={formatProfileStoreBackend(state.backendKind)} />
        <StatusPill
          label="Persistent storage"
          value={formatPersistentStorage(state.persistentStorageGranted)}
        />
        <StatusPill
          label="Active vocabulary"
          value={`${primaryCard.activeVocabulary.activeEntryCount.toString()} words`}
        />
      </div>

      {isCreateModelRoute ? (
        <CreateModelFlowPanel
          draft={createModelDraft}
          onBack={() => moveCreateModelStep('back')}
          onNext={() => moveCreateModelStep('next')}
          onStartRecording={handleStartRecording}
          onStepChange={setCreateModelStep}
          onUpdateDraft={updateCreateModelDraft}
          step={createModelStep}
        />
      ) : isImportModelRoute ? (
        <ImportModelFlowPanel
          baseModelReview={portableImportBaseModel}
          importMode={importMode}
          importState={portableImport}
          isBusy={isBusy}
          onFileChange={(event) => void handlePortableImportFile(event)}
          onImportLegacyProfile={(event) => void importProfile(event)}
          onPassphraseChange={(passphrase) =>
            setPortableImport((current) => ({ ...current, passphrase, error: null }))
          }
          onReset={resetPortableImport}
          onStage={() => void stagePortableImport()}
          onUpdateImportMode={setImportMode}
          steps={portableImportSteps}
        />
      ) : isExportModelRoute ? (
        <ExportModelFlowPanel
          baseModelReview={portableExportBaseModel}
          detailSummary={detailSummary}
          exportState={currentPortableExport}
          isBusy={isBusy}
          legacyExportDisabled={primarySummary === null || isBusy}
          onConfirmPassphraseChange={(confirmPassphrase) =>
            setPortableExport((current) => ({
              ...current,
              profileId: null,
              confirmPassphrase,
              summary: null,
              envelopeBytes: null,
              error: null,
              technicalError: null,
            }))
          }
          onEncryptedChange={(encrypted) =>
            setPortableExport((current) => ({
              ...current,
              profileId: null,
              encrypted,
              error: null,
              technicalError: null,
              summary: null,
              envelopeBytes: null,
              passphrase: encrypted ? current.passphrase : '',
              confirmPassphrase: encrypted ? current.confirmPassphrase : '',
            }))
          }
          onExport={() => void exportPortableModel()}
          onLegacyExport={() => {
            if (primarySummary !== null) void exportLegacyProfile(primarySummary.profile.id);
          }}
          onPassphraseChange={(passphrase) =>
            setPortableExport((current) => ({
              ...current,
              profileId: null,
              passphrase,
              summary: null,
              envelopeBytes: null,
              error: null,
              technicalError: null,
            }))
          }
          onSave={savePortableExport}
          review={portableExportReview}
          steps={portableExportSteps}
        />
      ) : isTrainingReadinessRoute ? (
        <TrainingReadinessPanel
          capabilityChecks={capabilityChecks}
          onTrain={() => focusRuntimePanel()}
          readinessTasks={readinessTasks}
          view={trainingReadinessView}
        />
      ) : isModelResultsRoute ? (
        <ModelResultsPanel
          isBusy={isBusy}
          onActivate={() => void enablePrimaryProfile()}
          resultView={modelResultView}
        />
      ) : (
        <>
          <section className="model-list-panel" aria-labelledby="voice-models-list-title">
            <div className="model-list-header">
              <div>
                <p className="eyebrow">Voice models</p>
                <h3 id="voice-models-list-title">Models</h3>
              </div>
              <div className="model-list-toolbar" aria-label="Model list actions">
                <a className="button secondary" href="/models/new">
                  New
                </a>
                <a className="button secondary" href="/models/import">
                  Import
                </a>
              </div>
            </div>

            <div className="model-list-toolbar" aria-label="Model refresh action">
              <button
                type="button"
                className="secondary"
                onClick={() => void refreshPersonalModels()}
                disabled={isBusy}
              >
                Refresh
              </button>
            </div>

            <div className="model-list" role="list" aria-label="Personal voice model rows">
              {cardRows.map((row) => (
                <article
                  className="model-list-row"
                  role="listitem"
                  key={row.profileId ?? 'generic-fallback'}
                >
                  <div className="model-list-main">
                    <h4>{row.row.displayName}</h4>
                    <div className="model-list-status" aria-label={`${row.row.displayName} status`}>
                      <span className={row.card.active ? 'status-chip success' : 'status-chip'}>
                        {row.row.activeLabel}
                      </span>
                      <span className="status-chip">{row.row.statusLabel}</span>
                    </div>
                  </div>
                  <div className="model-list-meta" aria-label={`${row.row.displayName} summary`}>
                    <span>{row.card.storage.acceptedUtterances.toString()} recordings</span>
                    <span>{formatDurationSeconds(row.card.storage.acceptedSeconds)}</span>
                    <span>{row.card.activeVocabulary.activeEntryCount.toString()} vocabulary</span>
                  </div>
                  <div className="model-list-actions">
                    <ModelRowPrimaryAction
                      row={row}
                      isBusy={isBusy}
                      onEnable={() =>
                        row.profileId === null ? undefined : void enableProfile(row.profileId)
                      }
                    />
                    {row.profileId === null ? null : (
                      <MenuButton
                        label="More"
                        menuLabel={`${row.row.displayName} model actions`}
                        buttonSize="sm"
                        items={createModelRowMenuItems({
                          profileId: row.profileId,
                          displayName: row.row.displayName,
                          active: row.card.active,
                          canExport: row.card.actions.canExport,
                          canDelete: row.card.actions.canDelete,
                          isBusy,
                          previousProfileAvailable:
                            state.activeState?.previousProfileId !== undefined,
                          onRename: () => void renameProfile(row.profileId, row.row.displayName),
                          onDuplicate: () =>
                            void duplicateProfile(row.profileId, row.row.displayName),
                          exportHref: `/models/${encodeURIComponent(row.profileId)}/export`,
                          onDeactivate: () => void deactivateProfile(row.profileId),
                          onRollback: () => void rollbackProfile(),
                          onDelete: () => void deleteProfile(row.profileId, row.row.displayName),
                        })}
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <PersonalModelDetailPanel
            activeState={state.activeState}
            backendKind={state.backendKind}
            capabilityChecks={capabilityChecks}
            capabilityError={preflight.capabilityError}
            card={primaryCard}
            detailBlockers={detailBlockers}
            detailSummary={detailSummary}
            isBusy={isBusy}
            modelBackendKind={preflight.modelBackendKind}
            modelError={preflight.modelError}
            modelStatus={preflight.modelStatus}
            onDeactivate={() =>
              primarySummary === null
                ? undefined
                : void deactivateProfile(primarySummary.profile.id)
            }
            onEnable={() =>
              primarySummary === null ? undefined : void enableProfile(primarySummary.profile.id)
            }
            onRunRuntimeSelfTest={() => void runRuntimeSelfTest()}
            persistentStorageGranted={state.persistentStorageGranted}
            readinessReport={readinessReport}
            readinessTasks={readinessTasks}
            resultView={modelResultView}
            runtimeSelfTest={preflight.runtimeSelfTest}
            trainingCompanion={trainingCompanion}
          />
        </>
      )}

      <p
        className={state.status === 'error' ? 'status-message error-message' : 'status-message'}
        aria-live="polite"
      >
        {state.message}
      </p>
      <p className="status-message">
        Models privacy: aggregate counts only; no raw audio, transcript text, training data, model
        files, vocabulary terms, or vocabulary item identifiers are displayed.
      </p>
    </section>
  );
}

function ExportModelFlowPanel({
  baseModelReview,
  detailSummary,
  exportState,
  isBusy,
  legacyExportDisabled,
  onConfirmPassphraseChange,
  onEncryptedChange,
  onExport,
  onLegacyExport,
  onPassphraseChange,
  onSave,
  review,
  steps,
}: {
  readonly baseModelReview: ReturnType<typeof buildPortableExportBaseModelReview>;
  readonly detailSummary: PersonalModelDetailSummaryV1;
  readonly exportState: PortableExportUiState;
  readonly isBusy: boolean;
  readonly legacyExportDisabled: boolean;
  readonly onConfirmPassphraseChange: (passphrase: string) => void;
  readonly onEncryptedChange: (encrypted: boolean) => void;
  readonly onExport: () => void;
  readonly onLegacyExport: () => void;
  readonly onPassphraseChange: (passphrase: string) => void;
  readonly onSave: () => void;
  readonly review: ReturnType<typeof buildPortableExportReview> | null;
  readonly steps: readonly ReturnType<typeof buildPortableExportStepView>[number][];
}) {
  const passphraseError = validatePortableExportPassphrase(
    exportState.encrypted,
    exportState.passphrase,
    exportState.confirmPassphrase,
  );
  const canExport =
    !isBusy &&
    exportState.status !== 'exporting' &&
    baseModelReview.exactBaseModel !== undefined &&
    passphraseError === null;
  return (
    <section className="export-model-flow" aria-labelledby="model-export-title">
      <div className="export-model-flow__header">
        <a className="button secondary" href="/models">
          Back to models
        </a>
        <p className="eyebrow">Export voice model</p>
        <h3 id="model-export-title">Export {detailSummary.displayName}</h3>
        <p>Save a portable .speechmodel file. Encryption is recommended.</p>
      </div>

      <ol className="export-model-steps" aria-label="Export steps">
        {steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      <section className="export-model-card" aria-labelledby="export-contents-title">
        <div>
          <p className="eyebrow">Step 1</p>
          <h4 id="export-contents-title">Choose contents</h4>
          <p>Recordings and training checkpoints are not included.</p>
        </div>
        <dl className="export-model-summary" aria-label="Export contents summary">
          <div>
            <dt>Name</dt>
            <dd>{detailSummary.displayName}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd>Not included</dd>
          </div>
          <div>
            <dt>Metric detail</dt>
            <dd>Aggregate results</dd>
          </div>
        </dl>
        <p className="status-message" data-status={baseModelReview.status}>
          {baseModelReview.title}. {baseModelReview.detail}
        </p>
      </section>

      <section className="export-model-card" aria-labelledby="export-encryption-title">
        <div>
          <p className="eyebrow">Step 2</p>
          <h4 id="export-encryption-title">Protect file</h4>
          <p>Passphrases are used only for this export and are not stored.</p>
        </div>
        <label className="export-model-checkbox">
          <input
            type="checkbox"
            checked={exportState.encrypted}
            onChange={(event) => onEncryptedChange(event.currentTarget.checked)}
            disabled={isBusy || exportState.status === 'exporting'}
          />
          <span>Encrypt export</span>
        </label>
        {exportState.encrypted ? (
          <div className="export-model-passphrases">
            <label htmlFor="export-model-passphrase">
              <span>Passphrase</span>
              <input
                id="export-model-passphrase"
                type="password"
                autoComplete="new-password"
                value={exportState.passphrase}
                onChange={(event) => onPassphraseChange(event.currentTarget.value)}
                disabled={isBusy || exportState.status === 'exporting'}
              />
            </label>
            <label htmlFor="export-model-confirm-passphrase">
              <span>Confirm passphrase</span>
              <input
                id="export-model-confirm-passphrase"
                type="password"
                autoComplete="new-password"
                value={exportState.confirmPassphrase}
                onChange={(event) => onConfirmPassphraseChange(event.currentTarget.value)}
                disabled={isBusy || exportState.status === 'exporting'}
              />
            </label>
            {passphraseError === null ? null : <p className="error-message">{passphraseError}</p>}
          </div>
        ) : (
          <p className="status-message warning-message">Unencrypted exports are sensitive files.</p>
        )}
      </section>

      <section className="export-model-card" aria-labelledby="export-review-title">
        <div>
          <p className="eyebrow">Step 3</p>
          <h4 id="export-review-title">Review and save</h4>
          <p>Packaging and encryption run in the profile worker.</p>
        </div>
        <div className="export-model-actions">
          <button type="button" onClick={onExport} disabled={!canExport}>
            {exportState.status === 'exporting' ? 'Preparing…' : 'Prepare export'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onSave}
            disabled={exportState.envelopeBytes === null || exportState.summary === null}
          >
            Save file
          </button>
        </div>
        {exportState.error === null ? null : <p className="error-message">{exportState.error}</p>}
        {review === null ? null : (
          <div className="export-model-review" aria-label="Prepared export review">
            <h5>{review.title}</h5>
            <p>{review.summary}</p>
            <dl className="export-model-summary">
              {review.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="status-message success-message">{review.privacySummary}</p>
          </div>
        )}
      </section>

      <details className="export-model-details">
        <summary>Export details</summary>
        <p>Manifest fields, checksums, and encryption parameters are kept here for verification.</p>
        {review === null ? null : <p>{review.technicalSummary}</p>}
        {exportState.technicalError === null ? null : <p>{exportState.technicalError}</p>}
      </details>

      <details className="export-model-details">
        <summary>Legacy profile export</summary>
        <p>
          Older profile JSON exports can include recordings and prompt text. Use .speechmodel for
          portable model sharing.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={onLegacyExport}
          disabled={legacyExportDisabled}
        >
          Export legacy profile JSON
        </button>
      </details>
    </section>
  );
}

function ImportModelFlowPanel({
  baseModelReview,
  importMode,
  importState,
  isBusy,
  onFileChange,
  onImportLegacyProfile,
  onPassphraseChange,
  onReset,
  onStage,
  onUpdateImportMode,
  steps,
}: {
  readonly baseModelReview: PortableImportBaseModelReviewV1;
  readonly importMode: EnrollmentProfileImportMode;
  readonly importState: PortableImportUiState;
  readonly isBusy: boolean;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onImportLegacyProfile: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPassphraseChange: (passphrase: string) => void;
  readonly onReset: () => void;
  readonly onStage: () => void;
  readonly onUpdateImportMode: (mode: EnrollmentProfileImportMode) => void;
  readonly steps: readonly PortableImportStepViewV1[];
}) {
  const review =
    importState.summary === null ? null : buildPortableImportReview(importState.summary);
  const canStage =
    importState.preview !== null &&
    baseModelReview.expectedBaseModel !== undefined &&
    !isBusy &&
    importState.status !== 'validating' &&
    importState.summary === null &&
    (!importState.preview.passphraseRequired || importState.passphrase.trim().length > 0);

  return (
    <section className="import-model-flow" aria-labelledby="model-import-title">
      <div className="import-model-flow__header">
        <a className="button secondary" href="/models">
          Back to models
        </a>
        <p className="eyebrow">Import voice model</p>
        <h3 id="model-import-title">Import a voice model</h3>
        <p>Choose a local .speechmodel file. Validation and smoke tests run on this device.</p>
      </div>

      <ol className="import-model-steps" aria-label="Import steps">
        {steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      <section className="import-model-card" aria-labelledby="import-file-title">
        <div>
          <p className="eyebrow">Step 1</p>
          <h4 id="import-file-title">Choose .speechmodel file</h4>
          <p>Hostile-file checks begin before archive expansion.</p>
        </div>
        <label className="secondary file-button import-model-file-button">
          Choose file
          <input
            type="file"
            accept=".speechmodel,application/vnd.wilsonle.speechmodel"
            onChange={onFileChange}
            disabled={isBusy}
          />
        </label>
        {importState.preview === null ? null : (
          <dl className="import-model-summary" aria-label="Selected file summary">
            <div>
              <dt>File</dt>
              <dd>{importState.preview.fileName}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{importState.preview.sizeLabel}</dd>
            </div>
            <div>
              <dt>Encryption</dt>
              <dd>{importState.preview.encrypted ? 'Passphrase required' : 'Not encrypted'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="import-model-card" aria-labelledby="import-unlock-title">
        <div>
          <p className="eyebrow">Step 2</p>
          <h4 id="import-unlock-title">Unlock when needed</h4>
          <p>Passphrases are used for this import only and are not stored.</p>
        </div>
        {importState.preview?.passphraseRequired === true ? (
          <label className="import-model-passphrase" htmlFor="import-model-passphrase">
            <span>Passphrase</span>
            <input
              id="import-model-passphrase"
              type="password"
              autoComplete="current-password"
              value={importState.passphrase}
              onChange={(event) => onPassphraseChange(event.currentTarget.value)}
              disabled={isBusy || importState.status === 'staged'}
            />
          </label>
        ) : (
          <p className="status-message">No passphrase needed for the selected file.</p>
        )}
      </section>

      <section className="import-model-card" aria-labelledby="import-validate-title">
        <div>
          <p className="eyebrow">Step 3</p>
          <h4 id="import-validate-title">Validate locally</h4>
          <p>{baseModelReview.detail}</p>
        </div>
        <p className="status-message" data-status={baseModelReview.status}>
          {baseModelReview.title}
        </p>
        <button type="button" onClick={onStage} disabled={!canStage}>
          {importState.status === 'validating' ? 'Validating…' : 'Validate and stage'}
        </button>
        {importState.error === null ? null : <p className="error-message">{importState.error}</p>}
      </section>

      {review === null ? null : (
        <section
          className="import-model-card import-model-review"
          aria-labelledby="import-review-title"
        >
          <div>
            <p className="eyebrow">Step 4</p>
            <h4 id="import-review-title">{review.title}</h4>
            <p>{review.summary}</p>
          </div>
          <dl className="import-model-summary" aria-label="Staged voice model review">
            {review.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="status-message success-message">{review.smokeSummary}</p>
          <p className="status-message">{review.privacySummary}</p>
          <div className="import-model-actions">
            <a className="button" href="/models">
              Back to models
            </a>
            <button type="button" className="secondary" onClick={onReset}>
              Import another
            </button>
          </div>
        </section>
      )}

      <details className="import-model-details">
        <summary>Validation details</summary>
        <p>
          Archive parsing, decryption, checksum verification, compatibility checks, smoke tests, and
          staging run in existing worker/package boundaries.
        </p>
        {review === null ? null : <p>{review.technicalSummary}</p>}
      </details>

      <details className="import-model-details">
        <summary>Legacy profile JSON import</summary>
        <p>
          Use this only for older local profile backups. Portable .speechmodel import is preferred.
        </p>
        <label className="select-field compact-select">
          <span>Import behavior</span>
          <select
            value={importMode}
            onChange={(event) =>
              onUpdateImportMode(event.currentTarget.value as EnrollmentProfileImportMode)
            }
            disabled={isBusy}
          >
            <option value="dedupe">Dedupe</option>
            <option value="import-as-new">Import as new</option>
            <option value="replace">Replace match</option>
          </select>
        </label>
        <label className="secondary file-button import-model-file-button">
          Import profile JSON
          <input
            type="file"
            accept="application/json,.json,.speechprofile"
            onChange={onImportLegacyProfile}
            disabled={isBusy}
          />
        </label>
      </details>
    </section>
  );
}

function CreateModelFlowPanel({
  draft,
  onBack,
  onNext,
  onStartRecording,
  onStepChange,
  onUpdateDraft,
  step,
}: {
  readonly draft: CreateModelDraftV1;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onStartRecording: () => void;
  readonly onStepChange: (step: CreateModelWizardStep) => void;
  readonly onUpdateDraft: (
    patch: Partial<
      Pick<
        CreateModelDraftV1,
        'displayName' | 'languageTarget' | 'includeMixedSpeech' | 'recordingPlan'
      >
    >,
  ) => void;
  readonly step: CreateModelWizardStep;
}) {
  const steps = getCreateModelSteps(draft);
  const stepIndex = Math.max(steps.indexOf(step), 0);
  const currentStep = steps[stepIndex] ?? 'name';
  const review = buildCreateModelReview(draft);
  const atFirstStep = stepIndex === 0;
  const atReviewStep = currentStep === 'review';
  const nameIsReady = draft.displayName.trim().length > 0;

  return (
    <section className="create-model-flow" aria-labelledby="create-model-flow-title">
      <div className="create-model-flow__header">
        <a className="button secondary" href="/models">
          Back to models
        </a>
        <p className="eyebrow">New voice model</p>
        <h3 id="create-model-flow-title">{getCreateModelStepTitle(currentStep)}</h3>
        <p className="create-model-flow__progress">
          Step {(stepIndex + 1).toString()} of {steps.length.toString()}
        </p>
      </div>

      <div className="create-model-flow__card" data-step={currentStep}>
        {currentStep === 'name' ? (
          <label className="create-model-flow__field" htmlFor="create-model-name">
            <span>Name this voice model</span>
            <input
              id="create-model-name"
              maxLength={80}
              onChange={(event) => onUpdateDraft({ displayName: event.currentTarget.value })}
              type="text"
              value={draft.displayName}
            />
          </label>
        ) : null}

        {currentStep === 'speech' ? (
          <RadioGroup
            label="Which speech should it learn?"
            name="create-model-language-target"
            onValueChange={(value) =>
              onUpdateDraft({ languageTarget: value as CreateModelLanguageTargetV1 })
            }
            options={createModelLanguageOptions}
            value={draft.languageTarget}
          />
        ) : null}

        {currentStep === 'mixed' ? (
          <RadioGroup
            label="Include mixed Vietnamese and English?"
            name="create-model-mixed-speech"
            onValueChange={(value) => onUpdateDraft({ includeMixedSpeech: value === 'include' })}
            options={createModelMixedOptions}
            value={draft.includeMixedSpeech ? 'include' : 'separate'}
          />
        ) : null}

        {currentStep === 'plan' ? (
          <RadioGroup
            label="Choose a recording plan"
            name="create-model-recording-plan"
            onValueChange={(value) =>
              onUpdateDraft({ recordingPlan: value as CreateModelRecordingPlanV1 })
            }
            options={createModelPlanOptions}
            value={draft.recordingPlan}
          />
        ) : null}

        {currentStep === 'review' ? <CreateModelReview review={review} /> : null}
      </div>

      <details className="create-model-flow__details">
        <summary>How voice models work</summary>
        <p>
          Speech stays on this device. The app adapts the shared speech model to your recordings
          instead of sending audio to a service.
        </p>
      </details>

      <div className="create-model-flow__actions" aria-label="Create voice model actions">
        <button type="button" className="secondary" onClick={onBack} disabled={atFirstStep}>
          Back
        </button>
        {steps.map((candidateStep) => (
          <button
            aria-current={candidateStep === currentStep ? 'step' : undefined}
            className="secondary create-model-flow__step-dot"
            key={candidateStep}
            onClick={() => onStepChange(candidateStep)}
            type="button"
          >
            <span className="sr-only">{getCreateModelStepTitle(candidateStep)}</span>
          </button>
        ))}
        {atReviewStep ? (
          <a className="button" href={review.startRoute} onClick={onStartRecording}>
            Start recording
          </a>
        ) : (
          <button type="button" onClick={onNext} disabled={currentStep === 'name' && !nameIsReady}>
            Continue
          </button>
        )}
      </div>
    </section>
  );
}

function CreateModelReview({
  review,
}: {
  readonly review: ReturnType<typeof buildCreateModelReview>;
}) {
  return (
    <div className="create-model-flow__review" aria-label="New voice model review">
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{review.name}</dd>
        </div>
        <div>
          <dt>Speech</dt>
          <dd>{review.speech}</dd>
        </div>
        <div>
          <dt>Mixed speech</dt>
          <dd>{review.mixedSpeech}</dd>
        </div>
        <div>
          <dt>Recording plan</dt>
          <dd>{review.plan}</dd>
        </div>
      </dl>
      <p className="status-message">Recording starts next. Progress is saved on this device.</p>
    </div>
  );
}

function TrainingReadinessPanel({
  capabilityChecks,
  onTrain,
  readinessTasks,
  view,
}: {
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly onTrain: () => void;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly view: PersonalModelTrainingReadinessViewV1;
}) {
  return (
    <section
      className="training-readiness-panel"
      aria-labelledby="training-readiness-title"
      data-status={view.status}
    >
      <div className="training-readiness-hero">
        <div>
          <p className="eyebrow">Training readiness</p>
          <h3 id="training-readiness-title">{view.title}</h3>
          <p>{view.summary}</p>
        </div>
        {view.primaryAction.kind === 'continue-recording' ? (
          <a className="button" href={view.primaryAction.href}>
            {view.primaryAction.label}
          </a>
        ) : (
          <button type="button" onClick={onTrain} disabled={view.primaryAction.disabled}>
            {view.primaryAction.label}
          </button>
        )}
      </div>

      <dl className="training-readiness-metrics" aria-label="Training readiness summary">
        <div>
          <dt>Recordings</dt>
          <dd>{view.recording.acceptedCount.toLocaleString('en')}</dd>
        </div>
        <div>
          <dt>Active speech</dt>
          <dd>{formatDurationSeconds(view.recording.acceptedDurationSeconds)}</dd>
        </div>
        <div>
          <dt>Required free storage</dt>
          <dd>{view.storage.label}</dd>
        </div>
        <div>
          <dt>Browser support</dt>
          <dd>{view.browserSupport.label}</dd>
        </div>
      </dl>

      {view.blockers.length === 0 ? (
        <p className="status-message success-message">All checks passed.</p>
      ) : (
        <ul className="training-readiness-blockers" aria-label="Training blockers">
          {view.blockers.map((blocker) => (
            <li key={blocker.id}>
              <strong>{blocker.label}</strong>
              <p>{blocker.detail}</p>
              <span>{blocker.nextAction}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="training-readiness-disclosures" aria-label="Training readiness details">
        <details>
          <summary>Recording details</summary>
          <p>{view.recording.label}</p>
          <p>
            Minimum: {view.recording.requiredCount.toLocaleString('en')} recordings and{' '}
            {formatDurationSeconds(view.recording.requiredDurationSeconds)} active speech.
          </p>
          <ul className="model-detail-task-list" aria-label="Recording readiness tasks">
            {readinessTasks.map((task) => (
              <li key={task.label} data-status={task.status}>
                <strong>{task.label}</strong>
                <span>
                  {task.status === 'complete' ? 'Complete' : `${task.missing.toString()} missing`}
                </span>
                <p>{task.detail}</p>
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary>Browser details</summary>
          <p>{view.browserSupport.detail}</p>
          <p>
            {view.details.passedCheckCount.toString()} passed ·{' '}
            {view.details.fallbackCheckCount.toString()} fallback ·{' '}
            {view.details.actionNeededCheckCount.toString()} need attention
          </p>
          <ul className="preflight-check-list" aria-label="Browser readiness checks">
            {capabilityChecks.map((check) => (
              <li key={check.label} data-status={check.status}>
                <strong>{check.label}</strong>
                <span>{formatPreflightStatus(check.status)}</span>
                <p>{check.detail}</p>
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary>Training support details</summary>
          <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
            <div>
              <dt>Status</dt>
              <dd>{view.trainingSupport.label}</dd>
            </div>
            <div>
              <dt>Required free storage</dt>
              <dd>{formatPreflightBytes(view.storage.requiredFreeBytes)}</dd>
            </div>
          </dl>
          <p>{view.trainingSupport.detail}</p>
        </details>

        <details>
          <summary>Privacy and data use</summary>
          <p>
            Readiness uses aggregate local counts only. Audio, transcript text, vocabulary terms,
            feature data, checkpoints, and model files stay on this device.
          </p>
        </details>
      </div>
    </section>
  );
}

function getCreateModelSteps(draft: CreateModelDraftV1): readonly CreateModelWizardStep[] {
  if (draft.languageTarget === 'both') return allCreateModelSteps;
  return allCreateModelSteps.filter((step) => step !== 'mixed');
}

function getCreateModelStepTitle(step: CreateModelWizardStep): string {
  if (step === 'name') return 'Name this voice model';
  if (step === 'speech') return 'Which speech should it learn?';
  if (step === 'mixed') return 'Include mixed Vietnamese and English?';
  if (step === 'plan') return 'Choose a recording plan';
  return 'Review and start recording';
}

interface ModelDetailBlocker {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: 'blocker' | 'warning';
}

function PersonalModelDetailPanel({
  activeState,
  backendKind,
  capabilityChecks,
  capabilityError,
  card,
  detailBlockers,
  detailSummary,
  isBusy,
  modelBackendKind,
  modelError,
  modelStatus,
  onDeactivate,
  onEnable,
  onRunRuntimeSelfTest,
  persistentStorageGranted,
  readinessReport,
  readinessTasks,
  resultView,
  runtimeSelfTest,
  trainingCompanion,
}: {
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly capabilityError: string | null;
  readonly card: PersonalModelProfileCardV1;
  readonly detailBlockers: readonly ModelDetailBlocker[];
  readonly detailSummary: PersonalModelDetailSummaryV1;
  readonly isBusy: boolean;
  readonly modelBackendKind: string | null;
  readonly modelError: string | null;
  readonly modelStatus: PersonalModelsPreflightState['modelStatus'];
  readonly onDeactivate: () => void | undefined;
  readonly onEnable: () => void | undefined;
  readonly onRunRuntimeSelfTest: () => void;
  readonly persistentStorageGranted: boolean | null;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly resultView: PersonalModelResultViewV1;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <section className="model-detail-panel" aria-labelledby="model-detail-title">
      <div className="model-detail-summary">
        <div className="model-detail-summary__copy">
          <p className="eyebrow">Model detail</p>
          <h3 id="model-detail-title">{detailSummary.displayName}</h3>
          <p>{detailSummary.nextActionSentence}</p>
          <dl className="model-detail-summary__meta" aria-label="Selected model summary">
            <div>
              <dt>Status</dt>
              <dd>{detailSummary.statusLabel}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateLabel(detailSummary.lastUpdatedIso)}</dd>
            </div>
          </dl>
        </div>
        <ModelDetailPrimaryAction
          detailSummary={detailSummary}
          isBusy={isBusy}
          onDeactivate={onDeactivate}
          onEnable={onEnable}
        />
      </div>

      {detailBlockers.length === 0 ? null : (
        <div className="model-detail-blockers" aria-label="Model blockers and incompatibilities">
          {detailBlockers.map((blocker) => (
            <article data-tone={blocker.tone} key={blocker.id}>
              <strong>{blocker.label}</strong>
              <p>{blocker.detail}</p>
            </article>
          ))}
        </div>
      )}

      <Accordion
        aria-label="Model detail sections"
        className="model-detail-accordion"
        headingLevel={4}
        items={[
          {
            id: 'recording-coverage',
            title: 'Recording coverage',
            children: (
              <ModelDetailRecordingCoverage
                card={card}
                readinessReport={readinessReport}
                readinessTasks={readinessTasks}
              />
            ),
          },
          {
            id: 'quality-results',
            title: 'Quality results',
            children: <PersonalModelResultViewPanel isBusy={isBusy} resultView={resultView} />,
          },
          {
            id: 'compatibility',
            title: 'Compatibility',
            children: (
              <ModelDetailCompatibilitySection
                capabilityChecks={capabilityChecks}
                capabilityError={capabilityError}
                modelError={modelError}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
          {
            id: 'storage',
            title: 'Storage',
            children: (
              <ModelDetailStorageSection
                backendKind={backendKind}
                card={card}
                persistentStorageGranted={persistentStorageGranted}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
          {
            id: 'technical-details',
            title: 'Technical details',
            children: (
              <ModelDetailTechnicalSection
                activeState={activeState}
                card={card}
                modelBackendKind={modelBackendKind}
                modelStatus={modelStatus}
                onRunRuntimeSelfTest={onRunRuntimeSelfTest}
                runtimeSelfTest={runtimeSelfTest}
                trainingCompanion={trainingCompanion}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function ModelDetailPrimaryAction({
  detailSummary,
  isBusy,
  onDeactivate,
  onEnable,
}: {
  readonly detailSummary: PersonalModelDetailSummaryV1;
  readonly isBusy: boolean;
  readonly onDeactivate: () => void | undefined;
  readonly onEnable: () => void | undefined;
}) {
  if (detailSummary.primaryAction === 'continue-recording') {
    return (
      <a className="button" href="#microphone-title">
        {detailSummary.primaryActionLabel}
      </a>
    );
  }

  if (detailSummary.primaryAction === 'use-model') {
    return (
      <button
        type="button"
        onClick={onEnable}
        disabled={isBusy || detailSummary.primaryActionDisabled}
      >
        {detailSummary.primaryActionLabel}
      </button>
    );
  }

  if (detailSummary.primaryAction === 'deactivate') {
    return (
      <button type="button" className="secondary" onClick={onDeactivate} disabled={isBusy}>
        {detailSummary.primaryActionLabel}
      </button>
    );
  }

  return (
    <button type="button" className="secondary" disabled>
      {detailSummary.primaryActionLabel}
    </button>
  );
}

function ModelDetailRecordingCoverage({
  card,
  readinessReport,
  readinessTasks,
}: {
  readonly card: PersonalModelProfileCardV1;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Accepted recordings</dt>
          <dd>{card.storage.acceptedUtterances.toString()}</dd>
        </div>
        <div>
          <dt>Active speech</dt>
          <dd>{formatDurationSeconds(card.storage.acceptedSeconds)}</dd>
        </div>
        <div>
          <dt>Prompt coverage</dt>
          <dd>{formatPromptCoverage(readinessReport)}</dd>
        </div>
        <div>
          <dt>Vocabulary coverage</dt>
          <dd>{formatVocabularyCoverage(readinessReport)}</dd>
        </div>
      </dl>
      <ul className="model-detail-task-list" aria-label="Recording coverage tasks">
        {readinessTasks.map((task) => (
          <li key={task.label} data-status={task.status}>
            <strong>{task.label}</strong>
            <span>
              {task.status === 'complete' ? 'Complete' : `${task.missing.toString()} missing`}
            </span>
            <p>{task.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelDetailCompatibilitySection({
  capabilityChecks,
  capabilityError,
  modelError,
  trainingCompanion,
}: {
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly capabilityError: string | null;
  readonly modelError: string | null;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      {capabilityError ? <p className="status-message error-message">{capabilityError}</p> : null}
      {modelError ? <p className="status-message error-message">{modelError}</p> : null}
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Speech model</dt>
          <dd>{trainingCompanion.modelLabel}</dd>
        </div>
        <div>
          <dt>Training support files</dt>
          <dd>{formatTrainingCompanionStatus(trainingCompanion)}</dd>
        </div>
        <div>
          <dt>Required files</dt>
          <dd>{trainingCompanion.requiredFileCount.toString()}</dd>
        </div>
        <div>
          <dt>Required storage</dt>
          <dd>{formatPreflightBytes(trainingCompanion.requiredStorageBytes)}</dd>
        </div>
      </dl>
      <ul className="preflight-check-list" aria-label="Compatibility checks">
        {capabilityChecks.map((check) => (
          <li key={check.label} data-status={check.status}>
            <strong>{check.label}</strong>
            <span>{formatPreflightStatus(check.status)}</span>
            <p>{check.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelDetailStorageSection({
  backendKind,
  card,
  persistentStorageGranted,
  trainingCompanion,
}: {
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly card: PersonalModelProfileCardV1;
  readonly persistentStorageGranted: boolean | null;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Recordings and profile</dt>
          <dd>{formatPreflightBytes(card.storage.storedBytes)}</dd>
        </div>
        <div>
          <dt>Training support files</dt>
          <dd>{formatPreflightBytes(trainingCompanion.requiredStorageBytes)}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{formatProfileStoreBackend(backendKind)}</dd>
        </div>
        <div>
          <dt>Persistent storage</dt>
          <dd>{formatPersistentStorage(persistentStorageGranted)}</dd>
        </div>
      </dl>
      <p className="status-message">
        Storage details remain local. Delete and export actions stay in each model row menu so
        destructive consequences remain explicit.
      </p>
    </div>
  );
}

function ModelDetailTechnicalSection({
  activeState,
  card,
  modelBackendKind,
  modelStatus,
  onRunRuntimeSelfTest,
  runtimeSelfTest,
  trainingCompanion,
}: {
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly card: PersonalModelProfileCardV1;
  readonly modelBackendKind: string | null;
  readonly modelStatus: PersonalModelsPreflightState['modelStatus'];
  readonly onRunRuntimeSelfTest: () => void;
  readonly runtimeSelfTest: RuntimeSelfTestUiState;
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}) {
  return (
    <div className="model-detail-section-content">
      <dl className="model-card-meta personal-model-card-meta model-detail-metrics">
        <div>
          <dt>Speech model binding</dt>
          <dd>
            {card.baseModel.status === 'exact-bound' ? 'exact match retained' : 'generic fallback'}
          </dd>
        </div>
        <div>
          <dt>Speech model version</dt>
          <dd>{card.baseModel.version ?? 'not bound'}</dd>
        </div>
        <div>
          <dt>Model storage</dt>
          <dd>{modelBackendKind ?? modelStatus}</dd>
        </div>
        <div>
          <dt>Runtime self-test</dt>
          <dd>{formatRuntimeSelfTestStatus(runtimeSelfTest)}</dd>
        </div>
        <div>
          <dt>Training support status</dt>
          <dd>{formatTrainingCompanionStatus(trainingCompanion)}</dd>
        </div>
        <div>
          <dt>Rollback state</dt>
          <dd>
            {activeState?.previousProfileId === undefined
              ? 'generic fallback'
              : 'previous retained'}
          </dd>
        </div>
      </dl>
      <button type="button" className="secondary" onClick={onRunRuntimeSelfTest}>
        Run runtime self-test
      </button>
      <p className="status-message">
        Technical details stay aggregate-only here. Diagnostics exports retain exact reproducible
        metrics with existing privacy filtering.
      </p>
    </div>
  );
}

function buildModelDetailBlockers({
  activationReview,
  capabilityChecks,
  readinessTasks,
  trainingCompanion,
}: {
  readonly activationReview: PersonalModelActivationReviewCardV1;
  readonly capabilityChecks: readonly PersonalModelPreflightCheckV1[];
  readonly readinessTasks: readonly PersonalModelReadinessTaskV1[];
  readonly trainingCompanion: PersonalModelTrainingCompanionSummaryV1;
}): readonly ModelDetailBlocker[] {
  const blockers: ModelDetailBlocker[] = [];
  if (activationReview.status === 'blocked') {
    blockers.push({
      id: 'activation-blocked',
      label: 'Activation blocked',
      detail: activationReview.detail,
      tone: 'blocker',
    });
  }

  const missingReadiness = readinessTasks.find((task) => task.status === 'missing');
  if (missingReadiness !== undefined) {
    blockers.push({
      id: 'recording-coverage-needed',
      label: 'Recording coverage needed',
      detail: missingReadiness.detail,
      tone: 'warning',
    });
  }

  if (trainingCompanion.status === 'base-model-missing') {
    blockers.push({
      id: 'base-model-missing',
      label: 'Speech model required',
      detail: trainingCompanion.detail,
      tone: 'blocker',
    });
  }

  const actionNeededCheck = capabilityChecks.find((check) => check.status === 'action-needed');
  if (actionNeededCheck !== undefined) {
    blockers.push({
      id: 'capability-action-needed',
      label: actionNeededCheck.label,
      detail: actionNeededCheck.detail,
      tone: 'warning',
    });
  }

  return blockers.slice(0, 4);
}

function ModelRowPrimaryAction({
  row,
  isBusy,
  onEnable,
}: {
  readonly row: {
    readonly profileId: string | null;
    readonly card: PersonalModelProfileCardV1;
    readonly row: PersonalModelListRowV1;
  };
  readonly isBusy: boolean;
  readonly onEnable: () => void | undefined;
}) {
  if (row.row.primaryAction === 'continue-recording') {
    return (
      <a className="button secondary" href="#microphone-title">
        {row.row.primaryActionLabel}
      </a>
    );
  }
  if (row.row.primaryAction === 'use-model') {
    return (
      <button
        type="button"
        className="secondary"
        onClick={onEnable}
        disabled={isBusy || row.row.primaryActionDisabled || !row.card.actions.canEnable}
      >
        {row.row.primaryActionLabel}
      </button>
    );
  }
  return (
    <button type="button" className="secondary" disabled>
      {row.row.primaryActionLabel}
    </button>
  );
}

function createModelRowMenuItems({
  profileId,
  displayName,
  active,
  canExport,
  canDelete,
  isBusy,
  previousProfileAvailable,
  onRename,
  onDuplicate,
  exportHref,
  onDeactivate,
  onRollback,
  onDelete,
}: {
  readonly profileId: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly canExport: boolean;
  readonly canDelete: boolean;
  readonly isBusy: boolean;
  readonly previousProfileAvailable: boolean;
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly exportHref: string;
  readonly onDeactivate: () => void;
  readonly onRollback: () => void;
  readonly onDelete: () => void;
}): readonly MenuButtonItem[] {
  return [
    { id: `${profileId}-rename`, label: 'Rename…', disabled: isBusy, onSelect: onRename },
    { id: `${profileId}-duplicate`, label: 'Duplicate…', disabled: isBusy, onSelect: onDuplicate },
    {
      id: `${profileId}-export`,
      kind: 'link',
      label: 'Export…',
      href: exportHref,
      disabled: isBusy || !canExport,
    },
    {
      id: `${profileId}-deactivate`,
      label: active ? 'Deactivate…' : 'Deactivate',
      disabled: isBusy || !active,
      onSelect: onDeactivate,
    },
    {
      id: `${profileId}-rollback`,
      label: 'Roll back…',
      disabled: isBusy || !active || !previousProfileAvailable,
      onSelect: onRollback,
    },
    {
      id: `${profileId}-delete`,
      label: `Delete ${displayName}…`,
      disabled: isBusy || !canDelete,
      destructive: true,
      onSelect: onDelete,
    },
  ];
}

function ModelResultsPanel({
  isBusy,
  onActivate,
  resultView,
}: {
  readonly isBusy: boolean;
  readonly onActivate: () => void;
  readonly resultView: PersonalModelResultViewV1;
}) {
  return (
    <section className="model-results-screen" aria-labelledby="model-results-title">
      <PersonalModelResultViewPanel
        actionHeadingId="model-results-title"
        isBusy={isBusy}
        onActivate={onActivate}
        resultView={resultView}
      />
    </section>
  );
}

function PersonalModelResultViewPanel({
  actionHeadingId = 'activation-review-title',
  isBusy,
  onActivate,
  resultView,
}: {
  readonly actionHeadingId?: string;
  readonly isBusy: boolean;
  readonly onActivate?: () => void;
  readonly resultView: PersonalModelResultViewV1;
}) {
  return (
    <section className="activation-review-card" aria-labelledby={actionHeadingId}>
      <div className="section-heading compact-heading">
        <p className="eyebrow">Candidate result</p>
        <h3 id={actionHeadingId}>{resultView.title}</h3>
        <p>{resultView.detail}</p>
      </div>

      <div className="model-result-actions" aria-label="Candidate result actions">
        <ResultPrimaryAction
          isBusy={isBusy}
          {...(onActivate === undefined ? {} : { onActivate })}
          resultView={resultView}
        />
        {resultView.secondaryActions.map((action) => (
          <ResultSecondaryAction action={action} key={action.kind} />
        ))}
      </div>

      <details className="model-result-details">
        <summary>Results</summary>
        <div className="model-result-metric-groups">
          {resultView.metricGroups.map((group) => (
            <section
              key={group.title}
              aria-labelledby={`model-result-${slugifyLabel(group.title)}`}
            >
              <h4 id={`model-result-${slugifyLabel(group.title)}`}>{group.title}</h4>
              <dl className="model-card-meta personal-model-card-meta activation-review-meta">
                {group.metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </details>

      <div className="model-result-gates" aria-label="Quality checks">
        <GateSummary title="Required checks" gates={resultView.gateGroups.hard} />
        <GateSummary title="Advisory checks" gates={resultView.gateGroups.advisory} />
      </div>

      <p className="status-message">
        Rollback:{' '}
        {resultView.rollback.previousProfileAvailable
          ? 'previous model retained'
          : 'generic fallback available'}
        . Activation changes apply at the next utterance boundary.
      </p>
      <p className="status-message">
        Privacy: aggregate metrics only; no raw audio, transcript text, case identifiers, profile
        identifiers, vocabulary terms, feature data, checkpoints, or model files are displayed.
      </p>
    </section>
  );
}

function ResultPrimaryAction({
  isBusy,
  onActivate,
  resultView,
}: {
  readonly isBusy: boolean;
  readonly onActivate?: () => void;
  readonly resultView: PersonalModelResultViewV1;
}) {
  const action = resultView.primaryAction;
  if (action.kind === 'use-model') {
    return (
      <button
        type="button"
        className="primary"
        disabled={isBusy || action.disabled || onActivate === undefined}
        onClick={onActivate}
      >
        {action.label}
      </button>
    );
  }
  if (action.href !== undefined) {
    return (
      <a
        className={action.tone === 'primary' ? 'button primary' : 'button secondary'}
        href={action.href}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className="secondary" disabled>
      {action.label}
    </button>
  );
}

function ResultSecondaryAction({ action }: { readonly action: PersonalModelResultActionV1 }) {
  if (action.href !== undefined) {
    return (
      <a className="button secondary" href={action.href} aria-disabled={action.disabled}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className="secondary" disabled={action.disabled}>
      {action.label}
    </button>
  );
}

function GateSummary({
  gates,
  title,
}: {
  readonly gates: readonly PersonalModelGateSummaryV1[];
  readonly title: string;
}) {
  const titleId = `model-result-gates-${slugifyLabel(title)}`;
  if (gates.length === 0) {
    return (
      <section aria-labelledby={titleId}>
        <h4 id={titleId}>{title}</h4>
        <p>No checks are available yet.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId}>{title}</h4>
      <ul className="model-result-gate-list">
        {gates.map((gate) => (
          <li
            key={`${gate.severity}-${gate.label}`}
            data-status={gate.passed ? 'passed' : 'failed'}
          >
            <strong>{gate.label}</strong>
            <span>
              {gate.passed
                ? 'Passed'
                : gate.severity === 'hard'
                  ? 'Required check failed'
                  : 'Advisory check'}
            </span>
            <p>{gate.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="status-pill" data-tone="neutral">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function reduceModelLifecyclePreflight(
  current: PersonalModelsPreflightState,
  message: ModelLifecycleResponse,
): PersonalModelsPreflightState {
  switch (message.type) {
    case 'READY':
      return {
        ...current,
        modelStatus: 'ready',
        modelBackendKind: message.backendKind,
        models: message.catalog.models,
        installed: message.installed,
        modelError: null,
      };
    case 'MANIFEST_READY':
      return {
        ...current,
        inspections: {
          ...current.inspections,
          [message.inspection.modelId]: message.inspection,
        },
      };
    case 'INSTALL_PROGRESS':
    case 'INSTALL_COMPLETE':
    case 'DELETE_COMPLETE':
      return current;
    case 'ERROR':
      return {
        ...current,
        modelStatus: 'error',
        modelError: formatModelReasonMessage('model-companion-check-failed'),
      };
  }
}

function formatImportResultMessage(result: EnrollmentProfileImportResultV1): string {
  switch (result.operation) {
    case 'deduped-existing':
      return formatModelReasonMessage('model-import-deduped-existing');
    case 'imported-new':
      return result.nameCollisionResolved
        ? formatModelReasonMessage('model-imported-name-collision')
        : formatModelReasonMessage('model-imported-new');
    case 'replaced-existing':
      return formatModelReasonMessage('model-replaced-existing');
  }
}

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/(^-|-$)/gu, '');
}

function focusRuntimePanel(): void {
  if (typeof document === 'undefined') return;
  const target = document.getElementById('runtime-title');
  if (target === null) return;
  target.setAttribute('tabIndex', '-1');
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}

function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes.toString()} min ${remainder.toString()} s`;
}

function formatPreflightStatus(status: PersonalModelPreflightStatus): string {
  switch (status) {
    case 'checking':
      return 'checking';
    case 'ready':
      return 'ready';
    case 'action-needed':
      return 'action needed';
    case 'fallback':
      return 'fallback';
  }
}

function formatTrainingCompanionStatus(companion: PersonalModelTrainingCompanionSummaryV1): string {
  switch (companion.status) {
    case 'checking':
      return 'checking';
    case 'installed':
      return 'installed';
    case 'available-not-installed':
      return 'available, not installed';
    case 'not-declared':
      return 'not declared';
    case 'base-model-missing':
      return 'speech model required';
  }
}

function formatRuntimeSelfTestStatus(runtimeSelfTest: RuntimeSelfTestUiState): string {
  switch (runtimeSelfTest.status) {
    case 'idle':
      return 'not run';
    case 'checking':
      return 'checking';
    case 'ready':
      return 'passed';
    case 'error':
      return 'failed';
  }
}

function formatDateLabel(iso: string | null): string {
  if (iso === null) return 'No updates yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Updated locally';
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPromptCoverage(report: TrainingReadinessCoverageReportV1 | null): string {
  if (report === null) return 'No saved prompts yet';
  return `${report.totals.uniquePromptIdentities.toLocaleString('en')} unique prompts`;
}

function formatVocabularyCoverage(report: TrainingReadinessCoverageReportV1 | null): string {
  if (report === null) return 'No selected words';
  return `${report.vocabularyCoverage.coveredEntryCount.toLocaleString('en')} of ${report.vocabularyCoverage.targetedEntryCount.toLocaleString('en')} selected words`;
}

function formatProfileStoreBackend(kind: ProfileStorageBackendKind | null): string {
  if (kind === null) return 'checking';
  return kind === 'opfs' ? 'device storage' : 'temporary storage';
}

function formatPersistentStorage(value: boolean | null): string {
  if (value === null) return 'checking';
  return value ? 'granted' : 'not granted';
}

function downloadPortableSpeechModel(bytes: ArrayBuffer, fileName: string): void {
  const blob = new Blob([bytes], { type: 'application/vnd.wilsonle.speech.personal-model' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadProfilePackage(profilePackage: EnrollmentProfileExportPackageV1): void {
  const blob = new Blob([`${JSON.stringify(profilePackage, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${profilePackage.profileId}.speechprofile.json`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
