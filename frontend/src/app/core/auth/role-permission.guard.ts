import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { NavDestination } from '../permissions/nav-permission.model';
import { NavPermissionService } from '../permissions/nav-permission.service';
import { AUTH_SERVICE } from '../tokens';

// Blocks direct navigation to a route outside the current employee's visible
// set (ADR-frontend §4.2, API map row 8). Nav-bar link hiding (Story 4) only
// keeps a disallowed route from being discovered through the UI; this guard
// is what actually stops navigating straight to its URL.
export const rolePermissionGuard: CanActivateFn = (route) => {
  const authService = inject(AUTH_SERVICE);
  const navPermissionService = inject(NavPermissionService);
  const router = inject(Router);

  const employee = authService.currentEmployee();

  if (!employee) {
    // The parent route's authGuard already denies an unauthenticated request
    // before this guard would run during real navigation — this branch is a
    // defensive fallback only, never the primary enforcement path.
    return router.createUrlTree(['/login']);
  }

  const visibleDestinations = navPermissionService.resolveVisibleDestinations(employee);
  const targetDestination = `/${route.routeConfig?.path}` as NavDestination;

  if (visibleDestinations.includes(targetDestination)) {
    return true;
  }

  const fallback = visibleDestinations[0] ?? '/login';

  return router.createUrlTree([fallback]);
};
