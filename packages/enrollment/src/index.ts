export * from './calibration';
export * from './coverage';
export * from './custom-vocabulary-prompts';
export * from './quality';
export * from './sentence-bank';

export interface EnrollmentPackageInfo {
  readonly name: '@speech/enrollment';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: EnrollmentPackageInfo = {
  name: '@speech/enrollment',
  status: 'active',
  description:
    'Guided enrollment scheduling, custom-vocabulary prompts, quality reporting, and coverage accounting.',
};
