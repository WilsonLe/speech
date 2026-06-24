import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizeEnrollmentSentenceText,
  parseEnrollmentSentenceBankV1,
  validateEnrollmentSentenceBank,
  type EnrollmentSentenceBankV1,
} from './sentence-bank';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../test-data/expected/enrollment-sentence-bank.json', import.meta.url),
    'utf8',
  ),
) as EnrollmentSentenceBankV1;

describe('enrollment sentence-bank format', () => {
  it('accepts the checked-in licensed bilingual fixture', () => {
    const result = validateEnrollmentSentenceBank(fixture);

    expect(result).toEqual({ ok: true, errors: [], normalizedBank: fixture });
    expect(parseEnrollmentSentenceBankV1(fixture)).toEqual(fixture);
    expect(new Set(fixture.sentences.map((sentence) => sentence.language))).toEqual(
      new Set(['vi', 'en', 'mixed']),
    );
    expect(fixture.licenses).toEqual([
      expect.objectContaining({
        id: 'project-apache-2.0',
        redistributionAllowed: true,
        derivativeAllowed: true,
        spdx: 'Apache-2.0',
      }),
    ]);
  });

  it('normalizes Vietnamese text to NFC and collapses whitespace', () => {
    expect(normalizeEnrollmentSentenceText('  To\u0302i   nói  rõ  ')).toBe('Tôi nói rõ');
  });

  it('rejects non-redistributable licenses and unreviewed release sentences by default', () => {
    const result = validateEnrollmentSentenceBank({
      ...fixture,
      licenses: [{ ...fixture.licenses[0], redistributionAllowed: false }],
      sentences: [
        {
          ...fixture.sentences[0],
          review: { humanReviewed: false },
        },
      ],
      heldOutSentenceIds: [fixture.sentences[0]?.id],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-license',
          field: 'licenses[0].redistributionAllowed',
        }),
        expect.objectContaining({ code: 'invalid-review', sentenceId: fixture.sentences[0]?.id }),
        expect.objectContaining({ code: 'missing-coverage', field: 'sentences' }),
      ]),
    );
  });

  it('allows draft banks to bypass release gates explicitly while keeping structural checks', () => {
    const draft = {
      ...fixture,
      licenses: [{ ...fixture.licenses[0], redistributionAllowed: false }],
      sentences: [
        {
          ...fixture.sentences[0],
          review: { humanReviewed: false },
        },
      ],
      heldOutSentenceIds: [],
    };

    const result = validateEnrollmentSentenceBank(draft, {
      requireBilingualCoverage: false,
      requireHeldOutSet: false,
      requireHumanReview: false,
      requireRedistributableLicenses: false,
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedBank?.sentences).toHaveLength(1);
  });

  it('honors custom id and sentence text limits consistently', () => {
    const longId = `sent-${'a'.repeat(140)}`;
    const longText = `${'A'.repeat(300)}.`;
    const result = validateEnrollmentSentenceBank(
      {
        ...fixture,
        sentences: [
          {
            ...fixture.sentences[0],
            id: longId,
            text: longText,
            normalizedText: longText,
          },
        ],
        heldOutSentenceIds: [longId],
      },
      {
        requireBilingualCoverage: false,
        limits: {
          maxIdCodePoints: 160,
          maxSentenceTextCodePoints: 320,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.normalizedBank?.heldOutSentenceIds).toEqual([longId]);
  });

  it('rejects duplicate ids, stale normalized text, and missing held-out references', () => {
    const duplicate = fixture.sentences[0]!;
    const result = validateEnrollmentSentenceBank({
      ...fixture,
      sentences: [
        duplicate,
        {
          ...duplicate,
          normalizedText: 'stale text',
        },
      ],
      heldOutSentenceIds: ['missing-sentence'],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate', sentenceId: duplicate.id }),
        expect.objectContaining({ code: 'invalid-field', field: 'sentences[1].normalizedText' }),
        expect.objectContaining({ code: 'invalid-id', sentenceId: 'missing-sentence' }),
      ]),
    );
  });

  it('rejects unsupported languages, voice conditions, empty coverage, and bad license references', () => {
    const result = validateEnrollmentSentenceBank({
      ...fixture,
      sentences: [
        {
          ...fixture.sentences[0],
          language: 'fr',
          allowedVoiceConditions: ['normal', 'shout'],
          coverage: {},
          licenseId: 'unknown-license',
        },
      ],
      heldOutSentenceIds: [fixture.sentences[0]?.id],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-language' }),
        expect.objectContaining({ code: 'invalid-voice-condition' }),
        expect.objectContaining({ code: 'missing-coverage' }),
        expect.objectContaining({ code: 'invalid-license' }),
      ]),
    );
  });
});
