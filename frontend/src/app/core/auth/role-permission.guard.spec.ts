import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { Employee } from '../models/auth/employee.model';
import { activeSaleGuard } from '../sale/active-sale.guard';
import { SaleService } from '../sale/sale.service';
import { AUTH_SERVICE } from '../tokens';
import { IAuthService, LoginCredentials } from './auth.service';
import { rolePermissionGuard } from './role-permission.guard';

const ASSOCIATE: Employee = { id: '1', name: 'Avery Brooks', tier: 'associate', department: 'grocery' };
const RECEIVING_ASSOCIATE: Employee = {
  id: '2',
  name: 'Riley Chen',
  tier: 'receiving-associate',
  department: 'storewide',
};

function authServiceStub(employee: Employee | null): IAuthService {
  const employeeState = signal(employee);

  return {
    currentEmployee: employeeState.asReadonly(),
    isAuthenticated: computed(() => employeeState() !== null),
    login: (_credentials: LoginCredentials) => {
      throw new Error('login() is not exercised by role-permission.guard.spec');
    },
    logout: () => employeeState.set(null),
  };
}

function routeSnapshotFor(path: string): ActivatedRouteSnapshot {
  return { routeConfig: { path } } as unknown as ActivatedRouteSnapshot;
}

const NOOP_STATE = {} as unknown as RouterStateSnapshot;

describe('rolePermissionGuard', () => {
  function configure(employee: Employee | null): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AUTH_SERVICE, useValue: authServiceStub(employee) },
      ],
    });
  }

  it('activates a route present in the visible set (sale)', () => {
    configure(ASSOCIATE);

    const result = TestBed.runInInjectionContext(() => rolePermissionGuard(routeSnapshotFor('sale'), NOOP_STATE));

    expect(result).toBe(true);
  });

  it('activates a route present in the visible set (sales)', () => {
    configure(ASSOCIATE);

    const result = TestBed.runInInjectionContext(() => rolePermissionGuard(routeSnapshotFor('sales'), NOOP_STATE));

    expect(result).toBe(true);
  });

  it('denies and redirects away from a route absent from the visible set', () => {
    // Associate's visible set is /sale, /products, /sales, /payment — no /buyers.
    configure(ASSOCIATE);

    const result = TestBed.runInInjectionContext(() =>
      rolePermissionGuard(routeSnapshotFor('buyers'), NOOP_STATE),
    ) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).not.toBe('/buyers');
    expect(result.toString()).toBe('/sale');
  });

  it('redirects an empty visible set to the defined fallback, for every protected route', () => {
    configure(RECEIVING_ASSOCIATE);

    for (const path of ['sale', 'products', 'sales', 'buyers', 'payment']) {
      const result = TestBed.runInInjectionContext(() =>
        rolePermissionGuard(routeSnapshotFor(path), NOOP_STATE),
      ) as UrlTree;

      expect(result).toBeInstanceOf(UrlTree);
      expect(result.toString()).toBe('/login');
    }
  });

  it('falls back to /login when no employee is resolved (defensive — authGuard is the primary enforcement)', () => {
    configure(null);

    const result = TestBed.runInInjectionContext(() =>
      rolePermissionGuard(routeSnapshotFor('sale'), NOOP_STATE),
    ) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login');
  });

  describe('composition with activeSaleGuard on /payment', () => {
    it('enforces role denial independently of active-sale state', () => {
      // Receiving Associate's empty visible set excludes /payment outright —
      // this should deny before active-sale status is even relevant.
      configure(RECEIVING_ASSOCIATE);

      const result = TestBed.runInInjectionContext(() =>
        rolePermissionGuard(routeSnapshotFor('payment'), NOOP_STATE),
      ) as UrlTree;

      expect(result).toBeInstanceOf(UrlTree);
      expect(result.toString()).toBe('/login');
    });

    it('still enforces active-sale denial once role check passes', () => {
      // Associate's visible set includes /payment, so the role guard passes;
      // activeSaleGuard's existing "no active sale" redirect must still fire.
      configure(ASSOCIATE);

      const roleResult = TestBed.runInInjectionContext(() =>
        rolePermissionGuard(routeSnapshotFor('payment'), NOOP_STATE),
      );

      expect(roleResult).toBe(true);

      const saleService = TestBed.inject(SaleService);
      expect(saleService.hasActiveSale()).toBe(false);

      const activeSaleResult = TestBed.runInInjectionContext(() =>
        activeSaleGuard(routeSnapshotFor('payment'), NOOP_STATE),
      ) as UrlTree;

      expect(activeSaleResult).toBeInstanceOf(UrlTree);
      expect(activeSaleResult.toString()).toBe('/sale');
    });
  });
});
