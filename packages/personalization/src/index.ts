export interface PersonalizationPackageInfo {
  readonly name: '@speech/personalization';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: PersonalizationPackageInfo = {
  name: '@speech/personalization',
  status: 'planned',
  description: 'Speaker profile and adapter runtime contracts.',
};
