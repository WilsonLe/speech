import {
  enrollmentVoiceConditionValues,
  normalizeEnrollmentSentenceText,
  type EnrollmentSentenceBankV1,
  type EnrollmentSentenceCoverageV1,
  type EnrollmentSentenceLanguage,
  type EnrollmentSentenceV1,
  type EnrollmentVoiceCondition,
} from './sentence-bank';

export const enrollmentCoverageFeatureKeys = [
  'vietnameseInitials',
  'vietnameseRimes',
  'vietnameseTones',
  'englishPhones',
  'phoneBigrams',
  'punctuationForms',
  'languageSwitchPatterns',
] as const;

export type EnrollmentCoverageFeatureKey = (typeof enrollmentCoverageFeatureKeys)[number];
export type EnrollmentSelectionFeatureKey =
  | EnrollmentCoverageFeatureKey
  | 'language'
  | 'voiceCondition'
  | 'tag';

export interface EnrollmentFeatureRef {
  readonly key: EnrollmentSelectionFeatureKey;
  readonly value: string;
}

export interface EnrollmentCoverageTarget extends EnrollmentFeatureRef {
  readonly minCount?: number;
  readonly weight?: number;
}

export interface DerivedEnrollmentCoverage {
  readonly normalizedText: string;
  readonly coverage: EnrollmentSentenceCoverageV1;
  readonly tokenLanguages: readonly EnrollmentSentenceLanguage[];
}

export interface EnrollmentCoverageReport {
  readonly sentenceCount: number;
  readonly heldOutSentenceCount: number;
  readonly totalEstimatedSeconds: number;
  readonly featureCounts: Readonly<
    Record<EnrollmentCoverageFeatureKey, Readonly<Record<string, number>>>
  >;
  readonly languageCounts: Readonly<Record<EnrollmentSentenceLanguage, number>>;
  readonly voiceConditionCounts: Readonly<Record<EnrollmentVoiceCondition, number>>;
  readonly missingTargets: readonly EnrollmentCoverageTarget[];
}

export interface EnrollmentSentenceSelectionOptions {
  readonly maxSentences?: number;
  readonly targetEstimatedSeconds?: number;
  readonly includeHeldOut?: boolean;
  readonly targets?: readonly EnrollmentCoverageTarget[];
  readonly featureWeights?: Partial<Record<EnrollmentSelectionFeatureKey, number>>;
  readonly repeatGroupPenalty?: number;
  readonly nearDuplicatePenalty?: number;
}

export interface EnrollmentSentenceSelectionStep {
  readonly sentenceId: string;
  readonly score: number;
  readonly uncoveredValue: number;
  readonly estimatedSeconds: number;
  readonly newlyCoveredTargets: readonly EnrollmentFeatureRef[];
  readonly penalties: readonly string[];
}

export interface EnrollmentSentenceSelectionResult {
  readonly selectedSentences: readonly EnrollmentSentenceV1[];
  readonly steps: readonly EnrollmentSentenceSelectionStep[];
  readonly coveredTargets: readonly EnrollmentFeatureRef[];
  readonly remainingTargets: readonly EnrollmentCoverageTarget[];
  readonly skippedHeldOutSentenceIds: readonly string[];
  readonly totalEstimatedSeconds: number;
}

const defaultFeatureWeights: Readonly<Record<EnrollmentSelectionFeatureKey, number>> = {
  vietnameseInitials: 1.2,
  vietnameseRimes: 1.2,
  vietnameseTones: 1.4,
  englishPhones: 1,
  phoneBigrams: 0.9,
  punctuationForms: 0.4,
  languageSwitchPatterns: 1.5,
  language: 2,
  voiceCondition: 1.5,
  tag: 0.2,
};

const vietnameseInitials = [
  'ngh',
  'ng',
  'gh',
  'ch',
  'gi',
  'kh',
  'nh',
  'ph',
  'qu',
  'th',
  'tr',
  'b',
  'c',
  'd',
  'đ',
  'g',
  'h',
  'k',
  'l',
  'm',
  'n',
  'p',
  'r',
  's',
  't',
  'v',
  'x',
] as const;

const vietnameseFunctionWords = new Set([
  'anh',
  'bạn',
  'bắt',
  'các',
  'câu',
  'cho',
  'của',
  'đang',
  'để',
  'đi',
  'đọc',
  'hãy',
  'kết',
  'kiểm',
  'là',
  'lại',
  'mới',
  'mở',
  'này',
  'nói',
  'quả',
  'rõ',
  'tôi',
  'trong',
  'trước',
  'từng',
  'và',
  'vừa',
]);

const englishWords = new Set([
  'a',
  'at',
  'change',
  'dashboard',
  'latest',
  'open',
  'pace',
  'please',
  'read',
  'review',
  'sentence',
  'steady',
  'the',
  'this',
]);

const englishDigraphPhones = new Map<string, string>([
  ['sh', 'sh'],
  ['ch', 'ch'],
  ['th', 'th'],
  ['ng', 'ng'],
  ['ph', 'f'],
  ['ck', 'k'],
  ['ee', 'iy'],
  ['ea', 'iy'],
  ['oo', 'uw'],
  ['ou', 'aw'],
  ['ow', 'aw'],
  ['ai', 'ey'],
  ['ay', 'ey'],
  ['oi', 'oy'],
]);

const englishLetterPhones = new Map<string, string>([
  ['a', 'ae'],
  ['b', 'b'],
  ['c', 'k'],
  ['d', 'd'],
  ['e', 'eh'],
  ['f', 'f'],
  ['g', 'g'],
  ['h', 'hh'],
  ['i', 'ih'],
  ['j', 'jh'],
  ['k', 'k'],
  ['l', 'l'],
  ['m', 'm'],
  ['n', 'n'],
  ['o', 'ao'],
  ['p', 'p'],
  ['q', 'k'],
  ['r', 'r'],
  ['s', 's'],
  ['t', 't'],
  ['u', 'ah'],
  ['v', 'v'],
  ['w', 'w'],
  ['x', 'ks'],
  ['y', 'y'],
  ['z', 'z'],
]);

const toneNamesByCombiningMark = new Map<string, string>([
  ['\u0300', 'huyền'],
  ['\u0301', 'sắc'],
  ['\u0309', 'hỏi'],
  ['\u0303', 'ngã'],
  ['\u0323', 'nặng'],
]);

export function analyzeEnrollmentSentenceText(
  text: string,
  language: EnrollmentSentenceLanguage,
): DerivedEnrollmentCoverage {
  const normalizedText = normalizeEnrollmentSentenceText(text);
  const tokens = tokenizeWords(normalizedText);
  const tokenLanguages = tokens.map((token) => classifyTokenLanguage(token, language));
  const vietnameseInitialSet = new Set<string>();
  const vietnameseRimeSet = new Set<string>();
  const vietnameseToneSet = new Set<string>();
  const englishPhones: string[] = [];

  for (const [index, token] of tokens.entries()) {
    const tokenLanguage = tokenLanguages[index];
    if (tokenLanguage === 'vi') {
      const syllable = analyzeVietnameseSyllable(token);
      if (syllable !== undefined) {
        vietnameseInitialSet.add(syllable.initial);
        vietnameseRimeSet.add(syllable.rime);
        vietnameseToneSet.add(syllable.tone);
      }
    }
    if (tokenLanguage === 'en') {
      englishPhones.push(...deriveEnglishPhones(token));
    }
  }

  const coverage = compactCoverage({
    vietnameseInitials: [...vietnameseInitialSet],
    vietnameseRimes: [...vietnameseRimeSet],
    vietnameseTones: [...vietnameseToneSet],
    englishPhones,
    phoneBigrams: deriveBigrams(englishPhones),
    punctuationForms: derivePunctuationForms(normalizedText),
    languageSwitchPatterns: deriveLanguageSwitchPatterns(tokenLanguages),
  });

  return {
    normalizedText,
    coverage,
    tokenLanguages,
  };
}

export function mergeEnrollmentSentenceCoverage(
  ...coverages: readonly EnrollmentSentenceCoverageV1[]
): EnrollmentSentenceCoverageV1 {
  const merged: Partial<Record<EnrollmentCoverageFeatureKey, readonly string[]>> = {};
  for (const key of enrollmentCoverageFeatureKeys) {
    const values = coverages.flatMap((coverage) => coverage[key] ?? []);
    const normalizedValues = uniqueSorted(values.map(normalizeCoverageValue));
    if (normalizedValues.length > 0) merged[key] = normalizedValues;
  }
  return merged;
}

export function flattenEnrollmentSentenceCoverage(
  coverage: EnrollmentSentenceCoverageV1,
): readonly EnrollmentFeatureRef[] {
  return enrollmentCoverageFeatureKeys.flatMap((key) =>
    (coverage[key] ?? []).map((value) => ({ key, value: normalizeCoverageValue(value) })),
  );
}

export function getSentenceSelectionFeatures(
  sentence: EnrollmentSentenceV1,
): readonly EnrollmentFeatureRef[] {
  return uniqueFeatureRefs([
    ...flattenEnrollmentSentenceCoverage(sentence.coverage),
    { key: 'language', value: sentence.language },
    ...sentence.allowedVoiceConditions.map((condition) => ({
      key: 'voiceCondition' as const,
      value: condition,
    })),
    ...sentence.tags.map((tag) => ({ key: 'tag' as const, value: normalizeCoverageValue(tag) })),
  ]);
}

export function buildEnrollmentCoverageReport(
  bank: EnrollmentSentenceBankV1,
  targets: readonly EnrollmentCoverageTarget[] = [],
): EnrollmentCoverageReport {
  const heldOut = new Set(bank.heldOutSentenceIds);
  const featureCounts = createFeatureCountMap();
  const languageCounts = createLanguageCountMap();
  const voiceConditionCounts = createVoiceConditionCountMap();
  let totalEstimatedSeconds = 0;

  for (const sentence of bank.sentences) {
    totalEstimatedSeconds += sentence.estimatedSeconds;
    languageCounts[sentence.language] += 1;
    for (const condition of sentence.allowedVoiceConditions) voiceConditionCounts[condition] += 1;
    for (const key of enrollmentCoverageFeatureKeys) {
      for (const value of sentence.coverage[key] ?? []) {
        const normalizedValue = normalizeCoverageValue(value);
        featureCounts[key][normalizedValue] = (featureCounts[key][normalizedValue] ?? 0) + 1;
      }
    }
  }

  return {
    sentenceCount: bank.sentences.length,
    heldOutSentenceCount: bank.sentences.filter((sentence) => heldOut.has(sentence.id)).length,
    totalEstimatedSeconds,
    featureCounts,
    languageCounts,
    voiceConditionCounts,
    missingTargets: findMissingTargets(targets, (target) => countTarget(bank.sentences, target)),
  };
}

export function selectEnrollmentSentences(
  bank: EnrollmentSentenceBankV1,
  options: EnrollmentSentenceSelectionOptions = {},
): EnrollmentSentenceSelectionResult {
  const includeHeldOut = options.includeHeldOut ?? false;
  const maxSentences = options.maxSentences ?? bank.sentences.length;
  const targetEstimatedSeconds = options.targetEstimatedSeconds ?? Number.POSITIVE_INFINITY;
  const weights = { ...defaultFeatureWeights, ...(options.featureWeights ?? {}) };
  const repeatGroupPenalty = options.repeatGroupPenalty ?? 0.35;
  const nearDuplicatePenalty = options.nearDuplicatePenalty ?? 0.35;
  const heldOutIds = new Set(bank.heldOutSentenceIds);
  const candidates = bank.sentences
    .filter((sentence) => includeHeldOut || !heldOutIds.has(sentence.id))
    .slice()
    .sort(compareSentenceById);
  const targetMap = buildTargetMap(options.targets ?? buildDefaultSelectionTargets(candidates));
  const selected: EnrollmentSentenceV1[] = [];
  const steps: EnrollmentSentenceSelectionStep[] = [];
  const coveredCounts = new Map<string, number>();
  let totalEstimatedSeconds = 0;

  while (selected.length < maxSentences && totalEstimatedSeconds < targetEstimatedSeconds) {
    const best = candidates
      .filter((candidate) => !selected.some((sentence) => sentence.id === candidate.id))
      .map((candidate) =>
        scoreSentence(candidate, selected, targetMap, coveredCounts, weights, {
          repeatGroupPenalty,
          nearDuplicatePenalty,
        }),
      )
      .sort(compareScoredSentences)[0];

    if (best === undefined || best.uncoveredValue <= 0 || best.score <= 0) break;
    selected.push(best.sentence);
    steps.push({
      sentenceId: best.sentence.id,
      score: roundScore(best.score),
      uncoveredValue: roundScore(best.uncoveredValue),
      estimatedSeconds: best.sentence.estimatedSeconds,
      newlyCoveredTargets: best.newlyCoveredTargets,
      penalties: best.penalties,
    });
    totalEstimatedSeconds += best.sentence.estimatedSeconds;
    for (const feature of best.newlyCoveredTargets) {
      const key = featureKey(feature);
      coveredCounts.set(key, (coveredCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    selectedSentences: selected,
    steps,
    coveredTargets: selected.flatMap((sentence) => getSentenceSelectionFeatures(sentence)),
    remainingTargets: findMissingTargets([...targetMap.values()], (target) => {
      const count = coveredCounts.get(featureKey(target)) ?? 0;
      return count;
    }),
    skippedHeldOutSentenceIds: includeHeldOut
      ? []
      : bank.heldOutSentenceIds.filter((id) => heldOutIds.has(id)),
    totalEstimatedSeconds,
  };
}

export function buildDefaultSelectionTargets(
  sentences: readonly EnrollmentSentenceV1[],
): readonly EnrollmentCoverageTarget[] {
  const targets = new Map<string, EnrollmentCoverageTarget>();
  for (const sentence of sentences) {
    for (const feature of getSentenceSelectionFeatures(sentence)) {
      if (feature.key === 'tag') continue;
      const key = featureKey(feature);
      if (!targets.has(key)) {
        targets.set(key, {
          ...feature,
          minCount: 1,
          weight: defaultFeatureWeights[feature.key],
        });
      }
    }
  }
  return [...targets.values()].sort(compareFeatureRef);
}

function scoreSentence(
  sentence: EnrollmentSentenceV1,
  selected: readonly EnrollmentSentenceV1[],
  targets: ReadonlyMap<string, Required<EnrollmentCoverageTarget>>,
  coveredCounts: ReadonlyMap<string, number>,
  weights: Readonly<Record<EnrollmentSelectionFeatureKey, number>>,
  penalties: { readonly repeatGroupPenalty: number; readonly nearDuplicatePenalty: number },
): ScoredSentence {
  const features = getSentenceSelectionFeatures(sentence);
  const newlyCoveredTargets = features.filter((feature) => {
    const target = targets.get(featureKey(feature));
    if (target === undefined) return false;
    return (coveredCounts.get(featureKey(feature)) ?? 0) < target.minCount;
  });
  const uncoveredValue = newlyCoveredTargets.reduce((total, feature) => {
    const target = targets.get(featureKey(feature));
    return total + (target?.weight ?? weights[feature.key] ?? 1);
  }, 0);
  const appliedPenalties: string[] = [];
  let multiplier = 1;

  if (
    sentence.repeatGroup !== undefined &&
    selected.some((selectedSentence) => selectedSentence.repeatGroup === sentence.repeatGroup)
  ) {
    multiplier -= penalties.repeatGroupPenalty;
    appliedPenalties.push('repeat-group');
  }
  if (selected.some((selectedSentence) => areNearDuplicateSentences(selectedSentence, sentence))) {
    multiplier -= penalties.nearDuplicatePenalty;
    appliedPenalties.push('near-duplicate');
  }

  multiplier = Math.max(0.05, multiplier);
  return {
    sentence,
    score: (uncoveredValue * multiplier) / sentence.estimatedSeconds,
    uncoveredValue,
    newlyCoveredTargets,
    penalties: appliedPenalties,
  };
}

function tokenizeWords(text: string): readonly string[] {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)].map((match) => match[0]);
}

function classifyTokenLanguage(
  token: string,
  sentenceLanguage: EnrollmentSentenceLanguage,
): EnrollmentSentenceLanguage {
  if (sentenceLanguage !== 'mixed') return sentenceLanguage;
  const normalized = normalizeEnrollmentSentenceText(token).toLocaleLowerCase('vi');
  if (hasVietnameseLetterOrTone(normalized) || vietnameseFunctionWords.has(normalized)) return 'vi';
  if (englishWords.has(normalized) || /^[a-z0-9][a-z0-9'-]*$/u.test(normalized)) return 'en';
  return 'mixed';
}

function analyzeVietnameseSyllable(
  token: string,
): { readonly initial: string; readonly rime: string; readonly tone: string } | undefined {
  const normalized = normalizeEnrollmentSentenceText(token).toLocaleLowerCase('vi');
  const tone = detectVietnameseTone(normalized);
  const withoutTone = removeVietnameseToneMarks(normalized);
  const initial = vietnameseInitials.find((candidate) => withoutTone.startsWith(candidate)) ?? '∅';
  const rime = initial === '∅' ? withoutTone : withoutTone.slice(initial.length);
  if (rime.length === 0) return undefined;
  return { initial, rime, tone };
}

function deriveEnglishPhones(token: string): readonly string[] {
  const normalized = stripAllDiacritics(token)
    .toLowerCase()
    .replace(/[^a-z]/gu, '');
  const phones: string[] = [];
  let index = 0;
  while (index < normalized.length) {
    const digraph = normalized.slice(index, index + 2);
    const digraphPhone = englishDigraphPhones.get(digraph);
    if (digraphPhone !== undefined) {
      phones.push(digraphPhone);
      index += 2;
      continue;
    }
    const phone = englishLetterPhones.get(normalized[index] ?? '');
    if (phone !== undefined) phones.push(phone);
    index += 1;
  }
  return phones;
}

function deriveBigrams(values: readonly string[]): readonly string[] {
  const bigrams: string[] = [];
  for (let index = 0; index < values.length - 1; index += 1) {
    bigrams.push(`${values[index]}-${values[index + 1]}`);
  }
  return bigrams;
}

function derivePunctuationForms(text: string): readonly string[] {
  const forms: string[] = [];
  if (text.includes('.')) forms.push('period');
  if (text.includes(',')) forms.push('comma');
  if (text.includes('?')) forms.push('question');
  if (text.includes('!')) forms.push('exclamation');
  if (text.includes(':')) forms.push('colon');
  if (text.includes(';')) forms.push('semicolon');
  if (/\d/u.test(text)) forms.push('digits');
  return forms;
}

function deriveLanguageSwitchPatterns(
  languages: readonly EnrollmentSentenceLanguage[],
): readonly string[] {
  const patterns: string[] = [];
  let previous: EnrollmentSentenceLanguage | undefined;
  for (const language of languages) {
    if (language === 'mixed') continue;
    if (previous !== undefined && previous !== language) patterns.push(`${previous}-${language}`);
    previous = language;
  }
  return patterns;
}

function detectVietnameseTone(token: string): string {
  for (const mark of token.normalize('NFD')) {
    const tone = toneNamesByCombiningMark.get(mark);
    if (tone !== undefined) return tone;
  }
  return 'ngang';
}

function removeVietnameseToneMarks(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0309\u0303\u0323]/gu, '')
    .normalize('NFC');
}

function stripAllDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd');
}

function hasVietnameseLetterOrTone(value: string): boolean {
  return /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu.test(value);
}

function compactCoverage(
  coverage: Partial<Record<EnrollmentCoverageFeatureKey, readonly string[]>>,
): EnrollmentSentenceCoverageV1 {
  const compacted: Partial<Record<EnrollmentCoverageFeatureKey, readonly string[]>> = {};
  for (const key of enrollmentCoverageFeatureKeys) {
    const values = uniqueSorted((coverage[key] ?? []).map(normalizeCoverageValue));
    if (values.length > 0) compacted[key] = values;
  }
  return compacted;
}

function normalizeCoverageValue(value: string): string {
  return normalizeEnrollmentSentenceText(value).toLocaleLowerCase('vi');
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b, 'vi'),
  );
}

function uniqueFeatureRefs(
  features: readonly EnrollmentFeatureRef[],
): readonly EnrollmentFeatureRef[] {
  const seen = new Set<string>();
  const unique: EnrollmentFeatureRef[] = [];
  for (const feature of features) {
    const normalized = { key: feature.key, value: normalizeCoverageValue(feature.value) };
    const key = featureKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique.sort(compareFeatureRef);
}

function buildTargetMap(
  targets: readonly EnrollmentCoverageTarget[],
): ReadonlyMap<string, Required<EnrollmentCoverageTarget>> {
  return new Map(
    targets.map((target) => {
      const normalized = {
        key: target.key,
        value: normalizeCoverageValue(target.value),
        minCount: target.minCount ?? 1,
        weight: target.weight ?? defaultFeatureWeights[target.key] ?? 1,
      };
      return [featureKey(normalized), normalized];
    }),
  );
}

function findMissingTargets(
  targets: readonly EnrollmentCoverageTarget[],
  count: (target: EnrollmentCoverageTarget) => number,
): readonly EnrollmentCoverageTarget[] {
  return targets
    .filter((target) => count(target) < (target.minCount ?? 1))
    .map((target) => ({
      key: target.key,
      value: normalizeCoverageValue(target.value),
      minCount: target.minCount ?? 1,
      weight: target.weight ?? defaultFeatureWeights[target.key] ?? 1,
    }))
    .sort(compareFeatureRef);
}

function countTarget(
  sentences: readonly EnrollmentSentenceV1[],
  target: EnrollmentCoverageTarget,
): number {
  return sentences.filter((sentence) =>
    getSentenceSelectionFeatures(sentence).some(
      (feature) =>
        feature.key === target.key && feature.value === normalizeCoverageValue(target.value),
    ),
  ).length;
}

function createFeatureCountMap(): Record<EnrollmentCoverageFeatureKey, Record<string, number>> {
  return {
    vietnameseInitials: {},
    vietnameseRimes: {},
    vietnameseTones: {},
    englishPhones: {},
    phoneBigrams: {},
    punctuationForms: {},
    languageSwitchPatterns: {},
  };
}

function createLanguageCountMap(): Record<EnrollmentSentenceLanguage, number> {
  return { vi: 0, en: 0, mixed: 0 };
}

function createVoiceConditionCountMap(): Record<EnrollmentVoiceCondition, number> {
  return Object.fromEntries(enrollmentVoiceConditionValues.map((value) => [value, 0])) as Record<
    EnrollmentVoiceCondition,
    number
  >;
}

function areNearDuplicateSentences(a: EnrollmentSentenceV1, b: EnrollmentSentenceV1): boolean {
  const aTokens = new Set(tokenizeWords(a.normalizedText.toLocaleLowerCase('vi')));
  const bTokens = new Set(tokenizeWords(b.normalizedText.toLocaleLowerCase('vi')));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return shared / union >= 0.72;
}

function featureKey(feature: EnrollmentFeatureRef): string {
  return `${feature.key}:${normalizeCoverageValue(feature.value)}`;
}

function compareFeatureRef(a: EnrollmentFeatureRef, b: EnrollmentFeatureRef): number {
  return a.key.localeCompare(b.key) || a.value.localeCompare(b.value, 'vi');
}

function compareSentenceById(a: EnrollmentSentenceV1, b: EnrollmentSentenceV1): number {
  return a.id.localeCompare(b.id);
}

function compareScoredSentences(a: ScoredSentence, b: ScoredSentence): number {
  return (
    b.score - a.score ||
    b.uncoveredValue - a.uncoveredValue ||
    compareSentenceById(a.sentence, b.sentence)
  );
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

interface ScoredSentence {
  readonly sentence: EnrollmentSentenceV1;
  readonly score: number;
  readonly uncoveredValue: number;
  readonly newlyCoveredTargets: readonly EnrollmentFeatureRef[];
  readonly penalties: readonly string[];
}
