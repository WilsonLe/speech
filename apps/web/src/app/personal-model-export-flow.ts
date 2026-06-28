import type { InstalledModelRecord } from '@speech/model-manager';
import type { PortableSpeechModelExportSummaryV1 } from '@speech/profile-manager';
import type { ExactBaseModelIdentityV1 } from '@speech/protocol';
import { buildPortableImportBaseModelReview } from './personal-model-import-flow';
import { formatPreflightBytes } from './personal-models-preflight';

export type PortableExportStepId = 'contents' | 'encrypt' | 'review' | 'save';

export interface PortableExportBaseModelReviewV1 {
  readonly status: 'ready' | 'missing-compatible-base';
  readonly title: string;
  readonly detail: string;
  readonly exactBaseModel?: ExactBaseModelIdentityV1;
  readonly privacy: {
    readonly aggregateOnly: true;
    readonly exposesModelId: false;
    readonly exposesManifestHash: false;
    readonly exposesTokenizerHash: false;
    readonly exposesGraphHash: false;
  };
}

export interface PortableExportStepViewV1 {
  readonly id: PortableExportStepId;
  readonly label: string;
  readonly status: 'current' | 'complete' | 'blocked' | 'pending';
}

export interface PortableExportReviewV1 {
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly {
    readonly label: 'Name' | 'Speech model' | 'Vocabulary' | 'Size' | 'Security';
    readonly value: string;
  }[];
  readonly privacySummary: string;
  readonly technicalSummary: string;
}

export function buildPortableExportBaseModelReview(
  installed: readonly InstalledModelRecord[],
  profileBaseModel?: {
    readonly id: string;
    readonly version: string;
    readonly manifestSha256: string;
    readonly graphContractSha256: string;
  },
): PortableExportBaseModelReviewV1 {
  const importReview = buildPortableImportBaseModelReview(installed);
  const exactBaseModel =
    importReview.expectedBaseModel === undefined || profileBaseModel === undefined
      ? importReview.expectedBaseModel
      : baseModelMatchesProfile(importReview.expectedBaseModel, profileBaseModel)
        ? importReview.expectedBaseModel
        : undefined;
  const ready = exactBaseModel !== undefined;
  return {
    status: ready ? 'ready' : 'missing-compatible-base',
    title: ready ? 'Speech model ready' : 'Install the matching speech model first',
    detail: ready
      ? `Version ${exactBaseModel.version} is installed for this voice model export.`
      : 'Voice model exports are bound to the exact speech model on this device.',
    ...(exactBaseModel === undefined ? {} : { exactBaseModel }),
    privacy: {
      aggregateOnly: true,
      exposesModelId: false,
      exposesManifestHash: false,
      exposesTokenizerHash: false,
      exposesGraphHash: false,
    },
  };
}

function baseModelMatchesProfile(
  installed: ExactBaseModelIdentityV1,
  profileBaseModel: {
    readonly id: string;
    readonly version: string;
    readonly manifestSha256: string;
    readonly graphContractSha256: string;
  },
): boolean {
  return (
    installed.id === profileBaseModel.id &&
    installed.version === profileBaseModel.version &&
    installed.manifestSha256 === profileBaseModel.manifestSha256 &&
    installed.graphContractSha256 === profileBaseModel.graphContractSha256
  );
}

export function buildPortableExportStepView({
  baseModelReady,
  encrypted,
  passphrase,
  confirmPassphrase,
  exporting,
  summary,
  error,
}: {
  readonly baseModelReady: boolean;
  readonly encrypted: boolean;
  readonly passphrase: string;
  readonly confirmPassphrase: string;
  readonly exporting: boolean;
  readonly summary: PortableSpeechModelExportSummaryV1 | null;
  readonly error: string | null;
}): readonly PortableExportStepViewV1[] {
  const contentsComplete = baseModelReady;
  const passphraseComplete =
    !encrypted || (passphrase.length > 0 && passphrase === confirmPassphrase);
  const reviewComplete = summary !== null;
  return [
    {
      id: 'contents',
      label: 'Choose contents',
      status: contentsComplete ? 'complete' : error === null ? 'current' : 'blocked',
    },
    {
      id: 'encrypt',
      label: 'Protect file',
      status: !contentsComplete
        ? 'pending'
        : passphraseComplete
          ? 'complete'
          : encrypted
            ? 'current'
            : 'complete',
    },
    {
      id: 'review',
      label: 'Review',
      status:
        summary !== null
          ? 'complete'
          : exporting
            ? 'current'
            : passphraseComplete
              ? 'current'
              : 'pending',
    },
    {
      id: 'save',
      label: 'Save file',
      status: reviewComplete ? 'complete' : 'pending',
    },
  ];
}

export function buildPortableExportReview(
  summary: PortableSpeechModelExportSummaryV1,
): PortableExportReviewV1 {
  return {
    title: `${summary.displayName} is ready to save`,
    summary: `${formatPreflightBytes(summary.expandedBytes)} prepared · ${summary.fileCount.toString()} files`,
    rows: [
      { label: 'Name', value: summary.displayName },
      {
        label: 'Speech model',
        value:
          summary.languages.length > 1 ? 'Bilingual voice model' : 'Single-language voice model',
      },
      {
        label: 'Vocabulary',
        value: summary.vocabulary.included ? 'Included by choice' : 'Not included',
      },
      { label: 'Size', value: formatPreflightBytes(summary.expandedBytes) },
      { label: 'Security', value: summary.encrypted ? 'Encrypted' : 'Not encrypted' },
    ],
    privacySummary: 'Recordings and training checkpoints are not included.',
    technicalSummary: `${summary.adaptationType} · ${summary.envelopeHeader.mode}`,
  };
}

export function validatePortableExportPassphrase(
  encrypted: boolean,
  passphrase: string,
  confirmPassphrase: string,
): string | null {
  if (!encrypted) return null;
  if (passphrase.length === 0) return 'Enter a passphrase to encrypt this export.';
  if (passphrase.length < 8) return 'Use at least 8 characters.';
  if (passphrase !== confirmPassphrase) return 'Passphrases do not match.';
  return null;
}

export function formatPortableExportError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('exportable personal-model artifact')) {
    return 'This voice model is not ready for portable export yet.';
  }
  if (normalized.includes('exact installed base model')) {
    return 'Install the matching speech model before exporting this voice model.';
  }
  if (normalized.includes('passphrase')) {
    return 'Enter a passphrase to protect this export.';
  }
  return 'The voice model could not be exported. Try again or open Details.';
}
