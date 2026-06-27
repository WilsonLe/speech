import type {
  EnrollmentQualityReportV1,
  EnrollmentSentenceLanguage,
  EnrollmentVoiceCondition,
  TrainingReadinessCoverageReportV1,
  TrainingReadinessPolicyV1,
} from '@speech/enrollment';

export type EnrollmentRecorderStatus =
  | 'idle'
  | 'recording'
  | 'analyzing'
  | 'ready'
  | 'accepted'
  | 'skipped'
  | 'error';

export interface EnrollmentPromptProgressView {
  readonly current: number;
  readonly total: number;
  readonly label: string;
}

export interface EnrollmentPrimaryRecordActionView {
  readonly label: string;
  readonly intent: 'start-microphone' | 'record' | 'stop' | 'checking';
  readonly disabled: boolean;
}

export interface EnrollmentConditionView {
  readonly label: 'Whisper' | 'Normal' | 'Loud';
  readonly hint: string | null;
}

export interface EnrollmentFeedbackView {
  readonly text: string;
  readonly tone: 'neutral' | 'good' | 'warning' | 'error';
  readonly livePoliteness: 'polite' | 'assertive';
}

export interface EnrollmentDetailsAvailabilityView {
  readonly canReplay: boolean;
  readonly canRetry: boolean;
  readonly canSkip: boolean;
  readonly canAccept: boolean;
  readonly canPause: boolean;
}

const conditionLabels: Record<EnrollmentVoiceCondition, EnrollmentConditionView['label']> = {
  whisper: 'Whisper',
  normal: 'Normal',
  projected: 'Loud',
};

const languageLabels: Record<EnrollmentSentenceLanguage, string> = {
  vi: 'Vietnamese',
  en: 'English',
  mixed: 'Mixed',
};

export function getEnrollmentConditionView(
  condition: EnrollmentVoiceCondition,
  options: {
    readonly isFirstPromptInCondition: boolean;
    readonly hasFailedTake: boolean;
  },
): EnrollmentConditionView {
  const label = conditionLabels[condition];
  if (!options.isFirstPromptInCondition && !options.hasFailedTake) {
    return { label, hint: null };
  }

  if (condition === 'projected') {
    return { label, hint: 'Project your voice without straining.' };
  }

  if (condition === 'whisper') {
    return { label, hint: 'Speak softly, but keep the words clear.' };
  }

  return { label, hint: 'Use your usual speaking voice.' };
}

export function formatEnrollmentLanguageLabel(language: EnrollmentSentenceLanguage): string {
  return languageLabels[language];
}

export function createEnrollmentPromptProgressView(options: {
  readonly acceptedTakes: number;
  readonly readinessReport: TrainingReadinessCoverageReportV1 | null;
  readonly fallbackPolicy: TrainingReadinessPolicyV1;
}): EnrollmentPromptProgressView {
  const total = Math.max(
    1,
    options.readinessReport?.policy.minAcceptedUtterances ??
      options.fallbackPolicy.minAcceptedUtterances,
  );
  const current = Math.min(total, Math.max(0, Math.floor(options.acceptedTakes)) + 1);
  return { current, total, label: `${current} of ${total}` };
}

export function createEnrollmentPrimaryRecordActionView(options: {
  readonly microphoneStatus: 'idle' | 'requesting' | 'active' | 'error';
  readonly recorderStatus: EnrollmentRecorderStatus;
}): EnrollmentPrimaryRecordActionView {
  if (options.recorderStatus === 'analyzing') {
    return { label: 'Checking', intent: 'checking', disabled: true };
  }

  if (options.recorderStatus === 'recording') {
    return { label: 'Stop', intent: 'stop', disabled: false };
  }

  if (options.microphoneStatus === 'requesting') {
    return { label: 'Starting microphone', intent: 'start-microphone', disabled: true };
  }

  if (options.microphoneStatus !== 'active') {
    return { label: 'Start microphone', intent: 'start-microphone', disabled: false };
  }

  return { label: 'Record', intent: 'record', disabled: false };
}

export function createEnrollmentFeedbackView(options: {
  readonly recorderStatus: EnrollmentRecorderStatus;
  readonly qualityReport: EnrollmentQualityReportV1 | null;
  readonly fallbackMessage: string;
}): EnrollmentFeedbackView {
  const report = options.qualityReport;
  if (report) {
    if (report.status === 'pass') {
      return { text: 'Good', tone: 'good', livePoliteness: 'polite' };
    }

    const reason = report.reasonCodes[0] ?? 'record-again';
    return {
      text: mapQualityReasonToFeedback(reason),
      tone: report.status === 'retry' ? 'error' : 'warning',
      livePoliteness: 'assertive',
    };
  }

  if (options.recorderStatus === 'recording') {
    return { text: 'Recording', tone: 'neutral', livePoliteness: 'polite' };
  }

  if (options.recorderStatus === 'analyzing') {
    return { text: 'Checking recording', tone: 'neutral', livePoliteness: 'polite' };
  }

  if (options.recorderStatus === 'accepted') {
    return { text: 'Saved locally', tone: 'good', livePoliteness: 'polite' };
  }

  if (options.recorderStatus === 'skipped') {
    return { text: 'Skipped', tone: 'warning', livePoliteness: 'polite' };
  }

  if (options.recorderStatus === 'error') {
    return {
      text: sanitizeEnrollmentStatusText(options.fallbackMessage) || 'Record again',
      tone: 'error',
      livePoliteness: 'assertive',
    };
  }

  return { text: 'Ready', tone: 'neutral', livePoliteness: 'polite' };
}

export function createEnrollmentDetailsAvailabilityView(options: {
  readonly recorderStatus: EnrollmentRecorderStatus;
  readonly hasCapturedTake: boolean;
  readonly hasQualityReport: boolean;
  readonly canSave: boolean;
  readonly microphoneActive: boolean;
}): EnrollmentDetailsAvailabilityView {
  const recording = options.recorderStatus === 'recording';
  return {
    canReplay: options.hasCapturedTake && !recording,
    canRetry: !recording && (options.hasCapturedTake || options.hasQualityReport),
    canSkip: !recording,
    canAccept: !recording && options.canSave,
    canPause: options.microphoneActive && !recording,
  };
}

export function sanitizeEnrollmentStatusText(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('sha') ||
    lower.includes('checksum') ||
    lower.includes('opfs') ||
    lower.includes('worker') ||
    lower.includes('audio chunks') ||
    lower.includes('sample rate')
  ) {
    return 'Record again.';
  }
  return message.trim();
}

function mapQualityReasonToFeedback(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes('quiet') || normalized.includes('low-level')) {
    return 'Too quiet — move closer.';
  }
  if (normalized.includes('clipp') || normalized.includes('peak')) {
    return 'Clipped — move back.';
  }
  if (normalized.includes('noise') || normalized.includes('snr')) {
    return 'Too much noise — try a quieter room.';
  }
  if (
    normalized.includes('late') ||
    normalized.includes('speech-start') ||
    normalized.includes('vad')
  ) {
    return 'Speech started late — record again.';
  }
  if (normalized.includes('short') || normalized.includes('duration')) {
    return 'Too short — read the full prompt.';
  }
  if (normalized.includes('pace') || normalized.includes('fast')) {
    return 'Too fast — slow down.';
  }
  return 'Record again.';
}
