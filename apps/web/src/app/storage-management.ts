import type { InstalledModelRecord } from '@speech/model-manager';
import type { EnrollmentProfileSummaryV1 } from '@speech/profile-manager';

export type StorageDeletionKind =
  | 'training-data'
  | 'personal-model'
  | 'base-model'
  | 'all-local-data';

export interface StorageQuotaEstimate {
  readonly usage?: number;
  readonly quota?: number;
}

export interface StorageSummaryInput {
  readonly installedModels: readonly InstalledModelRecord[];
  readonly profiles: readonly EnrollmentProfileSummaryV1[];
  readonly quota?: StorageQuotaEstimate;
  readonly vocabularyBytes?: number;
  readonly browserTrainingRecoveryBytes?: number;
  readonly profileTrainingJobBytes?: number;
  readonly profileTrainingJobCount?: number;
}

export interface StorageSummaryRow {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface StorageManagementSummary {
  readonly rows: readonly StorageSummaryRow[];
  readonly baseModelBytes: number;
  readonly profileBytes: number;
  readonly recordingBytes: number;
  readonly trainingWorkBytes: number;
  readonly vocabularyBytes: number;
  readonly quotaReliable: boolean;
  readonly availableQuotaBytes?: number;
}

export interface StorageConfirmationCopy {
  readonly title: string;
  readonly eyebrow: string;
  readonly confirmLabel: string;
  readonly removes: readonly string[];
  readonly retains: readonly string[];
  readonly warning: string;
}

export interface StoragePersonalModelTarget {
  readonly profileId: string;
  readonly displayName: string;
  readonly recordingCount: number;
  readonly sizeBytes: number;
  readonly active: boolean;
}

export interface StorageBaseModelTarget {
  readonly modelId: string;
  readonly displayName: string;
  readonly version: string;
  readonly sizeBytes: number;
}

export function createStorageManagementSummary(
  input: StorageSummaryInput,
): StorageManagementSummary {
  const baseModelBytes = input.installedModels.reduce(
    (total, model) =>
      total + model.requiredStorageBytes + (model.trainingCompanion?.requiredStorageBytes ?? 0),
    0,
  );
  const profileTotals = input.profiles.map(summarizeProfileBytes);
  const recordingBytes = profileTotals.reduce(
    (total, profile) => total + profile.recordingBytes,
    0,
  );
  const profileBytes = profileTotals.reduce((total, profile) => total + profile.profileBytes, 0);
  const trainingWorkBytes =
    (input.browserTrainingRecoveryBytes ?? 0) + (input.profileTrainingJobBytes ?? 0);
  const vocabularyBytes = input.vocabularyBytes ?? 0;
  const quotaReliable =
    typeof input.quota?.usage === 'number' &&
    Number.isFinite(input.quota.usage) &&
    typeof input.quota.quota === 'number' &&
    Number.isFinite(input.quota.quota) &&
    input.quota.quota > 0;
  const availableQuotaBytes = quotaReliable
    ? Math.max(0, (input.quota?.quota ?? 0) - (input.quota?.usage ?? 0))
    : undefined;

  return {
    baseModelBytes,
    profileBytes,
    recordingBytes,
    trainingWorkBytes,
    vocabularyBytes,
    quotaReliable,
    ...(availableQuotaBytes === undefined ? {} : { availableQuotaBytes }),
    rows: [
      {
        label: 'Speech model downloads',
        value: formatStorageBytes(baseModelBytes),
        detail: `${formatCount(input.installedModels.length, 'version')} installed`,
      },
      {
        label: 'Voice models',
        value: formatStorageBytes(profileBytes),
        detail: `${formatCount(input.profiles.length, 'model')} on this device`,
      },
      {
        label: 'Recordings and training work',
        value: formatStorageBytes(recordingBytes + trainingWorkBytes),
        detail: formatRecordingsAndTrainingDetail(
          totalUtterances(input.profiles),
          input.profileTrainingJobCount ?? 0,
          input.browserTrainingRecoveryBytes ?? 0,
        ),
      },
      {
        label: 'Vocabulary',
        value: formatStorageBytes(vocabularyBytes),
        detail: 'Local word lists and settings',
      },
      {
        label: 'Available quota',
        value:
          quotaReliable && availableQuotaBytes !== undefined
            ? formatStorageBytes(availableQuotaBytes)
            : 'Not available',
        detail: quotaReliable ? 'Browser estimate' : 'Browser did not provide a reliable estimate',
      },
    ],
  };
}

export function createPersonalModelTargets(
  profiles: readonly EnrollmentProfileSummaryV1[],
  activeProfileId: string | undefined,
): readonly StoragePersonalModelTarget[] {
  return profiles.map((profile) => {
    const totals = summarizeProfileBytes(profile);
    return {
      profileId: profile.profile.id,
      displayName: profile.profile.displayName,
      recordingCount: profile.utterances.length,
      sizeBytes: totals.profileBytes + totals.recordingBytes,
      active: profile.profile.id === activeProfileId,
    };
  });
}

export function createBaseModelTargets(
  installedModels: readonly InstalledModelRecord[],
): readonly StorageBaseModelTarget[] {
  return installedModels.map((record) => ({
    modelId: record.modelId,
    displayName: record.manifest.displayName,
    version: record.activeVersion,
    sizeBytes: record.requiredStorageBytes + (record.trainingCompanion?.requiredStorageBytes ?? 0),
  }));
}

export function getStorageConfirmationCopy(
  kind: StorageDeletionKind,
  targetName?: string,
): StorageConfirmationCopy {
  switch (kind) {
    case 'training-data':
      return {
        eyebrow: 'Delete training work files',
        title: 'Delete training data?',
        confirmLabel: 'Delete training data',
        removes: [
          'Saved training recovery',
          'Training job work files',
          'Temporary feature and label files',
        ],
        retains: ['Voice models', 'Enrollment recordings', 'Vocabulary', 'Speech model downloads'],
        warning: 'You can train again later, but interrupted training jobs cannot resume.',
      };
    case 'personal-model':
      return {
        eyebrow: 'Delete voice model',
        title: `Delete ${targetName ?? 'this voice model'}?`,
        confirmLabel: 'Delete voice model',
        removes: ['The selected voice model', 'Its recordings', 'Its saved training work files'],
        retains: ['Other voice models', 'Vocabulary', 'Speech model downloads'],
        warning: 'This removes the selected local voice model from this browser.',
      };
    case 'base-model':
      return {
        eyebrow: 'Remove speech model download',
        title: `Remove ${targetName ?? 'this speech model version'}?`,
        confirmLabel: 'Remove speech model',
        removes: ['The selected speech model download', 'Its installed support files'],
        retains: ['Voice models', 'Recordings', 'Vocabulary', 'Other speech model versions'],
        warning:
          'Dictation may need to reinstall this speech model before it can run offline again.',
      };
    case 'all-local-data':
      return {
        eyebrow: 'Delete all local speech data',
        title: 'Delete all local speech data?',
        confirmLabel: 'Delete all speech data',
        removes: [
          'Voice models and recordings',
          'Training work files and recovery',
          'Speech model downloads',
          'Vocabulary sets and draft model setup',
        ],
        retains: ['The installed app shell', 'UI preferences such as reduced motion or text size'],
        warning:
          'This resets local speech data in this browser. Reinstall speech models before dictating offline.',
      };
  }
}

export function formatStorageBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${Math.round(value).toString()} B`;
}

function summarizeProfileBytes(profile: EnrollmentProfileSummaryV1): {
  readonly profileBytes: number;
  readonly recordingBytes: number;
} {
  const recordingBytes = profile.utterances.reduce(
    (total, utterance) => total + utterance.audio.sizeBytes,
    0,
  );
  const totalBytes = Object.values(profile.checksums.files).reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  return {
    profileBytes: Math.max(0, totalBytes - recordingBytes),
    recordingBytes,
  };
}

function totalUtterances(profiles: readonly EnrollmentProfileSummaryV1[]): number {
  return profiles.reduce((total, profile) => total + profile.utterances.length, 0);
}

function formatRecordingsAndTrainingDetail(
  recordingCount: number,
  trainingJobCount: number,
  browserTrainingRecoveryBytes: number,
): string {
  const parts = [formatCount(recordingCount, 'recording')];
  if (trainingJobCount > 0) {
    parts.push(formatCount(trainingJobCount, 'training job'));
  }
  if (browserTrainingRecoveryBytes > 0) {
    parts.push('saved training recovery');
  }
  return parts.join(' plus ');
}

function formatCount(count: number, noun: string) {
  return `${count.toString()} ${noun}${count === 1 ? '' : 's'}`;
}
