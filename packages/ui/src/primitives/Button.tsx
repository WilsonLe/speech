import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { SpeechButtonSize, SpeechButtonVariant } from './contracts';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: SpeechButtonVariant;
  readonly size?: SpeechButtonSize;
  readonly loading?: boolean;
  readonly loadingLabel?: ReactNode;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled = false,
    leadingIcon,
    loading = false,
    loadingLabel,
    size = 'md',
    trailingIcon,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const visibleLabel = loading && loadingLabel ? loadingLabel : children;
  const classes = ['speech-button', className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      ref={ref}
      aria-busy={loading || undefined}
      className={classes}
      data-loading={loading ? 'true' : undefined}
      data-size={size}
      data-variant={variant}
      disabled={isDisabled}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="speech-button__spinner" /> : null}
      {leadingIcon && !loading ? (
        <span aria-hidden="true" className="speech-button__icon speech-button__icon--leading">
          {leadingIcon}
        </span>
      ) : null}
      <span className="speech-button__label">{visibleLabel}</span>
      {trailingIcon && !loading ? (
        <span aria-hidden="true" className="speech-button__icon speech-button__icon--trailing">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});
