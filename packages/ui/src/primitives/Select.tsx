import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import type { SpeechFieldSize, SpeechSelectOption } from './contracts';

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'size'
> {
  readonly label: string;
  readonly options: readonly SpeechSelectOption[];
  readonly controlSize?: SpeechFieldSize;
  readonly error?: string;
  readonly hint?: string;
  readonly selectId?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, controlSize = 'md', disabled, error, hint, id, label, options, selectId, ...props },
  ref,
) {
  const generatedId = useId();
  const resolvedId = selectId ?? id ?? `${generatedId}-select`;
  const hintId = hint ? `${resolvedId}-hint` : undefined;
  const errorId = error ? `${resolvedId}-error` : undefined;
  const describedBy = mergeAriaDescriptions(props['aria-describedby'], hintId, errorId);
  const classes = ['speech-field', 'speech-select-field', className].filter(Boolean).join(' ');

  return (
    <div className={classes} data-size={controlSize}>
      <label className="speech-field__label" htmlFor={resolvedId}>
        {label}
      </label>
      {hint ? (
        <p className="speech-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <span className="speech-select-field__control-wrap">
        <select
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="speech-select-field__control"
          disabled={disabled}
          id={resolvedId}
          ref={ref}
        >
          {options.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="speech-select-field__chevron" />
      </span>
      {error ? (
        <p className="speech-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
});

function mergeAriaDescriptions(
  existing: string | undefined,
  ...ids: Array<string | undefined>
): string | undefined {
  const mergedIds = [...(existing?.split(/\s+/).filter(Boolean) ?? []), ...ids.filter(Boolean)];

  if (mergedIds.length === 0) {
    return undefined;
  }

  return [...new Set(mergedIds)].join(' ');
}
