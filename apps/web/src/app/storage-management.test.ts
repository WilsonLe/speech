import { describe, expect, it } from 'vitest';
import type { InstalledModelRecord } from '@speech/model-manager';
import type { EnrollmentProfileSummaryV1 } from '@speech/profile-manager';
import {
  createBaseModelTargets,
  createPersonalModelTargets,
  createStorageManagementSummary,
  getStorageConfirmationCopy,
} from './storage-management';

describe('storage-management', () => {
  it('builds aggregate storage summaries without raw ids or paths', () => {
    const summary = createStorageManagementSummary({
      installedModels: [installedModel()],
      profiles: [profileSummary()],
      quota: { usage: 4_000, quota: 10_000 },
      vocabularyBytes: 600,
      browserTrainingRecoveryBytes: 700,
      profileTrainingJobBytes: 900,
      profileTrainingJobCount: 1,
    });

    expect(summary.baseModelBytes).toBe(3_000);
    expect(summary.profileBytes).toBe(700);
    expect(summary.recordingBytes).toBe(2_000);
    expect(summary.trainingWorkBytes).toBe(1_600);
    expect(summary.availableQuotaBytes).toBe(6_000);
    expect(summary.rows.map((row) => row.label)).toEqual([
      'Speech model downloads',
      'Voice models',
      'Recordings and training work',
      'Vocabulary',
      'Available quota',
    ]);
    expect(summary.rows[2]?.detail).toBe(
      '1 recording plus 1 training job plus saved training recovery',
    );
    expect(JSON.stringify(summary.rows)).not.toContain('profile-local');
    expect(JSON.stringify(summary.rows)).not.toContain('/recordings/');
    expect(JSON.stringify(summary.rows)).not.toContain('sha256');
  });

  it('returns reliable target lists for per-model deletion screens', () => {
    expect(createBaseModelTargets([installedModel()])).toEqual([
      {
        modelId: 'base-model',
        displayName: 'Local speech model',
        version: '2026.06',
        sizeBytes: 3_000,
      },
    ]);
    expect(createPersonalModelTargets([profileSummary()], 'profile-local')).toEqual([
      {
        profileId: 'profile-local',
        displayName: 'Wilson',
        recordingCount: 1,
        sizeBytes: 2_700,
        active: true,
      },
    ]);
  });

  it('states deletion consequences and retained data explicitly', () => {
    const training = getStorageConfirmationCopy('training-data');
    expect(training.removes).toContain('Training job work files');
    expect(training.retains).toContain('Voice models');
    expect(training.retains).toContain('Enrollment recordings');

    const all = getStorageConfirmationCopy('all-local-data');
    expect(all.removes).toContain('Voice models and recordings');
    expect(all.retains).toContain('UI preferences such as reduced motion or text size');
  });
});

function installedModel(): InstalledModelRecord {
  return {
    schemaVersion: 1,
    modelId: 'base-model',
    activeVersion: '2026.06',
    manifest: {
      id: 'base-model',
      displayName: 'Local speech model',
    },
    files: [],
    requiredStorageBytes: 2_000,
    backendKind: 'memory',
    installId: 'install-local',
    installedAt: '2026-06-25T00:00:00.000Z',
    activatedAt: '2026-06-25T00:00:00.000Z',
    trainingCompanion: {
      contractVersion: 1,
      files: [],
      requiredStorageBytes: 1_000,
      installId: 'training-support',
      installedAt: '2026-06-25T00:00:00.000Z',
      activatedAt: '2026-06-25T00:00:00.000Z',
    },
  } as unknown as InstalledModelRecord;
}

function profileSummary(): EnrollmentProfileSummaryV1 {
  return {
    profile: {
      schemaVersion: 1,
      id: 'profile-local',
      displayName: 'Wilson',
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:00.000Z',
      enrollment: {},
      privacy: { containsRawAudio: true, exportEncrypted: false, localOnly: true },
    },
    utterances: [
      {
        id: 'utt-local',
        audio: {
          path: 'profiles/profile-local/recordings/utt-local.wav',
          sizeBytes: 2_000,
        },
      },
    ],
    checksums: {
      schemaVersion: 1,
      profileId: 'profile-local',
      updatedAt: '2026-06-25T00:00:00.000Z',
      files: {
        'profiles/profile-local/profile.json': { sha256: 'profile-sha', sizeBytes: 400 },
        'profiles/profile-local/enrollment.jsonl': { sha256: 'enrollment-sha', sizeBytes: 300 },
        'profiles/profile-local/recordings/utt-local.wav': {
          sha256: 'audio-sha',
          sizeBytes: 2_000,
        },
      },
    },
  } as unknown as EnrollmentProfileSummaryV1;
}
