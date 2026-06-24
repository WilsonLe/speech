import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import pcmCaptureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import {
  MicrophoneCaptureController,
  attachPcmCaptureWorklet,
  getDefaultMicrophoneProcessingOptions,
  type MicrophoneCaptureFailure,
  type MicrophoneCaptureSnapshot,
  type MicrophoneProcessingOptions,
  type PcmCaptureChunkMessage,
  type PcmCaptureWorkletController,
  type PcmCaptureWorkletFailure,
  type PcmCaptureWorkletMessage,
} from '@speech/audio';
import {
  evaluateVoiceConditionGuidance,
  formatDb,
  formatDbRange,
  type EnrollmentQualityReportV1,
  type EnrollmentSentenceLanguage,
  type EnrollmentVoiceCondition,
} from '@speech/enrollment';
import type {
  ActiveEnrollmentProfileStateV1,
  EnrollmentCaptureMetadataV1,
  EnrollmentProfileExportPackageV1,
  EnrollmentProfileSummaryV1,
  ProfileStorageBackendKind,
} from '@speech/profile-manager';
import { analyzeEnrollmentTakeInWorker } from '../workers/enrollment-quality-worker-client';
import {
  deleteEnrollmentProfile,
  enableEnrollmentProfile,
  exportEnrollmentProfile,
  importEnrollmentProfile,
  loadEnrollmentProfile,
  rollbackEnrollmentProfile,
  saveAcceptedEnrollmentTake,
} from '../workers/profile-store-client';

interface ToggleConfig {
  readonly key: keyof MicrophoneProcessingOptions;
  readonly label: string;
  readonly description: string;
}

interface WorkletCaptureSummary {
  readonly status: 'idle' | 'loading' | 'capturing' | 'stopped' | 'error';
  readonly chunks: number;
  readonly samples: number;
  readonly sampleRateHz: number | null;
  readonly lastChunkSamples: number;
  readonly peak: number;
  readonly rms: number;
  readonly clippingRatio: number;
  readonly message: string;
}

type OwnedFloat32Array = Float32Array<ArrayBuffer>;

interface ActiveEnrollmentTakeBuffer {
  readonly chunks: OwnedFloat32Array[];
  readonly startedAt: string;
  sampleCount: number;
  sampleRateHz: number | null;
}

type EnrollmentRecorderStatus =
  | 'idle'
  | 'recording'
  | 'analyzing'
  | 'ready'
  | 'accepted'
  | 'skipped'
  | 'error';

interface EnrollmentRecorderSummary {
  readonly status: EnrollmentRecorderStatus;
  readonly sampleRateHz: number | null;
  readonly sampleCount: number;
  readonly durationMs: number;
  readonly message: string;
}

type ProfileStoreStatus =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'activating'
  | 'exporting'
  | 'importing'
  | 'deleting'
  | 'error';

interface ProfileStoreUiState {
  readonly status: ProfileStoreStatus;
  readonly backendKind: ProfileStorageBackendKind | null;
  readonly persistentStorageGranted: boolean | null;
  readonly activeState: ActiveEnrollmentProfileStateV1 | null;
  readonly summary: EnrollmentProfileSummaryV1 | null;
  readonly message: string;
}

const toggles: readonly ToggleConfig[] = [
  {
    key: 'echoCancellation',
    label: 'Echo cancellation',
    description: 'Useful for speakers/headsets, but can color raw enrollment audio.',
  },
  {
    key: 'noiseSuppression',
    label: 'Noise suppression',
    description: 'Reduces background noise at the cost of less raw acoustic detail.',
  },
  {
    key: 'autoGainControl',
    label: 'Automatic gain control',
    description:
      'Levels volume automatically; enrollment will later prefer this off when supported.',
  },
];

const idleCaptureSummary: WorkletCaptureSummary = {
  status: 'idle',
  chunks: 0,
  samples: 0,
  sampleRateHz: null,
  lastChunkSamples: 0,
  peak: 0,
  rms: 0,
  clippingRatio: 0,
  message: 'AudioWorklet capture is idle until you start a microphone check.',
};

const idleEnrollmentRecorderSummary: EnrollmentRecorderSummary = {
  status: 'idle',
  sampleRateHz: null,
  sampleCount: 0,
  durationMs: 0,
  message:
    'Start the microphone check, then record one in-memory enrollment take for local quality analysis.',
};

const enrollmentProcessingOptions: MicrophoneProcessingOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const voiceConditions: readonly EnrollmentVoiceCondition[] = ['whisper', 'normal', 'projected'];
const enrollmentLanguages: readonly EnrollmentSentenceLanguage[] = ['vi', 'en', 'mixed'];
const defaultEnrollmentPrompt = 'Tôi vừa update dashboard.';
const defaultProfileId = 'local-enrollment-profile';
const defaultProfileDisplayName = 'Local enrollment profile';
const defaultSentenceBankVersion = 'synthetic-v1';
const manualPromptId = 'manual-enrollment-prompt';
const manualPromptVersion = 1;

const initialProfileStoreState: ProfileStoreUiState = {
  status: 'loading',
  backendKind: null,
  persistentStorageGranted: null,
  activeState: null,
  summary: null,
  message: 'Checking private enrollment profile storage…',
};

export function MicrophonePanel() {
  const controller = useMemo(() => new MicrophoneCaptureController(), []);
  const workletController = useRef<PcmCaptureWorkletController | null>(null);
  const activeEnrollmentTake = useRef<ActiveEnrollmentTakeBuffer | null>(null);
  const lastTakePcm = useRef<OwnedFloat32Array | null>(null);
  const lastTakeSampleRateHz = useRef<number | null>(null);
  const [processing, setProcessing] = useState<MicrophoneProcessingOptions>(() =>
    getDefaultMicrophoneProcessingOptions(),
  );
  const [status, setStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [snapshot, setSnapshot] = useState<MicrophoneCaptureSnapshot | null>(null);
  const [error, setError] = useState<MicrophoneCaptureFailure | PcmCaptureWorkletFailure | null>(
    null,
  );
  const [captureSummary, setCaptureSummary] = useState<WorkletCaptureSummary>(idleCaptureSummary);
  const [roomNoiseRms, setRoomNoiseRms] = useState<number | null>(null);
  const [normalBaselineRms, setNormalBaselineRms] = useState<number | null>(null);
  const [voiceCondition, setVoiceCondition] = useState<EnrollmentVoiceCondition>('normal');
  const [enrollmentLanguage, setEnrollmentLanguage] = useState<EnrollmentSentenceLanguage>('mixed');
  const [enrollmentPrompt, setEnrollmentPrompt] = useState(defaultEnrollmentPrompt);
  const [recorderSummary, setRecorderSummary] = useState<EnrollmentRecorderSummary>(
    idleEnrollmentRecorderSummary,
  );
  const [qualityReport, setQualityReport] = useState<EnrollmentQualityReportV1 | null>(null);
  const [profileStore, setProfileStore] = useState<ProfileStoreUiState>(initialProfileStoreState);
  const calibrationBaseline = normalBaselineRms
    ? {
        normalRms: normalBaselineRms,
        ...(roomNoiseRms !== null ? { roomNoiseRms } : {}),
      }
    : null;
  const voiceGuidance = evaluateVoiceConditionGuidance(
    {
      rms: captureSummary.rms,
      peak: captureSummary.peak,
      clippingRatio: captureSummary.clippingRatio,
    },
    calibrationBaseline,
    voiceCondition,
  );

  useEffect(() => {
    let cancelled = false;
    setProfileStore(initialProfileStoreState);
    loadEnrollmentProfile({ profileId: defaultProfileId })
      .then((result) => {
        if (cancelled) return;
        setProfileStore({
          status: 'ready',
          backendKind: result.backendKind,
          persistentStorageGranted: result.persistentStorageGranted,
          activeState: result.activeState,
          summary: result.summary ?? null,
          message:
            result.summary === undefined
              ? 'Private profile store is ready. No accepted enrollment takes are stored yet.'
              : 'Private profile store resumed accepted enrollment takes from local storage.',
        });
      })
      .catch((storeError) => {
        if (cancelled) return;
        setProfileStore({
          status: 'error',
          backendKind: null,
          persistentStorageGranted: null,
          activeState: null,
          summary: null,
          message:
            storeError instanceof Error
              ? storeError.message
              : 'Enrollment profile storage could not initialize.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      activeEnrollmentTake.current = null;
      workletController.current?.dispose();
      workletController.current = null;
      void controller.stop();
    };
  }, [controller]);

  async function startMicrophoneCheck() {
    setStatus('requesting');
    setError(null);
    setCaptureSummary({
      ...idleCaptureSummary,
      status: 'loading',
      message: 'Loading AudioWorklet…',
    });

    try {
      const session = await controller.start({ processing });
      setSnapshot({
        requestedConstraints: session.requestedConstraints,
        actualSettings: session.actualSettings,
        audioContextSampleRateHz: session.audioContextSampleRateHz,
        trackLabel: session.trackLabel,
        trackState: session.trackState,
        startedAt: session.startedAt,
      });

      const captureWorklet = await attachPcmCaptureWorklet({
        audioContext: session.audioContext,
        sourceNode: session.sourceNode,
        workletModuleUrl: pcmCaptureWorkletUrl,
        onMessage: handleWorkletMessage,
      });
      workletController.current = captureWorklet;
      captureWorklet.start();
      setStatus('active');
      setCaptureSummary((current) => ({
        ...current,
        status: 'capturing',
        sampleRateHz: session.audioContextSampleRateHz,
        message: 'AudioWorklet is capturing device-rate PCM and posting local metrics.',
      }));
    } catch (captureError) {
      workletController.current?.dispose();
      workletController.current = null;
      await controller.stop();
      setSnapshot(null);
      setError(toCaptureFailure(captureError));
      setStatus('error');
      setCaptureSummary({
        ...idleCaptureSummary,
        status: 'error',
        message: 'AudioWorklet capture could not start.',
      });
    }
  }

  async function stopMicrophoneCheck() {
    activeEnrollmentTake.current = null;
    workletController.current?.stop();
    workletController.current?.dispose();
    workletController.current = null;
    await controller.stop();
    setStatus('idle');
    setSnapshot(null);
    setRecorderSummary((current) =>
      current.status === 'recording' || current.status === 'analyzing'
        ? {
            ...current,
            status: 'idle',
            message: 'Microphone stopped before the enrollment take was accepted or analyzed.',
          }
        : current,
    );
    setCaptureSummary((current) => ({
      ...current,
      status: 'stopped',
      message: 'Capture stopped and microphone resources were released.',
    }));
  }

  function useEnrollmentProcessingDefaults() {
    setProcessing(enrollmentProcessingOptions);
  }

  function saveRoomNoiseSample() {
    if (captureSummary.rms > 0) {
      setRoomNoiseRms(captureSummary.rms);
    }
  }

  function saveNormalBaseline() {
    if (captureSummary.rms > 0) {
      setNormalBaselineRms(captureSummary.rms);
    }
  }

  function startEnrollmentTake() {
    if (status !== 'active') {
      setRecorderSummary({
        ...idleEnrollmentRecorderSummary,
        status: 'error',
        message: 'Start the microphone check before recording an enrollment take.',
      });
      return;
    }

    activeEnrollmentTake.current = {
      chunks: [],
      sampleCount: 0,
      sampleRateHz: captureSummary.sampleRateHz,
      startedAt: new Date().toISOString(),
    };
    lastTakePcm.current = null;
    lastTakeSampleRateHz.current = null;
    setQualityReport(null);
    setRecorderSummary({
      status: 'recording',
      sampleRateHz: captureSummary.sampleRateHz,
      sampleCount: 0,
      durationMs: 0,
      message:
        'Recording enrollment take in memory. Stop and analyze when you finish reading the prompt.',
    });
  }

  async function stopAndAnalyzeEnrollmentTake() {
    const activeTake = activeEnrollmentTake.current;
    activeEnrollmentTake.current = null;
    if (!activeTake || activeTake.sampleCount === 0) {
      setRecorderSummary({
        ...idleEnrollmentRecorderSummary,
        status: 'error',
        message:
          'No enrollment audio chunks were captured for this take. Retry after capture starts.',
      });
      return;
    }

    const sampleRateHz = activeTake.sampleRateHz ?? captureSummary.sampleRateHz ?? null;
    if (!sampleRateHz) {
      setRecorderSummary({
        ...idleEnrollmentRecorderSummary,
        status: 'error',
        sampleCount: activeTake.sampleCount,
        message: 'Cannot analyze enrollment take because the sample rate is unavailable.',
      });
      return;
    }

    const pcm = concatenateChunks(activeTake.chunks, activeTake.sampleCount);
    lastTakePcm.current = pcm;
    lastTakeSampleRateHz.current = sampleRateHz;
    setRecorderSummary({
      status: 'analyzing',
      sampleRateHz,
      sampleCount: pcm.length,
      durationMs: (pcm.length / sampleRateHz) * 1_000,
      message: 'Analyzing clipping, SNR, VAD, pace, and reference-alignment hints in a worker…',
    });

    try {
      const analysisBuffer = copyFloat32ArrayToArrayBuffer(pcm);
      const report = await analyzeEnrollmentTakeInWorker({
        pcm: analysisBuffer,
        sampleRateHz,
        referenceText: enrollmentPrompt,
        language: enrollmentLanguage,
        voiceCondition,
        ...(calibrationBaseline === null ? {} : { calibration: calibrationBaseline }),
      });
      setQualityReport(report);
      setRecorderSummary({
        status: 'ready',
        sampleRateHz,
        sampleCount: pcm.length,
        durationMs: report.level.durationMs,
        message:
          'Quality report is ready. Audio remains in memory for replay/retry until you explicitly accept and save this take.',
      });
    } catch (analysisError) {
      setRecorderSummary({
        status: 'error',
        sampleRateHz,
        sampleCount: pcm.length,
        durationMs: (pcm.length / sampleRateHz) * 1_000,
        message:
          analysisError instanceof Error
            ? analysisError.message
            : 'Enrollment take quality analysis failed.',
      });
    }
  }

  function retryEnrollmentTake() {
    activeEnrollmentTake.current = null;
    lastTakePcm.current = null;
    lastTakeSampleRateHz.current = null;
    setQualityReport(null);
    setRecorderSummary({
      ...idleEnrollmentRecorderSummary,
      message: 'Take cleared from memory. Start another enrollment take when ready.',
    });
  }

  function skipEnrollmentPrompt() {
    activeEnrollmentTake.current = null;
    lastTakePcm.current = null;
    lastTakeSampleRateHz.current = null;
    setQualityReport(null);
    setRecorderSummary({
      status: 'skipped',
      sampleRateHz: null,
      sampleCount: 0,
      durationMs: 0,
      message: 'Prompt skipped. No audio was stored.',
    });
  }

  async function manuallyAcceptTake() {
    const pcm = lastTakePcm.current;
    const sampleRateHz = lastTakeSampleRateHz.current;
    if (!qualityReport || !pcm || !sampleRateHz) {
      setRecorderSummary((current) => ({
        ...current,
        status: 'error',
        message: 'Analyze a captured take before saving it to the private profile store.',
      }));
      return;
    }

    setProfileStore((current) => ({
      ...current,
      status: 'saving',
      message: 'Saving accepted take to the private enrollment profile store…',
    }));
    setRecorderSummary((current) => ({
      ...current,
      status: 'analyzing',
      message: 'Saving accepted take to worker-owned private profile storage…',
    }));

    try {
      const saveBuffer = copyFloat32ArrayToArrayBuffer(pcm);
      const result = await saveAcceptedEnrollmentTake({
        profileId: defaultProfileId,
        profileDisplayName: defaultProfileDisplayName,
        sentenceBankVersion: defaultSentenceBankVersion,
        promptId: manualPromptId,
        promptVersion: manualPromptVersion,
        referenceText: enrollmentPrompt,
        language: enrollmentLanguage,
        voiceCondition,
        pcm: saveBuffer,
        sampleRateHz,
        durationMs: qualityReport.level.durationMs,
        capture: buildCaptureMetadata(snapshot),
        quality: qualityReport,
        acceptedBy: 'manual',
      });
      setProfileStore({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summary: result.summary,
        message:
          result.backendKind === 'opfs'
            ? 'Accepted take saved in private OPFS profile storage and will resume after reload.'
            : 'Accepted take saved in non-durable memory fallback storage for this page session; OPFS is unavailable.',
      });
      setRecorderSummary((current) => ({
        ...current,
        status: 'accepted',
        message: `Accepted take ${result.utterance.id} saved locally with checksum ${result.utterance.audio.sha256.slice(0, 12)}…`,
      }));
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message:
          storeError instanceof Error
            ? storeError.message
            : 'Enrollment take could not be saved to private profile storage.',
      }));
      setRecorderSummary((current) => ({
        ...current,
        status: 'error',
        message:
          storeError instanceof Error
            ? storeError.message
            : 'Enrollment take could not be saved to private profile storage.',
      }));
    }
  }

  async function enableStoredProfile() {
    if (!profileStore.summary) return;
    setProfileStore((current) => ({
      ...current,
      status: 'activating',
      message: 'Enabling this local profile for the next utterance boundary…',
    }));
    try {
      const result = await enableEnrollmentProfile({ profileId: defaultProfileId });
      setProfileStore((current) => ({
        ...current,
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        message: 'Profile enabled locally. Runtime workers may apply it only between utterances.',
      }));
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message: storeError instanceof Error ? storeError.message : 'Profile could not be enabled.',
      }));
    }
  }

  async function rollbackStoredProfile() {
    setProfileStore((current) => ({
      ...current,
      status: 'activating',
      message: 'Rolling back to the previous active local profile…',
    }));
    try {
      const result = await rollbackEnrollmentProfile();
      setProfileStore((current) => ({
        ...current,
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        message:
          result.activeState.activeProfileId === undefined
            ? 'No previous profile was available to roll back to.'
            : `Rolled back active profile to ${result.activeState.activeProfileId}.`,
      }));
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message: storeError instanceof Error ? storeError.message : 'Profile rollback failed.',
      }));
    }
  }

  async function exportStoredProfile() {
    if (!profileStore.summary) return;
    setProfileStore((current) => ({
      ...current,
      status: 'exporting',
      message: 'Preparing a sensitive local profile export package…',
    }));
    try {
      const result = await exportEnrollmentProfile({
        profileId: defaultProfileId,
        timeoutMs: 15_000,
      });
      downloadProfilePackage(result.profilePackage);
      setProfileStore((current) => ({
        ...current,
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        message:
          'Profile export downloaded locally. Treat it as sensitive voice data; it includes accepted recordings and prompt metadata.',
      }));
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message: storeError instanceof Error ? storeError.message : 'Profile export failed.',
      }));
    }
  }

  async function importStoredProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setProfileStore((current) => ({
      ...current,
      status: 'importing',
      message: 'Importing and verifying a local profile export package…',
    }));
    try {
      const profilePackage = JSON.parse(await file.text()) as EnrollmentProfileExportPackageV1;
      const result = await importEnrollmentProfile({
        profilePackage,
        overwriteExisting: true,
        timeoutMs: 15_000,
      });
      setProfileStore({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summary: result.summary,
        message:
          'Profile import verified checksums and restored local enrollment recordings. Review before enabling.',
      });
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message: storeError instanceof Error ? storeError.message : 'Profile import failed.',
      }));
    }
  }

  async function deleteStoredProfile() {
    setProfileStore((current) => ({
      ...current,
      status: 'deleting',
      message: 'Deleting stored enrollment recordings and derived profile files…',
    }));
    try {
      const result = await deleteEnrollmentProfile({ profileId: defaultProfileId });
      setProfileStore({
        status: 'ready',
        backendKind: result.backendKind,
        persistentStorageGranted: result.persistentStorageGranted,
        activeState: result.activeState,
        summary: null,
        message: 'Stored enrollment recordings and profile metadata were deleted locally.',
      });
      setRecorderSummary((current) => ({
        ...current,
        status: current.status === 'recording' ? current.status : 'idle',
        message: 'Private profile store cleared. Current in-memory take, if any, was not saved.',
      }));
    } catch (storeError) {
      setProfileStore((current) => ({
        ...current,
        status: 'error',
        message:
          storeError instanceof Error
            ? storeError.message
            : 'Stored enrollment profile could not be deleted.',
      }));
    }
  }

  async function replayLastTake() {
    const pcm = lastTakePcm.current;
    const sampleRateHz = lastTakeSampleRateHz.current;
    if (!pcm || !sampleRateHz) {
      return;
    }

    try {
      const AudioContextConstructor = getAudioContextConstructor();
      const audioContext = new AudioContextConstructor();
      const buffer = audioContext.createBuffer(1, pcm.length, sampleRateHz);
      buffer.copyToChannel(new Float32Array(pcm), 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        void audioContext.close();
        setRecorderSummary((current) => ({
          ...current,
          message: 'Replay finished. Captured take still exists only in memory.',
        }));
      };
      source.start();
      setRecorderSummary((current) => ({
        ...current,
        message: 'Replaying the in-memory enrollment take through this browser tab.',
      }));
    } catch (replayError) {
      setRecorderSummary((current) => ({
        ...current,
        status: 'error',
        message: replayError instanceof Error ? replayError.message : 'Replay failed.',
      }));
    }
  }

  function handleWorkletMessage(message: PcmCaptureWorkletMessage) {
    switch (message.type) {
      case 'CAPTURE_STARTED':
        setCaptureSummary((current) => ({
          ...current,
          status: 'capturing',
          sampleRateHz: message.sampleRateHz,
          message: 'AudioWorklet capture started.',
        }));
        break;
      case 'CAPTURE_STOPPED':
        setCaptureSummary((current) => ({
          ...current,
          status: 'stopped',
          message: 'AudioWorklet capture stopped.',
        }));
        break;
      case 'LEVEL':
        setCaptureSummary((current) => ({
          ...current,
          sampleRateHz: message.sampleRateHz,
          peak: message.metrics.peak,
          rms: message.metrics.rms,
          clippingRatio: message.metrics.clippingRatio,
        }));
        break;
      case 'PCM_CHUNK':
        appendEnrollmentChunk(message);
        setCaptureSummary((current) => ({
          ...current,
          chunks: current.chunks + 1,
          samples: current.samples + message.sampleCount,
          sampleRateHz: message.sampleRateHz,
          lastChunkSamples: message.sampleCount,
          peak: message.metrics.peak,
          rms: message.metrics.rms,
          clippingRatio: message.metrics.clippingRatio,
        }));
        workletController.current?.releaseTransferredBuffer(message);
        break;
      case 'RING_BUFFER_STATUS':
        setCaptureSummary((current) => ({
          ...current,
          sampleRateHz: message.sampleRateHz,
          samples: message.state.writeSequence,
          message: `Shared ring buffer queued ${message.state.availableSamples} samples with ${message.state.overrunCount} overruns.`,
        }));
        break;
      case 'CAPTURE_ERROR':
        setError({
          code: message.code,
          message: message.message,
          recoveryStep: 'Stop capture, refresh the PWA, and try again.',
        });
        setStatus('error');
        setCaptureSummary((current) => ({ ...current, status: 'error', message: message.message }));
        break;
    }
  }

  function appendEnrollmentChunk(message: PcmCaptureChunkMessage) {
    const activeTake = activeEnrollmentTake.current;
    if (!activeTake) {
      return;
    }

    const chunkView = new Float32Array(message.pcm, 0, message.sampleCount);
    const copy = new Float32Array(chunkView.length);
    copy.set(chunkView);
    activeTake.chunks.push(copy);
    activeTake.sampleCount += copy.length;
    activeTake.sampleRateHz = message.sampleRateHz;
    setRecorderSummary({
      status: 'recording',
      sampleRateHz: message.sampleRateHz,
      sampleCount: activeTake.sampleCount,
      durationMs: (activeTake.sampleCount / message.sampleRateHz) * 1_000,
      message:
        'Recording enrollment take in memory. Stop and analyze when you finish reading the prompt.',
    });
  }

  return (
    <section className="microphone panel" aria-labelledby="microphone-title">
      <div className="section-heading">
        <p className="eyebrow">Microphone</p>
        <h2 id="microphone-title">Permission and capture check</h2>
        <p>
          Microphone access is requested only when you press start. The app asks for mono audio,
          attaches an AudioWorklet capture processor, and reports actual browser track settings
          because browsers may not honor every constraint.
        </p>
      </div>

      <fieldset className="toggle-list" disabled={status === 'requesting' || status === 'active'}>
        <legend>Browser audio processing</legend>
        {toggles.map((toggle) => (
          <label key={toggle.key}>
            <input
              type="checkbox"
              checked={processing[toggle.key]}
              onChange={(event) =>
                setProcessing((current) => ({ ...current, [toggle.key]: event.target.checked }))
              }
            />
            <span>
              <strong>{toggle.label}</strong>
              <small>{toggle.description}</small>
            </span>
          </label>
        ))}
        <button type="button" className="secondary" onClick={useEnrollmentProcessingDefaults}>
          Use enrollment defaults: browser processing off
        </button>
      </fieldset>

      <div className="hero-actions" aria-label="Microphone controls">
        <button type="button" onClick={startMicrophoneCheck} disabled={status === 'requesting'}>
          {status === 'requesting' ? 'Requesting microphone…' : 'Start microphone check'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={stopMicrophoneCheck}
          disabled={status !== 'active'}
        >
          Stop microphone
        </button>
      </div>

      {error ? (
        <p role="alert" className="status-message error-message">
          {error.message} {error.recoveryStep}
        </p>
      ) : null}

      <dl className="probe-list microphone-settings" aria-label="AudioWorklet capture metrics">
        <div>
          <dt>AudioWorklet status</dt>
          <dd>{captureSummary.status}</dd>
        </div>
        <div>
          <dt>Captured chunks</dt>
          <dd>{captureSummary.chunks}</dd>
        </div>
        <div>
          <dt>Captured samples</dt>
          <dd>{captureSummary.samples}</dd>
        </div>
        <div>
          <dt>Worklet sample rate</dt>
          <dd>
            {captureSummary.sampleRateHz ? `${captureSummary.sampleRateHz} Hz` : 'not started'}
          </dd>
        </div>
        <div>
          <dt>Peak level</dt>
          <dd>{captureSummary.peak.toFixed(3)}</dd>
        </div>
        <div>
          <dt>RMS level</dt>
          <dd>{captureSummary.rms.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Clipping</dt>
          <dd>{formatPercent(captureSummary.clippingRatio)}</dd>
        </div>
      </dl>
      <p className="status-message">{captureSummary.message}</p>

      <div
        className="status-message enrollment-calibration"
        aria-label="Enrollment calibration guidance"
      >
        <h3>Calibration and voice guidance</h3>
        <p>
          For enrollment, capture a short room-noise sample, then set a normal speaking baseline.
          Guidance uses only local RMS, peak, and clipping metrics from the AudioWorklet; no
          calibration audio is persisted.
        </p>
        <p>
          Enrollment requests should prefer browser processing off when supported. Current track AGC
          setting:{' '}
          {snapshot ? formatSetting(snapshot.actualSettings.autoGainControl) : 'not reported'}.
        </p>
        <div className="hero-actions" aria-label="Enrollment calibration controls">
          <button
            type="button"
            className="secondary"
            onClick={saveRoomNoiseSample}
            disabled={status !== 'active' || captureSummary.rms <= 0}
          >
            Use current level as room-noise sample
          </button>
          <button
            type="button"
            className="secondary"
            onClick={saveNormalBaseline}
            disabled={status !== 'active' || captureSummary.rms <= 0}
          >
            Set normal baseline from current level
          </button>
        </div>
        <label className="select-field">
          <span>Voice condition</span>
          <select
            value={voiceCondition}
            onChange={(event) => setVoiceCondition(event.target.value as EnrollmentVoiceCondition)}
          >
            {voiceConditions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </label>
        <dl className="probe-list microphone-settings" aria-label="Enrollment calibration metrics">
          <div>
            <dt>Room noise RMS</dt>
            <dd>{roomNoiseRms !== null ? roomNoiseRms.toFixed(3) : 'not set'}</dd>
          </div>
          <div>
            <dt>Normal baseline RMS</dt>
            <dd>{normalBaselineRms !== null ? normalBaselineRms.toFixed(3) : 'not set'}</dd>
          </div>
          <div>
            <dt>Current relative level</dt>
            <dd>{formatDb(voiceGuidance.relativeDb)}</dd>
          </div>
          <div>
            <dt>Advisory band</dt>
            <dd>{formatDbRange(voiceGuidance.target)}</dd>
          </div>
          <div>
            <dt>Estimated SNR</dt>
            <dd>{formatDb(voiceGuidance.snrDb)}</dd>
          </div>
          <div>
            <dt>Guidance status</dt>
            <dd>{voiceGuidance.status}</dd>
          </div>
        </dl>
        <p className="status-message">{voiceGuidance.message}</p>
        {voiceCondition === 'projected' ? (
          <p className="status-message">
            Projected means loud and clear, like addressing a room. Do not strain, scream, or
            sustain a shout.
          </p>
        ) : null}
      </div>

      <div className="status-message enrollment-recorder" aria-label="Enrollment recorder">
        <h3>Enrollment recorder and quality analyzer</h3>
        <p>
          Record a single guided take into memory, analyze it in a dedicated worker, then replay,
          retry, skip, or explicitly save the accepted take to the private enrollment profile store.
          OPFS is preferred; an in-memory fallback is reported when the browser context cannot
          expose OPFS to the worker.
        </p>
        <label className="text-field">
          <span>Reference prompt</span>
          <textarea
            value={enrollmentPrompt}
            rows={2}
            onChange={(event) => setEnrollmentPrompt(event.target.value)}
          />
        </label>
        <label className="select-field">
          <span>Prompt language</span>
          <select
            value={enrollmentLanguage}
            onChange={(event) =>
              setEnrollmentLanguage(event.target.value as EnrollmentSentenceLanguage)
            }
          >
            {enrollmentLanguages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <div className="hero-actions" aria-label="Enrollment recorder controls">
          <button
            type="button"
            onClick={startEnrollmentTake}
            disabled={status !== 'active' || recorderSummary.status === 'recording'}
          >
            Start enrollment take
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void stopAndAnalyzeEnrollmentTake()}
            disabled={recorderSummary.status !== 'recording'}
          >
            Stop and analyze take
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void replayLastTake()}
            disabled={!lastTakePcm.current || recorderSummary.status === 'recording'}
          >
            Replay captured take
          </button>
          <button
            type="button"
            className="secondary"
            onClick={retryEnrollmentTake}
            disabled={recorderSummary.status === 'recording'}
          >
            Retry take
          </button>
          <button
            type="button"
            className="secondary"
            onClick={skipEnrollmentPrompt}
            disabled={recorderSummary.status === 'recording'}
          >
            Skip prompt
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void manuallyAcceptTake()}
            disabled={
              !qualityReport ||
              !lastTakePcm.current ||
              recorderSummary.status === 'recording' ||
              profileStore.status === 'saving' ||
              profileStore.status === 'deleting'
            }
          >
            Manually accept and save take
          </button>
        </div>
        <dl className="probe-list microphone-settings" aria-label="Enrollment recorder metrics">
          <div>
            <dt>Recorder status</dt>
            <dd>{recorderSummary.status}</dd>
          </div>
          <div>
            <dt>Take samples</dt>
            <dd>{recorderSummary.sampleCount}</dd>
          </div>
          <div>
            <dt>Take duration</dt>
            <dd>{formatMs(recorderSummary.durationMs)}</dd>
          </div>
          <div>
            <dt>Take sample rate</dt>
            <dd>
              {recorderSummary.sampleRateHz ? `${recorderSummary.sampleRateHz} Hz` : 'not set'}
            </dd>
          </div>
        </dl>
        <p className="status-message">{recorderSummary.message}</p>
        <div className="profile-store-status" aria-label="Enrollment profile storage">
          <h4>Durable profile storage</h4>
          <p>
            Accepted takes are stored locally only after an explicit save. Use delete to remove the
            stored enrollment recordings and derived profile files for this local profile.
          </p>
          <dl className="probe-list microphone-settings">
            <div>
              <dt>Profile store status</dt>
              <dd>{profileStore.status}</dd>
            </div>
            <div>
              <dt>Storage backend</dt>
              <dd>{formatProfileStoreBackend(profileStore.backendKind)}</dd>
            </div>
            <div>
              <dt>Persistent storage</dt>
              <dd>{formatPersistentStorage(profileStore.persistentStorageGranted)}</dd>
            </div>
            <div>
              <dt>Active profile</dt>
              <dd>{profileStore.activeState?.activeProfileId ?? 'none'}</dd>
            </div>
            <div>
              <dt>Rollback profile</dt>
              <dd>{profileStore.activeState?.previousProfileId ?? 'none'}</dd>
            </div>
            <div>
              <dt>Stored accepted takes</dt>
              <dd>{profileStore.summary?.profile.enrollment.acceptedUtterances ?? 0}</dd>
            </div>
            <div>
              <dt>Stored accepted seconds</dt>
              <dd>
                {(profileStore.summary?.profile.enrollment.acceptedSeconds ?? 0).toFixed(2)} s
              </dd>
            </div>
            <div>
              <dt>Stored profile bytes</dt>
              <dd>{getStoredProfileBytes(profileStore.summary).toLocaleString()} bytes</dd>
            </div>
          </dl>
          <p className="status-message">{profileStore.message}</p>
          <div className="hero-actions" aria-label="Enrollment profile lifecycle controls">
            <button
              type="button"
              className="secondary"
              onClick={() => void enableStoredProfile()}
              disabled={!profileStore.summary || profileStore.status !== 'ready'}
            >
              Enable local profile
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void rollbackStoredProfile()}
              disabled={
                !profileStore.activeState?.previousProfileId || profileStore.status !== 'ready'
              }
            >
              Roll back active profile
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void exportStoredProfile()}
              disabled={!profileStore.summary || profileStore.status !== 'ready'}
            >
              Export sensitive profile package
            </button>
            <label className="secondary file-button">
              Import profile package
              <input
                type="file"
                accept="application/json,.json,.speechprofile"
                onChange={(event) => void importStoredProfile(event)}
                disabled={profileStore.status !== 'ready' && profileStore.status !== 'error'}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => void deleteStoredProfile()}
              disabled={
                profileStore.summary === null ||
                profileStore.status === 'saving' ||
                profileStore.status === 'activating' ||
                profileStore.status === 'exporting' ||
                profileStore.status === 'importing' ||
                profileStore.status === 'deleting'
              }
            >
              Delete stored enrollment profile
            </button>
          </div>
        </div>
        {qualityReport ? <QualityReportSummary report={qualityReport} /> : null}
      </div>

      {snapshot ? (
        <dl className="probe-list microphone-settings" aria-label="Actual microphone settings">
          <div>
            <dt>Track</dt>
            <dd>{snapshot.trackLabel || 'Microphone'}</dd>
          </div>
          <div>
            <dt>AudioContext sample rate</dt>
            <dd>{snapshot.audioContextSampleRateHz} Hz</dd>
          </div>
          <div>
            <dt>Track sample rate</dt>
            <dd>{snapshot.actualSettings.sampleRate ?? 'not reported'} Hz</dd>
          </div>
          <div>
            <dt>Channels</dt>
            <dd>{snapshot.actualSettings.channelCount ?? 'not reported'}</dd>
          </div>
          <div>
            <dt>Echo cancellation</dt>
            <dd>{formatSetting(snapshot.actualSettings.echoCancellation)}</dd>
          </div>
          <div>
            <dt>Noise suppression</dt>
            <dd>{formatSetting(snapshot.actualSettings.noiseSuppression)}</dd>
          </div>
          <div>
            <dt>Automatic gain control</dt>
            <dd>{formatSetting(snapshot.actualSettings.autoGainControl)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function QualityReportSummary({ report }: { readonly report: EnrollmentQualityReportV1 }) {
  return (
    <div className="quality-report" aria-label="Enrollment quality report">
      <h4>Quality report</h4>
      <p>{report.summary}</p>
      <dl className="probe-list microphone-settings">
        <div>
          <dt>Quality status</dt>
          <dd>{report.status}</dd>
        </div>
        <div>
          <dt>Reason codes</dt>
          <dd>{report.reasonCodes.length > 0 ? report.reasonCodes.join(', ') : 'none'}</dd>
        </div>
        <div>
          <dt>Active speech</dt>
          <dd>{formatMs(report.vad.activeSpeechDurationMs)}</dd>
        </div>
        <div>
          <dt>Peak dBFS</dt>
          <dd>{formatNullableDb(report.level.peakDbfs)}</dd>
        </div>
        <div>
          <dt>Clipping</dt>
          <dd>{formatPercent(report.level.clippingRatio)}</dd>
        </div>
        <div>
          <dt>Estimated SNR</dt>
          <dd>{formatDb(report.level.snrDb)}</dd>
        </div>
        <div>
          <dt>Relative level</dt>
          <dd>{formatDb(report.level.relativeDb)}</dd>
        </div>
        <div>
          <dt>Speaking pace</dt>
          <dd>{formatTokensPerSecond(report.pace.tokensPerSecond)}</dd>
        </div>
        <div>
          <dt>Reference alignment</dt>
          <dd>{formatCoverage(report.alignment.coverage)}</dd>
        </div>
        <div>
          <dt>Manual acceptance</dt>
          <dd>{report.manualAcceptanceAllowed ? 'available' : 'blocked'}</dd>
        </div>
        <div>
          <dt>Report privacy</dt>
          <dd>No audio or transcript text in report</dd>
        </div>
      </dl>
      <p className="status-message">{report.alignment.note}</p>
    </div>
  );
}

function concatenateChunks(
  chunks: readonly OwnedFloat32Array[],
  sampleCount: number,
): OwnedFloat32Array {
  const output = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function copyFloat32ArrayToArrayBuffer(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.byteLength);
  new Float32Array(buffer).set(samples);
  return buffer;
}

function buildCaptureMetadata(
  snapshot: MicrophoneCaptureSnapshot | null,
): EnrollmentCaptureMetadataV1 {
  return {
    requestedConstraints: toMetadataRecord(snapshot?.requestedConstraints),
    actualSettings: toMetadataRecord(snapshot?.actualSettings),
    ...(snapshot?.trackLabel ? { userMicrophoneLabel: snapshot.trackLabel } : {}),
  };
}

function toMetadataRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined || value === null) return {};
  return JSON.parse(JSON.stringify(value)) as Readonly<Record<string, unknown>>;
}

function downloadProfilePackage(profilePackage: EnrollmentProfileExportPackageV1): void {
  const blob = new Blob([`${JSON.stringify(profilePackage, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${profilePackage.profileId}.speechprofile.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getStoredProfileBytes(summary: EnrollmentProfileSummaryV1 | null): number {
  if (!summary) return 0;
  return Object.values(summary.checksums.files).reduce((total, file) => total + file.sizeBytes, 0);
}

function formatProfileStoreBackend(kind: ProfileStorageBackendKind | null): string {
  if (kind === null) return 'checking';
  return kind === 'opfs' ? 'OPFS' : 'memory fallback (not reload-durable)';
}

function formatPersistentStorage(value: boolean | null): string {
  if (value === null) return 'checking';
  return value ? 'granted' : 'not granted';
}

function getAudioContextConstructor(): typeof AudioContext {
  const globalWithWebkit = globalThis as typeof globalThis & {
    readonly webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor = globalThis.AudioContext ?? globalWithWebkit.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('AudioContext is unavailable for enrollment take replay.');
  }
  return AudioContextConstructor;
}

function formatSetting(value: boolean | undefined): string {
  if (typeof value !== 'boolean') {
    return 'not reported';
  }

  return value ? 'enabled' : 'disabled';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 ms';
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)} s` : `${value.toFixed(0)} ms`;
}

function formatNullableDb(value: number | null): string {
  return value === null ? 'not available' : `${value.toFixed(1)} dB`;
}

function formatTokensPerSecond(value: number | null): string {
  return value === null ? 'not available' : `${value.toFixed(2)} tokens/s`;
}

function formatCoverage(value: number | null): string {
  return value === null ? 'not available' : `${(value * 100).toFixed(1)}%`;
}

function toCaptureFailure(error: unknown): MicrophoneCaptureFailure | PcmCaptureWorkletFailure {
  if (isCaptureFailure(error)) {
    return error;
  }

  return {
    code: 'AUDIO_CONTEXT_FAILED',
    message: error instanceof Error ? error.message : 'Microphone capture failed.',
    recoveryStep: 'Stop capture, refresh the PWA, and try again.',
  };
}

function isCaptureFailure(
  error: unknown,
): error is MicrophoneCaptureFailure | PcmCaptureWorkletFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'recoveryStep' in error
  );
}
