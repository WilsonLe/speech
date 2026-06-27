import { type HTMLAttributes, type ReactNode } from 'react';
import { getProgressPercentage, type SpeechProgressSize } from './contracts';
import { mergeAriaDescriptions, mergeClassNames, useResolvedId } from './shared';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly description?: ReactNode;
  readonly descriptionId?: string;
  readonly label: ReactNode;
  readonly labelId?: string;
  readonly max?: number;
  readonly progressId?: string;
  readonly size?: SpeechProgressSize;
  readonly value?: number;
  readonly valueText?: string;
}

export function Progress({
  className,
  description,
  descriptionId,
  label,
  labelId,
  max = 100,
  progressId,
  size = 'md',
  value,
  valueText,
  ...props
}: ProgressProps) {
  const resolvedProgressId = useResolvedId(progressId, 'progress');
  const resolvedLabelId = useResolvedId(labelId, 'progress-label');
  const generatedDescriptionId = useResolvedId(descriptionId, 'progress-description');
  const resolvedDescriptionId = description ? generatedDescriptionId : undefined;
  const percentage = value === undefined ? undefined : getProgressPercentage(value, max);
  const resolvedValueText = valueText ?? formatProgressValueText(percentage);
  const describedBy = mergeAriaDescriptions(
    props['aria-describedby'],
    resolvedDescriptionId,
    resolvedValueText ? `${resolvedProgressId}-value` : undefined,
  );

  return (
    <div {...props} className={mergeClassNames('speech-progress', className)} data-size={size}>
      <div className="speech-progress__header">
        <label className="speech-progress__label" htmlFor={resolvedProgressId} id={resolvedLabelId}>
          {label}
        </label>
        {resolvedValueText ? (
          <span className="speech-progress__value" id={`${resolvedProgressId}-value`}>
            {resolvedValueText}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="speech-progress__description" id={resolvedDescriptionId}>
          {description}
        </p>
      ) : null}
      <progress
        aria-describedby={describedBy}
        aria-labelledby={resolvedLabelId}
        aria-valuetext={valueText}
        className="speech-progress__bar"
        id={resolvedProgressId}
        max={max}
        value={value}
      />
    </div>
  );
}

function formatProgressValueText(percentage: number | undefined): string | undefined {
  if (percentage === undefined) {
    return 'In progress';
  }

  return `${Math.round(percentage)}%`;
}
