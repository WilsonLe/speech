import type {
  SpeechModelManifestV2,
  VocabularyEntryLanguage,
  VocabularyEntryV1,
  VocabularyError,
  VocabularyRevisionV1,
} from '@speech/protocol';

import { normalizeVocabularyText } from './vocabulary-schema';

export interface VocabularyTokenizer {
  readonly unknownTokenId?: number;
  tokenize(text: string): readonly number[];
}

export type VocabularyCandidateSource = 'phrase' | 'alias';

export interface VocabularyAutomatonCompileOptions {
  readonly revision: VocabularyRevisionV1;
  readonly contextBiasing: SpeechModelManifestV2['contextBiasing'];
  readonly tokenizer: VocabularyTokenizer;
}

export interface VocabularyAutomatonCompileResult {
  readonly ok: boolean;
  readonly errors: readonly VocabularyError[];
  readonly automaton?: VocabularyTokenAutomaton;
  readonly compiledCandidateCount: number;
}

export interface VocabularyTokenAutomaton {
  readonly revision: number;
  readonly activeSetIds: readonly string[];
  readonly rootNodeId: number;
  readonly nodes: readonly VocabularyAutomatonNode[];
  readonly candidates: readonly VocabularyTokenCandidate[];
  readonly scoring: VocabularyAutomatonScoring;
}

export interface VocabularyAutomatonScoring {
  readonly prefixBonus: number;
  readonly completionBonus: number;
  readonly mismatchPenalty: number;
  readonly defaultWeight: number;
  readonly maxCumulativeBonus: number;
}

export interface VocabularyAutomatonNode {
  readonly id: number;
  readonly transitions: readonly VocabularyAutomatonTransition[];
  readonly terminalCandidateIds: readonly string[];
}

export interface VocabularyAutomatonTransition {
  readonly tokenId: number;
  readonly nextNodeId: number;
}

export interface VocabularyTokenCandidate {
  readonly id: string;
  readonly entryId: string;
  readonly displayForm: string;
  readonly language: VocabularyEntryLanguage;
  readonly source: VocabularyCandidateSource;
  readonly text: string;
  readonly tokenIds: readonly number[];
  readonly weight: number;
  readonly promptPriority?: number;
}

export interface VocabularyScoreContext {
  readonly emittedTokens: readonly number[];
}

export interface VocabularyTokenScoreAdjustment {
  readonly tokenId: number;
  readonly score: number;
  readonly matchedVocabularyIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly completion: boolean;
}

interface MutableNode {
  readonly id: number;
  readonly transitions: Map<number, number>;
  readonly terminalCandidateIds: string[];
}

export function compileVocabularyTokenAutomaton(
  options: VocabularyAutomatonCompileOptions,
): VocabularyAutomatonCompileResult {
  const { contextBiasing, revision, tokenizer } = options;
  const errors: VocabularyError[] = [];
  const candidates: VocabularyTokenCandidate[] = [];
  const seenCandidateKeys = new Set<string>();

  if (!contextBiasing.supported) {
    return {
      ok: false,
      errors: [
        {
          code: 'unsupported-context-biasing',
          message: 'Cannot compile vocabulary automaton for a model without contextual biasing.',
        },
      ],
      compiledCandidateCount: 0,
    };
  }

  for (const entry of revision.entries) {
    if (!contextBiasing.supportedEntryLanguages.includes(entry.language)) {
      errors.push({
        code: 'unsupported-language',
        entryId: entry.id,
        field: 'language',
        message: `Vocabulary language ${entry.language} is not supported by the active model context-bias contract.`,
      });
      continue;
    }

    const sources = createCandidateSources(entry);
    sources.forEach((source, sourceIndex) => {
      const tokenIds = tokenizeCandidate(source.text, entry, source.source, tokenizer, errors);
      if (tokenIds === undefined) return;

      const maxTokens =
        source.source === 'phrase' ? contextBiasing.maxPhraseTokens : contextBiasing.maxAliasTokens;
      if (tokenIds.length > maxTokens) {
        errors.push({
          code: 'limit-exceeded',
          entryId: entry.id,
          field: source.source === 'phrase' ? 'phrase' : 'spokenAliases',
          message: `${source.source} for ${entry.id} tokenizes to ${tokenIds.length.toString()} tokens, exceeding the model limit of ${maxTokens.toString()}.`,
        });
        return;
      }

      const dedupeKey = `${entry.id}:${tokenIds.join(',')}`;
      if (seenCandidateKeys.has(dedupeKey)) return;
      seenCandidateKeys.add(dedupeKey);
      candidates.push({
        id: `${entry.id}:${source.source}:${sourceIndex.toString()}`,
        entryId: entry.id,
        displayForm: entry.displayForm,
        language: entry.language,
        source: source.source,
        text: source.text,
        tokenIds,
        weight: entry.weight,
        ...(entry.promptPriority !== undefined ? { promptPriority: entry.promptPriority } : {}),
      });
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, compiledCandidateCount: candidates.length };
  }

  const nodes = buildTrie(candidates);
  return {
    ok: true,
    errors: [],
    automaton: {
      revision: revision.revision,
      activeSetIds: revision.activeSetIds,
      rootNodeId: 0,
      nodes,
      candidates: sortCandidates(candidates),
      scoring: {
        prefixBonus: contextBiasing.scoring.prefixBonus,
        completionBonus: contextBiasing.scoring.completionBonus,
        mismatchPenalty: contextBiasing.scoring.mismatchPenalty,
        defaultWeight: contextBiasing.defaultWeight,
        maxCumulativeBonus: contextBiasing.maxCumulativeBonus,
      },
    },
    compiledCandidateCount: candidates.length,
  };
}

export function scoreVocabularyTokenAdjustments(
  automaton: VocabularyTokenAutomaton,
  context: VocabularyScoreContext,
): readonly VocabularyTokenScoreAdjustment[] {
  const aggregate = new Map<
    number,
    {
      score: number;
      completion: boolean;
      matchedVocabularyIds: Set<string>;
      candidateIds: Set<string>;
    }
  >();

  for (const candidate of automaton.candidates) {
    const match = findLongestPrefixMatch(candidate.tokenIds, context.emittedTokens);
    if (match === undefined) continue;

    const nextTokenId = candidate.tokenIds[match.prefixLength];
    if (nextTokenId === undefined) continue;
    const completion = match.prefixLength === candidate.tokenIds.length - 1;
    const baseBonus = completion
      ? automaton.scoring.completionBonus
      : automaton.scoring.prefixBonus;
    if (baseBonus <= 0) continue;

    const score = weightedBonus(baseBonus, candidate.weight, automaton.scoring);
    const current = aggregate.get(nextTokenId) ?? {
      score: 0,
      completion: false,
      matchedVocabularyIds: new Set<string>(),
      candidateIds: new Set<string>(),
    };
    current.score = Math.min(automaton.scoring.maxCumulativeBonus, current.score + score);
    current.completion ||= completion;
    current.matchedVocabularyIds.add(candidate.entryId);
    current.candidateIds.add(candidate.id);
    aggregate.set(nextTokenId, current);
  }

  return [...aggregate.entries()]
    .map(([tokenId, value]) => ({
      tokenId,
      score: roundScore(value.score),
      matchedVocabularyIds: [...value.matchedVocabularyIds].sort(),
      candidateIds: [...value.candidateIds].sort(),
      completion: value.completion,
    }))
    .sort((left, right) => left.tokenId - right.tokenId);
}

export function createVocabularyScoreAdjuster(automaton: VocabularyTokenAutomaton) {
  return (context: VocabularyScoreContext): readonly VocabularyTokenScoreAdjustment[] =>
    scoreVocabularyTokenAdjustments(automaton, context);
}

function createCandidateSources(
  entry: VocabularyEntryV1,
): readonly { readonly source: VocabularyCandidateSource; readonly text: string }[] {
  return [
    { source: 'phrase', text: entry.phrase },
    ...entry.spokenAliases.map((alias) => ({ source: 'alias' as const, text: alias })),
  ];
}

function tokenizeCandidate(
  text: string,
  entry: VocabularyEntryV1,
  source: VocabularyCandidateSource,
  tokenizer: VocabularyTokenizer,
  errors: VocabularyError[],
): readonly number[] | undefined {
  const normalizedText = normalizeVocabularyText(text);
  let tokenIds: readonly number[];
  try {
    tokenIds = tokenizer.tokenize(normalizedText);
  } catch (error) {
    errors.push({
      code: 'invalid-field',
      entryId: entry.id,
      field: source === 'phrase' ? 'phrase' : 'spokenAliases',
      message:
        error instanceof Error
          ? `Tokenizer failed for ${entry.id}: ${error.message}`
          : `Tokenizer failed for ${entry.id}.`,
    });
    return undefined;
  }

  if (tokenIds.length === 0) {
    errors.push({
      code: 'unknown-only',
      entryId: entry.id,
      field: source === 'phrase' ? 'phrase' : 'spokenAliases',
      message: `${source} for ${entry.id} did not produce any tokenizer ids.`,
    });
    return undefined;
  }

  for (const tokenId of tokenIds) {
    if (!Number.isInteger(tokenId) || tokenId < 0) {
      errors.push({
        code: 'invalid-field',
        entryId: entry.id,
        field: source === 'phrase' ? 'phrase' : 'spokenAliases',
        message: `${source} for ${entry.id} produced an invalid token id.`,
      });
      return undefined;
    }
  }

  if (
    tokenizer.unknownTokenId !== undefined &&
    tokenIds.every((tokenId) => tokenId === tokenizer.unknownTokenId)
  ) {
    errors.push({
      code: 'unknown-only',
      entryId: entry.id,
      field: source === 'phrase' ? 'phrase' : 'spokenAliases',
      message: `${source} for ${entry.id} tokenizes only to the unknown token.`,
    });
    return undefined;
  }

  return [...tokenIds];
}

function buildTrie(
  candidates: readonly VocabularyTokenCandidate[],
): readonly VocabularyAutomatonNode[] {
  const mutableNodes: MutableNode[] = [{ id: 0, transitions: new Map(), terminalCandidateIds: [] }];
  for (const candidate of candidates) {
    let nodeId = 0;
    for (const tokenId of candidate.tokenIds) {
      const node = mutableNodes[nodeId];
      if (node === undefined) throw new Error(`Missing automaton node ${nodeId.toString()}.`);
      let nextNodeId = node.transitions.get(tokenId);
      if (nextNodeId === undefined) {
        nextNodeId = mutableNodes.length;
        node.transitions.set(tokenId, nextNodeId);
        mutableNodes.push({ id: nextNodeId, transitions: new Map(), terminalCandidateIds: [] });
      }
      nodeId = nextNodeId;
    }
    const terminalNode = mutableNodes[nodeId];
    if (terminalNode === undefined) {
      throw new Error(`Missing terminal automaton node ${nodeId.toString()}.`);
    }
    terminalNode.terminalCandidateIds.push(candidate.id);
  }
  return mutableNodes.map((node) => ({
    id: node.id,
    transitions: [...node.transitions.entries()]
      .map(([tokenId, nextNodeId]) => ({ tokenId, nextNodeId }))
      .sort((left, right) => left.tokenId - right.tokenId),
    terminalCandidateIds: [...node.terminalCandidateIds].sort(),
  }));
}

function sortCandidates(
  candidates: readonly VocabularyTokenCandidate[],
): readonly VocabularyTokenCandidate[] {
  return [...candidates].sort((left, right) => {
    const priorityDelta = (right.promptPriority ?? 0) - (left.promptPriority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    const weightDelta = right.weight - left.weight;
    if (weightDelta !== 0) return weightDelta;
    return left.id.localeCompare(right.id);
  });
}

function findLongestPrefixMatch(
  candidateTokens: readonly number[],
  emittedTokens: readonly number[],
): { readonly prefixLength: number } | undefined {
  const maxPrefixLength = Math.min(candidateTokens.length - 1, emittedTokens.length);
  for (let prefixLength = maxPrefixLength; prefixLength >= 0; prefixLength -= 1) {
    const suffixStart = emittedTokens.length - prefixLength;
    let matches = true;
    for (let index = 0; index < prefixLength; index += 1) {
      if (emittedTokens[suffixStart + index] !== candidateTokens[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return { prefixLength };
  }
  return undefined;
}

function weightedBonus(
  baseBonus: number,
  weight: number,
  scoring: VocabularyAutomatonScoring,
): number {
  const multiplier = scoring.defaultWeight > 0 ? weight / scoring.defaultWeight : 1;
  return Math.min(scoring.maxCumulativeBonus, Math.max(0, baseBonus * multiplier));
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
