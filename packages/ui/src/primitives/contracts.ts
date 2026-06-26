export const speechButtonVariants = ['primary', 'secondary', 'ghost', 'danger'] as const;
export const speechButtonSizes = ['sm', 'md', 'lg'] as const;

export type SpeechButtonVariant = (typeof speechButtonVariants)[number];
export type SpeechButtonSize = (typeof speechButtonSizes)[number];

export const speechIconButtonVariants = [
  'secondary',
  'ghost',
  'danger',
] as const satisfies readonly SpeechButtonVariant[];
export const speechIconButtonSizes = speechButtonSizes;

export type SpeechIconButtonVariant = (typeof speechIconButtonVariants)[number];
export type SpeechIconButtonSize = SpeechButtonSize;
