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

export const speechMenuPlacements = ['bottom-start', 'bottom-end'] as const;
export const speechMenuKeyboardKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;
export const speechTooltipPlacements = ['top', 'bottom', 'inline-start', 'inline-end'] as const;

export const speechDialogSizes = ['sm', 'md', 'lg'] as const;
export const speechFieldSizes = ['sm', 'md', 'lg'] as const;
export const speechRadioGroupOrientations = ['vertical', 'horizontal'] as const;
export const speechDialogKeyboardKeys = ['Escape', 'Tab', 'Shift+Tab'] as const;
export const speechSelectKeyboardKeys = ['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'] as const;
export const speechRadioGroupKeyboardKeys = [
  'Tab',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Space',
] as const;

export type SpeechMenuPlacement = (typeof speechMenuPlacements)[number];
export type SpeechMenuKeyboardKey = (typeof speechMenuKeyboardKeys)[number];
export type SpeechTooltipPlacement = (typeof speechTooltipPlacements)[number];
export type SpeechDialogSize = (typeof speechDialogSizes)[number];
export type SpeechFieldSize = (typeof speechFieldSizes)[number];
export type SpeechRadioGroupOrientation = (typeof speechRadioGroupOrientations)[number];
export type SpeechDialogKeyboardKey = (typeof speechDialogKeyboardKeys)[number];
export type SpeechSelectKeyboardKey = (typeof speechSelectKeyboardKeys)[number];
export type SpeechRadioGroupKeyboardKey = (typeof speechRadioGroupKeyboardKeys)[number];

export interface SpeechSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SpeechRadioGroupOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

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

export function getDialogTabTargetIndex(
  currentIndex: number,
  direction: 'forward' | 'backward',
  focusableCount: number,
): number {
  if (focusableCount <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === 'forward' ? 0 : focusableCount - 1;
  }

  if (direction === 'forward') {
    return (currentIndex + 1) % focusableCount;
  }

  return (currentIndex - 1 + focusableCount) % focusableCount;
}

export function getMenuKeyboardTargetIndex(
  currentIndex: number,
  key: SpeechMenuKeyboardKey,
  itemCount: number,
  options: { readonly disabledIndexes?: readonly number[] } = {},
): number {
  if (itemCount <= 0) {
    return -1;
  }

  const disabledIndexes = new Set(options.disabledIndexes ?? []);
  const enabledIndexes = Array.from({ length: itemCount }, (_, index) => index).filter(
    (index) => !disabledIndexes.has(index),
  );

  if (enabledIndexes.length === 0) {
    return -1;
  }

  if (key === 'Home') {
    return enabledIndexes[0] ?? -1;
  }

  if (key === 'End') {
    return enabledIndexes.at(-1) ?? -1;
  }

  const boundedIndex = Math.min(Math.max(currentIndex, -1), itemCount - 1);
  const currentEnabledPosition = enabledIndexes.indexOf(boundedIndex);

  if (key === 'ArrowDown') {
    const nextPosition =
      currentEnabledPosition === -1 ? 0 : (currentEnabledPosition + 1) % enabledIndexes.length;
    return enabledIndexes[nextPosition] ?? -1;
  }

  const previousPosition =
    currentEnabledPosition === -1
      ? enabledIndexes.length - 1
      : (currentEnabledPosition - 1 + enabledIndexes.length) % enabledIndexes.length;
  return enabledIndexes[previousPosition] ?? -1;
}
