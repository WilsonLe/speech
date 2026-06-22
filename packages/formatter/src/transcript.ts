export type TranscriptLanguage = 'vi' | 'en' | 'mixed' | 'auto';

export interface LanguageSpan {
  readonly start: number;
  readonly end: number;
  readonly language: TranscriptLanguage;
}

export interface TranscriptVocabulary {
  readonly tokens: Readonly<Record<string, string>>;
  readonly wordBoundaryMarker?: string;
  readonly ignoredTokenIds?: readonly number[];
}

export interface TranscriptRenderOptions {
  readonly vocabulary: TranscriptVocabulary;
  readonly tokenIds: readonly number[];
}

export interface TranscriptFormatOptions {
  readonly languageMode?: TranscriptLanguage;
  readonly languageSpans?: readonly LanguageSpan[];
  readonly formattingEnabled?: boolean;
  readonly spokenCommandsEnabled?: boolean;
  readonly verbatim?: boolean;
}

export interface TranscriptFormatResult {
  readonly text: string;
  readonly languageMode: TranscriptLanguage;
  readonly appliedRules: readonly string[];
}

const defaultFormatOptions: Required<
  Pick<
    TranscriptFormatOptions,
    'languageMode' | 'formattingEnabled' | 'spokenCommandsEnabled' | 'verbatim'
  >
> = {
  languageMode: 'auto',
  formattingEnabled: true,
  spokenCommandsEnabled: false,
  verbatim: false,
};

const digitWords = new Map<string, number>([
  ['không', 0],
  ['một', 1],
  ['mốt', 1],
  ['hai', 2],
  ['ba', 3],
  ['bốn', 4],
  ['tư', 4],
  ['năm', 5],
  ['lăm', 5],
  ['sáu', 6],
  ['bảy', 7],
  ['tám', 8],
  ['chín', 9],
]);

const numberWordPattern =
  '(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi|trăm|linh|lẻ|nghìn|ngàn|triệu)';
const numberPhrasePattern = `${numberWordPattern}(?:\\s+${numberWordPattern})*`;
const numberPhrasePatternLazy = `${numberWordPattern}(?:\\s+${numberWordPattern})*?`;
const digitWordPattern = '(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)';
const digitPhrasePattern = `${digitWordPattern}(?:\\s+${digitWordPattern})*`;

export function renderTranscriptFromTokenIds(options: TranscriptRenderOptions): string {
  const ignoredTokenIds = new Set(options.vocabulary.ignoredTokenIds ?? []);
  const pieces: string[] = [];
  for (const tokenId of options.tokenIds) {
    validateTokenId(tokenId);
    if (ignoredTokenIds.has(tokenId)) continue;
    const piece = options.vocabulary.tokens[tokenId.toString()];
    if (piece === undefined) {
      throw new Error(`Missing transcript token piece for token id ${tokenId.toString()}.`);
    }
    pieces.push(piece);
  }
  return detokenizePieces(pieces, {
    wordBoundaryMarker: options.vocabulary.wordBoundaryMarker ?? '▁',
  });
}

export interface DetokenizePiecesOptions {
  readonly wordBoundaryMarker?: string;
}

export function detokenizePieces(
  pieces: readonly string[],
  options: DetokenizePiecesOptions = {},
): string {
  const wordBoundaryMarker = options.wordBoundaryMarker ?? '▁';
  if (wordBoundaryMarker.length === 0) {
    throw new Error('wordBoundaryMarker must not be empty.');
  }

  let output = '';
  for (const piece of pieces) {
    if (piece.length === 0) continue;
    if (piece.startsWith(wordBoundaryMarker)) {
      const wordStart = piece.slice(wordBoundaryMarker.length);
      if (wordStart.length === 0) continue;
      if (output.length > 0) output += ' ';
      output += wordStart;
    } else {
      output += piece;
    }
  }
  return normalizeVietnameseText(output);
}

export function formatTranscriptText(
  text: string,
  options: TranscriptFormatOptions = {},
): TranscriptFormatResult {
  const resolved = { ...defaultFormatOptions, ...options };
  let formatted = normalizeVietnameseText(text);
  const appliedRules: string[] = ['unicode-nfc'];

  if (resolved.verbatim || !resolved.formattingEnabled) {
    return { text: formatted, languageMode: resolved.languageMode, appliedRules };
  }

  formatted = collapseWhitespace(formatted);
  appliedRules.push('whitespace');

  if (resolved.spokenCommandsEnabled) {
    const next = applySpokenCommands(formatted);
    if (next !== formatted) appliedRules.push('spoken-commands');
    formatted = next;
  }

  const itn = applyVietnameseItN(formatted);
  formatted = itn.text;
  appliedRules.push(...itn.appliedRules);

  return { text: formatted, languageMode: resolved.languageMode, appliedRules };
}

export function normalizeVietnameseText(text: string): string {
  return text.normalize('NFC');
}

export function parseVietnameseNumberPhrase(phrase: string): number | null {
  const tokens = phrase
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return parseVietnameseNumberTokens(tokens);
}

function applyVietnameseItN(text: string): {
  readonly text: string;
  readonly appliedRules: string[];
} {
  let formatted = text;
  const applied = new Set<string>();

  formatted = replaceNumberPhraseBeforeUnit(
    formatted,
    'phần trăm',
    (value) => `${value}%`,
    () => applied.add('vi-percent'),
  );
  formatted = replaceDecimalPhrases(formatted, applied);
  formatted = replaceCurrencyPhrases(formatted, applied);
  formatted = replaceDatePhrases(formatted, applied);
  formatted = replaceTimePhrases(formatted, applied);
  formatted = replacePhonePhrases(formatted, applied);

  return { text: formatted, appliedRules: [...applied] };
}

function replaceNumberPhraseBeforeUnit(
  text: string,
  unit: string,
  render: (value: number) => string,
  onApplied: () => void,
): string {
  const pattern = new RegExp(`\\b(${numberPhrasePattern})\\s+${escapeRegExp(unit)}\\b`, 'giu');
  return text.replace(pattern, (match, phrase: string) => {
    const value = parseVietnameseNumberPhrase(phrase);
    if (value === null) return match;
    onApplied();
    return `${render(value)}${unit === 'phần trăm' ? '' : ` ${unit}`}`;
  });
}

function replaceDecimalPhrases(text: string, applied: Set<string>): string {
  const pattern = new RegExp(
    `\\b(${numberPhrasePattern})\\s+phẩy\\s+(${digitPhrasePattern})\\b`,
    'giu',
  );
  return text.replace(pattern, (match, integerPhrase: string, fractionPhrase: string) => {
    const integer = parseVietnameseNumberPhrase(integerPhrase);
    const fractionDigits = parseVietnameseDigitSequence(fractionPhrase);
    if (integer === null || fractionDigits === null) return match;
    applied.add('vi-decimal');
    return `${integer},${fractionDigits}`;
  });
}

function replaceCurrencyPhrases(text: string, applied: Set<string>): string {
  const pattern = new RegExp(
    `\\b(${numberPhrasePattern})\\s+(nghìn|ngàn|triệu)?\\s*đồng\\b`,
    'giu',
  );
  return text.replace(pattern, (match, phrase: string, magnitude: string | undefined) => {
    const value = parseVietnameseNumberPhrase(phrase);
    if (value === null) return match;
    const multiplier = magnitude === 'triệu' ? 1_000_000 : magnitude ? 1_000 : 1;
    applied.add('vi-currency');
    return `${formatVietnameseInteger(value * multiplier)} đồng`;
  });
}

function replaceDatePhrases(text: string, applied: Set<string>): string {
  const withYearPattern = new RegExp(
    `\\bngày\\s+(${numberPhrasePatternLazy})\\s+tháng\\s+(${numberPhrasePatternLazy})\\s+năm\\s+(${numberPhrasePattern})\\b`,
    'giu',
  );
  const withoutYearPattern = new RegExp(
    `\\bngày\\s+(${numberPhrasePatternLazy})\\s+tháng\\s+(${numberPhrasePattern})\\b`,
    'giu',
  );
  const withYear = text.replace(
    withYearPattern,
    (match, dayPhrase: string, monthPhrase: string, yearPhrase: string) => {
      const replacement = renderDate(match, dayPhrase, monthPhrase, yearPhrase);
      if (replacement !== match) applied.add('vi-date');
      return replacement;
    },
  );
  return withYear.replace(withoutYearPattern, (match, dayPhrase: string, monthPhrase: string) => {
    const replacement = renderDate(match, dayPhrase, monthPhrase);
    if (replacement !== match) applied.add('vi-date');
    return replacement;
  });
}

function renderDate(
  fallback: string,
  dayPhrase: string,
  monthPhrase: string,
  yearPhrase?: string,
): string {
  const day = parseVietnameseNumberPhrase(dayPhrase);
  const month = parseVietnameseNumberPhrase(monthPhrase);
  const year = yearPhrase === undefined ? null : parseVietnameseNumberPhrase(yearPhrase);
  if (day === null || month === null || day < 1 || day > 31 || month < 1 || month > 12) {
    return fallback;
  }
  return year === null ? `${day}/${month}` : `${day}/${month}/${year}`;
}

function replaceTimePhrases(text: string, applied: Set<string>): string {
  const pattern = new RegExp(
    `\\b(${numberPhrasePattern})\\s+giờ(?:\\s+(${numberPhrasePattern}))?\\b`,
    'giu',
  );
  return text.replace(pattern, (match, hourPhrase: string, minutePhrase?: string) => {
    const hour = parseVietnameseNumberPhrase(hourPhrase);
    const minute = minutePhrase === undefined ? 0 : parseVietnameseNumberPhrase(minutePhrase);
    if (hour === null || minute === null || hour > 23 || minute > 59) return match;
    applied.add('vi-time');
    return `${hour}:${minute.toString().padStart(2, '0')}`;
  });
}

function replacePhonePhrases(text: string, applied: Set<string>): string {
  const pattern = new RegExp(`\\b(số điện thoại|điện thoại)\\s+(${numberPhrasePattern})\\b`, 'giu');
  return text.replace(pattern, (match, label: string, digitsPhrase: string) => {
    const digits = parseVietnameseDigitSequence(digitsPhrase);
    if (digits === null || digits.length < 3) return match;
    applied.add('vi-phone');
    return `${label} ${digits}`;
  });
}

function applySpokenCommands(text: string): string {
  return text
    .replace(/\b(?:xuống dòng|new line)\b/giu, '\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ').trim();
}

function parseVietnameseDigitSequence(phrase: string): string | null {
  const tokens = phrase
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let output = '';
  for (const token of tokens) {
    const digit = digitWords.get(token);
    if (digit === undefined) return null;
    output += digit.toString();
  }
  return output;
}

function parseVietnameseNumberTokens(tokens: readonly string[]): number | null {
  const millionIndex = tokens.lastIndexOf('triệu');
  if (millionIndex >= 0) {
    const left = parseVietnameseNumberTokens(tokens.slice(0, millionIndex));
    const right = parseVietnameseNumberTokens(tokens.slice(millionIndex + 1));
    if (left === null) return null;
    return left * 1_000_000 + (right ?? 0);
  }

  const thousandIndex = Math.max(tokens.lastIndexOf('nghìn'), tokens.lastIndexOf('ngàn'));
  if (thousandIndex >= 0) {
    const leftTokens = tokens.slice(0, thousandIndex);
    const rightTokens = tokens.slice(thousandIndex + 1);
    const left = leftTokens.length === 0 ? 1 : parseVietnameseNumberTokens(leftTokens);
    const right = parseVietnameseNumberTokens(rightTokens);
    if (left === null) return null;
    return left * 1_000 + (right ?? 0);
  }

  return parseUnderOneThousand(tokens);
}

function parseUnderOneThousand(tokens: readonly string[]): number | null {
  if (tokens.length === 0) return null;

  const hundredIndex = tokens.indexOf('trăm');
  if (hundredIndex >= 0) {
    const hundreds = hundredIndex === 0 ? 1 : parseDigitToken(tokens[hundredIndex - 1]);
    if (hundreds === null) return null;
    const remainder = parseUnderOneHundred(tokens.slice(hundredIndex + 1));
    return hundreds * 100 + (remainder ?? 0);
  }

  return parseUnderOneHundred(tokens);
}

function parseUnderOneHundred(tokens: readonly string[]): number | null {
  const filtered = tokens.filter((token) => token !== 'linh' && token !== 'lẻ');
  if (filtered.length === 0) return 0;
  if (filtered.length === 1) return parseDigitToken(filtered[0]);

  if (filtered[0] === 'mười') {
    const ones = filtered.length === 1 ? 0 : parseDigitToken(filtered[1]);
    return ones === null ? null : 10 + ones;
  }

  if (filtered[1] === 'mươi') {
    const tens = parseDigitToken(filtered[0]);
    const ones = filtered.length === 2 ? 0 : parseDigitToken(filtered[2]);
    if (tens === null || ones === null) return null;
    return tens * 10 + ones;
  }

  return null;
}

function parseDigitToken(token: string | undefined): number | null {
  if (token === undefined) return null;
  return digitWords.get(token) ?? null;
}

function formatVietnameseInteger(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateTokenId(tokenId: number): void {
  if (!Number.isInteger(tokenId) || tokenId < 0) {
    throw new Error(`Transcript token id ${String(tokenId)} must be a non-negative integer.`);
  }
}
