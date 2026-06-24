export * from './log-mel';

export interface FeaturesPackageInfo {
  readonly name: '@speech/features';
  readonly status: 'active';
  readonly description: string;
}

export const packageInfo: FeaturesPackageInfo = {
  name: '@speech/features',
  status: 'active',
  description: 'Streaming acoustic feature extraction contracts and implementations.',
};
