export const componentGalleryHashRoute = '#ui-gallery';

export interface ComponentGalleryRouteDecision {
  readonly shouldRender: boolean;
  readonly reason: 'development-route' | 'not-development' | 'different-route';
}

export function shouldRenderComponentGalleryRoute(
  hash: string | undefined,
  isDevelopment: boolean,
): ComponentGalleryRouteDecision {
  if (!isDevelopment) {
    return { shouldRender: false, reason: 'not-development' };
  }

  if (hash === componentGalleryHashRoute) {
    return { shouldRender: true, reason: 'development-route' };
  }

  return { shouldRender: false, reason: 'different-route' };
}

export function getBrowserHash(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.hash;
}
