import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  detokenizePieces,
  formatTranscriptText,
  parseVietnameseNumberPhrase,
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

  it('matches checked-in Python reference formatting cases', () => {
    for (const testCase of fixture.formatCases) {
      expect(formatTranscriptText(testCase.input, testCase.options).text).toBe(
        testCase.expectedText,
      );
    }
  });

  it('preserves NFC-normalized Vietnamese diacritics', () => {
    const decomposed = 'ca\u0300';

    expect(detokenizePieces([`▁${decomposed}`, '▁phê'])).toBe('cà phê');
  });

  it('renders spoken aliases with canonical display replacements by token span', () => {
    const vocabulary: TranscriptVocabulary = {
      wordBoundaryMarker: '▁',
      tokens: {
        '1': '▁mở',
        '2': '▁dashboard',
        '3': '▁chat',
        '4': '▁cho',
        '5': '▁Wilson',
      },
    };

    expect(
      renderTranscriptFromTokenIds({
        tokenIds: [1, 2, 3, 4, 5],
        vocabulary,
        displayReplacements: [
          {
            startTokenIndex: 1,
            endTokenIndex: 3,
            displayForm: 'Pangea Chat',
            vocabularyEntryId: 'term-pangea',
          },
        ],
      }),
    ).toBe('mở Pangea Chat cho Wilson');
  });

  it('rejects invalid or overlapping display replacement spans', () => {
    const vocabulary: TranscriptVocabulary = { tokens: { '1': '▁a', '2': '▁b' } };

    expect(() =>
      renderTranscriptFromTokenIds({
        tokenIds: [1, 2],
        vocabulary,
        displayReplacements: [{ startTokenIndex: 1, endTokenIndex: 1, displayForm: 'B' }],
      }),
    ).toThrow(/valid non-empty token index spans/);
    expect(() =>
      renderTranscriptFromTokenIds({
        tokenIds: [1, 2],
        vocabulary,
        displayReplacements: [
          { startTokenIndex: 0, endTokenIndex: 2, displayForm: 'AB' },
          { startTokenIndex: 1, endTokenIndex: 2, displayForm: 'B' },
        ],
      }),
    ).toThrow(/must not overlap/);
  });

  it('formats Vietnamese text with conservative basic ITN rules', () => {
    const formatted = formatTranscriptText(
      'hôm nay tăng hai mươi phần trăm lúc ba giờ mười lăm ngày hai mươi hai tháng sáu năm hai nghìn không trăm hai mươi sáu',
      { languageMode: 'vi' },
    );

    expect(formatted.text).toBe('hôm nay tăng 20% lúc 3:15 22/6/2026');
    expect(formatted.appliedRules).toContain('vi-percent');
    expect(formatted.appliedRules).toContain('vi-time');
    expect(formatted.appliedRules).toContain('vi-date');
  });

  it('handles decimal, currency, and phone phrases without changing English casing', () => {
    expect(formatTranscriptText('giá ba phẩy năm triệu đồng', { languageMode: 'vi' }).text).toBe(
      'giá 3,5 triệu đồng',
    );
    expect(
      formatTranscriptText('phí hai mươi nghìn đồng số điện thoại không chín không một hai ba', {
        languageMode: 'vi',
      }).text,
    ).toBe('phí 20.000 đồng số điện thoại 090123');
    expect(formatTranscriptText('deploy API xong', { languageMode: 'mixed' }).text).toBe(
      'deploy API xong',
    );
  });

  it('keeps spoken commands opt-in and supports verbatim mode', () => {
    expect(formatTranscriptText('xin chào xuống dòng Minh', { languageMode: 'vi' }).text).toBe(
      'xin chào xuống dòng Minh',
    );
    expect(
      formatTranscriptText('xin chào xuống dòng Minh', {
        languageMode: 'vi',
        spokenCommandsEnabled: true,
      }).text,
    ).toBe('xin chào\nMinh');
    expect(
      formatTranscriptText('hai mươi phần trăm', {
        languageMode: 'vi',
        verbatim: true,
      }).text,
    ).toBe('hai mươi phần trăm');
  });

  it('parses Vietnamese number phrases used by ITN rules', () => {
    expect(parseVietnameseNumberPhrase('hai mươi hai')).toBe(22);
    expect(parseVietnameseNumberPhrase('một trăm linh năm')).toBe(105);
    expect(parseVietnameseNumberPhrase('hai nghìn không trăm hai mươi sáu')).toBe(2026);
    expect(parseVietnameseNumberPhrase('không chín không một')).toBeNull();
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
  readonly formatCases: readonly TranscriptFormatFixtureCase[];
}

interface TranscriptFixtureCase {
  readonly id: string;
  readonly description: string;
  readonly tokenIds: readonly number[];
  readonly expectedText: string;
}

interface TranscriptFormatFixtureCase {
  readonly id: string;
  readonly input: string;
  readonly options: Parameters<typeof formatTranscriptText>[1];
  readonly expectedText: string;
}
