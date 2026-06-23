import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeEnrollmentSentenceText,
  buildEnrollmentCoverageReport,
  selectEnrollmentSentences,
  type EnrollmentCoverageTarget,
} from './coverage';
import type { EnrollmentSentenceBankV1, EnrollmentSentenceV1 } from './sentence-bank';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../test-data/expected/enrollment-sentence-bank.json', import.meta.url),
    'utf8',
  ),
) as EnrollmentSentenceBankV1;

describe('enrollment sentence coverage analysis', () => {
  it('derives Vietnamese onset, rime, tone, and punctuation coverage from NFC text', () => {
    const result = analyzeEnrollmentSentenceText('  To\u0302i   nói rõ. ', 'vi');

    expect(result.normalizedText).toBe('Tôi nói rõ.');
    expect(result.coverage.vietnameseInitials).toEqual(expect.arrayContaining(['n', 'r', 't']));
    expect(result.coverage.vietnameseRimes).toEqual(expect.arrayContaining(['ôi', 'oi', 'o']));
    expect(result.coverage.vietnameseTones).toEqual(
      expect.arrayContaining(['ngang', 'ngã', 'sắc']),
    );
    expect(result.coverage.punctuationForms).toEqual(['period']);
  });

  it('derives deterministic English phone and phone-bigram coverage', () => {
    const result = analyzeEnrollmentSentenceText('Please shop.', 'en');

    expect(result.coverage.englishPhones).toEqual(expect.arrayContaining(['iy', 'l', 'p', 'sh']));
    expect(result.coverage.phoneBigrams).toEqual(expect.arrayContaining(['sh-ao', 'ao-p']));
  });

  it('derives mixed-language switch patterns without treating the whole prompt as one language', () => {
    const result = analyzeEnrollmentSentenceText(
      'Tôi update dashboard và review kết quả.',
      'mixed',
    );

    expect(result.tokenLanguages).toEqual(expect.arrayContaining(['vi', 'en']));
    expect(result.coverage.languageSwitchPatterns).toEqual(
      expect.arrayContaining(['en-vi', 'vi-en']),
    );
  });

  it('reports aggregate coverage and missing declared targets', () => {
    const targets: EnrollmentCoverageTarget[] = [
      { key: 'language', value: 'vi', minCount: 1 },
      { key: 'voiceCondition', value: 'projected', minCount: 1 },
      { key: 'englishPhones', value: 'zz', minCount: 1 },
    ];

    const report = buildEnrollmentCoverageReport(fixture, targets);

    expect(report.sentenceCount).toBe(4);
    expect(report.heldOutSentenceCount).toBe(1);
    expect(report.languageCounts).toEqual({ vi: 2, en: 1, mixed: 1 });
    expect(report.voiceConditionCounts.projected).toBe(3);
    expect(report.featureCounts.punctuationForms['period']).toBe(4);
    expect(report.missingTargets).toEqual([
      expect.objectContaining({ key: 'englishPhones', value: 'zz' }),
    ]);
  });

  it('keeps the checked-in fixture above the declared minimal release coverage floor', () => {
    const releaseTargets: EnrollmentCoverageTarget[] = [
      { key: 'language', value: 'vi' },
      { key: 'language', value: 'en' },
      { key: 'language', value: 'mixed' },
      { key: 'voiceCondition', value: 'whisper' },
      { key: 'voiceCondition', value: 'normal' },
      { key: 'voiceCondition', value: 'projected' },
      { key: 'punctuationForms', value: 'period' },
      { key: 'languageSwitchPatterns', value: 'vi-en' },
      { key: 'languageSwitchPatterns', value: 'en-vi' },
    ];

    expect(buildEnrollmentCoverageReport(fixture, releaseTargets).missingTargets).toEqual([]);
  });
});

describe('weighted enrollment sentence selection', () => {
  it('selects highest uncovered coverage per second and skips held-out prompts by default', () => {
    const bank: EnrollmentSentenceBankV1 = {
      ...fixture,
      sentences: [
        makeSentence('s-en-shop', {
          language: 'en',
          allowedVoiceConditions: ['normal'],
          estimatedSeconds: 4,
          coverage: { englishPhones: ['sh'], phoneBigrams: ['sh-ao'] },
        }),
        makeSentence('s-mixed-switch', {
          language: 'mixed',
          allowedVoiceConditions: ['projected'],
          estimatedSeconds: 2,
          coverage: { languageSwitchPatterns: ['vi-en'], vietnameseInitials: ['t'] },
        }),
        makeSentence('s-held-out-rare', {
          language: 'vi',
          allowedVoiceConditions: ['whisper'],
          estimatedSeconds: 1,
          coverage: { vietnameseRimes: ['ươu'] },
        }),
      ],
      heldOutSentenceIds: ['s-held-out-rare'],
    };

    const result = selectEnrollmentSentences(bank, {
      targets: [
        { key: 'englishPhones', value: 'sh', weight: 8 },
        { key: 'languageSwitchPatterns', value: 'vi-en', weight: 3 },
        { key: 'voiceCondition', value: 'projected', weight: 2 },
        { key: 'vietnameseRimes', value: 'ươu', weight: 20 },
      ],
      maxSentences: 3,
    });

    expect(result.selectedSentences.map((sentence) => sentence.id)).toEqual([
      's-mixed-switch',
      's-en-shop',
    ]);
    expect(result.skippedHeldOutSentenceIds).toEqual(['s-held-out-rare']);
    expect(result.remainingTargets).toEqual([
      expect.objectContaining({ key: 'vietnameseRimes', value: 'ươu' }),
    ]);
  });

  it('penalizes repeated groups when another sentence covers the same remaining target', () => {
    const bank: EnrollmentSentenceBankV1 = {
      ...fixture,
      sentences: [
        makeSentence('s-anchor-a', {
          repeatGroup: 'anchor',
          estimatedSeconds: 1,
          coverage: { vietnameseInitials: ['t'] },
        }),
        makeSentence('s-anchor-b', {
          repeatGroup: 'anchor',
          estimatedSeconds: 1,
          coverage: { vietnameseInitials: ['t'] },
        }),
        makeSentence('s-independent', {
          repeatGroup: 'independent',
          estimatedSeconds: 1,
          coverage: { vietnameseInitials: ['t'] },
        }),
      ],
      heldOutSentenceIds: [],
    };

    const result = selectEnrollmentSentences(bank, {
      targets: [{ key: 'vietnameseInitials', value: 't', minCount: 2, weight: 2 }],
      maxSentences: 2,
    });

    expect(result.selectedSentences.map((sentence) => sentence.id)).toEqual([
      's-anchor-a',
      's-independent',
    ]);
    expect(result.steps[1]?.penalties).toEqual([]);
  });
});

function makeSentence(id: string, overrides: Partial<EnrollmentSentenceV1>): EnrollmentSentenceV1 {
  const { repeatGroup: _repeatGroup, ...base } = fixture.sentences[0]!;
  return {
    ...base,
    id,
    version: 1,
    text: `Synthetic prompt ${id}.`,
    normalizedText: `Synthetic prompt ${id}.`,
    tags: ['synthetic'],
    ...overrides,
  };
}
