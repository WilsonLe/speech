import { forwardRef, useId, type FieldsetHTMLAttributes } from 'react';
import type {
  SpeechFieldSize,
  SpeechRadioGroupOption,
  SpeechRadioGroupOrientation,
} from './contracts';

export interface RadioGroupProps extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  'children' | 'onChange'
> {
  readonly label: string;
  readonly options: readonly SpeechRadioGroupOption[];
  readonly controlSize?: SpeechFieldSize;
  readonly defaultValue?: string;
  readonly error?: string;
  readonly hint?: string;
  readonly name?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: SpeechRadioGroupOrientation;
  readonly value?: string;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(function RadioGroup(
  {
    className,
    controlSize = 'md',
    defaultValue,
    disabled,
    error,
    hint,
    id,
    label,
    name,
    onValueChange,
    options,
    orientation = 'vertical',
    value,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const resolvedId = id ?? `${generatedId}-radio-group`;
  const resolvedName = name ?? resolvedId;
  const hintId = hint ? `${resolvedId}-hint` : undefined;
  const errorId = error ? `${resolvedId}-error` : undefined;
  const describedBy = mergeAriaDescriptions(props['aria-describedby'], hintId, errorId);
  const isControlled = value !== undefined;
  const classes = ['speech-field', 'speech-radio-group', className].filter(Boolean).join(' ');

  return (
    <fieldset
      {...props}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={classes}
      data-orientation={orientation}
      data-size={controlSize}
      disabled={disabled}
      id={resolvedId}
      ref={ref}
    >
      <legend className="speech-field__label">{label}</legend>
      {hint ? (
        <p className="speech-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="speech-radio-group__options">
        {options.map((option, index) => {
          const optionId = buildRadioOptionDomId(resolvedId, index, option.value);
          const optionDescriptionId = option.description ? `${optionId}-description` : undefined;
          const checkedProps = isControlled
            ? { checked: value === option.value }
            : { defaultChecked: defaultValue === option.value };

          return (
            <div className="speech-radio-group__option" key={option.value}>
              <input
                {...checkedProps}
                aria-describedby={optionDescriptionId}
                className="speech-radio-group__input"
                disabled={option.disabled}
                id={optionId}
                name={resolvedName}
                onChange={() => onValueChange?.(option.value)}
                type="radio"
                value={option.value}
              />
              <label className="speech-radio-group__label" htmlFor={optionId}>
                <span className="speech-radio-group__label-text">{option.label}</span>
                {option.description ? (
                  <span className="speech-radio-group__description" id={optionDescriptionId}>
                    {option.description}
                  </span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="speech-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
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

function buildRadioOptionDomId(rootId: string, index: number, optionValue: string): string {
  const safeValue =
    optionValue.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'option';

  return `${rootId}-option-${index}-${safeValue}`;
}
