export const speechFeedbackTones = ['info', 'success', 'warning', 'danger'] as const;
export const speechLiveRegionModes = ['off', 'polite', 'assertive'] as const;
export const speechProgressSizes = ['sm', 'md', 'lg'] as const;
export const speechStatusVariants = ['subtle', 'solid'] as const;

export type SpeechFeedbackTone = (typeof speechFeedbackTones)[number];
export type SpeechLiveRegionMode = (typeof speechLiveRegionModes)[number];
export type SpeechProgressSize = (typeof speechProgressSizes)[number];
export type SpeechStatusVariant = (typeof speechStatusVariants)[number];

export function getProgressPercentage(value: number, max: number): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return undefined;
  }

  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function getFeedbackDefaultLiveMode(tone: SpeechFeedbackTone): SpeechLiveRegionMode {
  return tone === 'danger' || tone === 'warning' ? 'assertive' : 'polite';
}

export function getFeedbackDefaultRole(tone: SpeechFeedbackTone): 'alert' | 'status' {
  return tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
}
