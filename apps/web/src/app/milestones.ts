export interface RoadmapItem {
  readonly label: string;
  readonly status: 'shipped' | 'evidence-needed' | 'planned';
  readonly description: string;
}

export const roadmap: readonly RoadmapItem[] = [
  {
    label: 'Foundation',
    status: 'shipped',
    description: 'Monorepo, PWA shell, CI, contracts, documentation, and licensing baseline.',
  },
  {
    label: 'Capability diagnostics',
    status: 'shipped',
    description: 'Browser checks, local performance reports, and downloadable support summaries.',
  },
  {
    label: 'Audio transport',
    status: 'shipped',
    description:
      'Local microphone capture, responsive recording controls, and offline-safe audio flow.',
  },
  {
    label: 'Streaming speech recognition',
    status: 'shipped',
    description:
      'Live local dictation, stable partial text, and bilingual-ready transcript formatting.',
  },
  {
    label: 'Personal Models',
    status: 'shipped',
    description:
      'Guided recording, local training support, activation review, rollback, and private model management.',
  },
  {
    label: 'Evidence-backed production claims',
    status: 'evidence-needed',
    description:
      '30-speaker bilingual cohort evidence, declared reference-hardware benchmarks, and release-cleared production model packs.',
  },
];
