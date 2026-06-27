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

export const speechMenuFocusKeys = [
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
  'Escape',
  'Tab',
] as const;

export const speechMenuUsageRules = [
  'Use MenuButton for a temporary list of low-frequency actions or navigation for one context.',
  'Do not place forms, nested submenus, required privacy terms, blockers, or destructive consequences only in a menu.',
  'Destructive menu items must open a confirmation workflow rather than performing the destructive change directly.',
  'Frequently used actions stay visible instead of moving into a menu for visual minimalism.',
] as const;

export const speechTooltipUsageRules = [
  'Use Tooltip only for short supplemental text on compact controls or abbreviated statuses.',
  'Do not put links, buttons, forms, required instructions, errors, privacy terms, or destructive consequences inside a tooltip.',
  'Keep normal tooltip text within the v0.6 140-character budget.',
  'Provide a visible label or dedicated help surface when touch users need the information to complete the task.',
] as const;

export const speechDialogFocusKeys = ['Tab', 'Shift+Tab', 'Escape'] as const;

export const speechDialogUsageRules = [
  'Use Dialog only for short confirmations, concise rename/passphrase decisions, or blocking decisions on the current screen.',
  'Do not put a multi-step wizard, long form, or broad management task inside a dialog.',
  'Destructive dialogs must visibly name the object and consequence before the confirming action.',
  'When Escape would be unsafe, set closeOnEscape=false and provide visible Cancel or Back actions as appropriate.',
] as const;

export const speechFormControlFocusKeys = [
  'Tab',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Space',
] as const;

export const speechFormControlUsageRules = [
  'Use native Select for established choices that do not need side-by-side comparison.',
  'Use RadioGroup when two to four choices must be compared before continuing.',
  'Never use Select or RadioGroup to hide a primary action.',
  'Every Select and RadioGroup must have a visible persistent label; placeholders are not labels.',
] as const;

export type SpeechButtonActivationKey = (typeof speechButtonActivationKeys)[number];
export type SpeechButtonStateExample = (typeof speechButtonStateExamples)[number];
export type SpeechAccordionFocusKey = (typeof speechAccordionFocusKeys)[number];
export type SpeechMenuFocusKey = (typeof speechMenuFocusKeys)[number];
export type SpeechDialogFocusKey = (typeof speechDialogFocusKeys)[number];
export type SpeechFormControlFocusKey = (typeof speechFormControlFocusKeys)[number];
