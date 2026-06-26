export const speechTokenCategories = [
  'spacing',
  'typography',
  'colour',
  'motion',
  'elevation',
] as const;

export type SpeechTokenCategory = (typeof speechTokenCategories)[number];

export interface SpeechTokenContract {
  readonly category: SpeechTokenCategory;
  readonly cssFile: string;
  readonly requiredPrefixes: readonly string[];
  readonly intent: string;
}

export const speechTokenContracts: readonly SpeechTokenContract[] = [
  {
    category: 'spacing',
    cssFile: 'spacing.css',
    requiredPrefixes: ['--speech-space-', '--speech-size-', '--speech-radius-'],
    intent:
      'Task-first layout rhythm, touch targets, responsive shell spacing, and rounded geometry.',
  },
  {
    category: 'typography',
    cssFile: 'typography.css',
    requiredPrefixes: ['--speech-font-', '--speech-text-', '--speech-line-', '--speech-letter-'],
    intent: 'Readable system typography for headings, labels, transcript text, and diagnostics.',
  },
  {
    category: 'colour',
    cssFile: 'colour.css',
    requiredPrefixes: ['--speech-color-', '--speech-focus-'],
    intent:
      'Existing dark local-first visual language, semantic state colour, focus, and forced-colours aliases.',
  },
  {
    category: 'motion',
    cssFile: 'motion.css',
    requiredPrefixes: ['--speech-motion-', '--speech-duration-', '--speech-ease-'],
    intent: 'Short state-change motion that can be disabled by reduced-motion preferences.',
  },
  {
    category: 'elevation',
    cssFile: 'elevation.css',
    requiredPrefixes: ['--speech-shadow-', '--speech-layer-'],
    intent: 'Low-key layer separation for menus, dialogs, popovers, sticky bars, and panels.',
  },
] as const;

export const speechTokenCssEntry = '@speech/ui/tokens.css';
