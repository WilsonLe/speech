import { describe, expect, it, vi } from 'vitest';
import {
  createNavigationGuardDecision,
  createRouteRestorationPlan,
  focusPrimaryDestinationHeading,
  focusRouteHeading,
  getInitialPrimaryDestinationId,
  getPrimaryDestination,
  primaryDestinations,
  resolveAppRoute,
  resolveNavigationHref,
  targetRoutePatterns,
} from './routeState';

describe('v0.6 route migration and navigation guards', () => {
  it('defines exactly the three persistent primary destinations using path routes', () => {
    expect(primaryDestinations.map((destination) => destination.label)).toEqual([
      'Dictate',
      'Vocabulary',
      'Models',
    ]);
    expect(primaryDestinations.map((destination) => destination.href)).toEqual([
      '/',
      '/vocabulary',
      '/models',
    ]);
    expect(targetRoutePatterns).toEqual(
      expect.arrayContaining([
        '/',
        '/vocabulary',
        '/vocabulary/:setId',
        '/models/:profileId/enroll',
        '/models/:profileId/train',
        '/settings/diagnostics',
        '/about',
        '/setup/model',
      ]),
    );
  });

  it('resolves current target routes to the correct primary destination and focus plan', () => {
    const vocabulary = resolveAppRoute({
      pathname: '/vocabulary/work-terms',
      search: '?search=legal',
    });
    expect(vocabulary.routeId).toBe('vocabulary-detail');
    expect(vocabulary.primaryDestinationId).toBe('vocabulary');
    expect(vocabulary.params).toEqual({ setId: 'work-terms' });
    expect(vocabulary.href).toBe('/vocabulary/work-terms?search=legal');
    expect(createRouteRestorationPlan(vocabulary)).toMatchObject({
      headingId: 'vocabulary-title',
      scrollKey: 'vocabulary-detail:work-terms',
      stateSource: 'domain-storage',
    });

    const training = resolveAppRoute({
      pathname: '/models/profile.local/train',
      search: '?jobId=job-1&returnTo=/models/profile.local',
    });
    expect(training.routeId).toBe('model-train');
    expect(training.primaryDestinationId).toBe('models');
    expect(training.href).toBe(
      '/models/profile.local/train?jobId=job-1&returnTo=%2Fmodels%2Fprofile.local',
    );
    expect(createRouteRestorationPlan(training)).toMatchObject({
      headingId: 'runtime-title',
      scrollKey: 'model-train:profile.local',
      scrollRestoration: 'restore-current-stage',
    });
  });

  it('migrates v0.5 hash anchors to v0.6 routes while preserving safe IDs', () => {
    expect(resolveAppRoute({ pathname: '/', hash: '#diagnostics' }).href).toBe(
      '/settings/diagnostics',
    );
    expect(resolveAppRoute({ pathname: '/', hash: '#benchmark' }).href).toBe(
      '/settings/diagnostics?section=benchmark',
    );
    expect(
      resolveAppRoute({ pathname: '/', hash: '#vocabulary-title', search: '?setId=medical' }).href,
    ).toBe('/vocabulary/medical');
    expect(
      resolveAppRoute({
        pathname: '/',
        hash: '#personal-models-title',
        search: '?profileId=wilson.normal',
      }).href,
    ).toBe('/models/wilson.normal');
    expect(
      resolveAppRoute({
        pathname: '/',
        hash: '#microphone-title',
        search: '?profileId=office&promptId=prompt-7&condition=normal',
      }).href,
    ).toBe('/models/office/enroll?condition=normal&promptId=prompt-7');
    expect(
      resolveAppRoute({ pathname: '/', hash: '#microphone-title', search: '?profileId=../bad' })
        .href,
    ).toBe('/settings/audio');
    expect(
      resolveAppRoute({
        pathname: '/',
        hash: '#runtime-title',
        search: '?profileId=office&jobId=job-2',
      }).href,
    ).toBe('/models/office/train?jobId=job-2');
  });

  it('drops unsafe query state and rejects open return redirects', () => {
    const route = resolveAppRoute({
      pathname: '/models/profile-1/train',
      search:
        '?jobId=job-1&unknown=1&returnTo=https://example.com&profileId=raw&search=<script>&vocabulary=%2fsecret',
    });

    expect(route.href).toBe('/models/profile-1/train?jobId=job-1');
    expect(route.droppedUnsafeState).toBe(true);
    expect(route.replaceHistory).toBe(true);

    const safeReturn = resolveAppRoute({
      pathname: '/models/profile-1/export',
      search: '?returnTo=/models/profile-1/results?candidateId=candidate-7',
    });
    expect(safeReturn.href).toBe(
      '/models/profile-1/export?returnTo=%2Fmodels%2Fprofile-1%2Fresults%3FcandidateId%3Dcandidate-7',
    );

    for (const returnTo of [
      'https://example.com',
      '//example.com/path',
      'javascript:alert(1)',
      'data:text/html,private',
      '../settings',
      '/\\evil',
      '/%2f%2fevil.example',
      '/models/%2e%2e/settings',
    ]) {
      expect(
        resolveAppRoute({ pathname: '/models/profile-1/export', search: `?returnTo=${returnTo}` })
          .href,
      ).toBe('/models/profile-1/export');
    }
  });

  it('resolves only same-origin app navigation hrefs', () => {
    expect(
      resolveNavigationHref('/vocabulary?search=terms', 'https://app.example/models')?.href,
    ).toBe('/vocabulary?search=terms');
    expect(resolveNavigationHref('/#diagnostics', 'https://app.example/models')?.href).toBe(
      '/settings/diagnostics',
    );
    expect(resolveNavigationHref('https://evil.example/models', 'https://app.example/')?.href).toBe(
      undefined,
    );
    expect(resolveNavigationHref('/not-a-route', 'https://app.example/')?.href).toBe(undefined);
  });

  it('keeps old hash helpers compatible while pointing them to v0.6 routes', () => {
    expect(getInitialPrimaryDestinationId(undefined)).toBe('dictate');
    expect(getInitialPrimaryDestinationId('#transcript-title')).toBe('dictate');
    expect(getInitialPrimaryDestinationId('#vocabulary-title')).toBe('vocabulary');
    expect(getInitialPrimaryDestinationId('#personal-models-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#offline-model-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#diagnostics-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#benchmark-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#runtime-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#unknown-advanced-panel')).toBe('dictate');
  });

  it('focuses the route or destination heading without requiring app code to know heading IDs', () => {
    const focus = vi.fn();
    const heading = {
      focus,
      hasAttribute: (name: string) => name === 'tabindex',
    } as unknown as HTMLElement;
    const documentRef = {
      getElementById: vi.fn((id: string) =>
        id === getPrimaryDestination('models').headingId ? heading : null,
      ),
    } as Pick<Document, 'getElementById'>;

    expect(focusPrimaryDestinationHeading('models', documentRef)).toBe(true);
    expect(documentRef.getElementById).toHaveBeenCalledWith('personal-models-title');
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });

    const diagnostics = resolveAppRoute({ pathname: '/settings/diagnostics' });
    const diagnosticsDocument = {
      getElementById: vi.fn((id: string) => (id === 'diagnostics-title' ? heading : null)),
    } as Pick<Document, 'getElementById'>;
    expect(focusRouteHeading(diagnostics, diagnosticsDocument)).toBe(true);
    expect(diagnosticsDocument.getElementById).toHaveBeenCalledWith('diagnostics-title');
  });

  it('creates confirmation decisions for disruptive active work and unsaved UI edits', () => {
    const currentRoute = resolveAppRoute({ pathname: '/models/profile-1/train' });
    const nextRoute = resolveAppRoute({ pathname: '/vocabulary' });

    expect(createNavigationGuardDecision({ currentRoute, nextRoute })).toEqual({
      action: 'allow',
      reason: 'no-active-work',
    });
    expect(
      createNavigationGuardDecision({
        currentRoute,
        nextRoute: currentRoute,
        activeWork: { kind: 'training', label: 'training', disruptive: true },
      }),
    ).toEqual({ action: 'allow', reason: 'same-route' });
    expect(
      createNavigationGuardDecision({
        currentRoute,
        nextRoute,
        activeWork: {
          kind: 'training',
          label: 'training',
          currentRouteId: currentRoute.routeId,
          disruptive: true,
        },
      }),
    ).toMatchObject({
      action: 'confirm',
      reason: 'active-work',
      title: 'Leave training?',
      confirmLabel: 'Continue',
      cancelLabel: 'Stay',
    });
    expect(
      createNavigationGuardDecision({
        currentRoute,
        nextRoute: resolveAppRoute({ pathname: '/models/profile-2/train' }),
        activeWork: {
          kind: 'training',
          label: 'training',
          currentRouteId: currentRoute.routeId,
          disruptive: true,
        },
      }),
    ).toMatchObject({
      action: 'confirm',
      reason: 'active-work',
    });
    expect(
      createNavigationGuardDecision({ currentRoute, nextRoute, hasUnsavedUiEdits: true }),
    ).toMatchObject({
      action: 'confirm',
      reason: 'unsaved-ui-edits',
      title: 'Leave without saving?',
    });
  });
});
