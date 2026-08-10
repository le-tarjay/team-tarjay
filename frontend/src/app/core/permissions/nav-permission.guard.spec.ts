import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';

import { IAuthService } from '../auth/auth.service';
import { Employee } from '../models/auth/employee.model';
import { AUTH_SERVICE } from '../tokens';
import { navPermissionGuard } from './nav-permission.guard';
import { NavDestination } from './nav-permission.model';
import { NavPermissionService } from './nav-permission.service';

const ALL_DESTINATIONS: readonly NavDestination[] = [
  'sale',
  'products',
  'sales',
  'buyers',
  'payment',
];

/** One representative Employee per tier, per the story's unit test scenarios. */
const REPRESENTATIVE_EMPLOYEES: readonly Employee[] = [
  { id: 'a1', name: 'Associate Rep', tier: 'Associate', department: 'Cashier' },
  { id: 'd1', name: 'Dept Manager Rep', tier: 'Department Manager', department: 'Grocery' },
  { id: 's1', name: 'Store Manager Rep', tier: 'Store Manager', department: 'Electronics' },
  { id: 'r1', name: 'Receiving Associate Rep', tier: 'Receiving Associate', department: 'storewide' },
];

function routeFor(path: NavDestination): ActivatedRouteSnapshot {
  return { routeConfig: { path } } as unknown as ActivatedRouteSnapshot;
}

function fakeAuthService(employee: Employee | null): IAuthService {
  return {
    currentEmployee: signal(employee),
    isAuthenticated: signal(employee !== null),
    login: () => {
      throw new Error('login() is not exercised by this spec');
    },
    logout: () => {},
  };
}

function configure(employee: Employee | null, visibleDestinations?: ReadonlySet<NavDestination>): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AUTH_SERVICE, useValue: fakeAuthService(employee) },
      ...(visibleDestinations
        ? [
            {
              provide: NavPermissionService,
              useValue: { getVisibleDestinations: () => visibleDestinations },
            },
          ]
        : []),
    ],
  });
}

function runGuard(path: NavDestination) {
  return TestBed.runInInjectionContext(() =>
    navPermissionGuard(routeFor(path), {} as unknown as RouterStateSnapshot),
  );
}

describe('navPermissionGuard', () => {
  describe('against the real permission model (LET-80)', () => {
    it('allows an Associate into a route in their (full-access) visible set', () => {
      configure({ id: '1', name: 'Alex Rivera', tier: 'Associate', department: 'Cashier' });
      expect(runGuard('payment')).toBe(true);
    });

    it('allows a Department Manager into a route in their (full-access) visible set', () => {
      configure({ id: '2', name: 'Jordan Lee', tier: 'Department Manager', department: 'Electronics' });
      expect(runGuard('sales')).toBe(true);
    });

    it('allows a Store Manager into a route in their (full-access) visible set', () => {
      configure({ id: '3', name: 'Sam Patel', tier: 'Store Manager', department: 'Customer Support' });
      expect(runGuard('buyers')).toBe(true);
    });

    it('allows a Receiving Associate into the one route in their visible set', () => {
      configure({ id: '4', name: 'Casey Kim', tier: 'Receiving Associate', department: 'storewide' });
      expect(runGuard('products')).toBe(true);
    });

    it('blocks a Receiving Associate from a route outside their visible set (the AC-82 direct-URL case)', () => {
      configure({ id: '4', name: 'Casey Kim', tier: 'Receiving Associate', department: 'storewide' });

      const result = runGuard('buyers');

      expect(result).not.toBe(true);
      expect(result).toBeInstanceOf(UrlTree);
    });
  });

  // The real LET-80 map currently grants full access to every named-department
  // tier, so Receiving Associate is the only tier with a route outside its
  // visible set today. These stub the permission model so the guard's own
  // block/allow contract is exercised the same way for all four tiers,
  // independent of what today's mapping happens to grant.
  describe('blocking/allowing per tier against a stubbed, restricted permission model', () => {
    for (const employee of REPRESENTATIVE_EMPLOYEES) {
      it(`blocks ${employee.tier} from a route outside a restricted visible set`, () => {
        configure(employee, new Set(['sale']));

        const result = runGuard('buyers');

        expect(result).not.toBe(true);
        expect(result).toBeInstanceOf(UrlTree);
      });

      it(`allows ${employee.tier} into a route inside a restricted visible set`, () => {
        configure(employee, new Set(['sale']));

        expect(runGuard('sale')).toBe(true);
      });
    }
  });

  it('blocks all five routes when the visible set is empty', () => {
    const employee: Employee = { id: '5', name: 'Nobody', tier: 'Associate', department: 'Grocery' };
    configure(employee, new Set());

    for (const destination of ALL_DESTINATIONS) {
      const result = runGuard(destination);

      expect(result).not.toBe(true);
      expect(result).toBeInstanceOf(UrlTree);
    }
  });

  it('blocks navigation rather than throwing when there is no signed-in employee', () => {
    configure(null, new Set(['sale']));

    const result = runGuard('sale');

    expect(result).not.toBe(true);
    expect(result).toBeInstanceOf(UrlTree);
  });
});
