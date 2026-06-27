import { type HTMLAttributes, type ReactNode } from 'react';
import { Progress } from './Progress';
import type { SpeechLiveRegionMode, SpeechProgressSize } from './contracts';
import { liveRegionAttributes, mergeClassNames, useResolvedId } from './shared';

export interface LoadingStateProps extends HTMLAttributes<HTMLElement> {
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly label: ReactNode;
  readonly labelId?: string;
  readonly live?: SpeechLiveRegionMode;
  readonly progressMax?: number;
  readonly progressSize?: SpeechProgressSize;
  readonly progressValue?: number;
  readonly progressValueText?: string;
}

export function LoadingState({
  children,
  className,
  description,
  label,
  labelId,
  live = 'polite',
  progressMax,
  progressSize = 'md',
  progressValue,
  progressValueText,
  role,
  ...props
}: LoadingStateProps) {
  const resolvedLabelId = useResolvedId(labelId, 'loading-title');

  return (
    <section
      {...props}
      {...liveRegionAttributes(live)}
      aria-busy="true"
      aria-labelledby={resolvedLabelId}
      className={mergeClassNames('speech-loading-state', className)}
      role={role ?? (live === 'off' ? undefined : 'status')}
    >
      <span aria-hidden="true" className="speech-loading-state__spinner" />
      <div className="speech-loading-state__content">
        <h2 className="speech-loading-state__title" id={resolvedLabelId}>
          {label}
        </h2>
        {description ? <p className="speech-loading-state__description">{description}</p> : null}
        {children ? <div className="speech-loading-state__body">{children}</div> : null}
        {progressValue !== undefined || progressValueText ? (
          <Progress
            label="Progress"
            size={progressSize}
            {...(progressMax !== undefined ? { max: progressMax } : {})}
            {...(progressValue !== undefined ? { value: progressValue } : {})}
            {...(progressValueText ? { valueText: progressValueText } : {})}
          />
        ) : null}
      </div>
    </section>
  );
}
