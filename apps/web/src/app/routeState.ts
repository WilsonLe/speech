export type PrimaryDestinationId = 'dictate' | 'vocabulary' | 'models';

export interface PrimaryDestination {
  readonly id: PrimaryDestinationId;
  readonly label: 'Dictate' | 'Vocabulary' | 'Models';
  readonly href: AppRoutePath;
  readonly headingId: string;
}

export type AppRouteId =
  | 'dictate'
  | 'vocabulary-list'
  | 'vocabulary-new'
  | 'vocabulary-detail'
  | 'models-list'
  | 'models-new'
  | 'models-import'
  | 'model-detail'
  | 'model-enroll'
  | 'model-train'
  | 'model-results'
  | 'model-export'
  | 'settings-index'
  | 'settings-audio'
  | 'settings-storage'
  | 'settings-privacy'
  | 'settings-shortcuts'
  | 'settings-diagnostics'
  | 'about'
  | 'setup-model';

export type AppRoutePath =
  | '/'
  | '/vocabulary'
  | '/vocabulary/new'
  | `/vocabulary/${string}`
  | '/models'
  | '/models/new'
  | '/models/import'
  | `/models/${string}`
  | `/models/${string}/enroll`
  | `/models/${string}/train`
  | `/models/${string}/results`
  | `/models/${string}/export`
  | '/settings'
  | '/settings/audio'
  | '/settings/storage'
  | '/settings/privacy'
  | '/settings/shortcuts'
  | '/settings/diagnostics'
  | '/about'
  | '/setup/model';

export type RouteScrollRestoration =
  | 'restore-per-route-when-returning'
  | 'restore-per-route-and-setId'
  | 'restore-per-route-and-profileId'
  | 'restore-per-route-and-section'
  | 'restore-current-prompt'
  | 'restore-current-stage'
  | 'reset-on-new-task'
  | 'reset-on-required-setup';

export interface AppRouteSpec {
  readonly id: AppRouteId;
  readonly pattern: string;
  readonly title: string;
  readonly primaryDestinationId?: PrimaryDestinationId;
  readonly headingId: string;
  readonly queryKeys: readonly SafeQueryKey[];
  readonly scrollRestoration: RouteScrollRestoration;
  readonly stateSource: 'domain-storage' | 'ui-preferences' | 'static';
}

export type SafeQueryKey =
  | 'candidateId'
  | 'condition'
  | 'focus'
  | 'jobId'
  | 'language'
  | 'model'
  | 'profileId'
  | 'promptId'
  | 'replaceProfileId'
  | 'returnTo'
  | 'search'
  | 'section'
  | 'setId'
  | 'status'
  | 'vocabulary';

export interface RouteLocationLike {
  readonly pathname?: string;
  readonly search?: string;
  readonly hash?: string;
}

export interface ResolvedAppRoute {
  readonly routeId: AppRouteId;
  readonly path: AppRoutePath;
  readonly search: string;
  readonly href: string;
  readonly primaryDestinationId?: PrimaryDestinationId;
  readonly headingId: string;
  readonly scrollRestoration: RouteScrollRestoration;
  readonly stateSource: AppRouteSpec['stateSource'];
  readonly params: Readonly<Record<string, string>>;
  readonly safeQuery: URLSearchParams;
  readonly legacyRedirect: boolean;
  readonly droppedUnsafeState: boolean;
  readonly replaceHistory: boolean;
}

export interface RouteFocusRestorationPlan {
  readonly headingId: string;
  readonly scrollKey: string;
  readonly scrollRestoration: RouteScrollRestoration;
  readonly stateSource: AppRouteSpec['stateSource'];
}

export type ActiveNavigationWorkKind =
  | 'recording'
  | 'enrollment'
  | 'training'
  | 'import'
  | 'export'
  | 'model-update';

export interface ActiveNavigationWork {
  readonly kind: ActiveNavigationWorkKind;
  readonly label: string;
  readonly currentRouteId?: AppRouteId;
  readonly disruptive: boolean;
}

export type NavigationGuardDecision =
  | {
      readonly action: 'allow';
      readonly reason: 'same-route' | 'no-active-work' | 'safe-active-work';
    }
  | {
      readonly action: 'confirm';
      readonly reason: 'active-work' | 'unsaved-ui-edits';
      readonly title: string;
      readonly message: string;
      readonly confirmLabel: string;
      readonly cancelLabel: string;
    };

export const primaryDestinations = [
  {
    id: 'dictate',
    label: 'Dictate',
    href: '/',
    headingId: 'transcript-title',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    href: '/vocabulary',
    headingId: 'vocabulary-title',
  },
  {
    id: 'models',
    label: 'Models',
    href: '/models',
    headingId: 'personal-models-title',
  },
] as const satisfies readonly PrimaryDestination[];

const appRouteSpecs = [
  defineRoute({
    id: 'dictate',
    pattern: '/',
    title: 'Dictate',
    primaryDestinationId: 'dictate',
    headingId: 'transcript-title',
    queryKeys: ['language', 'model', 'vocabulary'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'vocabulary-list',
    pattern: '/vocabulary',
    title: 'Vocabulary',
    primaryDestinationId: 'vocabulary',
    headingId: 'vocabulary-title',
    queryKeys: ['search', 'returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'vocabulary-new',
    pattern: '/vocabulary/new',
    title: 'New vocabulary set',
    primaryDestinationId: 'vocabulary',
    headingId: 'vocabulary-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'reset-on-new-task',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'vocabulary-detail',
    pattern: '/vocabulary/:setId',
    title: 'Vocabulary set',
    primaryDestinationId: 'vocabulary',
    headingId: 'vocabulary-title',
    queryKeys: ['search', 'returnTo'],
    scrollRestoration: 'restore-per-route-and-setId',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'models-list',
    pattern: '/models',
    title: 'Voice models',
    primaryDestinationId: 'models',
    headingId: 'personal-models-title',
    queryKeys: ['status', 'returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'models-new',
    pattern: '/models/new',
    title: 'New voice model',
    primaryDestinationId: 'models',
    headingId: 'create-model-flow-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'reset-on-new-task',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'models-import',
    pattern: '/models/import',
    title: 'Import voice model',
    primaryDestinationId: 'models',
    headingId: 'personal-models-title',
    queryKeys: ['returnTo', 'replaceProfileId'],
    scrollRestoration: 'reset-on-new-task',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'model-enroll',
    pattern: '/models/:profileId/enroll',
    title: 'Record voice model',
    primaryDestinationId: 'models',
    headingId: 'microphone-title',
    queryKeys: ['promptId', 'condition', 'returnTo'],
    scrollRestoration: 'restore-current-prompt',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'model-train',
    pattern: '/models/:profileId/train',
    title: 'Train voice model',
    primaryDestinationId: 'models',
    headingId: 'training-readiness-title',
    queryKeys: ['jobId', 'returnTo'],
    scrollRestoration: 'restore-current-stage',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'model-results',
    pattern: '/models/:profileId/results',
    title: 'Training results',
    primaryDestinationId: 'models',
    headingId: 'personal-models-title',
    queryKeys: ['candidateId', 'returnTo'],
    scrollRestoration: 'restore-per-route-and-profileId',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'model-export',
    pattern: '/models/:profileId/export',
    title: 'Export voice model',
    primaryDestinationId: 'models',
    headingId: 'personal-models-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'reset-on-new-task',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'model-detail',
    pattern: '/models/:profileId',
    title: 'Voice model detail',
    primaryDestinationId: 'models',
    headingId: 'personal-models-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-and-profileId',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'settings-index',
    pattern: '/settings',
    title: 'Settings',
    headingId: 'offline-model-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'ui-preferences',
  }),
  defineRoute({
    id: 'settings-audio',
    pattern: '/settings/audio',
    title: 'Audio',
    headingId: 'microphone-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'settings-storage',
    pattern: '/settings/storage',
    title: 'Storage',
    headingId: 'offline-model-title',
    queryKeys: ['returnTo', 'focus'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'settings-privacy',
    pattern: '/settings/privacy',
    title: 'Privacy',
    headingId: 'transcript-privacy-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'static',
  }),
  defineRoute({
    id: 'settings-shortcuts',
    pattern: '/settings/shortcuts',
    title: 'Keyboard shortcuts',
    headingId: 'transcript-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'static',
  }),
  defineRoute({
    id: 'settings-diagnostics',
    pattern: '/settings/diagnostics',
    title: 'Diagnostics',
    headingId: 'diagnostics-title',
    queryKeys: ['section', 'returnTo'],
    scrollRestoration: 'restore-per-route-and-section',
    stateSource: 'domain-storage',
  }),
  defineRoute({
    id: 'about',
    pattern: '/about',
    title: 'About',
    headingId: 'roadmap-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'restore-per-route-when-returning',
    stateSource: 'static',
  }),
  defineRoute({
    id: 'setup-model',
    pattern: '/setup/model',
    title: 'Install speech model',
    headingId: 'offline-model-title',
    queryKeys: ['returnTo'],
    scrollRestoration: 'reset-on-required-setup',
    stateSource: 'domain-storage',
  }),
] as const satisfies readonly AppRouteSpec[];

export const targetRoutePatterns = appRouteSpecs.map((route) => route.pattern);

const defaultRoute = appRouteSpecs[0];
const defaultPrimaryDestination = primaryDestinations[0];
const idValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const encodedTraversalPattern = /%(?:2e|2f|5c)/i;
const unsafeQueryTextPattern = /[<>"'`\\]/;
const allSafeQueryKeys: readonly SafeQueryKey[] = [
  'candidateId',
  'condition',
  'focus',
  'jobId',
  'language',
  'model',
  'profileId',
  'promptId',
  'replaceProfileId',
  'returnTo',
  'search',
  'section',
  'setId',
  'status',
  'vocabulary',
];
const idQueryKeys = new Set<SafeQueryKey>([
  'candidateId',
  'jobId',
  'model',
  'profileId',
  'promptId',
  'replaceProfileId',
  'setId',
  'vocabulary',
]);
const allowedReturnPrefixes = ['/vocabulary', '/models', '/settings', '/about', '/setup/model'];

const legacyHashRedirects = new Set([
  '',
  '#',
  '#dictate',
  '#transcript-title',
  '#committed-transcript-text',
  '#transcript-privacy-title',
  '#vocabulary',
  '#vocabulary-title',
  '#models',
  '#personal-models-title',
  '#microphone-title',
  '#offline-model-title',
  '#diagnostics',
  '#diagnostics-title',
  '#benchmark',
  '#benchmark-title',
  '#runtime-title',
  '#roadmap-title',
]);

function defineRoute(route: AppRouteSpec): AppRouteSpec {
  return route;
}

export function normalizeHashForPrimaryDestination(hash: string | undefined): PrimaryDestinationId {
  const location: RouteLocationLike =
    hash === undefined ? { pathname: '/' } : { pathname: '/', hash };
  return getClosestPrimaryDestinationId(resolveAppRoute(location));
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

export function resolveAppRoute(location: RouteLocationLike): ResolvedAppRoute {
  const pathname = normalizePathname(location.pathname);
  const hash = normalizeHash(location.hash);
  const search = location.search ?? '';

  if (pathname === '/' && isLegacyHash(hash)) {
    return resolveLegacyHashRedirect(hash, search);
  }

  const routeMatch = matchTargetRoute(pathname);
  if (!routeMatch) {
    return buildResolvedRoute(defaultRoute, {}, sanitizeQuery(search, defaultRoute.queryKeys), {
      legacyRedirect: true,
      replaceHistory: true,
      droppedUnsafeState: true,
    });
  }

  const safeQuery = sanitizeQuery(search, routeMatch.route.queryKeys);
  const droppedUnsafeState = stripQuestionMark(search) !== safeQuery.toString();
  return buildResolvedRoute(routeMatch.route, routeMatch.params, safeQuery, {
    legacyRedirect: false,
    replaceHistory: droppedUnsafeState || hash !== '',
    droppedUnsafeState,
  });
}

export function resolveNavigationHref(
  href: string,
  baseHref = 'http://localhost/',
): ResolvedAppRoute | undefined {
  let parsed: URL;
  let base: URL;
  try {
    base = new URL(baseHref);
    parsed = new URL(href, base);
  } catch {
    return undefined;
  }

  if (parsed.origin !== base.origin) {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return undefined;
  }

  const resolved = resolveAppRoute({
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  });

  if (resolved.routeId === defaultRoute.id && parsed.pathname !== '/' && parsed.hash === '') {
    return undefined;
  }

  return resolved;
}

export function createRouteRestorationPlan(route: ResolvedAppRoute): RouteFocusRestorationPlan {
  return {
    headingId: route.headingId,
    scrollKey: createRouteScrollKey(route),
    scrollRestoration: route.scrollRestoration,
    stateSource: route.stateSource,
  };
}

export function createNavigationGuardDecision(options: {
  readonly currentRoute: ResolvedAppRoute;
  readonly nextRoute: ResolvedAppRoute;
  readonly activeWork?: ActiveNavigationWork;
  readonly hasUnsavedUiEdits?: boolean;
}): NavigationGuardDecision {
  const { activeWork, currentRoute, hasUnsavedUiEdits = false, nextRoute } = options;

  if (currentRoute.href === nextRoute.href) {
    return { action: 'allow', reason: 'same-route' };
  }

  if (hasUnsavedUiEdits) {
    return {
      action: 'confirm',
      reason: 'unsaved-ui-edits',
      title: 'Leave without saving?',
      message: 'This screen has local edits that are not saved yet.',
      confirmLabel: 'Leave screen',
      cancelLabel: 'Stay',
    };
  }

  if (!activeWork) {
    return { action: 'allow', reason: 'no-active-work' };
  }

  if (!activeWork.disruptive) {
    return { action: 'allow', reason: 'safe-active-work' };
  }

  return {
    action: 'confirm',
    reason: 'active-work',
    title: `Leave ${activeWork.label}?`,
    message: `Navigation could interrupt ${formatActiveWorkKind(activeWork.kind)}. Continue only if you are ready to leave this workflow.`,
    confirmLabel: 'Continue',
    cancelLabel: 'Stay',
  };
}

export function focusRouteHeading(
  route: ResolvedAppRoute,
  documentRef: Pick<Document, 'getElementById'> = document,
): boolean {
  const heading = documentRef.getElementById(route.headingId);
  if (!isFocusableElement(heading)) {
    return false;
  }

  if (!heading.hasAttribute('tabindex')) {
    heading.tabIndex = -1;
  }
  heading.focus({ preventScroll: false });
  return true;
}

export function focusPrimaryDestinationHeading(
  destinationId: PrimaryDestinationId,
  documentRef: Pick<Document, 'getElementById'> = document,
): boolean {
  const destination = getPrimaryDestination(destinationId);
  const route = resolveAppRoute({ pathname: destination.href });
  return focusRouteHeading(route, documentRef);
}

function getClosestPrimaryDestinationId(route: ResolvedAppRoute): PrimaryDestinationId {
  if (route.primaryDestinationId) {
    return route.primaryDestinationId;
  }

  if (route.routeId === 'settings-privacy' || route.routeId === 'settings-shortcuts') {
    return 'dictate';
  }

  return 'models';
}

function resolveLegacyHashRedirect(hash: string, search: string): ResolvedAppRoute {
  const normalizedHash = normalizeHash(hash);
  const rawQuery = new URLSearchParams(stripQuestionMark(search));
  const safeProfileId = sanitizeIdValue(rawQuery.get('profileId'));
  const safeSetId = sanitizeIdValue(rawQuery.get('setId'));

  switch (normalizedHash) {
    case '#vocabulary':
    case '#vocabulary-title': {
      const path = safeSetId ? `/vocabulary/${encodeURIComponent(safeSetId)}` : '/vocabulary';
      const route = resolveCanonicalPath(
        path,
        search,
        safeSetId ? ['search', 'returnTo'] : ['search', 'returnTo'],
      );
      return markLegacy(route);
    }
    case '#models':
    case '#personal-models-title': {
      const path = safeProfileId ? `/models/${encodeURIComponent(safeProfileId)}` : '/models';
      const route = resolveCanonicalPath(
        path,
        search,
        safeProfileId ? ['returnTo'] : ['status', 'returnTo'],
      );
      return markLegacy(route);
    }
    case '#microphone-title': {
      if (!safeProfileId) {
        return markLegacy(resolveCanonicalPath('/settings/audio', search, ['returnTo']));
      }
      return markLegacy(
        resolveCanonicalPath(`/models/${encodeURIComponent(safeProfileId)}/enroll`, search, [
          'promptId',
          'condition',
          'returnTo',
        ]),
      );
    }
    case '#runtime-title': {
      if (!safeProfileId) {
        return markLegacy(resolveCanonicalPath('/settings/diagnostics', search, ['returnTo']));
      }
      return markLegacy(
        resolveCanonicalPath(`/models/${encodeURIComponent(safeProfileId)}/train`, search, [
          'jobId',
          'returnTo',
        ]),
      );
    }
    case '#offline-model-title':
      return markLegacy(resolveCanonicalPath('/setup/model', search, ['returnTo']));
    case '#diagnostics':
    case '#diagnostics-title':
      return markLegacy(
        resolveCanonicalPath('/settings/diagnostics', search, ['section', 'returnTo']),
      );
    case '#benchmark':
    case '#benchmark-title': {
      const safeQuery = sanitizeQuery(search, ['returnTo']);
      safeQuery.set('section', 'benchmark');
      return markLegacy(
        resolveCanonicalPath('/settings/diagnostics', `?${safeQuery.toString()}`, [
          'section',
          'returnTo',
        ]),
      );
    }
    case '#transcript-privacy-title':
      return markLegacy(resolveCanonicalPath('/settings/privacy', search, ['returnTo']));
    case '#roadmap-title':
      return markLegacy(resolveCanonicalPath('/about', search, ['returnTo']));
    case '':
    case '#':
    case '#dictate':
    case '#transcript-title':
    case '#committed-transcript-text':
    default:
      return markLegacy(resolveCanonicalPath('/', search, ['language', 'model', 'vocabulary']));
  }
}

function resolveCanonicalPath(
  path: string,
  search: string,
  queryKeys: readonly SafeQueryKey[],
): ResolvedAppRoute {
  const match = matchTargetRoute(path) ?? { route: defaultRoute, params: {} };
  const safeQuery = sanitizeQuery(search, queryKeys);
  return buildResolvedRoute(match.route, match.params, safeQuery, {
    legacyRedirect: false,
    replaceHistory: false,
    droppedUnsafeState: stripQuestionMark(search) !== safeQuery.toString(),
  });
}

function markLegacy(route: ResolvedAppRoute): ResolvedAppRoute {
  return {
    ...route,
    legacyRedirect: true,
    replaceHistory: true,
  };
}

function buildResolvedRoute(
  route: AppRouteSpec,
  params: Readonly<Record<string, string>>,
  safeQuery: URLSearchParams,
  flags: Pick<ResolvedAppRoute, 'droppedUnsafeState' | 'legacyRedirect' | 'replaceHistory'>,
): ResolvedAppRoute {
  const path = buildConcretePath(route.pattern, params);
  const search = safeQuery.toString();
  return {
    ...flags,
    routeId: route.id,
    path,
    search,
    href: search ? `${path}?${search}` : path,
    ...(route.primaryDestinationId ? { primaryDestinationId: route.primaryDestinationId } : {}),
    headingId: route.headingId,
    scrollRestoration: route.scrollRestoration,
    stateSource: route.stateSource,
    params,
    safeQuery,
  };
}

function sanitizeQuery(search: string, allowedKeys: readonly SafeQueryKey[]): URLSearchParams {
  const input = new URLSearchParams(stripQuestionMark(search));
  const allowed = new Set<SafeQueryKey>(allowedKeys);
  const output = new URLSearchParams();

  for (const key of allSafeQueryKeys) {
    if (!allowed.has(key)) {
      continue;
    }

    const values = input.getAll(key).slice(0, 8);
    for (const value of values) {
      const safeValue = sanitizeQueryValue(key, value);
      if (safeValue !== undefined) {
        output.append(key, safeValue);
      }
    }
  }

  return output;
}

function sanitizeQueryValue(key: SafeQueryKey, value: string): string | undefined {
  if (key === 'returnTo') {
    return sanitizeReturnTarget(value) ?? undefined;
  }

  if (idQueryKeys.has(key)) {
    return sanitizeIdValue(value) ?? undefined;
  }

  if (value.length > 120 || hasControlCharacter(value) || unsafeQueryTextPattern.test(value)) {
    return undefined;
  }

  if (encodedTraversalPattern.test(value)) {
    return undefined;
  }

  return value;
}

function sanitizeIdValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  return idValuePattern.test(value) ? value : undefined;
}

function sanitizeReturnTarget(value: string): string | null {
  if (
    value.length === 0 ||
    value.length > 240 ||
    hasControlCharacter(value) ||
    value.includes('\\') ||
    value.includes('../') ||
    value.includes('/..') ||
    encodedTraversalPattern.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.startsWith('//') ||
    !value.startsWith('/')
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://speech.local');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://speech.local' || parsed.hash !== '') {
    return null;
  }

  const decodedPathname = decodeUriSafely(parsed.pathname);
  if (!decodedPathname || decodedPathname.includes('..') || decodedPathname.includes('\\')) {
    return null;
  }

  if (!isAllowedReturnPath(parsed.pathname) || !matchTargetRoute(parsed.pathname)) {
    return null;
  }

  const matchedRoute = matchTargetRoute(parsed.pathname);
  if (!matchedRoute) {
    return null;
  }
  const safeQuery = sanitizeQuery(parsed.search, matchedRoute.route.queryKeys);
  const search = safeQuery.toString();
  return search ? `${parsed.pathname}?${search}` : parsed.pathname;
}

function isAllowedReturnPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }

  return allowedReturnPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function matchTargetRoute(pathname: string):
  | {
      readonly route: AppRouteSpec;
      readonly params: Readonly<Record<string, string>>;
    }
  | undefined {
  const normalizedPath = normalizePathname(pathname);
  const pathSegments = splitPath(normalizedPath);

  for (const route of appRouteSpecs) {
    const patternSegments = splitPath(route.pattern);
    if (patternSegments.length !== pathSegments.length) {
      continue;
    }

    const params: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < patternSegments.length; index += 1) {
      const patternSegment = patternSegments[index];
      const pathSegment = pathSegments[index];
      if (!patternSegment || !pathSegment) {
        matches = false;
        break;
      }

      if (patternSegment.startsWith(':')) {
        const decodedValue = decodeUriSafely(pathSegment);
        const safeValue = sanitizeIdValue(decodedValue);
        if (!safeValue) {
          matches = false;
          break;
        }
        params[patternSegment.slice(1)] = safeValue;
        continue;
      }

      if (patternSegment !== pathSegment) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return { route, params };
    }
  }

  return undefined;
}

function buildConcretePath(
  pattern: string,
  params: Readonly<Record<string, string>>,
): AppRoutePath {
  const concretePath = pattern.replace(/:([A-Za-z]+)/g, (_match, key: string) => {
    const value = params[key];
    return value ? encodeURIComponent(value) : '';
  });
  return concretePath as AppRoutePath;
}

function createRouteScrollKey(route: ResolvedAppRoute): string {
  const identity =
    route.params['profileId'] ?? route.params['setId'] ?? route.safeQuery.get('section');
  return identity ? `${route.routeId}:${identity}` : route.routeId;
}

function normalizePathname(pathname: string | undefined): string {
  if (!pathname || pathname === '') {
    return '/';
  }

  if (!pathname.startsWith('/')) {
    return '/';
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function normalizeHash(hash: string | undefined): string {
  if (!hash) {
    return '';
  }

  return hash.startsWith('#') ? hash : `#${hash}`;
}

function isLegacyHash(hash: string): boolean {
  return legacyHashRedirects.has(hash);
}

function stripQuestionMark(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

function splitPath(pathname: string): readonly string[] {
  if (pathname === '/') {
    return [];
  }

  return pathname.split('/').filter(Boolean);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }
  return false;
}

function decodeUriSafely(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function formatActiveWorkKind(kind: ActiveNavigationWorkKind): string {
  switch (kind) {
    case 'recording':
      return 'the active recording';
    case 'enrollment':
      return 'the enrollment recording';
    case 'training':
      return 'model training';
    case 'import':
      return 'the model import';
    case 'export':
      return 'the model export';
    case 'model-update':
      return 'the model update';
  }
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
