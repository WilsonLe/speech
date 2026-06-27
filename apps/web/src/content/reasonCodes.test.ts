import { describe, expect, it } from 'vitest';

import {
  formatModelReasonMessage,
  formatVocabularyValidationErrors,
  getModelReasonCopy,
  getVocabularyOperationReasonCopy,
  getVocabularyValidationReasonCopy,
  modelReasonCodes,
  vocabularyOperationReasonCodes,
  vocabularyValidationReasonCodes,
} from './reasonCodes';

const forbiddenDefaultJargon =
  /\b(trie|automaton|token path|tokenizer|parser|schema parse|OPFS|WER|CER|WebGPU|WASM|gate|adapter|profile IDs?|profile identifiers?|model IDs?|model identifiers?|entry IDs?|hash(?:es)?|storage paths?|base model|localStorage|private vocabulary)\b/iu;

describe('user-facing reason-code copy', () => {
  it('keeps vocabulary validation codes stable and maps them to actionable plain copy', () => {
    expect(vocabularyValidationReasonCodes).toEqual([
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
    ]);

    for (const code of vocabularyValidationReasonCodes) {
      const copy = getVocabularyValidationReasonCopy(code);
      expect(copy.schemaVersion).toBe(1);
      expect(copy.title).not.toHaveLength(0);
      expect(copy.message).not.toHaveLength(0);
      expect(copy.action).not.toHaveLength(0);
      if (copy.audience === 'default') {
        expect(`${copy.title} ${copy.message} ${copy.action}`).not.toMatch(forbiddenDefaultJargon);
      }
    }
  });

  it('maps validation errors to field labels without raw schema/parser wording', () => {
    const message = formatVocabularyValidationErrors([
      { code: 'duplicate', field: 'entries.0.phrase' },
      { code: 'invalid-weight', field: 'weight' },
      { code: 'invalid-field', field: 'schemaVersion' },
    ]);

    expect(message).toContain(
      'This word or spoken variant already matches another word in the set.',
    );
    expect(message).toContain('(word list).');
    expect(message).toContain('(strength).');
    expect(message).toContain('(file version).');
    expect(message).not.toMatch(/schema parse|Zod|tokenizer|automaton|entry ID/iu);
  });

  it('keeps vocabulary operation reasons stable and free of hidden technical jargon', () => {
    expect(vocabularyOperationReasonCodes).toContain('vocabulary-import-json-unreadable');
    expect(vocabularyOperationReasonCodes).toContain('vocabulary-import-csv-words-imported');

    for (const code of vocabularyOperationReasonCodes) {
      const copy = getVocabularyOperationReasonCopy(code);
      expect(copy.audience).toBe('default');
      expect(`${copy.title} ${copy.message} ${copy.action}`).not.toMatch(forbiddenDefaultJargon);
    }
  });

  it('keeps model reason codes stable and default copy aggregate-only', () => {
    expect(modelReasonCodes).toEqual([
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
    ]);

    for (const code of modelReasonCodes) {
      const copy = getModelReasonCopy(code);
      expect(copy.schemaVersion).toBe(1);
      expect(copy.audience).toBe('default');
      expect(`${copy.title} ${copy.message} ${copy.action}`).not.toMatch(forbiddenDefaultJargon);
      expect(`${copy.message} ${copy.action}`).not.toMatch(
        /raw audio|checkpoint|profile-[a-z0-9-]+/iu,
      );
    }
  });

  it('formats model reasons as concise issue-plus-action messages', () => {
    expect(formatModelReasonMessage('model-runtime-check-failed')).toBe(
      'The local speech check did not complete. Try again. If it still fails, open Diagnostics.',
    );
    expect(formatModelReasonMessage('model-quality-blocked')).toBe(
      'Required quality checks did not pass. Record more speech or keep the current model active.',
    );
  });
});
