import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  detokenizePieces,
  renderTranscriptFromTokenIds,
  type TranscriptVocabulary,
} from './transcript';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../test-data/expected/transcript-reference.json', import.meta.url),
    'utf8',
  ),
) as TranscriptFixture;

describe('transcript rendering parity fixture', () => {
  it('matches checked-in Python reference fixture cases', () => {
    for (const testCase of fixture.cases) {
      expect(
        renderTranscriptFromTokenIds({
          tokenIds: testCase.tokenIds,
          vocabulary: fixture.tokenizer,
        }),
      ).toBe(testCase.expectedText);
    }
  });

  it('preserves NFC-normalized Vietnamese diacritics', () => {
    const decomposed = 'ca\u0300';

    expect(detokenizePieces([`▁${decomposed}`, '▁phê'])).toBe('cà phê');
  });

  it('rejects missing token pieces and invalid marker configuration', () => {
    const vocabulary: TranscriptVocabulary = {
      tokens: { '1': '▁xin' },
    };

    expect(() => renderTranscriptFromTokenIds({ tokenIds: [2], vocabulary })).toThrow(
      /Missing transcript token piece/,
    );
    expect(() => detokenizePieces(['▁xin'], { wordBoundaryMarker: '' })).toThrow(
      /wordBoundaryMarker/,
    );
  });
});

interface TranscriptFixture {
  readonly schemaVersion: 1;
  readonly tokenizer: TranscriptVocabulary;
  readonly cases: readonly TranscriptFixtureCase[];
}

interface TranscriptFixtureCase {
  readonly id: string;
  readonly description: string;
  readonly tokenIds: readonly number[];
  readonly expectedText: string;
}
