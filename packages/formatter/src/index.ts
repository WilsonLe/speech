export interface FormatterPackageInfo {
  readonly name: '@speech/formatter';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: FormatterPackageInfo = {
  name: '@speech/formatter',
  status: 'planned',
  description: 'Vietnamese/English normalization, detokenization, punctuation, and ITN.',
};
