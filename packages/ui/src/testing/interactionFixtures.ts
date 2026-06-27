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

export const speechAccordionFocusKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;

export const speechDisclosureUsageRules = [
  'Use Disclosure for one optional section that supports the current task.',
  'Keep required blockers, required fields, destructive consequences, and privacy consent visible outside collapsed content.',
  'Use Accordion only for several independent optional sections on a detail or diagnostics screen.',
  'Do not nest Accordion patterns or place long forms inside accordion panels.',
] as const;

export type SpeechButtonActivationKey = (typeof speechButtonActivationKeys)[number];
export type SpeechButtonStateExample = (typeof speechButtonStateExamples)[number];
export type SpeechAccordionFocusKey = (typeof speechAccordionFocusKeys)[number];
