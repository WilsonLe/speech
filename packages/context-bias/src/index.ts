export * from './token-automaton';
export * from './vocabulary-schema';

export interface ContextBiasPackageInfo {
  readonly name: '@speech/context-bias';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: ContextBiasPackageInfo = {
  name: '@speech/context-bias',
  status: 'active',
  description: 'Vocabulary schemas, token automata, and bounded contextual bias scoring.',
};
