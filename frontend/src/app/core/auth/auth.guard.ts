import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';

import { DEFAULT_SIGNED_IN_ROUTE, isRouteAllowedForEmployee } from '../navigation/route-access';
import { AUTH_SERVICE } from '../tokens';
import { returnUrlParams } from './return-url';

/**
 * Registered as both `canActivate` and `canActivateChild` on the shell route.
 * The `canActivate` alone would only run when the shell itself is activated —
 * moving between two of its children reuses the shell, so a role check hung
 * there would never see the second route.
 */
export const authGuard: CanActivateFn & CanActivateChildFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const authService = inject(AUTH_SERVICE);
  const router = inject(Router);

  const employee = authService.currentEmployee();

  if (!employee) {
    return router.createUrlTree(['/login'], { queryParams: returnUrlParams(state.url) });
  }

  if (isRouteAllowedForEmployee(employee, state.url, declaredNavItem(route))) {
    return true;
  }

  /**
   * Somewhere real rather than nowhere: an employee who reaches a route their
   * role doesn't cover has still signed in successfully, so they land on the
   * same default as any other sign-in rather than on a blank or broken page.
   */
  return router.createUrlTree([DEFAULT_SIGNED_IN_ROUTE]);
};

function declaredNavItem(route: ActivatedRouteSnapshot): string | undefined {
  const navItem: unknown = route.data['navItem'];

  return typeof navItem === 'string' ? navItem : undefined;
}
