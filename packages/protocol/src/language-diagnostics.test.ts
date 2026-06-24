import { describe, expect, it } from 'vitest';
import {
  createLanguageModeDiagnostics,
  normalizeLanguageSpans,
  normalizeSupportedLanguageModes,
  resolveLanguageMode,
  summarizeLanguageSpans,
} from './language-diagnostics';

describe('language diagnostics', () => {
  it('keeps a supported requested language mode effective', () => {
    expect(resolveLanguageMode('auto', ['vi', 'en', 'auto']).effectiveMode).toBe('auto');
  });

  it('falls back from unsupported auto or mixed modes to Vietnamese when available', () => {
    const auto = resolveLanguageMode('auto', ['vi']);
    expect(auto.effectiveMode).toBe('vi');
    expect(auto.fallbackReason).toContain('auto');

    const mixed = resolveLanguageMode('mixed', ['vi', 'en']);
    expect(mixed.effectiveMode).toBe('vi');
    expect(mixed.fallbackReason).toContain('mixed');
  });

  it('normalizes and deduplicates supported language modes', () => {
    expect(normalizeSupportedLanguageModes(['vi', 'vi', 'auto'])).toEqual(['vi', 'auto']);
    expect(() => normalizeSupportedLanguageModes([])).toThrow(/at least one/);
  });

  it('summarizes token coverage and language switches', () => {
    expect(
      summarizeLanguageSpans([
        { startToken: 0, endToken: 2, language: 'vi' },
        { startToken: 2, endToken: 5, language: 'en' },
        { startToken: 5, endToken: 6, language: 'mixed' },
      ]),
    ).toEqual({
      spanCount: 3,
      tokenCount: 6,
      switchCount: 2,
      tokenCounts: { vi: 2, en: 3, mixed: 1 },
    });
  });

  it('rejects overlapping or invalid spans', () => {
    expect(() =>
      normalizeLanguageSpans([
        { startToken: 0, endToken: 2, language: 'vi' },
        { startToken: 1, endToken: 3, language: 'en' },
      ]),
    ).toThrow(/overlaps/);
    expect(() => normalizeLanguageSpans([{ startToken: 2, endToken: 2, language: 'vi' }])).toThrow(
      /greater than startToken/,
    );
  });

  it('builds diagnostics with fallback and span summaries', () => {
    const diagnostics = createLanguageModeDiagnostics({
      requestedMode: 'mixed',
      supportedLanguageModes: ['vi'],
      languageSpans: [
        { startToken: 0, endToken: 1, language: 'vi' },
        { startToken: 1, endToken: 3, language: 'en' },
      ],
    });

    expect(diagnostics.requestedMode).toBe('mixed');
    expect(diagnostics.effectiveMode).toBe('vi');
    expect(diagnostics.fallbackReason).toContain('mixed');
    expect(diagnostics.spanSummary.tokenCounts).toEqual({ vi: 1, en: 2, mixed: 0 });
  });
});
