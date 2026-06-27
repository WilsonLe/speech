import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { MenuButton, type MenuButtonItem } from '@speech/ui';
import {
  appMenuDestinations,
  createAppShellLocalStatusView,
  createModelLifecycleErrorSummary,
  createModelLifecycleSummary,
  loadingModelLifecycleSummary,
  type AppShellLocalStatusView,
  type AppShellModelLifecycleSummary,
} from './appShellStatus';
import {
  activatePwaUpdate,
  getPwaLifecycleSnapshot,
  subscribePwaLifecycle,
  type PwaLifecycleSnapshot,
} from './pwa-lifecycle';
import {
  createRouteRestorationPlan,
  focusRouteHeading,
  primaryDestinations,
  resolveAppRoute,
  resolveNavigationHref,
  type PrimaryDestination,
  type PrimaryDestinationId,
  type ResolvedAppRoute,
} from './routeState';
import {
  createModelLifecycleWorker,
  type ModelLifecycleResponse,
} from '../workers/model-lifecycle-client';

function getCurrentRoute(): ResolvedAppRoute {
  if (typeof window === 'undefined') {
    return resolveAppRoute({ pathname: '/' });
  }

  return resolveAppRoute({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });
}

function getInitialOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  const [currentRoute, setCurrentRoute] = useState<ResolvedAppRoute>(() => getCurrentRoute());
  const [pwa, setPwa] = useState<PwaLifecycleSnapshot>(() => getPwaLifecycleSnapshot());
  const [online, setOnline] = useState(() => getInitialOnlineStatus());
  const [modelLifecycle, setModelLifecycle] = useState<AppShellModelLifecycleSummary>(
    loadingModelLifecycleSummary,
  );

  const focusRoute = useCallback((route: ResolvedAppRoute) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    window.requestAnimationFrame(() => {
      focusRouteHeading(route, document);
    });
  }, []);

  const commitRoute = useCallback(
    (route: ResolvedAppRoute, mode: 'push' | 'replace') => {
      if (typeof window === 'undefined') {
        return;
      }

      const method = mode === 'replace' ? 'replaceState' : 'pushState';
      if (window.location.pathname + window.location.search + window.location.hash !== route.href) {
        window.history[method]({}, '', route.href);
      }
      setCurrentRoute(route);

      const restoration = createRouteRestorationPlan(route);
      if (restoration.scrollRestoration.startsWith('reset')) {
        window.scrollTo({ top: 0, left: 0 });
      }
      focusRoute(route);
    },
    [focusRoute],
  );

  useEffect(() => subscribePwaLifecycle(setPwa), []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined;
    }

    function handleOnlineChange() {
      setOnline(navigator.onLine);
    }

    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    return () => {
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      return undefined;
    }

    const worker = createModelLifecycleWorker();
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ type: 'INIT' });

    function handleWorkerMessage(event: MessageEvent<ModelLifecycleResponse>) {
      const message = event.data;
      if (message.type === 'READY') {
        setModelLifecycle(createModelLifecycleSummary(message.catalog.models, message.installed));
        return;
      }

      if (message.type === 'INSTALL_COMPLETE' || message.type === 'DELETE_COMPLETE') {
        worker.postMessage({ type: 'INIT' });
        return;
      }

      if (message.type === 'ERROR') {
        setModelLifecycle(createModelLifecycleErrorSummary());
      }
    }

    function handleWorkerError() {
      setModelLifecycle(createModelLifecycleErrorSummary());
    }

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    const initialRoute = getCurrentRoute();
    if (
      initialRoute.replaceHistory &&
      window.location.pathname + window.location.search + window.location.hash !== initialRoute.href
    ) {
      window.history.replaceState({}, '', initialRoute.href);
    }
    if (initialRoute.href !== '/') {
      focusRoute(initialRoute);
    }

    const handleHistoryNavigation = () => {
      const route = getCurrentRoute();
      if (route.replaceHistory) {
        commitRoute(route, 'replace');
        return;
      }

      setCurrentRoute(route);
      focusRoute(route);
    };
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHistoryNavigation);
    return () => {
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('hashchange', handleHistoryNavigation);
    };
  }, [commitRoute, focusRoute]);

  const handleDestinationClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, destinationId: PrimaryDestinationId) => {
      event.preventDefault();
      const destination = primaryDestinations.find((item) => item.id === destinationId);
      if (!destination || typeof window === 'undefined') {
        return;
      }
      const route = resolveAppRoute({ pathname: destination.href });
      commitRoute(route, 'push');
    },
    [commitRoute],
  );

  const handleFrameClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || typeof window === 'undefined' || event.button !== 0) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const anchor = getClosestRouteAnchor(event.target);
      if (!anchor || anchor.target || anchor.hasAttribute('download')) {
        return;
      }

      const route = resolveNavigationHref(anchor.href, window.location.href);
      if (!route) {
        return;
      }

      event.preventDefault();
      commitRoute(route, 'push');
    },
    [commitRoute],
  );

  const handleSkipToMain = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      focusRoute(currentRoute);
    },
    [currentRoute, focusRoute],
  );

  const localStatus = useMemo(
    () => createAppShellLocalStatusView({ modelLifecycle, online, pwa }),
    [modelLifecycle, online, pwa],
  );

  const appMenuItems = useMemo(
    () => createAppMenuItems(pwa.updateAvailable),
    [pwa.updateAvailable],
  );
  const activeDestination = currentRoute.primaryDestinationId;

  return (
    <div className="app-frame" onClick={handleFrameClick}>
      <a className="skip-link" href="#app-main" onClick={handleSkipToMain}>
        Skip to main content
      </a>
      <header className="app-frame-header" role="banner">
        <div className="app-frame-header__inner">
          <a
            className="app-brand"
            href="/"
            onClick={(event) => handleDestinationClick(event, 'dictate')}
          >
            Speech
          </a>
          <PrimaryNavigation
            className="app-primary-nav"
            activeDestination={activeDestination}
            onDestinationClick={handleDestinationClick}
          />
          <LocalStatusPopover status={localStatus} />
          <ApplicationMenu items={appMenuItems} />
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

function ApplicationMenu({ items }: { readonly items: readonly MenuButtonItem[] }) {
  return (
    <MenuButton
      buttonSize="sm"
      buttonVariant="secondary"
      className="app-menu"
      items={items}
      label="Menu"
      menuLabel="Application menu"
      placement="bottom-end"
    />
  );
}

function LocalStatusPopover({ status }: { readonly status: AppShellLocalStatusView }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = 'app-local-status-popover';

  function closePopover() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    closePopover();
  }

  return (
    <div
      className="app-local-status"
      data-open={open ? 'true' : undefined}
      data-tone={status.tone}
      onKeyDown={handleKeyDown}
    >
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={status.ariaLabel}
        className="app-local-status__button"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <span>Local</span>
        <strong>{status.label}</strong>
      </button>
      <div
        className="app-local-status__popover"
        hidden={!open}
        id={popoverId}
        role="group"
        aria-label="Local status details"
      >
        <p className="app-local-status__headline">{status.headline}</p>
        <dl>
          {status.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="app-local-status__privacy">{status.privacyNote}</p>
      </div>
    </div>
  );
}

function PrimaryNavigation({
  activeDestination,
  className,
  onDestinationClick,
}: {
  readonly activeDestination: PrimaryDestinationId | undefined;
  readonly className: string;
  readonly onDestinationClick: (
    event: MouseEvent<HTMLAnchorElement>,
    destinationId: PrimaryDestinationId,
  ) => void;
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

function createAppMenuItems(updateAvailable: boolean): readonly MenuButtonItem[] {
  const destinationItems: MenuButtonItem[] = appMenuDestinations.map((destination) => ({
    id: destination.id,
    kind: 'link',
    href: destination.href,
    label: destination.label,
  }));

  if (!updateAvailable) {
    return destinationItems;
  }

  return [
    ...destinationItems,
    {
      id: 'install-update',
      label: 'Install update',
      onSelect: () => {
        void activatePwaUpdate();
      },
    },
  ];
}

function PrimaryNavigationLink({
  active,
  destination,
  onDestinationClick,
}: {
  readonly active: boolean;
  readonly destination: PrimaryDestination;
  readonly onDestinationClick: (
    event: MouseEvent<HTMLAnchorElement>,
    destinationId: PrimaryDestinationId,
  ) => void;
}) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      href={destination.href}
      onClick={(event) => onDestinationClick(event, destination.id)}
    >
      {destination.label}
    </a>
  );
}

function getClosestRouteAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('a[href]');
}
