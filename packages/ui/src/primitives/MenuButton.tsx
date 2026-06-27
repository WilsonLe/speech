import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ForwardedRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import {
  getMenuKeyboardTargetIndex,
  speechMenuKeyboardKeys,
  type SpeechButtonSize,
  type SpeechButtonVariant,
  type SpeechMenuKeyboardKey,
  type SpeechMenuPlacement,
} from './contracts';

export interface MenuButtonActionItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly kind?: 'action';
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly onSelect?: () => void;
}

export interface MenuButtonLinkItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly kind: 'link';
  readonly href: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly rel?: string;
  readonly target?: string;
}

export type MenuButtonItem = MenuButtonActionItem | MenuButtonLinkItem;

export interface MenuButtonProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: ReactNode;
  readonly items: readonly MenuButtonItem[];
  readonly buttonId?: string;
  readonly buttonVariant?: SpeechButtonVariant;
  readonly buttonSize?: SpeechButtonSize;
  readonly defaultOpen?: boolean;
  readonly disabled?: boolean;
  readonly menuId?: string;
  readonly menuLabel?: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly placement?: SpeechMenuPlacement;
}

const menuKeyboardKeySet = new Set<string>(speechMenuKeyboardKeys);

export const MenuButton = forwardRef<HTMLButtonElement, MenuButtonProps>(function MenuButton(
  {
    buttonId,
    buttonSize = 'md',
    buttonVariant = 'secondary',
    className,
    defaultOpen = false,
    disabled = false,
    items,
    label,
    menuId,
    menuLabel,
    onBlur,
    onOpenChange,
    open,
    placement = 'bottom-end',
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const resolvedButtonId = buttonId ?? `${generatedId}-button`;
  const resolvedMenuId = menuId ?? `${generatedId}-menu`;
  const disabledIndexes = items
    .map((item, index) => (item.disabled ? index : -1))
    .filter((index) => index >= 0);
  const classes = ['speech-menu-button', className].filter(Boolean).join(' ');

  const commitOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  function focusTrigger() {
    triggerRef.current?.focus();
  }

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  function focusItemAfterOpen(index: number) {
    window.setTimeout(() => focusItem(index), 0);
  }

  function openAndFocus(index: number) {
    commitOpen(true);
    focusItemAfterOpen(index);
  }

  function handleTriggerRef(button: HTMLButtonElement | null) {
    triggerRef.current = button;
    assignForwardedRef(ref, button);
  }

  function handleTriggerClick() {
    commitOpen(!isOpen);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      commitOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const nextIndex = getMenuKeyboardTargetIndex(-1, 'ArrowDown', items.length, {
        disabledIndexes,
      });
      openAndFocus(nextIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = getMenuKeyboardTargetIndex(0, 'ArrowUp', items.length, {
        disabledIndexes,
      });
      openAndFocus(nextIndex);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    if (event.key === 'Escape') {
      event.preventDefault();
      commitOpen(false);
      focusTrigger();
      return;
    }

    if (event.key === 'Tab') {
      commitOpen(false);
      return;
    }

    if (!isMenuKeyboardKey(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex = getMenuKeyboardTargetIndex(index, event.key, items.length, {
      disabledIndexes,
    });
    focusItem(nextIndex);
  }

  function handleItemClick(event: MouseEvent<HTMLElement>, item: MenuButtonItem) {
    if (item.disabled) {
      event.preventDefault();
      return;
    }

    if (item.kind !== 'link') {
      item.onSelect?.();
    }

    commitOpen(false);
    focusTrigger();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    onBlur?.(event);

    if (event.defaultPrevented || rootRef.current?.contains(event.relatedTarget)) {
      return;
    }

    commitOpen(false);
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }

      commitOpen(false);
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [commitOpen, isOpen]);

  return (
    <div
      {...props}
      ref={rootRef}
      className={classes}
      data-open={isOpen ? 'true' : undefined}
      data-placement={placement}
      onBlur={handleBlur}
    >
      <Button
        aria-controls={resolvedMenuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="speech-menu-button__trigger"
        disabled={disabled}
        id={resolvedButtonId}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        ref={handleTriggerRef}
        size={buttonSize}
        variant={buttonVariant}
      >
        <span className="speech-menu-button__label">{label}</span>
        <span aria-hidden="true" className="speech-menu-button__chevron" />
      </Button>
      <ul
        aria-labelledby={menuLabel ? undefined : resolvedButtonId}
        aria-label={menuLabel}
        className="speech-menu-button__menu"
        hidden={!isOpen}
        id={resolvedMenuId}
        role="menu"
      >
        {items.map((item, index) => (
          <li className="speech-menu-button__menu-item" key={item.id} role="none">
            {renderMenuItem({
              index,
              item,
              menuId: resolvedMenuId,
              onClick: handleItemClick,
              onKeyDown: handleMenuKeyDown,
              ref: (node) => {
                itemRefs.current[index] = node;
              },
            })}
          </li>
        ))}
      </ul>
    </div>
  );
});

function renderMenuItem(options: {
  readonly index: number;
  readonly item: MenuButtonItem;
  readonly menuId: string;
  readonly onClick: (event: MouseEvent<HTMLElement>, item: MenuButtonItem) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
  readonly ref: (node: HTMLElement | null) => void;
}) {
  const { index, item, menuId, onClick, onKeyDown, ref } = options;
  const commonProps = {
    'aria-disabled': item.disabled || undefined,
    className: 'speech-menu-button__item-control',
    'data-destructive': item.destructive ? 'true' : undefined,
    id: buildMenuItemDomId(menuId, index, item.id),
    onClick: (event: MouseEvent<HTMLElement>) => onClick(event, item),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(event, index),
    ref,
    role: 'menuitem',
    tabIndex: item.disabled ? undefined : -1,
  } as const;

  if (item.kind === 'link') {
    if (item.disabled) {
      return <span {...commonProps}>{item.label}</span>;
    }

    return (
      <a {...commonProps} href={item.href} rel={resolveMenuItemRel(item)} target={item.target}>
        {item.label}
      </a>
    );
  }

  return (
    <button {...commonProps} disabled={item.disabled} type="button">
      {item.label}
    </button>
  );
}

function isMenuKeyboardKey(key: string): key is SpeechMenuKeyboardKey {
  return menuKeyboardKeySet.has(key);
}

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

function resolveMenuItemRel(item: MenuButtonLinkItem): string | undefined {
  if (item.rel) {
    return item.rel;
  }

  return item.target === '_blank' ? 'noreferrer' : undefined;
}

function buildMenuItemDomId(menuId: string, index: number, itemId: string): string {
  const safeItemId = itemId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

  return `${menuId}-item-${index}-${safeItemId}`;
}
