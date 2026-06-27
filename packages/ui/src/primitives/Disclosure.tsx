import {
  forwardRef,
  useId,
  useState,
  type DetailsHTMLAttributes,
  type ReactNode,
  type ToggleEvent,
} from 'react';
import type { SpeechDisclosureVariant } from './contracts';

export interface DisclosureProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'title'> {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly summaryId?: string;
  readonly panelId?: string;
  readonly variant?: SpeechDisclosureVariant;
}

export const Disclosure = forwardRef<HTMLDetailsElement, DisclosureProps>(function Disclosure(
  {
    children,
    className,
    defaultOpen = false,
    onOpenChange,
    onToggle,
    open,
    panelId,
    summaryId,
    title,
    variant = 'plain',
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;
  const resolvedSummaryId = summaryId ?? `${generatedId}-summary`;
  const resolvedPanelId = panelId ?? `${generatedId}-panel`;
  const classes = ['speech-disclosure', className].filter(Boolean).join(' ');

  function handleToggle(event: ToggleEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;

    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
    onToggle?.(event);
  }

  return (
    <details
      {...props}
      ref={ref}
      className={classes}
      data-variant={variant}
      onToggle={handleToggle}
      open={isOpen}
    >
      <summary
        aria-controls={resolvedPanelId}
        aria-expanded={isOpen}
        className="speech-disclosure__summary"
        id={resolvedSummaryId}
      >
        <span aria-hidden="true" className="speech-disclosure__chevron" />
        <span className="speech-disclosure__title">{title}</span>
      </summary>
      <div
        aria-labelledby={resolvedSummaryId}
        className="speech-disclosure__panel"
        id={resolvedPanelId}
        role="region"
      >
        {children}
      </div>
    </details>
  );
});
