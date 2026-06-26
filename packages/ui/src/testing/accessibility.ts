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
