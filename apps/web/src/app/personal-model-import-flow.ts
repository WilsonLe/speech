import type { InstalledModelRecord } from '@speech/model-manager';
import {
  PORTABLE_SPEECH_MODEL_EXTENSION,
  PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES,
  parsePortableSpeechModelEnvelopePrefix,
  type PortableSpeechModelEnvelopeMode,
} from '@speech/portable-model';
import type { PortableSpeechModelImportSummaryV1 } from '@speech/profile-manager';
import type { ExactBaseModelIdentityV1, SpeechModelManifestV3 } from '@speech/protocol';
import { formatPreflightBytes } from './personal-models-preflight';

export type PortableImportStepId = 'choose' | 'unlock' | 'validate' | 'review';

export interface PortableImportEnvelopePreviewV1 {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly mode: PortableSpeechModelEnvelopeMode;
  readonly encrypted: boolean;
  readonly passphraseRequired: boolean;
  readonly sizeLabel: string;
  readonly privacy: {
    readonly localOnly: true;
    readonly parsedPrefixOnly: true;
    readonly expandedArchiveOnMainThread: false;
    readonly containsManifestHashes: false;
    readonly containsStoragePaths: false;
  };
}

export interface PortableImportBaseModelReviewV1 {
  readonly status: 'ready' | 'missing-compatible-base';
  readonly title: string;
  readonly detail: string;
  readonly expectedBaseModel?: ExactBaseModelIdentityV1;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly exposesModelId: false;
    readonly exposesManifestHash: false;
    readonly exposesTokenizerHash: false;
    readonly exposesGraphHash: false;
  };
}

export interface PortableImportReviewV1 {
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly {
    readonly label: 'Name' | 'Speech model' | 'Vocabulary' | 'Size' | 'Compatibility';
    readonly value: string;
  }[];
  readonly smokeSummary: string;
  readonly privacySummary: string;
  readonly technicalSummary: string;
}

export interface PortableImportStepViewV1 {
  readonly id: PortableImportStepId;
  readonly label: string;
  readonly status: 'current' | 'complete' | 'blocked' | 'pending';
}

export function inspectPortableImportEnvelope(
  bytes: Uint8Array,
  fileName: string,
): PortableImportEnvelopePreviewV1 {
  if (bytes.byteLength > PORTABLE_SPEECH_MODEL_HARD_MAX_BYTES) {
    throw new Error('Portable speech model file exceeds the supported size limit.');
  }
  if (!fileName.toLowerCase().endsWith(PORTABLE_SPEECH_MODEL_EXTENSION)) {
    throw new Error('Choose a .speechmodel file.');
  }
  const prefix = parsePortableSpeechModelEnvelopePrefix(bytes);
  return {
    fileName,
    fileSizeBytes: bytes.byteLength,
    mode: prefix.header.mode,
    encrypted: prefix.header.mode === 'encrypted',
    passphraseRequired: prefix.header.mode === 'encrypted',
    sizeLabel: formatPreflightBytes(bytes.byteLength),
    privacy: {
      localOnly: true,
      parsedPrefixOnly: true,
      expandedArchiveOnMainThread: false,
      containsManifestHashes: false,
      containsStoragePaths: false,
    },
  };
}

export function buildPortableImportBaseModelReview(
  installed: readonly InstalledModelRecord[],
): PortableImportBaseModelReviewV1 {
  const installedWithTrainingContract = installed.find(hasBrowserTrainingContract);
  if (installedWithTrainingContract === undefined) {
    return {
      status: 'missing-compatible-base',
      title: 'Install the matching speech model first',
      detail:
        'Imported voice models are checked against the exact speech model on this device before they are staged.',
      privacy: createBaseModelReviewPrivacy(),
    };
  }
  return {
    status: 'ready',
    title: 'Speech model ready',
    detail: `Version ${installedWithTrainingContract.manifest.browserTraining.exactBaseModel.version} is installed for compatibility checks.`,
    expectedBaseModel: installedWithTrainingContract.manifest.browserTraining.exactBaseModel,
    privacy: createBaseModelReviewPrivacy(),
  };
}

export function buildPortableImportStepView({
  preview,
  passphrase,
  validating,
  summary,
  error,
}: {
  readonly preview: PortableImportEnvelopePreviewV1 | null;
  readonly passphrase: string;
  readonly validating: boolean;
  readonly summary: PortableSpeechModelImportSummaryV1 | null;
  readonly error: string | null;
}): readonly PortableImportStepViewV1[] {
  const chooseComplete = preview !== null;
  const unlockNeeded = preview?.passphraseRequired === true;
  const unlockComplete = !unlockNeeded || passphrase.trim().length > 0 || summary !== null;
  const validationComplete = summary !== null;
  return [
    {
      id: 'choose',
      label: 'Choose file',
      status: chooseComplete ? 'complete' : error === null ? 'current' : 'blocked',
    },
    {
      id: 'unlock',
      label: 'Unlock',
      status: !chooseComplete
        ? 'pending'
        : !unlockNeeded
          ? 'complete'
          : unlockComplete
            ? 'complete'
            : 'current',
    },
    {
      id: 'validate',
      label: 'Validate locally',
      status:
        summary !== null
          ? 'complete'
          : validating
            ? 'current'
            : chooseComplete && unlockComplete
              ? 'current'
              : 'pending',
    },
    {
      id: 'review',
      label: 'Review',
      status: validationComplete ? 'current' : 'pending',
    },
  ];
}

export function buildPortableImportReview(
  summary: PortableSpeechModelImportSummaryV1,
): PortableImportReviewV1 {
  return {
    title: 'Ready on this device',
    summary: `${summary.displayName} passed local validation and runtime checks. It stays inactive until you choose to use it from Models.`,
    rows: [
      { label: 'Name', value: summary.displayName },
      { label: 'Speech model', value: `Exact version ${summary.baseModel.version} matched` },
      {
        label: 'Vocabulary',
        value: summary.vocabulary.included ? 'Included, terms hidden' : 'Not included',
      },
      { label: 'Size', value: formatPreflightBytes(summary.expandedBytes) },
      { label: 'Compatibility', value: 'Passed local checks' },
    ],
    smokeSummary: `${summary.smokeTest.vectorCount.toString()} smoke test vector${
      summary.smokeTest.vectorCount === 1 ? '' : 's'
    } passed`,
    privacySummary:
      'Recordings, training checkpoints, feature tensors, transcript text, and private vocabulary terms were not displayed.',
    technicalSummary: `${summary.fileCount.toString()} checked file${summary.fileCount === 1 ? '' : 's'} · ${summary.adaptationType === 'cli-residual-adapter' ? 'CLI adapter' : 'Browser adapter'}`,
  };
}

export function formatPortableImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('passphrase') || normalized.includes('decrypt')) {
    return 'Unlock failed. Check the passphrase, then try again.';
  }
  if (
    normalized.includes('base model') ||
    normalized.includes('exact') ||
    normalized.includes('compatible')
  ) {
    return 'This voice model needs the exact speech model it was created with.';
  }
  if (
    normalized.includes('magic') ||
    normalized.includes('envelope') ||
    normalized.includes('archive') ||
    normalized.includes('manifest') ||
    normalized.includes('unsupported')
  ) {
    return 'Choose a valid .speechmodel file. No model data was imported.';
  }
  if (normalized.includes('smoke') || normalized.includes('runtime')) {
    return 'Local runtime checks did not pass. No active voice model changed.';
  }
  return 'Import failed. No active voice model changed.';
}

function hasBrowserTrainingContract(
  record: InstalledModelRecord,
): record is InstalledModelRecord & { readonly manifest: SpeechModelManifestV3 } {
  return record.manifest.schemaVersion === 3 && record.manifest.browserTraining.supported;
}

function createBaseModelReviewPrivacy(): PortableImportBaseModelReviewV1['privacy'] {
  return {
    aggregateOnly: true,
    exposesModelId: false,
    exposesManifestHash: false,
    exposesTokenizerHash: false,
    exposesGraphHash: false,
  };
}
