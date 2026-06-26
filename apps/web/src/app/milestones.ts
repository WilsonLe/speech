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
    description: 'API probes, execution-tier selection, worker benchmark, and downloadable report.',
  },
  {
    label: 'Audio transport',
    status: 'shipped',
    description:
      'Microphone controller, AudioWorklet, SharedArrayBuffer ring buffer, and transferable fallback.',
  },
  {
    label: 'Streaming ASR runtime',
    status: 'shipped',
    description: 'Resampler, log-Mel features, ONNX RNN-T sessions, decoding, and stable partials.',
  },
  {
    label: 'Personal Models',
    status: 'shipped',
    description:
      'Guided enrollment, browser training infrastructure, activation review, rollback, and private profile lifecycle.',
  },
  {
    label: 'Evidence-backed production claims',
    status: 'evidence-needed',
    description:
      '30-speaker bilingual cohort evidence, declared reference-hardware benchmarks, and release-cleared production model packs.',
  },
];
