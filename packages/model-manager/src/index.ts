export * from './storage';

export interface ModelManagerPackageInfo {
  readonly name: '@speech/model-manager';
  readonly status: 'active';
  readonly description: string;
}

export const packageInfo: ModelManagerPackageInfo = {
  name: '@speech/model-manager',
  status: 'active',
  description:
    'Model catalog, install, checksum, storage, activation, rollback, and deletion lifecycle.',
};
