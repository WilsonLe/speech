export * from './encoder-cache';
export * from './onnx-runtime';
export * from './personal-adapter';
export * from './provider-benchmark';
export * from './training-artifact-spike';

export interface InferencePackageInfo {
  readonly name: '@speech/inference';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: InferencePackageInfo = {
  name: '@speech/inference',
  status: 'active',
  description: 'ONNX Runtime Web session, personal-adapter, provider, and training-spike helpers.',
};
