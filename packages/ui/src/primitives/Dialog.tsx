import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Button } from './Button';
import { getDialogTabTargetIndex, type SpeechDialogSize } from './contracts';

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly closeLabel?: string;
  readonly defaultOpen?: boolean;
  readonly description?: ReactNode;
  readonly descriptionId?: string;
  readonly footer?: ReactNode;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly labelId?: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly closeOnBackdrop?: boolean;
  readonly closeOnEscape?: boolean;
  readonly size?: SpeechDialogSize;
}

const dialogFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    children,
    className,
    closeLabel,
    closeOnBackdrop = true,
    closeOnEscape = true,
    defaultOpen = false,
    description,
    descriptionId,
    footer,
    initialFocusRef,
    labelId,
    onClick,
    onKeyDown,
    onOpenChange,
    open,
    restoreFocusRef,
    size = 'md',
    title,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const resolvedLabelId = labelId ?? `${generatedId}-title`;
  const resolvedDescriptionId = description
    ? (descriptionId ?? `${generatedId}-description`)
    : undefined;
  const classes = ['speech-dialog', className].filter(Boolean).join(' ');

  const commitOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  function handleDialogRef(node: HTMLDivElement | null) {
    dialogRef.current = node;
    assignForwardedRef(ref, node);
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);

    if (!closeOnBackdrop || event.defaultPrevented || event.target !== event.currentTarget) {
      return;
    }

    commitOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      event.stopPropagation();
      commitOpen(false);
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getDialogFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getDialogTabTargetIndex(
      currentIndex,
      event.shiftKey ? 'backward' : 'forward',
      focusableElements.length,
    );
    if (nextIndex === currentIndex) {
      return;
    }

    event.preventDefault();
    focusableElements[nextIndex]?.focus();
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const restoreFocusTarget = restoreFocusRef?.current;

    window.setTimeout(() => {
      const dialog = dialogRef.current;
      const target = initialFocusRef?.current ?? getDialogFocusableElements(dialog)[0] ?? dialog;
      target?.focus();
    }, 0);

    return () => {
      const target = restoreFocusTarget ?? previouslyFocusedRef.current;
      if (target && document.contains(target)) {
        target.focus();
      }
    };
  }, [initialFocusRef, isOpen, restoreFocusRef]);

  return (
    <div
      {...props}
      aria-hidden={!isOpen || undefined}
      className={classes}
      data-open={isOpen ? 'true' : undefined}
      hidden={!isOpen}
      onClick={handleBackdropClick}
    >
      <div
        aria-describedby={resolvedDescriptionId}
        aria-labelledby={resolvedLabelId}
        aria-modal="true"
        className="speech-dialog__panel"
        data-close-on-escape={closeOnEscape ? 'true' : 'false'}
        data-size={size}
        onKeyDown={handleKeyDown}
        ref={handleDialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="speech-dialog__header">
          <h2 className="speech-dialog__title" id={resolvedLabelId}>
            {title}
          </h2>
          {closeLabel ? (
            <Button
              className="speech-dialog__close"
              onClick={() => commitOpen(false)}
              variant="ghost"
            >
              {closeLabel}
            </Button>
          ) : null}
        </header>
        {description ? (
          <p className="speech-dialog__description" id={resolvedDescriptionId}>
            {description}
          </p>
        ) : null}
        <div className="speech-dialog__content">{children}</div>
        {footer ? <footer className="speech-dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  );
});

function getDialogFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) {
    return [];
  }

  return Array.from(root.querySelectorAll<HTMLElement>(dialogFocusableSelector)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function assignForwardedRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}
