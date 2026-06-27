import type { VocabularyError, VocabularyErrorCode } from '@speech/protocol';

export interface UserFacingReasonCopyV1 {
  readonly schemaVersion: 1;
  readonly title: string;
  readonly message: string;
  readonly action: string;
  readonly audience: 'default' | 'advanced' | 'diagnostics';
}

export const vocabularyValidationReasonCodes = [
  'empty',
  'overlong',
  'unknown-only',
  'duplicate',
  'limit-exceeded',
  'invalid-schema-version',
  'invalid-id',
  'invalid-language',
  'invalid-weight',
  'invalid-priority',
  'invalid-revision',
  'invalid-timestamp',
  'invalid-field',
  'unsupported-language',
  'unsupported-context-biasing',
] as const satisfies readonly VocabularyErrorCode[];

export const vocabularyOperationReasonCodes = [
  'vocabulary-validation-ok',
  'vocabulary-set-name-required',
  'vocabulary-keep-one-set',
  'vocabulary-set-not-found',
  'vocabulary-word-not-found',
  'vocabulary-import-json-shape',
  'vocabulary-import-json-unreadable',
  'vocabulary-import-json-store-imported',
  'vocabulary-import-json-set-imported',
  'vocabulary-import-json-words-imported',
  'vocabulary-import-csv-empty',
  'vocabulary-import-csv-header',
  'vocabulary-import-csv-words-imported',
  'vocabulary-store-created',
  'vocabulary-store-loaded',
  'vocabulary-store-reset',
  'vocabulary-store-unreadable',
] as const;

export const modelReasonCodes = [
  'model-profiles-loading',
  'model-profile-refresh-started',
  'model-profiles-empty',
  'model-profiles-loaded',
  'model-profiles-load-failed',
  'model-runtime-check-idle',
  'model-runtime-check-started',
  'model-runtime-check-passed',
  'model-runtime-check-failed',
  'model-enable-started',
  'model-deactivate-started',
  'model-rollback-started',
  'model-lifecycle-refreshed',
  'model-delete-started',
  'model-delete-complete',
  'model-export-started',
  'model-export-complete',
  'model-export-failed',
  'model-import-started',
  'model-import-failed',
  'model-duplicate-started',
  'model-duplicate-failed',
  'model-rename-started',
  'model-rename-complete',
  'model-rename-failed',
  'model-lifecycle-failed',
  'model-capability-check-failed',
  'model-companion-check-failed',
  'model-import-deduped-existing',
  'model-imported-new',
  'model-imported-name-collision',
  'model-replaced-existing',
  'model-quality-awaiting-evaluation',
  'model-quality-automatic-ready',
  'model-quality-review-required',
  'model-quality-review-accepted',
  'model-quality-blocked',
] as const;

export type VocabularyOperationReasonCode = (typeof vocabularyOperationReasonCodes)[number];
export type ModelReasonCode = (typeof modelReasonCodes)[number];

const vocabularyValidationReasonCopies = {
  empty: createDefaultReasonCopy({
    title: 'Required word is missing',
    message: 'A vocabulary word or name is empty.',
    action: 'Enter the missing text, then save again.',
  }),
  overlong: createDefaultReasonCopy({
    title: 'Text is too long',
    message: 'A vocabulary value is longer than this app can store safely.',
    action: 'Shorten the word, name, variant, or category, then try again.',
  }),
  'unknown-only': createAdvancedReasonCopy({
    title: 'Word cannot be matched',
    message: 'This word cannot be prepared for the current speech model.',
    action: 'Try a spoken variant or use a shorter spelling.',
  }),
  duplicate: createDefaultReasonCopy({
    title: 'Duplicate word',
    message: 'This word or spoken variant already matches another word in the set.',
    action: 'Edit the duplicate or remove one copy.',
  }),
  'limit-exceeded': createDefaultReasonCopy({
    title: 'Too many items',
    message: 'This vocabulary set is over a supported limit.',
    action: 'Turn off or remove extra words, variants, recordings, or sets, then try again.',
  }),
  'invalid-schema-version': createDefaultReasonCopy({
    title: 'Unsupported vocabulary file',
    message: 'This vocabulary file uses a version this app cannot open.',
    action: 'Export it again from a compatible Speech version, then import that file.',
  }),
  'invalid-id': createAdvancedReasonCopy({
    title: 'Vocabulary file needs repair',
    message: 'A saved vocabulary identifier is missing or uses unsupported characters.',
    action: 'Export a fresh copy or recreate the affected word or set.',
  }),
  'invalid-language': createDefaultReasonCopy({
    title: 'Choose a supported language',
    message: 'A vocabulary word uses a language choice this app does not support.',
    action: 'Choose Auto, Vietnamese, English, or Mixed, then save again.',
  }),
  'invalid-weight': createDefaultReasonCopy({
    title: 'Choose a valid strength',
    message: 'A vocabulary strength value is outside the supported range.',
    action: 'Use the strength control in Advanced, then save again.',
  }),
  'invalid-priority': createDefaultReasonCopy({
    title: 'Choose a valid prompt priority',
    message: 'A prompt priority must be a whole number in the supported range.',
    action: 'Clear the priority or enter a non-negative whole number.',
  }),
  'invalid-revision': createAdvancedReasonCopy({
    title: 'Vocabulary file needs repair',
    message: 'A saved vocabulary revision is not valid.',
    action: 'Export a fresh copy or recreate the affected set.',
  }),
  'invalid-timestamp': createAdvancedReasonCopy({
    title: 'Vocabulary file needs repair',
    message: 'A saved vocabulary date is not valid.',
    action: 'Export a fresh copy or recreate the affected set.',
  }),
  'invalid-field': createDefaultReasonCopy({
    title: 'Vocabulary file format is not supported',
    message: 'A vocabulary field has the wrong shape or value.',
    action: 'Export a sample file from this app, then copy your words into that format.',
  }),
  'unsupported-language': createDefaultReasonCopy({
    title: 'Language not available for this model',
    message: 'The active speech model cannot use this vocabulary language.',
    action: 'Change the word language or choose a compatible speech model.',
  }),
  'unsupported-context-biasing': createDefaultReasonCopy({
    title: 'Vocabulary is not available for this model',
    message: 'The active speech model cannot use vocabulary hints.',
    action: 'Turn off the word or choose a compatible speech model.',
  }),
} satisfies Record<VocabularyErrorCode, UserFacingReasonCopyV1>;

const vocabularyOperationReasonCopies = {
  'vocabulary-validation-ok': createDefaultReasonCopy({
    title: 'Vocabulary ready',
    message: 'Vocabulary looks ready. Matching is checked before the next recording.',
    action: 'Record when you are ready.',
  }),
  'vocabulary-set-name-required': createDefaultReasonCopy({
    title: 'Name the set',
    message: 'A vocabulary set needs a name.',
    action: 'Enter a name, then create the set.',
  }),
  'vocabulary-keep-one-set': createDefaultReasonCopy({
    title: 'Keep one set',
    message: 'At least one local vocabulary set must remain.',
    action: 'Create another set before deleting this one.',
  }),
  'vocabulary-set-not-found': createDefaultReasonCopy({
    title: 'Set not found',
    message: 'This vocabulary set is no longer available.',
    action: 'Choose another set or create a new one.',
  }),
  'vocabulary-word-not-found': createDefaultReasonCopy({
    title: 'Word not found',
    message: 'This word is no longer in the selected set.',
    action: 'Choose another word or add it again.',
  }),
  'vocabulary-import-json-shape': createDefaultReasonCopy({
    title: 'Use a vocabulary JSON file',
    message: 'JSON import must contain a vocabulary store, set, or word list.',
    action: 'Export a sample JSON file, then copy your words into that format.',
  }),
  'vocabulary-import-json-unreadable': createDefaultReasonCopy({
    title: 'JSON could not be read',
    message: 'The pasted JSON is not readable by this app.',
    action: 'Check the file text, then import again.',
  }),
  'vocabulary-import-json-store-imported': createDefaultReasonCopy({
    title: 'Vocabulary imported',
    message: 'Imported the vocabulary JSON store locally.',
    action: 'Review enabled sets before recording.',
  }),
  'vocabulary-import-json-set-imported': createDefaultReasonCopy({
    title: 'Set imported',
    message: 'Imported the vocabulary JSON set locally.',
    action: 'Review its words before recording.',
  }),
  'vocabulary-import-json-words-imported': createDefaultReasonCopy({
    title: 'Words imported',
    message: 'Imported vocabulary JSON words locally.',
    action: 'Review them before recording.',
  }),
  'vocabulary-import-csv-empty': createDefaultReasonCopy({
    title: 'CSV is empty',
    message: 'The CSV import does not contain any rows.',
    action: 'Paste exported vocabulary rows, then import again.',
  }),
  'vocabulary-import-csv-header': createDefaultReasonCopy({
    title: 'CSV columns do not match',
    message: 'The CSV import does not use the vocabulary column template.',
    action: 'Export a CSV sample, then copy your rows into that format.',
  }),
  'vocabulary-import-csv-words-imported': createDefaultReasonCopy({
    title: 'Words imported',
    message: 'Imported vocabulary CSV words locally.',
    action: 'Review them before recording.',
  }),
  'vocabulary-store-created': createDefaultReasonCopy({
    title: 'Vocabulary created',
    message: 'Created a local vocabulary store.',
    action: 'Add a word when you are ready.',
  }),
  'vocabulary-store-loaded': createDefaultReasonCopy({
    title: 'Vocabulary loaded',
    message: 'Loaded local vocabulary.',
    action: 'Add, edit, or enable words as needed.',
  }),
  'vocabulary-store-reset': createDefaultReasonCopy({
    title: 'Vocabulary was reset',
    message: 'Saved vocabulary could not be used and was reset locally.',
    action: 'Import a valid backup or add your words again.',
  }),
  'vocabulary-store-unreadable': createDefaultReasonCopy({
    title: 'Vocabulary could not be read',
    message: 'Saved vocabulary could not be read and was reset locally.',
    action: 'Import a valid backup or add your words again.',
  }),
} satisfies Record<VocabularyOperationReasonCode, UserFacingReasonCopyV1>;

const modelReasonCopies = {
  'model-profiles-loading': createDefaultReasonCopy({
    title: 'Loading voice models',
    message: 'Refreshing local voice models and vocabulary counts.',
    action: 'Wait for the local check to finish.',
  }),
  'model-profile-refresh-started': createDefaultReasonCopy({
    title: 'Refreshing voice models',
    message: 'Refreshing local voice models and vocabulary counts.',
    action: 'Wait for the local check to finish.',
  }),
  'model-profiles-empty': createDefaultReasonCopy({
    title: 'Generic model active',
    message: 'No voice model is stored yet. The generic speech model is active.',
    action: 'Record enrollment takes to create a voice model.',
  }),
  'model-profiles-loaded': createDefaultReasonCopy({
    title: 'Voice models loaded',
    message: 'Loaded local voice models from this device.',
    action: 'Choose a model or continue recording.',
  }),
  'model-profiles-load-failed': createDefaultReasonCopy({
    title: 'Voice models could not load',
    message: 'Local voice models could not be read.',
    action: 'Refresh the page. If this continues, open Diagnostics.',
  }),
  'model-runtime-check-idle': createDefaultReasonCopy({
    title: 'Local speech check not run',
    message: 'The local speech check has not run yet.',
    action: 'Run the check when you need readiness details.',
  }),
  'model-runtime-check-started': createDefaultReasonCopy({
    title: 'Checking local speech',
    message: 'Checking local speech processing for voice models.',
    action: 'Wait for the check to finish.',
  }),
  'model-runtime-check-passed': createDefaultReasonCopy({
    title: 'Local speech check passed',
    message: 'Local speech processing is ready for voice models.',
    action: 'Continue with the next model task.',
  }),
  'model-runtime-check-failed': createDefaultReasonCopy({
    title: 'Local speech check failed',
    message: 'The local speech check did not complete.',
    action: 'Try again. If it still fails, open Diagnostics.',
  }),
  'model-enable-started': createDefaultReasonCopy({
    title: 'Using voice model',
    message: 'Switching to this voice model at a safe boundary.',
    action: 'Finish the current utterance before recording again.',
  }),
  'model-deactivate-started': createDefaultReasonCopy({
    title: 'Using generic model',
    message: 'Switching back to the generic speech model at a safe boundary.',
    action: 'Record again after the switch finishes.',
  }),
  'model-rollback-started': createDefaultReasonCopy({
    title: 'Rolling back voice model',
    message: 'Switching back to the previous voice model at a safe boundary.',
    action: 'Keep the current model until the switch finishes.',
  }),
  'model-lifecycle-refreshed': createDefaultReasonCopy({
    title: 'Voice model state refreshed',
    message: 'Local voice model state was refreshed.',
    action: 'Continue with the next model task.',
  }),
  'model-delete-started': createDefaultReasonCopy({
    title: 'Deleting voice model',
    message: 'Deleting local recordings, training data, and model files for this voice model.',
    action: 'Keep this page open until deletion finishes.',
  }),
  'model-delete-complete': createDefaultReasonCopy({
    title: 'Voice model deleted',
    message: 'Stored recordings, training data, model files, and local pointers were deleted.',
    action: 'Use the generic model or create another voice model.',
  }),
  'model-export-started': createDefaultReasonCopy({
    title: 'Preparing export',
    message: 'Preparing a sensitive local voice model export.',
    action: 'Keep this page open until the download starts.',
  }),
  'model-export-complete': createDefaultReasonCopy({
    title: 'Export downloaded',
    message: 'Voice model export downloaded locally.',
    action: 'Treat the downloaded file as sensitive voice data outside this browser.',
  }),
  'model-export-failed': createDefaultReasonCopy({
    title: 'Export failed',
    message: 'The voice model export could not finish.',
    action: 'Try again, or open Diagnostics if it keeps failing.',
  }),
  'model-import-started': createDefaultReasonCopy({
    title: 'Importing voice model',
    message: 'Importing and checking a sensitive local voice model file.',
    action: 'Keep this page open until checks finish.',
  }),
  'model-import-failed': createDefaultReasonCopy({
    title: 'Import failed',
    message: 'The voice model import could not finish.',
    action: 'Choose a valid local model export, then try again.',
  }),
  'model-duplicate-started': createDefaultReasonCopy({
    title: 'Duplicating voice model',
    message: 'Creating a local copy without downloading or uploading files.',
    action: 'Review the copied voice model before using it.',
  }),
  'model-duplicate-failed': createDefaultReasonCopy({
    title: 'Duplicate failed',
    message: 'The voice model copy could not be created.',
    action: 'Try again, or export and import the model manually.',
  }),
  'model-rename-started': createDefaultReasonCopy({
    title: 'Renaming voice model',
    message: 'Updating the local voice model name.',
    action: 'Wait for the local update to finish.',
  }),
  'model-rename-complete': createDefaultReasonCopy({
    title: 'Voice model renamed',
    message: 'The local voice model name was updated.',
    action: 'Continue with the next model task.',
  }),
  'model-rename-failed': createDefaultReasonCopy({
    title: 'Rename failed',
    message: 'The voice model name could not be updated.',
    action: 'Choose a different name, then try again.',
  }),
  'model-lifecycle-failed': createDefaultReasonCopy({
    title: 'Model action failed',
    message: 'The local voice model action could not finish.',
    action: 'Try again, or keep using the current model.',
  }),
  'model-capability-check-failed': createDefaultReasonCopy({
    title: 'Readiness check failed',
    message: 'The local readiness check did not complete.',
    action: 'Try again, or open Diagnostics if it keeps failing.',
  }),
  'model-companion-check-failed': createDefaultReasonCopy({
    title: 'Support-file check failed',
    message: 'Training support files could not be checked.',
    action: 'Try again, or open Diagnostics if it keeps failing.',
  }),
  'model-import-deduped-existing': createDefaultReasonCopy({
    title: 'Existing model found',
    message: 'Import matched an existing voice model, so no duplicate files were written.',
    action: 'Use the existing model or import as new.',
  }),
  'model-imported-new': createDefaultReasonCopy({
    title: 'Model imported',
    message: 'Import checks passed and a new local voice model was created.',
    action: 'Review the model before using it.',
  }),
  'model-imported-name-collision': createDefaultReasonCopy({
    title: 'Model imported with a new name',
    message: 'Import checks passed and the display-name conflict was resolved.',
    action: 'Review the new model name before using it.',
  }),
  'model-replaced-existing': createDefaultReasonCopy({
    title: 'Model replaced',
    message: 'Import checks passed and replaced the matching local voice model.',
    action: 'Review the model before using it.',
  }),
  'model-quality-awaiting-evaluation': createDefaultReasonCopy({
    title: 'Quality check needed',
    message: 'Run quality checks before using this voice model for dictation.',
    action: 'Review results when the check is available.',
  }),
  'model-quality-automatic-ready': createDefaultReasonCopy({
    title: 'Quality checks passed',
    message: 'This voice model can be used at the next utterance boundary.',
    action: 'Use the model when you are ready.',
  }),
  'model-quality-review-required': createDefaultReasonCopy({
    title: 'Review recommended',
    message: 'Required checks passed, but advisory checks need review before use.',
    action: 'Review the results before using this model.',
  }),
  'model-quality-review-accepted': createDefaultReasonCopy({
    title: 'Review accepted',
    message: 'This voice model can be used with your explicit review decision.',
    action: 'Keep rollback available after using it.',
  }),
  'model-quality-blocked': createDefaultReasonCopy({
    title: 'More work needed',
    message: 'Required quality checks did not pass.',
    action: 'Record more speech or keep the current model active.',
  }),
} satisfies Record<ModelReasonCode, UserFacingReasonCopyV1>;

export function getVocabularyValidationReasonCopy(
  code: VocabularyErrorCode,
): UserFacingReasonCopyV1 {
  return vocabularyValidationReasonCopies[code];
}

export function getVocabularyOperationReasonCopy(
  code: VocabularyOperationReasonCode,
): UserFacingReasonCopyV1 {
  return vocabularyOperationReasonCopies[code];
}

export function getModelReasonCopy(code: ModelReasonCode): UserFacingReasonCopyV1 {
  return modelReasonCopies[code];
}

export function formatVocabularyValidationErrors(
  errors: readonly Pick<VocabularyError, 'code' | 'field'>[],
): string {
  if (errors.length === 0) {
    return getVocabularyOperationReasonCopy('vocabulary-validation-ok').message;
  }
  const messages = new Set<string>();
  for (const error of errors) {
    const copy = getVocabularyValidationReasonCopy(error.code);
    const fieldLabel = formatVocabularyFieldLabel(error.field);
    messages.add(`${copy.message}${fieldLabel === null ? '' : ` (${fieldLabel}).`} ${copy.action}`);
  }
  return [...messages].join(' ');
}

export function describeVocabularyValidationErrors(
  errors: readonly Pick<VocabularyError, 'code' | 'field'>[],
): readonly UserFacingReasonCopyV1[] {
  if (errors.length === 0) return [getVocabularyOperationReasonCopy('vocabulary-validation-ok')];
  return errors.map((error) => getVocabularyValidationReasonCopy(error.code));
}

export function formatModelReasonMessage(code: ModelReasonCode): string {
  const copy = getModelReasonCopy(code);
  return `${copy.message} ${copy.action}`;
}

function createDefaultReasonCopy({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action: string;
}): UserFacingReasonCopyV1 {
  return { schemaVersion: 1, title, message, action, audience: 'default' };
}

function createAdvancedReasonCopy({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action: string;
}): UserFacingReasonCopyV1 {
  return { schemaVersion: 1, title, message, action, audience: 'advanced' };
}

function formatVocabularyFieldLabel(field: string | undefined): string | null {
  const baseField = field?.split('.')[0];
  switch (baseField) {
    case undefined:
      return null;
    case 'displayName':
      return 'set name';
    case 'phrase':
      return 'word';
    case 'displayForm':
      return 'display text';
    case 'spokenAliases':
      return 'spoken variants';
    case 'entries':
      return 'word list';
    case 'sets':
      return 'set list';
    case 'activeSetIds':
      return 'enabled sets';
    case 'promptPriority':
      return 'prompt priority';
    case 'pronunciationRecordingIds':
      return 'pronunciation recordings';
    case 'language':
      return 'language';
    case 'enabled':
      return 'enabled state';
    case 'weight':
      return 'strength';
    case 'schemaVersion':
      return 'file version';
    case 'revision':
      return 'saved revision';
    case 'source':
      return 'source';
    case 'id':
      return 'saved identifier';
    default:
      return 'field';
  }
}
