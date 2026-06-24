export type EnrollmentSentenceLanguage = 'vi' | 'en' | 'mixed';
export type EnrollmentVoiceCondition = 'whisper' | 'normal' | 'projected';
export type EnrollmentSentenceDifficulty = 1 | 2 | 3;
export type EnrollmentSentenceLicenseSource = 'project-authored' | 'third-party' | 'user-provided';

export interface EnrollmentSentenceCoverageV1 {
  readonly vietnameseInitials?: readonly string[];
  readonly vietnameseRimes?: readonly string[];
  readonly vietnameseTones?: readonly string[];
  readonly englishPhones?: readonly string[];
  readonly phoneBigrams?: readonly string[];
  readonly punctuationForms?: readonly string[];
  readonly languageSwitchPatterns?: readonly string[];
}

export interface EnrollmentSentenceReviewV1 {
  readonly humanReviewed: boolean;
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly notes?: string;
}

export interface EnrollmentSentenceLicenseV1 {
  readonly id: string;
  readonly name: string;
  readonly source: EnrollmentSentenceLicenseSource;
  readonly redistributionAllowed: boolean;
  readonly derivativeAllowed: boolean;
  readonly spdx?: string;
  readonly url?: string;
  readonly attribution?: string;
  readonly notes?: string;
}

export interface EnrollmentSentenceV1 {
  readonly id: string;
  readonly version: number;
  readonly text: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly normalizedText: string;
  readonly allowedVoiceConditions: readonly EnrollmentVoiceCondition[];
  readonly estimatedSeconds: number;
  readonly difficulty: EnrollmentSentenceDifficulty;
  readonly tags: readonly string[];
  readonly repeatGroup?: string;
  readonly coverage: EnrollmentSentenceCoverageV1;
  readonly licenseId: string;
  readonly review: EnrollmentSentenceReviewV1;
}

export interface EnrollmentSentenceBankV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly licenses: readonly EnrollmentSentenceLicenseV1[];
  readonly sentences: readonly EnrollmentSentenceV1[];
  readonly heldOutSentenceIds: readonly string[];
}

export type EnrollmentSentenceBankIssueCode =
  | 'empty'
  | 'duplicate'
  | 'invalid-schema-version'
  | 'invalid-id'
  | 'invalid-language'
  | 'invalid-voice-condition'
  | 'invalid-license'
  | 'invalid-review'
  | 'invalid-field'
  | 'invalid-timestamp'
  | 'invalid-version'
  | 'limit-exceeded'
  | 'missing-coverage';

export interface EnrollmentSentenceBankIssue {
  readonly code: EnrollmentSentenceBankIssueCode;
  readonly message: string;
  readonly field?: string;
  readonly sentenceId?: string;
  readonly licenseId?: string;
}

export interface EnrollmentSentenceBankValidationOptions {
  readonly requireBilingualCoverage?: boolean;
  readonly requireHeldOutSet?: boolean;
  readonly requireRedistributableLicenses?: boolean;
  readonly requireHumanReview?: boolean;
  readonly limits?: Partial<EnrollmentSentenceBankLimits>;
}

export interface EnrollmentSentenceBankLimits {
  readonly maxIdCodePoints: number;
  readonly maxVersionCodePoints: number;
  readonly maxDisplayNameCodePoints: number;
  readonly maxDescriptionCodePoints: number;
  readonly maxSentenceTextCodePoints: number;
  readonly maxTagCodePoints: number;
  readonly maxTagsPerSentence: number;
  readonly maxCoverageValueCodePoints: number;
  readonly maxCoverageValuesPerField: number;
  readonly maxSentences: number;
  readonly maxLicenses: number;
  readonly maxEstimatedSeconds: number;
  readonly maxReviewNotesCodePoints: number;
}

export interface EnrollmentSentenceBankValidationResult {
  readonly ok: boolean;
  readonly errors: readonly EnrollmentSentenceBankIssue[];
  readonly normalizedBank?: EnrollmentSentenceBankV1;
}

export const enrollmentSentenceLanguageValues = ['vi', 'en', 'mixed'] as const;
export const enrollmentVoiceConditionValues = ['whisper', 'normal', 'projected'] as const;

export const defaultEnrollmentSentenceBankLimits: EnrollmentSentenceBankLimits = {
  maxIdCodePoints: 128,
  maxVersionCodePoints: 64,
  maxDisplayNameCodePoints: 120,
  maxDescriptionCodePoints: 1_000,
  maxSentenceTextCodePoints: 280,
  maxTagCodePoints: 64,
  maxTagsPerSentence: 24,
  maxCoverageValueCodePoints: 64,
  maxCoverageValuesPerField: 64,
  maxSentences: 5_000,
  maxLicenses: 128,
  maxEstimatedSeconds: 60,
  maxReviewNotesCodePoints: 1_000,
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const languageValues = new Set<EnrollmentSentenceLanguage>(enrollmentSentenceLanguageValues);
const voiceConditionValues = new Set<EnrollmentVoiceCondition>(enrollmentVoiceConditionValues);
const licenseSourceValues = new Set<EnrollmentSentenceLicenseSource>([
  'project-authored',
  'third-party',
  'user-provided',
]);

export function normalizeEnrollmentSentenceText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function validateEnrollmentSentenceBank(
  value: unknown,
  options: EnrollmentSentenceBankValidationOptions = {},
): EnrollmentSentenceBankValidationResult {
  const limits = resolveLimits(options.limits);
  const requireBilingualCoverage = options.requireBilingualCoverage ?? true;
  const requireHeldOutSet = options.requireHeldOutSet ?? true;
  const requireRedistributableLicenses = options.requireRedistributableLicenses ?? true;
  const requireHumanReview = options.requireHumanReview ?? true;
  const errors: EnrollmentSentenceBankIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [makeIssue('invalid-field', 'Enrollment sentence bank must be an object.')],
    };
  }

  if (value['schemaVersion'] !== 1) {
    errors.push(
      makeIssue('invalid-schema-version', 'Enrollment sentence bank schemaVersion must be 1.', {
        field: 'schemaVersion',
      }),
    );
  }

  const id = validateId(value['id'], 'id', limits.maxIdCodePoints, errors);
  const version = validateTextField(
    value['version'],
    'version',
    limits.maxVersionCodePoints,
    errors,
    {
      emptyCode: 'invalid-version',
    },
  );
  const displayName = validateTextField(
    value['displayName'],
    'displayName',
    limits.maxDisplayNameCodePoints,
    errors,
  );
  const description = validateOptionalTextField(
    value['description'],
    'description',
    limits.maxDescriptionCodePoints,
    errors,
  );
  const createdAt = validateIsoTimestamp(value['createdAt'], 'createdAt', errors);
  const updatedAt = validateIsoTimestamp(value['updatedAt'], 'updatedAt', errors);

  const licenses = validateLicenses(value['licenses'], limits, errors, {
    requireRedistributableLicenses,
  });
  const licenseIds = new Set(licenses.map((license) => license.id));
  const sentences = validateSentences(value['sentences'], limits, errors, {
    licenseIds,
    requireHumanReview,
  });
  const heldOutSentenceIds = validateHeldOutSentenceIds(
    value['heldOutSentenceIds'],
    limits,
    errors,
    {
      sentenceIds: new Set(sentences.map((sentence) => sentence.id)),
      requireHeldOutSet,
    },
  );

  if (requireBilingualCoverage && sentences.length > 0) {
    const languages = new Set(sentences.map((sentence) => sentence.language));
    if (!languages.has('vi') || !languages.has('en')) {
      errors.push(
        makeIssue(
          'missing-coverage',
          'Enrollment sentence bank must include at least one Vietnamese and one English sentence.',
          { field: 'sentences' },
        ),
      );
    }
  }

  if (
    id === undefined ||
    version === undefined ||
    displayName === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    licenses.length === 0 ||
    sentences.length === 0 ||
    heldOutSentenceIds === undefined ||
    errors.length > 0
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    normalizedBank: {
      schemaVersion: 1,
      id,
      version,
      displayName,
      ...(description !== undefined ? { description } : {}),
      createdAt,
      updatedAt,
      licenses,
      sentences,
      heldOutSentenceIds,
    },
  };
}

export function parseEnrollmentSentenceBankV1(
  value: unknown,
  options?: EnrollmentSentenceBankValidationOptions,
): EnrollmentSentenceBankV1 {
  const result = validateEnrollmentSentenceBank(value, options);
  if (!result.ok || result.normalizedBank === undefined) {
    throw new Error(result.errors.map((error) => error.message).join('\n'));
  }
  return result.normalizedBank;
}

function validateLicenses(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  options: { readonly requireRedistributableLicenses: boolean },
): EnrollmentSentenceLicenseV1[] {
  if (!Array.isArray(value)) {
    errors.push(makeIssue('invalid-license', 'licenses must be an array.', { field: 'licenses' }));
    return [];
  }
  if (value.length === 0) {
    errors.push(
      makeIssue('empty', 'licenses must include at least one license.', { field: 'licenses' }),
    );
    return [];
  }
  if (value.length > limits.maxLicenses) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `licenses must include at most ${limits.maxLicenses.toString()} entries.`,
        {
          field: 'licenses',
        },
      ),
    );
  }

  const seenIds = new Set<string>();
  const licenses: EnrollmentSentenceLicenseV1[] = [];
  for (const [index, rawLicense] of value.entries()) {
    if (!isRecord(rawLicense)) {
      errors.push(
        makeIssue('invalid-license', 'Sentence-bank license must be an object.', {
          field: `licenses[${index.toString()}]`,
        }),
      );
      continue;
    }

    const id = validateId(
      rawLicense['id'],
      `licenses[${index.toString()}].id`,
      limits.maxIdCodePoints,
      errors,
      {
        code: 'invalid-license',
      },
    );
    const licenseId = id;
    if (id !== undefined) {
      if (seenIds.has(id)) {
        errors.push(
          makeIssue('duplicate', `License id ${id} is duplicated.`, {
            field: `licenses[${index.toString()}].id`,
            licenseId: id,
          }),
        );
      }
      seenIds.add(id);
    }

    const name = validateTextField(
      rawLicense['name'],
      `licenses[${index.toString()}].name`,
      limits.maxDisplayNameCodePoints,
      errors,
      { licenseId },
    );
    const source = validateLicenseSource(rawLicense['source'], errors, {
      field: `licenses[${index.toString()}].source`,
      licenseId,
    });
    const redistributionAllowed = validateBoolean(rawLicense['redistributionAllowed'], errors, {
      field: `licenses[${index.toString()}].redistributionAllowed`,
      licenseId,
      code: 'invalid-license',
    });
    const derivativeAllowed = validateBoolean(rawLicense['derivativeAllowed'], errors, {
      field: `licenses[${index.toString()}].derivativeAllowed`,
      licenseId,
      code: 'invalid-license',
    });
    const spdx = validateOptionalTextField(
      rawLicense['spdx'],
      `licenses[${index.toString()}].spdx`,
      limits.maxVersionCodePoints,
      errors,
      { licenseId },
    );
    const url = validateOptionalTextField(
      rawLicense['url'],
      `licenses[${index.toString()}].url`,
      limits.maxDescriptionCodePoints,
      errors,
      { licenseId },
    );
    const attribution = validateOptionalTextField(
      rawLicense['attribution'],
      `licenses[${index.toString()}].attribution`,
      limits.maxDescriptionCodePoints,
      errors,
      { licenseId },
    );
    const notes = validateOptionalTextField(
      rawLicense['notes'],
      `licenses[${index.toString()}].notes`,
      limits.maxDescriptionCodePoints,
      errors,
      { licenseId },
    );

    if (options.requireRedistributableLicenses && redistributionAllowed === false) {
      errors.push(
        makeIssue(
          'invalid-license',
          `License ${licenseId ?? index.toString()} is not redistributable.`,
          {
            field: `licenses[${index.toString()}].redistributionAllowed`,
            licenseId,
          },
        ),
      );
    }

    if (
      id === undefined ||
      name === undefined ||
      source === undefined ||
      redistributionAllowed === undefined ||
      derivativeAllowed === undefined
    ) {
      continue;
    }

    licenses.push({
      id,
      name,
      source,
      redistributionAllowed,
      derivativeAllowed,
      ...(spdx !== undefined ? { spdx } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(attribution !== undefined ? { attribution } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
  }
  return licenses;
}

function validateSentences(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  options: { readonly licenseIds: ReadonlySet<string>; readonly requireHumanReview: boolean },
): EnrollmentSentenceV1[] {
  if (!Array.isArray(value)) {
    errors.push(makeIssue('invalid-field', 'sentences must be an array.', { field: 'sentences' }));
    return [];
  }
  if (value.length === 0) {
    errors.push(
      makeIssue('empty', 'sentences must include at least one sentence.', { field: 'sentences' }),
    );
    return [];
  }
  if (value.length > limits.maxSentences) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `sentences must include at most ${limits.maxSentences.toString()} entries.`,
        {
          field: 'sentences',
        },
      ),
    );
  }

  const seenIds = new Set<string>();
  const sentences: EnrollmentSentenceV1[] = [];
  for (const [index, rawSentence] of value.entries()) {
    if (!isRecord(rawSentence)) {
      errors.push(
        makeIssue('invalid-field', 'Enrollment sentence must be an object.', {
          field: `sentences[${index.toString()}]`,
        }),
      );
      continue;
    }

    const id = validateId(
      rawSentence['id'],
      `sentences[${index.toString()}].id`,
      limits.maxIdCodePoints,
      errors,
    );
    const sentenceId = id;
    if (id !== undefined) {
      if (seenIds.has(id)) {
        errors.push(
          makeIssue('duplicate', `Sentence id ${id} is duplicated.`, {
            field: `sentences[${index.toString()}].id`,
            sentenceId: id,
          }),
        );
      }
      seenIds.add(id);
    }

    const version = validatePositiveInteger(rawSentence['version'], errors, {
      field: `sentences[${index.toString()}].version`,
      sentenceId,
      code: 'invalid-version',
    });
    const text = validateTextField(
      rawSentence['text'],
      `sentences[${index.toString()}].text`,
      limits.maxSentenceTextCodePoints,
      errors,
      { sentenceId },
    );
    const language = validateLanguage(rawSentence['language'], errors, {
      field: `sentences[${index.toString()}].language`,
      sentenceId,
    });
    const normalizedText = validateNormalizedText(
      rawSentence['normalizedText'],
      text,
      limits,
      errors,
      {
        field: `sentences[${index.toString()}].normalizedText`,
        sentenceId,
      },
    );
    const allowedVoiceConditions = validateVoiceConditions(
      rawSentence['allowedVoiceConditions'],
      errors,
      { field: `sentences[${index.toString()}].allowedVoiceConditions`, sentenceId },
    );
    const estimatedSeconds = validateEstimatedSeconds(
      rawSentence['estimatedSeconds'],
      limits,
      errors,
      {
        field: `sentences[${index.toString()}].estimatedSeconds`,
        sentenceId,
      },
    );
    const difficulty = validateDifficulty(rawSentence['difficulty'], errors, {
      field: `sentences[${index.toString()}].difficulty`,
      sentenceId,
    });
    const tags = validateTags(rawSentence['tags'], limits, errors, {
      field: `sentences[${index.toString()}].tags`,
      sentenceId,
    });
    const repeatGroup = validateOptionalId(
      rawSentence['repeatGroup'],
      `sentences[${index.toString()}].repeatGroup`,
      limits.maxIdCodePoints,
      errors,
      { sentenceId },
    );
    const coverage = validateCoverage(rawSentence['coverage'], limits, errors, {
      field: `sentences[${index.toString()}].coverage`,
      sentenceId,
    });
    const licenseId = validateLicenseId(
      rawSentence['licenseId'],
      options.licenseIds,
      limits,
      errors,
      {
        field: `sentences[${index.toString()}].licenseId`,
        sentenceId,
      },
    );
    const review = validateReview(rawSentence['review'], limits, errors, {
      field: `sentences[${index.toString()}].review`,
      sentenceId,
      requireHumanReview: options.requireHumanReview,
    });

    if (
      id === undefined ||
      version === undefined ||
      text === undefined ||
      language === undefined ||
      normalizedText === undefined ||
      allowedVoiceConditions === undefined ||
      estimatedSeconds === undefined ||
      difficulty === undefined ||
      tags === undefined ||
      coverage === undefined ||
      licenseId === undefined ||
      review === undefined
    ) {
      continue;
    }

    sentences.push({
      id,
      version,
      text,
      language,
      normalizedText,
      allowedVoiceConditions,
      estimatedSeconds,
      difficulty,
      tags,
      ...(repeatGroup !== undefined ? { repeatGroup } : {}),
      coverage,
      licenseId,
      review,
    });
  }
  return sentences;
}

function validateHeldOutSentenceIds(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  options: { readonly sentenceIds: ReadonlySet<string>; readonly requireHeldOutSet: boolean },
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      makeIssue('invalid-field', 'heldOutSentenceIds must be an array.', {
        field: 'heldOutSentenceIds',
      }),
    );
    return undefined;
  }
  if (options.requireHeldOutSet && value.length === 0) {
    errors.push(
      makeIssue('empty', 'heldOutSentenceIds must reserve at least one sentence.', {
        field: 'heldOutSentenceIds',
      }),
    );
  }

  const seenIds = new Set<string>();
  const ids: string[] = [];
  for (const [index, rawId] of value.entries()) {
    const id = validateId(
      rawId,
      `heldOutSentenceIds[${index.toString()}]`,
      limits.maxIdCodePoints,
      errors,
    );
    if (id === undefined) continue;
    if (!options.sentenceIds.has(id)) {
      errors.push(
        makeIssue('invalid-id', `Held-out sentence id ${id} does not reference a sentence.`, {
          field: `heldOutSentenceIds[${index.toString()}]`,
          sentenceId: id,
        }),
      );
    }
    if (seenIds.has(id)) {
      errors.push(
        makeIssue('duplicate', `Held-out sentence id ${id} is duplicated.`, {
          field: `heldOutSentenceIds[${index.toString()}]`,
          sentenceId: id,
        }),
      );
    }
    seenIds.add(id);
    ids.push(id);
  }
  return ids;
}

function validateNormalizedText(
  value: unknown,
  text: string | undefined,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): string | undefined {
  const normalizedText = validateTextField(
    value,
    context.field ?? 'normalizedText',
    limits.maxSentenceTextCodePoints,
    errors,
    context,
  );
  if (normalizedText === undefined || text === undefined) return undefined;
  const expected = normalizeEnrollmentSentenceText(text);
  if (normalizedText !== expected) {
    errors.push(
      makeIssue(
        'invalid-field',
        'normalizedText must match the NFC-normalized sentence text.',
        context,
      ),
    );
  }
  return normalizedText;
}

function validateVoiceConditions(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): readonly EnrollmentVoiceCondition[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(
      makeIssue(
        'invalid-voice-condition',
        'allowedVoiceConditions must be a non-empty array.',
        context,
      ),
    );
    return undefined;
  }
  const seen = new Set<EnrollmentVoiceCondition>();
  const voiceConditions: EnrollmentVoiceCondition[] = [];
  for (const rawValue of value) {
    if (
      typeof rawValue !== 'string' ||
      !voiceConditionValues.has(rawValue as EnrollmentVoiceCondition)
    ) {
      errors.push(
        makeIssue(
          'invalid-voice-condition',
          `Voice condition ${String(rawValue)} is not supported.`,
          context,
        ),
      );
      continue;
    }
    const condition = rawValue as EnrollmentVoiceCondition;
    if (seen.has(condition)) {
      errors.push(makeIssue('duplicate', `Voice condition ${condition} is duplicated.`, context));
      continue;
    }
    seen.add(condition);
    voiceConditions.push(condition);
  }
  return voiceConditions.length === 0 ? undefined : voiceConditions;
}

function validateCoverage(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): EnrollmentSentenceCoverageV1 | undefined {
  if (!isRecord(value)) {
    errors.push(makeIssue('invalid-field', 'coverage must be an object.', context));
    return undefined;
  }

  const coverage: EnrollmentSentenceCoverageV1 = {
    ...optionalCoverageField(value, 'vietnameseInitials', limits, errors, context),
    ...optionalCoverageField(value, 'vietnameseRimes', limits, errors, context),
    ...optionalCoverageField(value, 'vietnameseTones', limits, errors, context),
    ...optionalCoverageField(value, 'englishPhones', limits, errors, context),
    ...optionalCoverageField(value, 'phoneBigrams', limits, errors, context),
    ...optionalCoverageField(value, 'punctuationForms', limits, errors, context),
    ...optionalCoverageField(value, 'languageSwitchPatterns', limits, errors, context),
  };

  if (Object.keys(coverage).length === 0) {
    errors.push(
      makeIssue(
        'missing-coverage',
        'coverage must include at least one coverage feature.',
        context,
      ),
    );
    return undefined;
  }
  return coverage;
}

function optionalCoverageField(
  value: Record<string, unknown>,
  key: keyof EnrollmentSentenceCoverageV1,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): Partial<Record<typeof key, readonly string[]>> {
  const rawField = value[key];
  if (rawField === undefined) return {};
  if (!Array.isArray(rawField)) {
    errors.push(
      makeIssue('invalid-field', `coverage.${key} must be an array.`, {
        ...context,
        field: `${context.field}.${key}`,
      }),
    );
    return {};
  }
  if (rawField.length > limits.maxCoverageValuesPerField) {
    errors.push(
      makeIssue('limit-exceeded', `coverage.${key} has too many values.`, {
        ...context,
        field: `${context.field}.${key}`,
      }),
    );
  }
  const values = normalizeStringArray(rawField, limits.maxCoverageValueCodePoints, errors, {
    ...context,
    field: `${context.field}.${key}`,
  });
  return values.length === 0 ? {} : { [key]: values };
}

function validateReview(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext & { readonly requireHumanReview: boolean },
): EnrollmentSentenceReviewV1 | undefined {
  if (!isRecord(value)) {
    errors.push(makeIssue('invalid-review', 'review must be an object.', context));
    return undefined;
  }
  const humanReviewed = validateBoolean(value['humanReviewed'], errors, {
    ...context,
    field: `${context.field}.humanReviewed`,
    code: 'invalid-review',
  });
  const reviewedAt = validateOptionalIsoTimestamp(
    value['reviewedAt'],
    `${context.field}.reviewedAt`,
    errors,
    context,
  );
  const reviewer = validateOptionalTextField(
    value['reviewer'],
    `${context.field}.reviewer`,
    limits.maxDisplayNameCodePoints,
    errors,
    context,
  );
  const notes = validateOptionalTextField(
    value['notes'],
    `${context.field}.notes`,
    limits.maxReviewNotesCodePoints,
    errors,
    context,
  );

  if (context.requireHumanReview && humanReviewed === false) {
    errors.push(
      makeIssue('invalid-review', 'Sentence must be human-reviewed before release.', context),
    );
  }
  if (humanReviewed === true && reviewedAt === undefined) {
    errors.push(
      makeIssue(
        'invalid-review',
        'review.reviewedAt is required when humanReviewed is true.',
        context,
      ),
    );
  }

  if (humanReviewed === undefined) return undefined;
  return {
    humanReviewed,
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    ...(reviewer !== undefined ? { reviewer } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

function validateLanguage(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): EnrollmentSentenceLanguage | undefined {
  if (typeof value !== 'string' || !languageValues.has(value as EnrollmentSentenceLanguage)) {
    errors.push(
      makeIssue(
        'invalid-language',
        `Sentence language ${String(value)} is not supported.`,
        context,
      ),
    );
    return undefined;
  }
  return value as EnrollmentSentenceLanguage;
}

function validateLicenseSource(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): EnrollmentSentenceLicenseSource | undefined {
  if (
    typeof value !== 'string' ||
    !licenseSourceValues.has(value as EnrollmentSentenceLicenseSource)
  ) {
    errors.push(
      makeIssue('invalid-license', `License source ${String(value)} is not supported.`, context),
    );
    return undefined;
  }
  return value as EnrollmentSentenceLicenseSource;
}

function validateLicenseId(
  value: unknown,
  licenseIds: ReadonlySet<string>,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): string | undefined {
  const id = validateId(value, context.field ?? 'licenseId', limits.maxIdCodePoints, errors, {
    ...context,
    code: 'invalid-license',
  });
  if (id !== undefined && !licenseIds.has(id)) {
    errors.push(
      makeIssue('invalid-license', `License id ${id} does not reference a license.`, context),
    );
  }
  return id;
}

function validateDifficulty(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): EnrollmentSentenceDifficulty | undefined {
  if (value !== 1 && value !== 2 && value !== 3) {
    errors.push(makeIssue('invalid-field', 'difficulty must be 1, 2, or 3.', context));
    return undefined;
  }
  return value;
}

function validateEstimatedSeconds(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): number | undefined {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > limits.maxEstimatedSeconds
  ) {
    errors.push(
      makeIssue(
        'invalid-field',
        `estimatedSeconds must be greater than 0 and at most ${limits.maxEstimatedSeconds.toString()}.`,
        context,
      ),
    );
    return undefined;
  }
  return value;
}

function validateTags(
  value: unknown,
  limits: EnrollmentSentenceBankLimits,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(makeIssue('invalid-field', 'tags must be an array.', context));
    return undefined;
  }
  if (value.length > limits.maxTagsPerSentence) {
    errors.push(
      makeIssue(
        'limit-exceeded',
        `tags must include at most ${limits.maxTagsPerSentence.toString()} entries.`,
        context,
      ),
    );
  }
  return normalizeStringArray(value, limits.maxTagCodePoints, errors, context);
}

function normalizeStringArray(
  value: readonly unknown[],
  maxCodePoints: number,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext,
): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawItem of value) {
    if (typeof rawItem !== 'string') {
      errors.push(makeIssue('invalid-field', 'Array values must be strings.', context));
      continue;
    }
    const item = normalizeEnrollmentSentenceText(rawItem);
    if (item.length === 0) {
      errors.push(makeIssue('empty', 'Array values must not be empty.', context));
      continue;
    }
    if (countCodePoints(item) > maxCodePoints) {
      errors.push(makeIssue('limit-exceeded', 'Array value is too long.', context));
      continue;
    }
    if (seen.has(item)) {
      errors.push(makeIssue('duplicate', `Array value ${item} is duplicated.`, context));
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function validateTextField(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext & { readonly emptyCode?: EnrollmentSentenceBankIssueCode } = {},
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(makeIssue('invalid-field', `${field} must be a string.`, { ...context, field }));
    return undefined;
  }
  const normalized = normalizeEnrollmentSentenceText(value);
  if (normalized.length === 0) {
    errors.push(
      makeIssue(context.emptyCode ?? 'empty', `${field} must not be empty.`, { ...context, field }),
    );
    return undefined;
  }
  if (countCodePoints(normalized) > maxCodePoints) {
    errors.push(makeIssue('limit-exceeded', `${field} is too long.`, { ...context, field }));
    return undefined;
  }
  return normalized;
}

function validateOptionalTextField(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext = {},
): string | undefined {
  if (value === undefined) return undefined;
  return validateTextField(value, field, maxCodePoints, errors, context);
}

function validateId(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext & { readonly code?: EnrollmentSentenceBankIssueCode } = {},
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(
      makeIssue(context.code ?? 'invalid-id', `${field} must be a string id.`, {
        ...context,
        field,
      }),
    );
    return undefined;
  }
  const normalized = normalizeEnrollmentSentenceText(value);
  if (!idPattern.test(normalized) || countCodePoints(normalized) > maxCodePoints) {
    errors.push(
      makeIssue(context.code ?? 'invalid-id', `${field} has invalid id format.`, {
        ...context,
        field,
      }),
    );
    return undefined;
  }
  return normalized;
}

function validateOptionalId(
  value: unknown,
  field: string,
  maxCodePoints: number,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext = {},
): string | undefined {
  if (value === undefined) return undefined;
  return validateId(value, field, maxCodePoints, errors, context);
}

function validatePositiveInteger(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext & { readonly code?: EnrollmentSentenceBankIssueCode },
): number | undefined {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(
      makeIssue(
        context.code ?? 'invalid-field',
        `${context.field ?? 'value'} must be a positive integer.`,
        context,
      ),
    );
    return undefined;
  }
  return value as number;
}

function validateBoolean(
  value: unknown,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext & { readonly code?: EnrollmentSentenceBankIssueCode },
): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors.push(
      makeIssue(
        context.code ?? 'invalid-field',
        `${context.field ?? 'value'} must be a boolean.`,
        context,
      ),
    );
    return undefined;
  }
  return value;
}

function validateIsoTimestamp(
  value: unknown,
  field: string,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext = {},
): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(
      makeIssue('invalid-timestamp', `${field} must be an ISO timestamp.`, { ...context, field }),
    );
    return undefined;
  }
  return value;
}

function validateOptionalIsoTimestamp(
  value: unknown,
  field: string,
  errors: EnrollmentSentenceBankIssue[],
  context: IssueContext = {},
): string | undefined {
  if (value === undefined) return undefined;
  return validateIsoTimestamp(value, field, errors, context);
}

function resolveLimits(
  limits: Partial<EnrollmentSentenceBankLimits> | undefined,
): EnrollmentSentenceBankLimits {
  return { ...defaultEnrollmentSentenceBankLimits, ...(limits ?? {}) };
}

interface IssueContext {
  readonly field?: string | undefined;
  readonly sentenceId?: string | undefined;
  readonly licenseId?: string | undefined;
}

function makeIssue(
  code: EnrollmentSentenceBankIssueCode,
  message: string,
  context: IssueContext = {},
): EnrollmentSentenceBankIssue {
  return {
    code,
    message,
    ...(context.field !== undefined ? { field: context.field } : {}),
    ...(context.sentenceId !== undefined ? { sentenceId: context.sentenceId } : {}),
    ...(context.licenseId !== undefined ? { licenseId: context.licenseId } : {}),
  };
}

function countCodePoints(value: string): number {
  return [...value].length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
