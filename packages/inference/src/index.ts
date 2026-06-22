export * from './onnx-runtime';

export interface InferencePackageInfo {
  readonly name: '@speech/inference';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: InferencePackageInfo = {
  name: '@speech/inference',
  status: 'active',
  description: 'ONNX Runtime Web session adapters and provider selection.',
};
