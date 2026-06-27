export const speechButtonAccessibilityChecklist = [
  'Button renders a native <button> with a visible label.',
  'Button defaults to type="button" so forms opt in to submission.',
  'Loading state is disabled and exposes aria-busy without hiding the visible label.',
  'Focus-visible styling uses repository focus-ring tokens.',
  'Touch target uses the repository minimum touch-target token.',
] as const;

export const speechIconButtonAccessibilityChecklist = [
  'IconButton renders a native <button> with an aria-label.',
  'Icon glyphs are aria-hidden so the label is the accessible name.',
  'Optional tooltip text is connected with aria-describedby and role="tooltip".',
  'Tooltip content supplements the label and must not carry required instructions.',
  'IconButton supports disabled, loading, destructive, focus-visible, and forced-colours states.',
] as const;

export const speechButtonCssRequirements = [
  '--speech-size-touch-target',
  '--speech-size-icon-button',
  '--speech-focus-ring-color',
  '--speech-focus-ring-width',
  '--speech-focus-ring-offset',
  'prefers-reduced-motion: reduce',
  'forced-colors: active',
] as const;

export const speechDisclosureAccessibilityChecklist = [
  'Disclosure renders a native <details> with a <summary> trigger.',
  'Disclosure trigger exposes aria-expanded and aria-controls for assistive technology fixtures.',
  'Disclosure content remains in the native details panel and must not hide required blockers by default.',
  'Disclosure focus-visible styling uses repository focus-ring tokens.',
] as const;

export const speechAccordionAccessibilityChecklist = [
  'Accordion renders one heading button per panel with aria-expanded and aria-controls.',
  'Collapsed accordion panels use hidden so their contents are not focusable.',
  'Accordion arrow-key, Home, and End focus movement follows the WAI-ARIA accordion pattern.',
  'Do not nest Accordion inside Accordion or put required fields/blockers only in a collapsed panel.',
  'Accordion CSS covers focus-visible, reduced-motion, forced-colours, and touch-target states.',
] as const;

export const speechDisclosureCssRequirements = [
  '--speech-size-touch-target',
  '--speech-focus-ring-color',
  '--speech-focus-ring-width',
  '--speech-focus-ring-offset',
  'prefers-reduced-motion: reduce',
  'forced-colors: active',
  '[hidden]',
] as const;

export const speechMenuButtonAccessibilityChecklist = [
  'MenuButton trigger renders a native <button> with aria-haspopup="menu".',
  'MenuButton menu renders role="menu" and action/navigation children as role="menuitem".',
  'MenuButton closes on Escape, returns focus to the trigger, and closes when focus leaves the widget.',
  'MenuButton supports ArrowDown, ArrowUp, Home, and End movement without nested submenus.',
  'MenuButton examples must keep long forms, required consequences, and destructive confirmations outside the menu.',
] as const;

export const speechTooltipAccessibilityChecklist = [
  'Tooltip connects supplemental text to the trigger with aria-describedby and role="tooltip".',
  'Tooltip opens on focus and pointer hover, dismisses on Escape, and keeps focus on the trigger.',
  'Tooltip content is plain text and must not contain required instructions, errors, or destructive consequences.',
  'Tooltip CSS covers hidden content, reduced motion, forced colours, viewport-safe width, and pointer-safe behaviour.',
] as const;

export const speechMenuCssRequirements = [
  '--speech-size-touch-target',
  '--speech-focus-ring-color',
  '--speech-focus-ring-width',
  '--speech-focus-ring-offset',
  '--speech-shadow-popover',
  'prefers-reduced-motion: reduce',
  'forced-colors: active',
  '[hidden]',
] as const;
