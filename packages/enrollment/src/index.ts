export interface EnrollmentPackageInfo {
  readonly name: '@speech/enrollment';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: EnrollmentPackageInfo = {
  name: '@speech/enrollment',
  status: 'planned',
  description: 'Guided enrollment scheduling, quality reporting, and coverage accounting.',
};
