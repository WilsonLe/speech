export interface ModelManagerPackageInfo {
  readonly name: '@speech/model-manager';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: ModelManagerPackageInfo = {
  name: '@speech/model-manager',
  status: 'planned',
  description:
    'Model catalog, install, checksum, storage, activation, rollback, and deletion lifecycle.',
};
