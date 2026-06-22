export interface ProfileManagerPackageInfo {
  readonly name: '@speech/profile-manager';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: ProfileManagerPackageInfo = {
  name: '@speech/profile-manager',
  status: 'planned',
  description: 'Private profile storage, import/export, rollback, and deletion.',
};
