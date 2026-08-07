import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { authGuard } from './core/auth/auth.guard';
import { rolePermissionGuard } from './core/auth/role-permission.guard';
import { activeSaleGuard } from './core/sale/active-sale.guard';

describe('routes', () => {
  const shellRoute = routes.find((route) => route.path === '');

  it('guards the app shell with authGuard, ahead of anything role-based', () => {
    expect(shellRoute?.canActivate).toEqual([authGuard]);
  });

  it.each(['sale', 'products', 'sales', 'buyers', 'payment'])(
    'guards /%s with rolePermissionGuard',
    (path) => {
      const child = shellRoute?.children?.find((route) => route.path === path);

      expect(child?.canActivate).toContain(rolePermissionGuard);
    },
  );

  it('keeps activeSaleGuard on /payment, evaluated after the role check', () => {
    const payment = shellRoute?.children?.find((route) => route.path === 'payment');

    expect(payment?.canActivate).toEqual([rolePermissionGuard, activeSaleGuard]);
  });
});
