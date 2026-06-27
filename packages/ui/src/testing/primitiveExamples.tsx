import type { ReactElement } from 'react';
import {
  Accordion,
  Button,
  Dialog,
  Disclosure,
  IconButton,
  MenuButton,
  RadioGroup,
  Select,
  Tooltip,
  speechAccordionKeyboardKeys,
  speechButtonSizes,
  speechButtonVariants,
  speechDialogKeyboardKeys,
  speechIconButtonVariants,
  speechMenuKeyboardKeys,
  speechRadioGroupKeyboardKeys,
  speechSelectKeyboardKeys,
} from '../primitives/index';
import {
  EmptyState,
  InlineError,
  LoadingState,
  Notice,
  Progress,
  Status,
  Toast,
} from '../feedback/index';
import {
  speechButtonCssRequirements,
  speechDialogCssRequirements,
  speechDisclosureCssRequirements,
  speechFeedbackCssRequirements,
  speechFormControlCssRequirements,
  speechMenuCssRequirements,
} from './accessibility';

export const speechPrimitiveInteractionRequirements = [
  'keyboard',
  'escape',
  'focus-order',
  'focus-restoration',
  'aria-state',
  'hidden-focusability',
  'pointer-touch',
  'forced-colours',
  'reduced-motion',
  'disabled-loading',
] as const;

export type SpeechPrimitiveInteractionRequirement =
  (typeof speechPrimitiveInteractionRequirements)[number];

export type SpeechPrimitiveExampleCssEntry =
  | 'button.css'
  | 'dialog.css'
  | 'disclosure.css'
  | 'feedback.css'
  | 'form-controls.css'
  | 'menu.css';

export interface SpeechPrimitiveAccessibilityExample {
  readonly id: string;
  readonly primitive: string;
  readonly purpose: string;
  readonly element: ReactElement;
  readonly requiredMarkup: readonly string[];
  readonly forbiddenMarkup?: readonly string[];
  readonly keyboardKeys?: readonly string[];
  readonly interactionRequirements: readonly SpeechPrimitiveInteractionRequirement[];
  readonly cssEntry: SpeechPrimitiveExampleCssEntry;
  readonly cssRequirements: readonly string[];
}

function iconGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" />;
}

export const speechPrimitiveAccessibilityExamples: readonly SpeechPrimitiveAccessibilityExample[] =
  [
    {
      id: 'button-loading',
      primitive: 'Button',
      purpose: 'Native action with visible loading text and safe disabled state.',
      element: (
        <Button loading loadingLabel="Saving">
          Save
        </Button>
      ),
      requiredMarkup: ['<button', 'type="button"', 'aria-busy="true"', 'disabled=""', 'Saving'],
      keyboardKeys: ['Enter', 'Space'],
      interactionRequirements: [
        'keyboard',
        'pointer-touch',
        'forced-colours',
        'reduced-motion',
        'disabled-loading',
      ],
      cssEntry: 'button.css',
      cssRequirements: speechButtonCssRequirements,
    },
    {
      id: 'icon-button-tooltip',
      primitive: 'IconButton',
      purpose: 'Compact secondary action with an accessible name and supplemental tooltip.',
      element: (
        <IconButton label="Copy text" tooltip="Copies the current text." tooltipId="copy-text-tip">
          {iconGlyph()}
        </IconButton>
      ),
      requiredMarkup: [
        '<button',
        'aria-label="Copy text"',
        'aria-describedby="copy-text-tip"',
        'role="tooltip"',
      ],
      forbiddenMarkup: ['<a '],
      keyboardKeys: ['Enter', 'Space', 'Escape'],
      interactionRequirements: ['keyboard', 'escape', 'aria-state', 'pointer-touch'],
      cssEntry: 'button.css',
      cssRequirements: speechButtonCssRequirements,
    },
    {
      id: 'disclosure-closed',
      primitive: 'Disclosure',
      purpose: 'Native optional details with an expanded-state trigger.',
      element: (
        <Disclosure title="Recording details">Level, clipping, and timing details.</Disclosure>
      ),
      requiredMarkup: ['<details', '<summary', 'aria-expanded="false"', 'Recording details'],
      interactionRequirements: ['keyboard', 'aria-state', 'pointer-touch'],
      cssEntry: 'disclosure.css',
      cssRequirements: speechDisclosureCssRequirements,
    },
    {
      id: 'accordion-collapsed',
      primitive: 'Accordion',
      purpose: 'Independent optional sections with hidden collapsed panel content.',
      element: (
        <Accordion
          items={[
            {
              id: 'coverage',
              title: 'Coverage',
              children: <Button>Review coverage</Button>,
            },
            {
              id: 'storage',
              title: 'Storage',
              children: 'Storage details.',
            },
          ]}
        />
      ),
      requiredMarkup: ['aria-expanded="false"', 'aria-controls=', 'hidden=""', 'Review coverage'],
      keyboardKeys: speechAccordionKeyboardKeys,
      interactionRequirements: ['keyboard', 'focus-order', 'aria-state', 'hidden-focusability'],
      cssEntry: 'disclosure.css',
      cssRequirements: speechDisclosureCssRequirements,
    },
    {
      id: 'menu-open',
      primitive: 'MenuButton',
      purpose: 'Temporary action list with menu roles, keyboard movement, and focus restoration.',
      element: (
        <MenuButton
          defaultOpen
          items={[
            { id: 'rename', label: 'Rename' },
            { id: 'export', label: 'Export…', kind: 'link', href: '/models/demo/export' },
            { id: 'delete', label: 'Delete…', destructive: true },
          ]}
          label="More"
          menuId="example-actions"
        />
      ),
      requiredMarkup: [
        'aria-haspopup="menu"',
        'aria-expanded="true"',
        'role="menu"',
        'role="menuitem"',
        'data-destructive="true"',
      ],
      forbiddenMarkup: ['role="submenu"'],
      keyboardKeys: [...speechMenuKeyboardKeys, 'Escape', 'Tab'],
      interactionRequirements: [
        'keyboard',
        'escape',
        'focus-order',
        'focus-restoration',
        'aria-state',
        'pointer-touch',
      ],
      cssEntry: 'menu.css',
      cssRequirements: speechMenuCssRequirements,
    },
    {
      id: 'menu-closed-hidden',
      primitive: 'MenuButton',
      purpose: 'Closed menu hides menu items from the focus order.',
      element: (
        <MenuButton items={[{ id: 'copy', label: 'Copy' }]} label="Actions" menuId="closed-menu" />
      ),
      requiredMarkup: ['role="menu"', 'hidden=""', 'role="menuitem"'],
      keyboardKeys: [...speechMenuKeyboardKeys, 'Escape', 'Tab'],
      interactionRequirements: ['keyboard', 'escape', 'aria-state', 'hidden-focusability'],
      cssEntry: 'menu.css',
      cssRequirements: speechMenuCssRequirements,
    },
    {
      id: 'tooltip-open',
      primitive: 'Tooltip',
      purpose: 'Plain supplemental text attached to a focusable trigger.',
      element: (
        <Tooltip content="Shows local status." defaultOpen id="local-status-tip">
          <button type="button">Local</button>
        </Tooltip>
      ),
      requiredMarkup: [
        'aria-describedby="local-status-tip"',
        'role="tooltip"',
        'Shows local status.',
      ],
      forbiddenMarkup: ['<a ', '<form', '<button type="button">Shows'],
      keyboardKeys: ['Escape'],
      interactionRequirements: [
        'keyboard',
        'escape',
        'focus-restoration',
        'aria-state',
        'pointer-touch',
      ],
      cssEntry: 'menu.css',
      cssRequirements: speechMenuCssRequirements,
    },
    {
      id: 'dialog-open',
      primitive: 'Dialog',
      purpose: 'Short modal decision with focus trap, labelled title, and safe Escape behavior.',
      element: (
        <Dialog
          closeLabel="Close dialog"
          description="Confirm the short decision."
          footer={<Button>Close</Button>}
          onOpenChange={() => undefined}
          open
          title="Short decision"
        >
          Decision body.
        </Dialog>
      ),
      requiredMarkup: [
        'role="dialog"',
        'aria-modal="true"',
        'aria-labelledby=',
        'aria-describedby=',
        'Close dialog',
      ],
      keyboardKeys: speechDialogKeyboardKeys,
      interactionRequirements: [
        'keyboard',
        'escape',
        'focus-order',
        'focus-restoration',
        'aria-state',
        'pointer-touch',
      ],
      cssEntry: 'dialog.css',
      cssRequirements: speechDialogCssRequirements,
    },
    {
      id: 'dialog-closed-hidden',
      primitive: 'Dialog',
      purpose: 'Closed modal content is hidden so inactive controls cannot receive focus.',
      element: (
        <Dialog onOpenChange={() => undefined} open={false} title="Rename">
          <Button>Hidden action</Button>
        </Dialog>
      ),
      requiredMarkup: ['role="dialog"', 'hidden=""', 'Hidden action'],
      keyboardKeys: speechDialogKeyboardKeys,
      interactionRequirements: ['keyboard', 'escape', 'aria-state', 'hidden-focusability'],
      cssEntry: 'dialog.css',
      cssRequirements: speechDialogCssRequirements,
    },
    {
      id: 'select-invalid',
      primitive: 'Select',
      purpose: 'Native labelled choice with connected hint and error text.',
      element: (
        <Select
          error="Choose a language."
          hint="Applies next recording."
          label="Language"
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'vi', label: 'Tiếng Việt' },
          ]}
          selectId="language-select"
        />
      ),
      requiredMarkup: [
        '<label',
        '<select',
        'aria-invalid="true"',
        'aria-describedby=',
        'Choose a language.',
      ],
      keyboardKeys: speechSelectKeyboardKeys,
      interactionRequirements: ['keyboard', 'aria-state', 'pointer-touch'],
      cssEntry: 'form-controls.css',
      cssRequirements: speechFormControlCssRequirements,
    },
    {
      id: 'radio-group',
      primitive: 'RadioGroup',
      purpose: 'Native radio choice group with persistent legend and hint text.',
      element: (
        <RadioGroup
          hint="Choose one option."
          label="Recording mode"
          name="recording-mode"
          options={[
            { value: 'press', label: 'Press to record' },
            { value: 'hold', label: 'Hold to speak' },
          ]}
          value="press"
        />
      ),
      requiredMarkup: ['<fieldset', '<legend', 'type="radio"', 'checked=""', 'Recording mode'],
      keyboardKeys: speechRadioGroupKeyboardKeys,
      interactionRequirements: ['keyboard', 'aria-state', 'pointer-touch'],
      cssEntry: 'form-controls.css',
      cssRequirements: speechFormControlCssRequirements,
    },
    {
      id: 'inline-error',
      primitive: 'InlineError',
      purpose: 'Visible field recovery text with assertive alert semantics.',
      element: <InlineError>Choose a term before saving.</InlineError>,
      requiredMarkup: ['role="alert"', 'aria-live="assertive"', 'Choose a term before saving.'],
      interactionRequirements: ['aria-state'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'notice-blocker',
      primitive: 'Notice',
      purpose: 'Visible page-level blocker with action and assertive live region.',
      element: (
        <Notice
          actions={<Button>Install model</Button>}
          title="Speech model required"
          tone="danger"
        >
          Works offline after install.
        </Notice>
      ),
      requiredMarkup: [
        'role="alert"',
        'aria-live="assertive"',
        'Speech model required',
        'Install model',
      ],
      interactionRequirements: ['aria-state', 'pointer-touch'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'toast-confirmation',
      primitive: 'Toast',
      purpose: 'Transient noncritical confirmation with polite status semantics.',
      element: <Toast title="Copied">Text copied.</Toast>,
      requiredMarkup: ['role="status"', 'aria-live="polite"', 'Copied', 'Text copied.'],
      interactionRequirements: ['aria-state'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'empty-state',
      primitive: 'EmptyState',
      purpose: 'Labelled empty section with visible recovery action.',
      element: <EmptyState actions={<Button>New set</Button>} title="No vocabulary sets" />,
      requiredMarkup: ['aria-labelledby=', 'No vocabulary sets', 'New set'],
      interactionRequirements: ['aria-state', 'pointer-touch'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'loading-state',
      primitive: 'LoadingState',
      purpose: 'Busy status with state label and progress text equivalent.',
      element: <LoadingState label="Verifying model" progressMax={4} progressValue={3} />,
      requiredMarkup: ['role="status"', 'aria-busy="true"', '<progress', '75%', 'Verifying model'],
      interactionRequirements: ['aria-state', 'disabled-loading'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'progress',
      primitive: 'Progress',
      purpose: 'Native progress with visible label and text equivalent.',
      element: <Progress label="Training" max={10} progressId="training-progress" value={6} />,
      requiredMarkup: ['<progress', 'id="training-progress"', 'value="6"', '60%', 'Training'],
      interactionRequirements: ['aria-state'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
    {
      id: 'status',
      primitive: 'Status',
      purpose: 'Compact state text with role and wording so colour is not the only signal.',
      element: (
        <Status live="polite" tone="warning">
          Needs recording
        </Status>
      ),
      requiredMarkup: ['role="status"', 'Needs recording', 'data-tone="warning"'],
      interactionRequirements: ['aria-state'],
      cssEntry: 'feedback.css',
      cssRequirements: speechFeedbackCssRequirements,
    },
  ];

export const speechPrimitiveKeyboardTestMatrix = speechPrimitiveAccessibilityExamples.map(
  ({ id, primitive, keyboardKeys, interactionRequirements }) => ({
    exampleId: id,
    primitive,
    keyboardKeys: keyboardKeys ?? [],
    interactionRequirements,
  }),
);

export const speechPrimitiveExampleStateCoverage = {
  variants: speechButtonVariants,
  sizes: speechButtonSizes,
  iconButtonVariants: speechIconButtonVariants,
  requirements: speechPrimitiveInteractionRequirements,
} as const;
