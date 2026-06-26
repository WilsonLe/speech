import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { SpeechIconButtonSize, SpeechIconButtonVariant } from './contracts';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  readonly label: string;
  readonly tooltip?: string;
  readonly tooltipId?: string;
  readonly variant?: SpeechIconButtonVariant;
  readonly size?: SpeechIconButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    children,
    className,
    disabled = false,
    label,
    loading = false,
    size = 'md',
    tooltip,
    tooltipId,
    type = 'button',
    variant = 'ghost',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const generatedTooltipId = useId();
  const resolvedTooltipId = tooltip ? (tooltipId ?? generatedTooltipId) : undefined;
  const classes = ['speech-icon-button', className].filter(Boolean).join(' ');

  return (
    <span className="speech-icon-button__wrap">
      <button
        {...props}
        ref={ref}
        aria-busy={loading || undefined}
        aria-describedby={resolvedTooltipId}
        aria-label={label}
        className={classes}
        data-loading={loading ? 'true' : undefined}
        data-size={size}
        data-variant={variant}
        disabled={isDisabled}
        type={type}
      >
        {loading ? <span aria-hidden="true" className="speech-icon-button__spinner" /> : null}
        <span aria-hidden="true" className="speech-icon-button__glyph">
          {children}
        </span>
      </button>
      {tooltip ? (
        <span className="speech-icon-button__tooltip" id={resolvedTooltipId} role="tooltip">
          {tooltip}
        </span>
      ) : null}
    </span>
  );
});
