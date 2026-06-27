import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  getAccordionKeyboardTargetIndex,
  speechAccordionKeyboardKeys,
  type SpeechAccordionHeadingLevel,
  type SpeechAccordionKeyboardKey,
  type SpeechAccordionVariant,
} from './contracts';

export interface AccordionItem {
  readonly id: string;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly disabled?: boolean;
}

export interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly AccordionItem[];
  readonly allowMultiple?: boolean;
  readonly collapsible?: boolean;
  readonly defaultOpenIds?: readonly string[];
  readonly openIds?: readonly string[];
  readonly onOpenChange?: (openIds: readonly string[]) => void;
  readonly headingLevel?: SpeechAccordionHeadingLevel;
  readonly variant?: SpeechAccordionVariant;
}

const accordionKeyboardKeySet = new Set<string>(speechAccordionKeyboardKeys);
const defaultOpenAccordionIds: readonly string[] = [];

export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  {
    allowMultiple = true,
    className,
    collapsible = true,
    defaultOpenIds = defaultOpenAccordionIds,
    headingLevel = 3,
    items,
    onOpenChange,
    openIds,
    variant = 'plain',
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const isControlled = openIds !== undefined;
  const [uncontrolledOpenIds, setUncontrolledOpenIds] = useState<readonly string[]>(defaultOpenIds);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const itemIds = items.map((item) => item.id);
  const visibleOpenIds = filterOpenIds(isControlled ? openIds : uncontrolledOpenIds, itemIds, {
    allowMultiple,
  });
  const classes = ['speech-accordion', className].filter(Boolean).join(' ');
  const Heading = `h${headingLevel}` as AccordionHeadingTag;

  function commitOpenIds(nextOpenIds: readonly string[]) {
    const filteredOpenIds = filterOpenIds(nextOpenIds, itemIds, { allowMultiple });

    if (!isControlled) {
      setUncontrolledOpenIds(filteredOpenIds);
    }

    onOpenChange?.(filteredOpenIds);
  }

  function toggleItem(itemId: string) {
    const isOpen = visibleOpenIds.includes(itemId);
    const nextOpenIds = isOpen
      ? collapsible
        ? visibleOpenIds.filter((openId) => openId !== itemId)
        : visibleOpenIds
      : allowMultiple
        ? [...visibleOpenIds, itemId]
        : [itemId];

    commitOpenIds(nextOpenIds);
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!isAccordionKeyboardKey(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex = getAccordionKeyboardTargetIndex(index, event.key, items.length);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div {...props} ref={ref} className={classes} data-variant={variant}>
      {items.map((item, index) => {
        const isOpen = visibleOpenIds.includes(item.id);
        const panelId = buildAccordionDomId(generatedId, index, item.id, 'panel');
        const buttonId = buildAccordionDomId(generatedId, index, item.id, 'button');

        return (
          <section
            aria-labelledby={buttonId}
            className="speech-accordion__item"
            data-open={isOpen ? 'true' : undefined}
            key={item.id}
          >
            <Heading className="speech-accordion__heading">
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                className="speech-accordion__button"
                disabled={item.disabled}
                id={buttonId}
                onClick={() => toggleItem(item.id)}
                onKeyDown={(event) => handleButtonKeyDown(event, index)}
                ref={(button) => {
                  buttonRefs.current[index] = button;
                }}
                type="button"
              >
                <span className="speech-accordion__title">{item.title}</span>
                <span aria-hidden="true" className="speech-accordion__chevron" />
              </button>
            </Heading>
            <div
              aria-labelledby={buttonId}
              className="speech-accordion__panel"
              hidden={!isOpen}
              id={panelId}
              role="region"
            >
              {item.children}
            </div>
          </section>
        );
      })}
    </div>
  );
});

function filterOpenIds(
  requestedOpenIds: readonly string[],
  itemIds: readonly string[],
  options: { readonly allowMultiple: boolean },
): readonly string[] {
  const itemIdSet = new Set(itemIds);
  const seenOpenIds = new Set<string>();
  const filteredOpenIds = requestedOpenIds.filter((openId) => {
    if (!itemIdSet.has(openId) || seenOpenIds.has(openId)) {
      return false;
    }

    seenOpenIds.add(openId);
    return true;
  });

  return options.allowMultiple ? filteredOpenIds : filteredOpenIds.slice(0, 1);
}

function isAccordionKeyboardKey(key: string): key is SpeechAccordionKeyboardKey {
  return accordionKeyboardKeySet.has(key);
}

function buildAccordionDomId(
  rootId: string,
  index: number,
  itemId: string,
  suffix: 'button' | 'panel',
): string {
  const safeItemId = itemId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

  return `${rootId}-item-${index}-${safeItemId}-${suffix}`;
}

type AccordionHeadingTag = `h${SpeechAccordionHeadingLevel}`;

export type AccordionButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
