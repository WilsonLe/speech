export type PrimaryDestinationId = 'dictate' | 'vocabulary' | 'models';

export interface PrimaryDestination {
  readonly id: PrimaryDestinationId;
  readonly label: 'Dictate' | 'Vocabulary' | 'Models';
  readonly href: `#${PrimaryDestinationId}`;
  readonly headingId: string;
}

export const primaryDestinations = [
  {
    id: 'dictate',
    label: 'Dictate',
    href: '#dictate',
    headingId: 'transcript-title',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    href: '#vocabulary',
    headingId: 'vocabulary-title',
  },
  {
    id: 'models',
    label: 'Models',
    href: '#models',
    headingId: 'personal-models-title',
  },
] as const satisfies readonly PrimaryDestination[];

const defaultPrimaryDestination = primaryDestinations[0];

const hashAliases: Readonly<Record<string, PrimaryDestinationId>> = {
  '': 'dictate',
  '#': 'dictate',
  '#dictate': 'dictate',
  '#transcript-title': 'dictate',
  '#committed-transcript-text': 'dictate',
  '#transcript-privacy-title': 'dictate',
  '#vocabulary': 'vocabulary',
  '#vocabulary-title': 'vocabulary',
  '#models': 'models',
  '#personal-models-title': 'models',
  '#microphone-title': 'models',
  '#offline-model-title': 'models',
  '#diagnostics-title': 'models',
  '#benchmark-title': 'models',
  '#runtime-title': 'models',
  '#roadmap-title': 'models',
};

export function normalizeHashForPrimaryDestination(hash: string | undefined): PrimaryDestinationId {
  return hashAliases[hash ?? ''] ?? defaultPrimaryDestination.id;
}

export function getPrimaryDestination(destinationId: PrimaryDestinationId): PrimaryDestination {
  return (
    primaryDestinations.find((destination) => destination.id === destinationId) ??
    defaultPrimaryDestination
  );
}

export function getInitialPrimaryDestinationId(hash?: string): PrimaryDestinationId {
  return normalizeHashForPrimaryDestination(hash);
}

export function focusPrimaryDestinationHeading(
  destinationId: PrimaryDestinationId,
  documentRef: Pick<Document, 'getElementById'> = document,
): boolean {
  const destination = getPrimaryDestination(destinationId);
  const heading = documentRef.getElementById(destination.headingId);
  if (!isFocusableElement(heading)) {
    return false;
  }

  if (!heading.hasAttribute('tabindex')) {
    heading.tabIndex = -1;
  }
  heading.focus({ preventScroll: false });
  return true;
}

function isFocusableElement(
  element: ReturnType<Pick<Document, 'getElementById'>['getElementById']>,
): element is HTMLElement {
  return (
    element !== null &&
    typeof element === 'object' &&
    'focus' in element &&
    typeof element.focus === 'function' &&
    'hasAttribute' in element &&
    typeof element.hasAttribute === 'function'
  );
}
