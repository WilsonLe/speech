import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type FocusEvent,
  type FocusEventHandler,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEvent,
  type PointerEventHandler,
  type ReactElement,
} from 'react';
import type { SpeechTooltipPlacement } from './contracts';

export interface TooltipProps {
  readonly children: ReactElement<TooltipTriggerProps>;
  readonly content: string;
  readonly defaultOpen?: boolean;
  readonly id?: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly placement?: SpeechTooltipPlacement;
}

interface TooltipTriggerProps {
  readonly 'aria-describedby'?: string;
  readonly onBlur?: FocusEventHandler<HTMLElement>;
  readonly onFocus?: FocusEventHandler<HTMLElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLElement>;
  readonly onMouseEnter?: MouseEventHandler<HTMLElement>;
  readonly onMouseLeave?: MouseEventHandler<HTMLElement>;
  readonly onPointerDown?: PointerEventHandler<HTMLElement>;
}

export function Tooltip({
  children,
  content,
  defaultOpen = false,
  id,
  onOpenChange,
  open,
  placement = 'top',
}: TooltipProps) {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;
  const trigger = Children.only(children);

  if (!isValidElement<TooltipTriggerProps>(trigger)) {
    throw new TypeError('Tooltip requires a single valid React element trigger.');
  }

  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;

  function commitOpen(nextOpen: boolean) {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  function handleFocus(event: FocusEvent<HTMLElement>) {
    trigger.props.onFocus?.(event);
    commitOpen(true);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    trigger.props.onBlur?.(event);
    commitOpen(false);
  }

  function handleMouseEnter(event: MouseEvent<HTMLElement>) {
    trigger.props.onMouseEnter?.(event);
    commitOpen(true);
  }

  function handleMouseLeave(event: MouseEvent<HTMLElement>) {
    trigger.props.onMouseLeave?.(event);
    commitOpen(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    trigger.props.onPointerDown?.(event);

    if (event.pointerType === 'touch') {
      commitOpen(true);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    trigger.props.onKeyDown?.(event);

    if (event.key === 'Escape') {
      event.stopPropagation();
      commitOpen(false);
    }
  }

  const describedBy = mergeAriaDescriptions(trigger.props['aria-describedby'], resolvedId);

  return (
    <span className="speech-tooltip" data-open={isOpen ? 'true' : undefined}>
      {cloneElement(trigger, {
        'aria-describedby': describedBy,
        onBlur: handleBlur,
        onFocus: handleFocus,
        onKeyDown: handleKeyDown,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onPointerDown: handlePointerDown,
      })}
      <span
        className="speech-tooltip__content"
        data-placement={placement}
        hidden={!isOpen}
        id={resolvedId}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}

function mergeAriaDescriptions(existing: string | undefined, tooltipId: string): string {
  if (!existing) {
    return tooltipId;
  }

  const existingIds = existing.split(/\s+/).filter(Boolean);
  return [...new Set([...existingIds, tooltipId])].join(' ');
}
