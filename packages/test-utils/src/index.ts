export interface TestUtilsPackageInfo {
  readonly name: '@speech/test-utils';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: TestUtilsPackageInfo = {
  name: '@speech/test-utils',
  status: 'planned',
  description: 'Shared fixtures and deterministic test helpers.',
};
