export * from './encoder-cache';
export * from './onnx-runtime';
export * from './personal-adapter';
export * from './provider-benchmark';

export interface InferencePackageInfo {
  readonly name: '@speech/inference';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: InferencePackageInfo = {
  name: '@speech/inference',
  status: 'active',
  description: 'ONNX Runtime Web session, personal-adapter, and provider selection helpers.',
};
