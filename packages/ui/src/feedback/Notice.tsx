import { type HTMLAttributes, type ReactNode } from 'react';
import {
  getFeedbackDefaultLiveMode,
  getFeedbackDefaultRole,
  type SpeechFeedbackTone,
  type SpeechLiveRegionMode,
} from './contracts';
import { liveRegionAttributes, mergeClassNames, useResolvedId } from './shared';

export interface NoticeProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly live?: SpeechLiveRegionMode;
  readonly title: ReactNode;
  readonly titleId?: string;
  readonly tone?: SpeechFeedbackTone;
}

export function Notice({
  actions,
  children,
  className,
  live,
  role,
  title,
  titleId,
  tone = 'info',
  ...props
}: NoticeProps) {
  const resolvedTitleId = useResolvedId(titleId, 'notice-title');
  const resolvedLive = live ?? getFeedbackDefaultLiveMode(tone);

  return (
    <aside
      {...props}
      {...liveRegionAttributes(resolvedLive)}
      aria-labelledby={resolvedTitleId}
      className={mergeClassNames('speech-notice', className)}
      data-tone={tone}
      role={role ?? getFeedbackDefaultRole(tone)}
    >
      <div className="speech-notice__body">
        <h2 className="speech-notice__title" id={resolvedTitleId}>
          {title}
        </h2>
        {children ? <div className="speech-notice__content">{children}</div> : null}
      </div>
      {actions ? <div className="speech-notice__actions">{actions}</div> : null}
    </aside>
  );
}
