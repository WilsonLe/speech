import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  focusPrimaryDestinationHeading,
  getInitialPrimaryDestinationId,
  normalizeHashForPrimaryDestination,
  primaryDestinations,
  type PrimaryDestination,
  type PrimaryDestinationId,
} from './routeState';

function getCurrentHash(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.location.hash;
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  const [activeDestination, setActiveDestination] = useState<PrimaryDestinationId>(() =>
    getInitialPrimaryDestinationId(getCurrentHash()),
  );

  const focusDestination = useCallback((destinationId: PrimaryDestinationId) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    window.requestAnimationFrame(() => {
      focusPrimaryDestinationHeading(destinationId, document);
    });
  }, []);

  useEffect(() => {
    const currentHash = getCurrentHash();
    if (currentHash) {
      focusDestination(normalizeHashForPrimaryDestination(currentHash));
    }

    const handleHashChange = () => {
      const destinationId = normalizeHashForPrimaryDestination(getCurrentHash());
      setActiveDestination(destinationId);
      focusDestination(destinationId);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [focusDestination]);

  const handleDestinationClick = useCallback(
    (destinationId: PrimaryDestinationId) => {
      setActiveDestination(destinationId);
      focusDestination(destinationId);
    },
    [focusDestination],
  );

  const handleSkipToMain = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      focusDestination(activeDestination);
    },
    [activeDestination, focusDestination],
  );

  return (
    <div className="app-frame">
      <a className="skip-link" href="#app-main" onClick={handleSkipToMain}>
        Skip to main content
      </a>
      <header className="app-frame-header" role="banner">
        <div className="app-frame-header__inner">
          <a
            className="app-brand"
            href="#dictate"
            onClick={() => handleDestinationClick('dictate')}
          >
            Speech
          </a>
          <PrimaryNavigation
            className="app-primary-nav"
            activeDestination={activeDestination}
            onDestinationClick={handleDestinationClick}
          />
          <span className="app-shell-local" aria-label="Local status summary">
            Local
          </span>
        </div>
      </header>
      <PrimaryNavigation
        className="app-bottom-nav"
        activeDestination={activeDestination}
        onDestinationClick={handleDestinationClick}
      />
      <main id="app-main" className="app-shell" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

function PrimaryNavigation({
  activeDestination,
  className,
  onDestinationClick,
}: {
  readonly activeDestination: PrimaryDestinationId;
  readonly className: string;
  readonly onDestinationClick: (destinationId: PrimaryDestinationId) => void;
}) {
  return (
    <nav className={className} aria-label="Primary destinations">
      {primaryDestinations.map((destination) => (
        <PrimaryNavigationLink
          active={destination.id === activeDestination}
          destination={destination}
          key={destination.id}
          onDestinationClick={onDestinationClick}
        />
      ))}
    </nav>
  );
}

function PrimaryNavigationLink({
  active,
  destination,
  onDestinationClick,
}: {
  readonly active: boolean;
  readonly destination: PrimaryDestination;
  readonly onDestinationClick: (destinationId: PrimaryDestinationId) => void;
}) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      href={destination.href}
      onClick={() => onDestinationClick(destination.id)}
    >
      {destination.label}
    </a>
  );
}
