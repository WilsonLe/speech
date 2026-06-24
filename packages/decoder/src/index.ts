export * from './finalization';
export * from './greedy-rnnt';
export * from './stable-prefix';

export interface DecoderPackageInfo {
  readonly name: '@speech/decoder';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: DecoderPackageInfo = {
  name: '@speech/decoder',
  status: 'active',
  description: 'RNN-T decoding, stable-prefix control, and contextual-scoring integration.',
};
