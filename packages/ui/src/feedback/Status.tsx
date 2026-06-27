import { type HTMLAttributes, type ReactNode } from 'react';
import type { SpeechFeedbackTone, SpeechLiveRegionMode, SpeechStatusVariant } from './contracts';
import { liveRegionAttributes, mergeClassNames } from './shared';

export interface StatusProps extends HTMLAttributes<HTMLSpanElement> {
  readonly children: ReactNode;
  readonly live?: SpeechLiveRegionMode;
  readonly tone?: SpeechFeedbackTone;
  readonly variant?: SpeechStatusVariant;
}

export function Status({
  children,
  className,
  live = 'off',
  role,
  tone = 'info',
  variant = 'subtle',
  ...props
}: StatusProps) {
  return (
    <span
      {...props}
      {...liveRegionAttributes(live)}
      className={mergeClassNames('speech-status', className)}
      data-tone={tone}
      data-variant={variant}
      role={role ?? (live === 'off' ? undefined : 'status')}
    >
      {children}
    </span>
  );
}
