import { Route } from '@angular/router';

import { routes } from './app.routes';
import { authGuard } from './core/auth/auth.guard';
import { navPermissionGuard } from './core/permissions/nav-permission.guard';
import { activeSaleGuard } from './core/sale/active-sale.guard';

/**
 * Route-config-level checks that the new guard was composed alongside the
 * existing ones rather than replacing them — the actual "does one guard's
 * failure get masked by the other" behavior is exercised at the guard level
 * (nav-permission.guard.spec.ts) and, across a real navigated session, by
 * the e2e suite. This file just proves the wiring is what those tests
 * assume.
 */
describe('app routes — guard composition', () => {
  const FEATURE_ROUTE_PATHS = ['sale', 'products', 'sales', 'buyers', 'payment'];

  function shellRoute(): Route {
    const shell = routes.find((route) => route.path === '');
    if (!shell) {
      throw new Error('Expected the app-shell route (path: "") to exist.');
    }
    return shell;
  }

  function childRoute(path: string): Route {
    const child = shellRoute().children?.find((route) => route.path === path);
    if (!child) {
      throw new Error(`Expected a child route for path "${path}" under the app shell.`);
    }
    return child;
  }

  it('leaves authGuard on the app-shell route, unchanged', () => {
    expect(shellRoute().canActivate).toEqual([authGuard]);
  });

  it.each(FEATURE_ROUTE_PATHS)('applies navPermissionGuard to /%s', (path) => {
    expect(childRoute(path).canActivate).toContain(navPermissionGuard);
  });

  it('keeps activeSaleGuard on /payment alongside navPermissionGuard — neither replaces the other', () => {
    const paymentRoute = childRoute('payment');

    expect(paymentRoute.canActivate).toContain(activeSaleGuard);
    expect(paymentRoute.canActivate).toContain(navPermissionGuard);
    expect(paymentRoute.canActivate).toHaveLength(2);
  });
});
