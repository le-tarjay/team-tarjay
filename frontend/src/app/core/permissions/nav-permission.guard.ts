import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AUTH_SERVICE } from '../tokens';
import { NavDestination } from './nav-permission.model';
import { NavPermissionService } from './nav-permission.service';

/**
 * Every routed destination the permission model has an opinion about,
 * mirroring NavDestination — also doubles as the fallback order used when a
 * navigation is blocked: the guard redirects to the first of these the
 * employee can actually see, so a blocked navigation lands somewhere usable
 * instead of bouncing between two blocked routes.
 */
const DESTINATION_FALLBACK_ORDER: readonly NavDestination[] = [
  'sale',
  'products',
  'sales',
  'buyers',
  'payment',
];

function isNavDestination(path: string | null | undefined): path is NavDestination {
  return (DESTINATION_FALLBACK_ORDER as readonly string[]).includes(path ?? '');
}

/**
 * Blocks navigation to a route the current employee's tier/department can't
 * see, per LET-80's permission model. Applied alongside authGuard (session)
 * and, on /payment, activeSaleGuard — this guard only ever answers the
 * permission question; it doesn't check session state or active-sale state,
 * so it can't mask either of those guards' failures, and it can't be masked
 * by them either. A direct URL navigation goes through this guard exactly
 * like a nav-link click would have.
 */
export const navPermissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AUTH_SERVICE);
  const navPermissionService = inject(NavPermissionService);
  const router = inject(Router);

  const employee = authService.currentEmployee();
  const destination = route.routeConfig?.path;

  if (!employee || !isNavDestination(destination)) {
    return router.createUrlTree(['/login']);
  }

  const visibleDestinations = navPermissionService.getVisibleDestinations(employee);

  if (visibleDestinations.has(destination)) {
    return true;
  }

  const fallback = DESTINATION_FALLBACK_ORDER.find((candidate) =>
    visibleDestinations.has(candidate),
  );

  return router.createUrlTree([fallback ? `/${fallback}` : '/login']);
};
