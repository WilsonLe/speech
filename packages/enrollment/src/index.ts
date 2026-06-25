export * from './calibration';
export * from './coverage';
export * from './custom-vocabulary-prompts';
export * from './prompt-split';
export * from './quality';
export * from './sentence-bank';
export * from './training-readiness';

export interface EnrollmentPackageInfo {
  readonly name: '@speech/enrollment';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: EnrollmentPackageInfo = {
  name: '@speech/enrollment',
  status: 'active',
  description:
    'Guided enrollment scheduling, custom-vocabulary prompts, quality reporting, readiness policy, prompt-identity splitting, and coverage accounting.',
};
