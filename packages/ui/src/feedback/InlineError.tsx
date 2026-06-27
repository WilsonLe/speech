import { type HTMLAttributes, type ReactNode } from 'react';
import type { SpeechLiveRegionMode } from './contracts';
import { liveRegionAttributes, mergeClassNames } from './shared';

export interface InlineErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  readonly children: ReactNode;
  readonly live?: SpeechLiveRegionMode;
}

export function InlineError({
  children,
  className,
  live = 'assertive',
  role,
  ...props
}: InlineErrorProps) {
  return (
    <p
      {...props}
      {...liveRegionAttributes(live)}
      className={mergeClassNames('speech-inline-error', className)}
      role={role ?? (live === 'off' ? undefined : 'alert')}
    >
      {children}
    </p>
  );
}
