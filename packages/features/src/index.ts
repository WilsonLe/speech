export interface FeaturesPackageInfo {
  readonly name: '@speech/features';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: FeaturesPackageInfo = {
  name: '@speech/features',
  status: 'planned',
  description: 'Streaming acoustic feature extraction contracts and implementations.',
};
