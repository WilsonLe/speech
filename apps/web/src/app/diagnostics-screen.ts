import type { CapabilityReport } from '../capabilities';
import type { PwaLifecycleSnapshot } from './pwa-lifecycle';
import type { VocabularyStoreSnapshotV1 } from '@speech/protocol';

export type DiagnosticsSectionId =
  | 'browser-capabilities'
  | 'audio'
  | 'inference'
  | 'model-tokenizer'
  | 'vocabulary'
  | 'enrollment-training'
  | 'storage'
  | 'recent-errors';

export interface DiagnosticsRowV1 {
  readonly label: string;
  readonly value: string;
}

export interface DiagnosticsSectionV1 {
  readonly id: DiagnosticsSectionId;
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly DiagnosticsRowV1[];
  readonly notes?: readonly string[];
}

export interface DiagnosticsModelSummaryV1 {
  readonly status: 'checking' | 'ready' | 'error';
  readonly installedModelCount: number;
  readonly installableModelCount: number;
  readonly backendKind?: string;
}

export interface DiagnosticsProfileSummaryV1 {
  readonly status: 'checking' | 'ready' | 'error';
  readonly profileCount: number;
  readonly acceptedRecordingCount: number;
  readonly trainingJobBytes: number;
  readonly browserTrainingRecoveryBytes: number;
}

export interface DiagnosticsScreenSummaryV1 {
  readonly generatedAt: string;
  readonly sections: readonly DiagnosticsSectionV1[];
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly containsAudio: false;
    readonly containsTranscriptText: false;
    readonly containsVocabularyTerms: false;
    readonly containsProfileIds: false;
    readonly containsStoragePaths: false;
    readonly networkUpload: false;
  };
}

export interface BuildDiagnosticsScreenSummaryOptions {
  readonly generatedAt: string;
  readonly capabilityReport: CapabilityReport | null;
  readonly pwa: PwaLifecycleSnapshot;
  readonly modelSummary: DiagnosticsModelSummaryV1;
  readonly profileSummary: DiagnosticsProfileSummaryV1;
  readonly vocabularySummary: VocabularyDiagnosticsSummaryV1;
  readonly recentErrors?: readonly string[];
}

export interface VocabularyDiagnosticsSummaryV1 {
  readonly status: 'ready' | 'unavailable';
  readonly setCount: number;
  readonly enabledSetCount: number;
  readonly wordCount: number;
}

const aggregatePrivacy = {
  aggregateOnly: true,
  containsAudio: false,
  containsTranscriptText: false,
  containsVocabularyTerms: false,
  containsProfileIds: false,
  containsStoragePaths: false,
  networkUpload: false,
} as const;

export function createEmptyModelDiagnosticsSummary(): DiagnosticsModelSummaryV1 {
  return { status: 'checking', installedModelCount: 0, installableModelCount: 0 };
}

export function createEmptyProfileDiagnosticsSummary(): DiagnosticsProfileSummaryV1 {
  return {
    status: 'checking',
    profileCount: 0,
    acceptedRecordingCount: 0,
    trainingJobBytes: 0,
    browserTrainingRecoveryBytes: 0,
  };
}

export function createVocabularyDiagnosticsSummary(
  snapshot: VocabularyStoreSnapshotV1 | null,
): VocabularyDiagnosticsSummaryV1 {
  if (snapshot === null) {
    return { status: 'unavailable', setCount: 0, enabledSetCount: 0, wordCount: 0 };
  }

  return {
    status: 'ready',
    setCount: snapshot.sets.length,
    enabledSetCount: snapshot.sets.filter((set) => set.enabled).length,
    wordCount: snapshot.sets.reduce((total, set) => total + set.entries.length, 0),
  };
}

export function buildDiagnosticsScreenSummary(
  options: BuildDiagnosticsScreenSummaryOptions,
): DiagnosticsScreenSummaryV1 {
  const capabilityReport = options.capabilityReport;
  const warnings = capabilityReport?.warnings ?? [];
  const recentErrors = sanitizeMessages([...(options.recentErrors ?? []), ...warnings]);

  return {
    generatedAt: options.generatedAt,
    privacy: aggregatePrivacy,
    sections: [
      {
        id: 'browser-capabilities',
        title: 'Browser and capabilities',
        summary: capabilityReport
          ? `Tier ${capabilityReport.capabilities.selectedTier}; ${formatProvider(capabilityReport.recommendedProvider)}.`
          : 'Checking browser support.',
        rows: [
          row('Secure context', formatBool(capabilityReport?.capabilities.secureContext)),
          row('Shared memory', formatBool(capabilityReport?.capabilities.sharedArrayBuffer)),
          row(
            'Cross-origin isolation',
            formatBool(capabilityReport?.capabilities.crossOriginIsolated),
          ),
          row('Workers', formatBool(capabilityReport?.capabilities.webWorkers)),
          row('Persistent storage', formatBool(capabilityReport?.capabilities.persistentStorage)),
        ],
      },
      {
        id: 'audio',
        title: 'Audio',
        summary: capabilityReport?.capabilities.mediaDevices
          ? 'Microphone checks are available when you start an input test or recording.'
          : 'Microphone APIs are unavailable in this browser context.',
        rows: [
          row('Microphone API', formatBool(capabilityReport?.capabilities.mediaDevices)),
          row('AudioWorklet', formatBool(capabilityReport?.capabilities.audioWorklet)),
          row('Input test', 'Start from Audio settings'),
        ],
      },
      {
        id: 'inference',
        title: 'Inference',
        summary: capabilityReport
          ? `${formatProvider(capabilityReport.recommendedProvider)} selected from current browser capabilities.`
          : 'Checking processing mode.',
        rows: [
          row('Processing mode', formatProvider(capabilityReport?.recommendedProvider)),
          row('WebGPU device', formatBool(capabilityReport?.capabilities.webGpu)),
          row('WebAssembly SIMD', formatBool(capabilityReport?.capabilities.webAssemblySimd)),
          row('WebAssembly threads', formatBool(capabilityReport?.capabilities.webAssemblyThreads)),
          row('Worker round trip', formatWorkerRoundTrip(capabilityReport)),
        ],
        notes: [
          'Synthetic benchmark results remain diagnostics only until reference evidence exists.',
        ],
      },
      {
        id: 'model-tokenizer',
        title: 'Model and tokenizer',
        summary: formatModelSummary(options.modelSummary),
        rows: [
          row('Installable speech models', formatCount(options.modelSummary.installableModelCount)),
          row('Installed speech models', formatCount(options.modelSummary.installedModelCount)),
          row('Storage backend', options.modelSummary.backendKind ?? 'Checking'),
          row('Exact compatibility', 'Checked during import, export, and activation'),
        ],
      },
      {
        id: 'vocabulary',
        title: 'Vocabulary',
        summary:
          options.vocabularySummary.status === 'ready'
            ? `${formatCount(options.vocabularySummary.enabledSetCount)} enabled set${plural(options.vocabularySummary.enabledSetCount)}.`
            : 'Vocabulary summary is unavailable in this browser context.',
        rows: [
          row('Sets', formatCount(options.vocabularySummary.setCount)),
          row('Enabled sets', formatCount(options.vocabularySummary.enabledSetCount)),
          row('Words', formatCount(options.vocabularySummary.wordCount)),
          row('Activation', 'Applies at the next utterance boundary'),
        ],
      },
      {
        id: 'enrollment-training',
        title: 'Enrollment and training',
        summary: formatProfileSummary(options.profileSummary),
        rows: [
          row('Voice models', formatCount(options.profileSummary.profileCount)),
          row('Accepted recordings', formatCount(options.profileSummary.acceptedRecordingCount)),
          row('Training work storage', formatBytes(options.profileSummary.trainingJobBytes)),
          row(
            'Recovery state',
            formatRecoveryBytes(options.profileSummary.browserTrainingRecoveryBytes),
          ),
        ],
      },
      {
        id: 'storage',
        title: 'Storage',
        summary: formatStorageSummary(capabilityReport, options.pwa),
        rows: [
          row('Quota', formatBytes(capabilityReport?.storage.quotaBytes)),
          row('Estimated usage', formatBytes(capabilityReport?.storage.usageBytes)),
          row('Offline app', formatOfflineStatus(options.pwa)),
          row('Update state', options.pwa.updateAvailable ? 'Update available' : 'Current'),
        ],
      },
      {
        id: 'recent-errors',
        title: 'Recent recoverable errors',
        summary:
          recentErrors.length === 0
            ? 'No recent recoverable errors captured.'
            : `${recentErrors.length.toString()} item${plural(recentErrors.length)} need attention.`,
        rows:
          recentErrors.length === 0
            ? [row('Status', 'No recoverable errors captured in this session')]
            : recentErrors.map((message, index) => row(`Item ${(index + 1).toString()}`, message)),
      },
    ],
  };
}

export function buildSupportBundlePayload(
  summary: DiagnosticsScreenSummaryV1,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    reportType: 'speech-support-bundle',
    generatedAt: summary.generatedAt,
    privacy: summary.privacy,
    sections: summary.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      rows: section.rows,
      ...(section.notes === undefined ? {} : { notes: section.notes }),
    })),
    notes: [
      'Generated locally in the browser.',
      'No audio, transcript text, vocabulary terms, profile identifiers, adapter weights, or storage paths are included.',
      'Use Diagnostics only when you need support or compatibility details.',
    ],
  };
}

function row(label: string, value: string): DiagnosticsRowV1 {
  return { label, value };
}

function formatBool(value: boolean | undefined): string {
  if (value === undefined) return 'Checking';
  return value ? 'Available' : 'Unavailable';
}

function formatProvider(provider: string | undefined): string {
  switch (provider) {
    case 'webgpu':
      return 'WebGPU';
    case 'wasm':
      return 'WASM';
    case 'none':
      return 'None';
    default:
      return 'Checking';
  }
}

function formatWorkerRoundTrip(report: CapabilityReport | null): string {
  const median = report?.workerBenchmark.medianRoundTripMs;
  if (typeof median !== 'number') return 'Unavailable';
  return `${median.toFixed(2)} ms median`;
}

function formatModelSummary(summary: DiagnosticsModelSummaryV1): string {
  if (summary.status === 'checking') return 'Checking speech-model storage.';
  if (summary.status === 'error') return 'Model storage needs attention.';
  if (summary.installedModelCount === 0) return 'No speech model is installed yet.';
  return `${formatCount(summary.installedModelCount)} installed speech model${plural(summary.installedModelCount)}.`;
}

function formatProfileSummary(summary: DiagnosticsProfileSummaryV1): string {
  if (summary.status === 'checking') return 'Checking local voice-model storage.';
  if (summary.status === 'error') return 'Voice-model storage needs attention.';
  if (summary.profileCount === 0) return 'No local voice models yet.';
  return `${formatCount(summary.profileCount)} local voice model${plural(summary.profileCount)}.`;
}

function formatStorageSummary(report: CapabilityReport | null, pwa: PwaLifecycleSnapshot): string {
  if (pwa.offlineReady) return 'Offline app files are ready.';
  if (report?.storage.quotaBytes !== undefined) return 'Storage estimate is available.';
  return 'Storage estimate is unavailable.';
}

function formatOfflineStatus(pwa: PwaLifecycleSnapshot): string {
  if (!pwa.serviceWorkerSupported) return 'Unsupported';
  if (pwa.registrationState === 'error') return 'Needs attention';
  if (pwa.offlineReady) return 'Ready';
  if (pwa.registrationState === 'registered') return 'Preparing';
  return pwa.registrationState;
}

function formatRecoveryBytes(bytes: number): string {
  if (bytes <= 0) return 'None stored';
  return `${formatBytes(bytes)} stored locally`;
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number') return 'Unknown';
  if (value < 1024) return `${value.toString()} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}

function sanitizeMessages(messages: readonly string[]): readonly string[] {
  return messages
    .map(sanitizeMessage)
    .filter((message) => message.length > 0)
    .slice(0, 12);
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\bprofile[-_:][A-Za-z0-9._:-]+\b/gi, '[profile]')
    .replace(/[a-f0-9]{32,}/gi, '[hash]')
    .replace(/(?:[A-Za-z]:)?[\\/][^\s]+/g, '[path]')
    .trim()
    .slice(0, 180);
}
