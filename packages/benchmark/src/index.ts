export interface BenchmarkPackageInfo {
  readonly name: '@speech/benchmark';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: BenchmarkPackageInfo = {
  name: '@speech/benchmark',
  status: 'planned',
  description: 'Latency, RTF, queue, memory, and benchmark export contracts.',
};
