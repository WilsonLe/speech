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

export const speechDisclosureVariants = ['plain', 'card'] as const;
export type SpeechDisclosureVariant = (typeof speechDisclosureVariants)[number];

export const speechAccordionVariants = ['plain', 'card'] as const;
export const speechAccordionHeadingLevels = [2, 3, 4, 5, 6] as const;
export const speechAccordionKeyboardKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;

export type SpeechAccordionVariant = (typeof speechAccordionVariants)[number];
export type SpeechAccordionHeadingLevel = (typeof speechAccordionHeadingLevels)[number];
export type SpeechAccordionKeyboardKey = (typeof speechAccordionKeyboardKeys)[number];

export function getAccordionKeyboardTargetIndex(
  currentIndex: number,
  key: SpeechAccordionKeyboardKey,
  itemCount: number,
): number {
  if (itemCount <= 0) {
    return -1;
  }

  const boundedIndex = Math.min(Math.max(currentIndex, 0), itemCount - 1);

  switch (key) {
    case 'ArrowDown':
      return (boundedIndex + 1) % itemCount;
    case 'ArrowUp':
      return (boundedIndex - 1 + itemCount) % itemCount;
    case 'Home':
      return 0;
    case 'End':
      return itemCount - 1;
  }
}
