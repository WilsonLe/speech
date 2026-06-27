import { createContext, useContext } from 'react';
import { resolveAppRoute, type ResolvedAppRoute } from './routeState';

export const AppRouteContext = createContext<ResolvedAppRoute | null>(null);

export function useAppRoute(): ResolvedAppRoute {
  const route = useContext(AppRouteContext);
  return route ?? resolveAppRoute({ pathname: '/' });
}
