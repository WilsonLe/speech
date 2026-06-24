import type { SpeechLanguage, SpeechLanguageMode } from './model-manifest';

export type LanguageSpanLanguage = SpeechLanguage | 'mixed';

export interface LanguageSpan {
  readonly startToken: number;
  readonly endToken: number;
  readonly language: LanguageSpanLanguage;
}

export interface LanguageSpanTokenCounts {
  readonly vi: number;
  readonly en: number;
  readonly mixed: number;
}

export interface LanguageSpanSummary {
  readonly spanCount: number;
  readonly tokenCount: number;
  readonly switchCount: number;
  readonly tokenCounts: LanguageSpanTokenCounts;
}

export interface LanguageModeDiagnostics {
  readonly requestedMode: SpeechLanguageMode;
  readonly effectiveMode: SpeechLanguageMode;
  readonly supportedLanguageModes: readonly SpeechLanguageMode[];
  readonly fallbackReason?: string;
  readonly spanSummary: LanguageSpanSummary;
  readonly spans: readonly LanguageSpan[];
}

export interface LanguageModeDiagnosticOptions {
  readonly requestedMode: SpeechLanguageMode;
  readonly supportedLanguageModes: readonly SpeechLanguageMode[];
  readonly languageSpans?: readonly LanguageSpan[];
}

const languageModeValues = new Set<SpeechLanguageMode>(['vi', 'en', 'auto', 'mixed']);
const languageSpanValues = new Set<LanguageSpanLanguage>(['vi', 'en', 'mixed']);

export const EMPTY_LANGUAGE_SPAN_SUMMARY: LanguageSpanSummary = {
  spanCount: 0,
  tokenCount: 0,
  switchCount: 0,
  tokenCounts: { vi: 0, en: 0, mixed: 0 },
};

export function isSpeechLanguageMode(value: unknown): value is SpeechLanguageMode {
  return typeof value === 'string' && languageModeValues.has(value as SpeechLanguageMode);
}

export function isLanguageSpanLanguage(value: unknown): value is LanguageSpanLanguage {
  return typeof value === 'string' && languageSpanValues.has(value as LanguageSpanLanguage);
}

export function createLanguageModeDiagnostics(
  options: LanguageModeDiagnosticOptions,
): LanguageModeDiagnostics {
  const supportedLanguageModes = normalizeSupportedLanguageModes(options.supportedLanguageModes);
  const { effectiveMode, fallbackReason } = resolveLanguageMode(
    options.requestedMode,
    supportedLanguageModes,
  );
  const spans = normalizeLanguageSpans(options.languageSpans ?? []);
  const summary = summarizeLanguageSpans(spans);
  const base = {
    requestedMode: options.requestedMode,
    effectiveMode,
    supportedLanguageModes,
    spanSummary: summary,
    spans,
  } satisfies Omit<LanguageModeDiagnostics, 'fallbackReason'>;
  return fallbackReason === undefined ? base : { ...base, fallbackReason };
}

export function resolveLanguageMode(
  requestedMode: SpeechLanguageMode,
  supportedLanguageModes: readonly SpeechLanguageMode[],
): { readonly effectiveMode: SpeechLanguageMode; readonly fallbackReason?: string } {
  const supported = normalizeSupportedLanguageModes(supportedLanguageModes);
  if (supported.includes(requestedMode)) {
    return { effectiveMode: requestedMode };
  }

  const effectiveMode = chooseFallbackLanguageMode(requestedMode, supported);
  return {
    effectiveMode,
    fallbackReason: `Requested language mode ${requestedMode} is not supported; using ${effectiveMode}.`,
  };
}

export function normalizeSupportedLanguageModes(
  modes: readonly SpeechLanguageMode[],
): readonly SpeechLanguageMode[] {
  if (modes.length === 0) {
    throw new Error('supportedLanguageModes must contain at least one mode.');
  }
  const unique: SpeechLanguageMode[] = [];
  for (const mode of modes) {
    if (!isSpeechLanguageMode(mode)) {
      throw new Error(`Unsupported language mode: ${String(mode)}.`);
    }
    if (!unique.includes(mode)) unique.push(mode);
  }
  return unique;
}

export function normalizeLanguageSpans(spans: readonly LanguageSpan[]): readonly LanguageSpan[] {
  let previousEnd = 0;
  return spans.map((span, index) => {
    if (!Number.isInteger(span.startToken) || span.startToken < 0) {
      throw new Error(
        `languageSpans[${index.toString()}].startToken must be a non-negative integer.`,
      );
    }
    if (!Number.isInteger(span.endToken) || span.endToken <= span.startToken) {
      throw new Error(
        `languageSpans[${index.toString()}].endToken must be greater than startToken.`,
      );
    }
    if (span.startToken < previousEnd) {
      throw new Error(`languageSpans[${index.toString()}] overlaps a previous span.`);
    }
    if (!isLanguageSpanLanguage(span.language)) {
      throw new Error(`languageSpans[${index.toString()}].language has unsupported value.`);
    }
    previousEnd = span.endToken;
    return {
      startToken: span.startToken,
      endToken: span.endToken,
      language: span.language,
    };
  });
}

export function summarizeLanguageSpans(spans: readonly LanguageSpan[]): LanguageSpanSummary {
  const normalized = normalizeLanguageSpans(spans);
  if (normalized.length === 0) return EMPTY_LANGUAGE_SPAN_SUMMARY;

  const counts: Record<LanguageSpanLanguage, number> = { vi: 0, en: 0, mixed: 0 };
  let tokenCount = 0;
  let switchCount = 0;
  let previousLanguage: LanguageSpanLanguage | null = null;
  for (const span of normalized) {
    const length = span.endToken - span.startToken;
    counts[span.language] += length;
    tokenCount += length;
    if (previousLanguage !== null && previousLanguage !== span.language) {
      switchCount += 1;
    }
    previousLanguage = span.language;
  }

  return {
    spanCount: normalized.length,
    tokenCount,
    switchCount,
    tokenCounts: counts,
  };
}

function chooseFallbackLanguageMode(
  requestedMode: SpeechLanguageMode,
  supportedLanguageModes: readonly SpeechLanguageMode[],
): SpeechLanguageMode {
  if (
    (requestedMode === 'auto' || requestedMode === 'mixed') &&
    supportedLanguageModes.includes('vi')
  ) {
    return 'vi';
  }
  return supportedLanguageModes[0] ?? 'vi';
}
