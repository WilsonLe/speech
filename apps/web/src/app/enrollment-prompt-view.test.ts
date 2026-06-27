import { describe, expect, it } from 'vitest';
import {
  defaultTrainingReadinessPolicyV1,
  type EnrollmentQualityReportV1,
  type EnrollmentTakeQualityReasonCode,
  type EnrollmentTakeQualityStatus,
} from '@speech/enrollment';
import {
  createEnrollmentDetailsAvailabilityView,
  createEnrollmentFeedbackView,
  createEnrollmentPrimaryRecordActionView,
  createEnrollmentPromptLiveText,
  createEnrollmentPromptProgressView,
  createEnrollmentQualityFeedbackList,
  formatEnrollmentLanguageLabel,
  getEnrollmentConditionView,
  sanitizeEnrollmentStatusText,
  summarizeEnrollmentQualityForDetails,
} from './enrollment-prompt-view';

describe('enrollment prompt view helpers', () => {
  it('uses compact condition labels and only shows hints when useful', () => {
    expect(
      getEnrollmentConditionView('projected', {
        isFirstPromptInCondition: true,
        hasFailedTake: false,
      }),
    ).toEqual({ label: 'Loud', hint: 'Project your voice without straining.' });
    expect(
      getEnrollmentConditionView('projected', {
        isFirstPromptInCondition: false,
        hasFailedTake: false,
      }),
    ).toEqual({ label: 'Loud', hint: null });
    expect(
      getEnrollmentConditionView('whisper', {
        isFirstPromptInCondition: false,
        hasFailedTake: true,
      }),
    ).toEqual({ label: 'Whisper', hint: 'Speak softly, but keep the words clear.' });
  });

  it('formats progress from aggregate accepted-take counts', () => {
    expect(
      createEnrollmentPromptProgressView({
        acceptedTakes: 0,
        readinessReport: null,
        fallbackPolicy: defaultTrainingReadinessPolicyV1,
      }),
    ).toEqual({ current: 1, total: 24, label: '1 of 24' });
    expect(
      createEnrollmentPromptProgressView({
        acceptedTakes: 24,
        readinessReport: null,
        fallbackPolicy: defaultTrainingReadinessPolicyV1,
      }),
    ).toEqual({ current: 24, total: 24, label: '24 of 24' });
  });

  it('maps one primary recording control across microphone and recorder states', () => {
    expect(
      createEnrollmentPrimaryRecordActionView({
        microphoneStatus: 'idle',
        recorderStatus: 'idle',
      }),
    ).toMatchObject({ label: 'Start microphone', intent: 'start-microphone', disabled: false });
    expect(
      createEnrollmentPrimaryRecordActionView({
        microphoneStatus: 'active',
        recorderStatus: 'idle',
      }),
    ).toMatchObject({ label: 'Record', intent: 'record', disabled: false });
    expect(
      createEnrollmentPrimaryRecordActionView({
        microphoneStatus: 'active',
        recorderStatus: 'recording',
      }),
    ).toMatchObject({ label: 'Stop', intent: 'stop', disabled: false });
    expect(
      createEnrollmentPrimaryRecordActionView({
        microphoneStatus: 'active',
        recorderStatus: 'analyzing',
      }),
    ).toMatchObject({ label: 'Checking', intent: 'checking', disabled: true });
  });

  it('keeps quality feedback short and actionable', () => {
    expect(
      createEnrollmentFeedbackView({
        recorderStatus: 'ready',
        qualityReport: qualityReport({ status: 'pass', reasonCodes: [] }),
        fallbackMessage: 'unused',
      }),
    ).toMatchObject({ text: 'Good', tone: 'good' });
    expect(
      createEnrollmentFeedbackView({
        recorderStatus: 'ready',
        qualityReport: qualityReport({ status: 'review', reasonCodes: ['condition-too-quiet'] }),
        fallbackMessage: 'unused',
      }),
    ).toMatchObject({ text: 'Too quiet — move closer.', tone: 'warning' });
    expect(
      createEnrollmentFeedbackView({
        recorderStatus: 'ready',
        qualityReport: qualityReport({ status: 'retry', reasonCodes: ['clipping'] }),
        fallbackMessage: 'unused',
      }),
    ).toMatchObject({ text: 'Clipped — move back.', tone: 'error', livePoliteness: 'assertive' });
    expect(
      createEnrollmentFeedbackView({
        recorderStatus: 'ready',
        qualityReport: qualityReport({
          status: 'review',
          reasonCodes: ['low-base-model-confidence'],
        }),
        fallbackMessage: 'unused',
      }),
    ).toMatchObject({ text: 'Recognizer unsure — you can still accept.', tone: 'warning' });
  });

  it('maps every quality reason to concise default UI copy', () => {
    const report = qualityReport({
      status: 'review',
      reasonCodes: [
        'no-audio',
        'duration-too-short',
        'duration-too-long',
        'clipping',
        'low-snr',
        'condition-too-quiet',
        'condition-too-loud',
        'vad-missing-start',
        'vad-missing-end',
        'pace-too-slow',
        'pace-too-fast',
        'alignment-low',
        'alignment-unavailable',
        'low-base-model-confidence',
      ],
    });

    expect(createEnrollmentQualityFeedbackList(report).map((item) => item.text)).toEqual([
      'No speech — record again.',
      'Too short — read the full prompt.',
      'Too long — read only the prompt.',
      'Clipped — move back.',
      'Too much noise — try a quieter room.',
      'Too quiet — move closer.',
      'Too loud — move back.',
      'Speech started late — record again.',
      'Speech ended early — record again.',
      'Too slow — read naturally.',
      'Too fast — slow down.',
      'Prompt match unclear — retry or accept.',
      'Prompt check unavailable — you can still accept.',
      'Recognizer unsure — you can still accept.',
    ]);
  });

  it('sanitizes technical status text and details summaries before default copy', () => {
    expect(sanitizeEnrollmentStatusText('checksum abc123 failed in worker')).toBe('Record again.');
    expect(sanitizeEnrollmentStatusText('Try a quieter room.')).toBe('Try a quieter room.');
    expect(
      summarizeEnrollmentQualityForDetails(
        qualityReport({ status: 'review', reasonCodes: ['low-base-model-confidence'] }),
      ),
    ).toBe('Review the take. You can accept it if it sounds right.');
    expect(
      summarizeEnrollmentQualityForDetails(
        qualityReport({ status: 'retry', reasonCodes: ['duration-too-short'] }),
      ),
    ).toBe('Record again when ready.');
  });

  it('keeps secondary actions relevant to the current take state', () => {
    expect(
      createEnrollmentDetailsAvailabilityView({
        recorderStatus: 'recording',
        hasCapturedTake: true,
        hasQualityReport: true,
        canSave: true,
        microphoneActive: true,
      }),
    ).toEqual({
      canReplay: false,
      canRetry: false,
      canSkip: false,
      canAccept: false,
      canPause: false,
    });
    expect(
      createEnrollmentDetailsAvailabilityView({
        recorderStatus: 'ready',
        hasCapturedTake: true,
        hasQualityReport: true,
        canSave: true,
        microphoneActive: true,
      }),
    ).toEqual({ canReplay: true, canRetry: true, canSkip: true, canAccept: true, canPause: true });
  });

  it('announces prompt changes with restrained live text', () => {
    expect(
      createEnrollmentPromptLiveText({
        progress: { current: 3, total: 24, label: '3 of 24' },
        condition: { label: 'Loud', hint: 'Project your voice without straining.' },
      }),
    ).toBe('Prompt 3 of 24. Loud.');
  });

  it('uses default user-facing language labels', () => {
    expect(formatEnrollmentLanguageLabel('vi')).toBe('Vietnamese');
    expect(formatEnrollmentLanguageLabel('en')).toBe('English');
    expect(formatEnrollmentLanguageLabel('mixed')).toBe('Mixed');
  });
});

function qualityReport(overrides: {
  readonly status: EnrollmentTakeQualityStatus;
  readonly reasonCodes: readonly EnrollmentTakeQualityReasonCode[];
}): EnrollmentQualityReportV1 {
  return {
    schemaVersion: 1,
    status: overrides.status,
    reasonCodes: overrides.reasonCodes,
    summary: 'Synthetic aggregate report.',
    language: 'mixed',
    voiceCondition: 'normal',
    manualAcceptanceAllowed: true,
    level: {
      durationMs: 1_000,
      sampleCount: 16_000,
      peak: 0.5,
      peakDbfs: -6,
      rms: 0.1,
      activeSpeechRms: 0.12,
      clippingRatio: 0,
      clippedSamples: 0,
      snrDb: 25,
      relativeDb: 0,
    },
    vad: {
      activeSpeechDurationMs: 800,
      activeSpeechRatio: 0.8,
      startMs: 100,
      endMs: 900,
      confidence: 0.9,
      missingStart: false,
      missingEnd: false,
      thresholdRms: 0.01,
    },
    pace: { referenceTokenCount: 4, tokensPerSecond: 2.5, status: 'in-range' },
    alignment: {
      available: true,
      referenceTokenCount: 4,
      observedTokenCount: 4,
      coverage: 1,
      confidence: 0.9,
      status: 'pass',
      note: 'Synthetic note.',
    },
    privacy: {
      containsAudio: false,
      containsTranscriptText: false,
      localOnly: true,
    },
  };
}
