export interface RoadmapItem {
  readonly label: string;
  readonly status: 'scaffolded' | 'planned';
  readonly description: string;
}

export const roadmap: readonly RoadmapItem[] = [
  {
    label: 'Foundation',
    status: 'scaffolded',
    description: 'Monorepo, PWA shell, CI, contracts, documentation, and licensing baseline.',
  },
  {
    label: 'Capability diagnostics',
    status: 'planned',
    description: 'API probes, execution-tier selection, worker benchmark, and downloadable report.',
  },
  {
    label: 'Audio transport',
    status: 'planned',
    description:
      'Microphone controller, AudioWorklet, SharedArrayBuffer ring buffer, and transferable fallback.',
  },
  {
    label: 'Streaming ASR runtime',
    status: 'planned',
    description: 'Resampler, log-Mel features, ONNX RNN-T sessions, decoding, and stable partials.',
  },
  {
    label: 'Personalization',
    status: 'planned',
    description:
      'Vocabulary steering, guided enrollment, private profiles, and local adapter tooling.',
  },
];
