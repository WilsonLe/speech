export interface AudioPackageInfo {
  readonly name: '@speech/audio';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: AudioPackageInfo = {
  name: '@speech/audio',
  status: 'planned',
  description:
    'Audio transport primitives: capture controller, ring buffer, fallback buffers, and resampling integration.',
};
