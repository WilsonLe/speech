import type { EnrollmentVoiceCondition } from './sentence-bank';

export interface EnrollmentCalibrationLevelSample {
  readonly rms: number;
  readonly peak: number;
  readonly clippingRatio: number;
}

export interface EnrollmentCalibrationBaseline {
  readonly normalRms: number;
  readonly roomNoiseRms?: number;
}

export interface VoiceConditionTargetBand {
  readonly condition: EnrollmentVoiceCondition;
  readonly minRelativeDb: number;
  readonly maxRelativeDb: number;
  readonly label: string;
  readonly instruction: string;
}

export type VoiceConditionGuidanceStatus =
  | 'not-ready'
  | 'in-range'
  | 'too-quiet'
  | 'too-loud'
  | 'clipping'
  | 'low-snr';

export interface VoiceConditionGuidanceResult {
  readonly condition: EnrollmentVoiceCondition;
  readonly status: VoiceConditionGuidanceStatus;
  readonly target: VoiceConditionTargetBand;
  readonly relativeDb: number | null;
  readonly snrDb: number | null;
  readonly message: string;
}

const minUsableRms = 0.000_001;
const clippingRatioGate = 0.001;
const peakClipGate = 0.98;
const preferredSnrDb = 12;

const voiceConditionTargets: Readonly<Record<EnrollmentVoiceCondition, VoiceConditionTargetBand>> =
  {
    whisper: {
      condition: 'whisper',
      minRelativeDb: -15,
      maxRelativeDb: -6,
      label: 'Whisper',
      instruction: 'Speak in a comfortable whisper. Stop if your voice feels strained.',
    },
    normal: {
      condition: 'normal',
      minRelativeDb: -4,
      maxRelativeDb: 4,
      label: 'Normal',
      instruction: 'Use your ordinary conversational voice at the calibrated microphone position.',
    },
    projected: {
      condition: 'projected',
      minRelativeDb: 3,
      maxRelativeDb: 10,
      label: 'Projected',
      instruction:
        'Speak louder and clearer than normal, like addressing a room. Do not strain, scream, or sustain a shout.',
    },
  };

export function getVoiceConditionTarget(
  condition: EnrollmentVoiceCondition,
): VoiceConditionTargetBand {
  return voiceConditionTargets[condition];
}

export function calculateRelativeDb(currentRms: number, baselineRms: number): number | null {
  if (currentRms <= minUsableRms || baselineRms <= minUsableRms) return null;
  return 20 * Math.log10(currentRms / baselineRms);
}

export function estimateSnrDb(signalRms: number, roomNoiseRms: number | undefined): number | null {
  if (roomNoiseRms === undefined || signalRms <= minUsableRms || roomNoiseRms <= minUsableRms) {
    return null;
  }
  return 20 * Math.log10(signalRms / roomNoiseRms);
}

export function evaluateVoiceConditionGuidance(
  sample: EnrollmentCalibrationLevelSample,
  baseline: EnrollmentCalibrationBaseline | null,
  condition: EnrollmentVoiceCondition,
): VoiceConditionGuidanceResult {
  const target = getVoiceConditionTarget(condition);
  if (baseline === null || baseline.normalRms <= minUsableRms) {
    return {
      condition,
      status: 'not-ready',
      target,
      relativeDb: null,
      snrDb: null,
      message: 'Capture room noise, then read one normal calibration sentence to set a baseline.',
    };
  }

  const relativeDb = calculateRelativeDb(sample.rms, baseline.normalRms);
  const snrDb = estimateSnrDb(sample.rms, baseline.roomNoiseRms);

  if (sample.clippingRatio > clippingRatioGate || sample.peak >= peakClipGate) {
    return {
      condition,
      status: 'clipping',
      target,
      relativeDb,
      snrDb,
      message:
        'Input is clipping. Move the microphone away or speak more softly before accepting a take.',
    };
  }

  if (snrDb !== null && snrDb < preferredSnrDb) {
    return {
      condition,
      status: 'low-snr',
      target,
      relativeDb,
      snrDb,
      message:
        'Room noise is close to speech level. Reduce noise or move closer to the microphone.',
    };
  }

  if (relativeDb === null) {
    return {
      condition,
      status: 'not-ready',
      target,
      relativeDb,
      snrDb,
      message: 'Current level is too low to compare with the normal baseline.',
    };
  }

  if (relativeDb < target.minRelativeDb) {
    return {
      condition,
      status: 'too-quiet',
      target,
      relativeDb,
      snrDb,
      message: `${target.label} target is ${formatDbRange(target)}; current level is too quiet.`,
    };
  }

  if (relativeDb > target.maxRelativeDb) {
    return {
      condition,
      status: 'too-loud',
      target,
      relativeDb,
      snrDb,
      message: `${target.label} target is ${formatDbRange(target)}; current level is too loud.`,
    };
  }

  return {
    condition,
    status: 'in-range',
    target,
    relativeDb,
    snrDb,
    message: `${target.label} level is in the advisory band. ${target.instruction}`,
  };
}

export function formatDb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'not available';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} dB`;
}

export function formatDbRange(target: VoiceConditionTargetBand): string {
  return `${formatDb(target.minRelativeDb)} to ${formatDb(target.maxRelativeDb)} relative to normal`;
}
