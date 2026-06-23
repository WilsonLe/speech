import { describe, expect, it } from 'vitest';

import type { SpeechModelManifestV2, VocabularyRevisionV1 } from '@speech/protocol';

import {
  compileVocabularyTokenAutomaton,
  createVocabularyScoreAdjuster,
  scoreVocabularyTokenAdjustments,
  type VocabularyTokenizer,
} from './token-automaton';

const contextBiasing = {
  supported: true,
  algorithm: 'token-trie',
  supportedEntryLanguages: ['vi', 'en', 'mixed', 'auto'],
  maxActiveEntries: 8,
  maxPhraseTokens: 3,
  maxAliasesPerEntry: 2,
  maxAliasTokens: 2,
  defaultWeight: 5,
  maxCumulativeBonus: 6,
  weightRange: { min: 0, max: 10 },
  presets: { light: 2, normal: 5, strong: 8 },
  scoring: { prefixBonus: 1, completionBonus: 3, mismatchPenalty: 0.5 },
  wordBoundary: { mode: 'unicode-word', requireForSingleToken: true },
  revisionSwap: 'utterance-boundary',
  diagnostics: { emitMatchedVocabularyIds: true, emitScoreBreakdown: true },
} satisfies SpeechModelManifestV2['contextBiasing'];

const tokenizer: VocabularyTokenizer = {
  unknownTokenId: 999,
  tokenize(text) {
    return text.split(' ').map((piece) => {
      const tokenId = tokenIds.get(piece.toLocaleLowerCase('vi'));
      return tokenId ?? 999;
    });
  },
};

const tokenIds = new Map<string, number>([
  ['pangea', 1],
  ['chat', 2],
  ['dashboard', 3],
  ['wilson', 4],
  ['alpha', 5],
  ['project', 6],
]);

describe('compileVocabularyTokenAutomaton', () => {
  it('compiles active vocabulary entries and aliases into a token trie', () => {
    const result = compileVocabularyTokenAutomaton({
      revision: createRevision(),
      contextBiasing,
      tokenizer,
    });

    expect(result.ok).toBe(true);
    expect(result.compiledCandidateCount).toBe(3);
    expect(result.automaton?.revision).toBe(7);
    expect(result.automaton?.candidates.map((candidate) => candidate.id)).toEqual([
      'term-wilson:phrase:0',
      'term-pangea:alias:1',
      'term-pangea:phrase:0',
    ]);
    expect(result.automaton?.nodes[0]?.transitions).toEqual([
      { tokenId: 1, nextNodeId: 1 },
      { tokenId: 3, nextNodeId: 3 },
      { tokenId: 4, nextNodeId: 5 },
    ]);
  });

  it('rejects unsupported languages, unknown-only candidates, and token-length overflows at compile time', () => {
    const result = compileVocabularyTokenAutomaton({
      revision: {
        revision: 1,
        activeSetIds: ['set-work'],
        entries: [
          createEntry({ id: 'term-too-long', phrase: 'project alpha dashboard chat' }),
          createEntry({ id: 'term-unknown', phrase: 'does-not-tokenize', displayForm: 'Unknown' }),
          createEntry({ id: 'term-fr', language: 'fr' as never }),
        ],
      },
      contextBiasing,
      tokenizer,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'limit-exceeded', entryId: 'term-too-long' }),
        expect.objectContaining({ code: 'unknown-only', entryId: 'term-unknown' }),
        expect.objectContaining({ code: 'unsupported-language', entryId: 'term-fr' }),
      ]),
    );
  });

  it('refuses compilation when the active model does not support contextual biasing', () => {
    const result = compileVocabularyTokenAutomaton({
      revision: createRevision(),
      contextBiasing: { ...contextBiasing, supported: false },
      tokenizer,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'unsupported-context-biasing' }),
    );
  });
});

describe('scoreVocabularyTokenAdjustments', () => {
  it('scores first-token prefixes and completion continuations from emitted-token suffixes', () => {
    const automaton = compileVocabularyTokenAutomaton({
      revision: createRevision(),
      contextBiasing,
      tokenizer,
    }).automaton!;

    expect(scoreVocabularyTokenAdjustments(automaton, { emittedTokens: [] })).toEqual([
      {
        tokenId: 1,
        score: 1,
        matchedVocabularyIds: ['term-pangea'],
        candidateIds: ['term-pangea:phrase:0'],
        completion: false,
      },
      {
        tokenId: 3,
        score: 1,
        matchedVocabularyIds: ['term-pangea'],
        candidateIds: ['term-pangea:alias:1'],
        completion: false,
      },
      {
        tokenId: 4,
        score: 4.8,
        matchedVocabularyIds: ['term-wilson'],
        candidateIds: ['term-wilson:phrase:0'],
        completion: true,
      },
    ]);

    expect(scoreVocabularyTokenAdjustments(automaton, { emittedTokens: [1] })).toEqual(
      expect.arrayContaining([
        {
          tokenId: 2,
          score: 3,
          matchedVocabularyIds: ['term-pangea'],
          candidateIds: ['term-pangea:phrase:0'],
          completion: true,
        },
      ]),
    );
  });

  it('aggregates overlapping candidate bonuses but caps each token at maxCumulativeBonus', () => {
    const automaton = compileVocabularyTokenAutomaton({
      revision: {
        revision: 2,
        activeSetIds: ['set-work'],
        entries: [
          createEntry({ id: 'term-project-alpha', phrase: 'project alpha', weight: 10 }),
          createEntry({ id: 'term-project-dashboard', phrase: 'project dashboard', weight: 10 }),
        ],
      },
      contextBiasing,
      tokenizer,
    }).automaton!;

    expect(scoreVocabularyTokenAdjustments(automaton, { emittedTokens: [] })).toEqual([
      {
        tokenId: 6,
        score: 4,
        matchedVocabularyIds: ['term-project-alpha', 'term-project-dashboard'],
        candidateIds: ['term-project-alpha:phrase:0', 'term-project-dashboard:phrase:0'],
        completion: false,
      },
    ]);

    expect(scoreVocabularyTokenAdjustments(automaton, { emittedTokens: [6] })).toEqual([
      {
        tokenId: 3,
        score: 6,
        matchedVocabularyIds: ['term-project-dashboard'],
        candidateIds: ['term-project-dashboard:phrase:0'],
        completion: true,
      },
      {
        tokenId: 5,
        score: 6,
        matchedVocabularyIds: ['term-project-alpha'],
        candidateIds: ['term-project-alpha:phrase:0'],
        completion: true,
      },
    ]);
  });

  it('returns a decoder-compatible score adjuster', () => {
    const automaton = compileVocabularyTokenAutomaton({
      revision: createRevision(),
      contextBiasing,
      tokenizer,
    }).automaton!;
    const adjuster = createVocabularyScoreAdjuster(automaton);

    expect(adjuster({ emittedTokens: [3] })).toEqual(
      expect.arrayContaining([expect.objectContaining({ tokenId: 2, score: 3, completion: true })]),
    );
  });
});

function createRevision(): VocabularyRevisionV1 {
  return {
    revision: 7,
    activeSetIds: ['set-work'],
    entries: [
      createEntry({
        id: 'term-pangea',
        phrase: 'Pangea Chat',
        displayForm: 'Pangea Chat',
        spokenAliases: ['dashboard chat', 'dashboard chat'],
      }),
      createEntry({ id: 'term-wilson', phrase: 'Wilson', displayForm: 'Wilson', weight: 8 }),
    ],
  };
}

function createEntry(overrides: Partial<VocabularyRevisionV1['entries'][number]> = {}) {
  return {
    id: 'term-default',
    phrase: 'Pangea Chat',
    displayForm: 'Pangea Chat',
    language: 'mixed' as const,
    spokenAliases: [],
    weight: 5,
    enabled: true,
    exactCase: true,
    ...overrides,
  };
}
