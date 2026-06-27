import { type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '../primitives/Button';
import type { SpeechFeedbackTone, SpeechLiveRegionMode } from './contracts';
import { liveRegionAttributes, mergeClassNames, useResolvedId } from './shared';

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly dismissLabel?: string;
  readonly live?: SpeechLiveRegionMode;
  readonly onDismiss?: () => void;
  readonly title?: ReactNode;
  readonly titleId?: string;
  readonly tone?: SpeechFeedbackTone;
}

export function Toast({
  action,
  children,
  className,
  dismissLabel = 'Dismiss',
  live = 'polite',
  onDismiss,
  role,
  title,
  titleId,
  tone = 'info',
  ...props
}: ToastProps) {
  const generatedTitleId = useResolvedId(titleId, 'toast-title');
  const resolvedTitleId = title ? generatedTitleId : undefined;

  return (
    <div
      {...props}
      {...liveRegionAttributes(live)}
      aria-labelledby={resolvedTitleId}
      className={mergeClassNames('speech-toast', className)}
      data-tone={tone}
      role={role ?? (live === 'off' ? undefined : 'status')}
    >
      <div className="speech-toast__body">
        {title ? (
          <strong className="speech-toast__title" id={resolvedTitleId}>
            {title}
          </strong>
        ) : null}
        {children ? <div className="speech-toast__content">{children}</div> : null}
      </div>
      {action || onDismiss ? (
        <div className="speech-toast__actions">
          {action}
          {onDismiss ? (
            <Button onClick={onDismiss} size="sm" variant="ghost">
              {dismissLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
