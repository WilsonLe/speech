export const speechButtonActivationKeys = ['Enter', 'Space'] as const;

export const speechButtonStateExamples = [
  'default',
  'hover',
  'focus-visible',
  'disabled',
  'loading',
  'destructive',
  'forced-colours',
  'reduced-motion',
  'touch-target',
] as const;

export const speechButtonPointerExpectations = [
  'Use native button semantics for click, pointer, Enter, and Space activation.',
  'Do not use a disabled button when hiding the unavailable action is clearer.',
  'Keep destructive consequences outside the primitive and in the calling workflow.',
] as const;

export type SpeechButtonActivationKey = (typeof speechButtonActivationKeys)[number];
export type SpeechButtonStateExample = (typeof speechButtonStateExamples)[number];
