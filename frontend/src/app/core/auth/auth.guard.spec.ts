import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, throwError } from 'rxjs';

import { authGuard } from './auth.guard';
import { IAuthService } from './auth.service';
import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { AUTH_SERVICE } from '../tokens';

/**
 * The same reasoning as `app-shell.spec.ts`: `MockAuthService` resolves one
 * hardcoded Associate, and the gate turns on all four roles. Teaching the mock
 * to become an arbitrary employee would give it behaviour `IAuthService`
 * doesn't declare, so the identity signal is driven directly here instead.
 */
class StubAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(): Observable<Employee> {
    return throwError(() => new Error('Not exercised by the route guard.'));
  }

  logout(): void {
    this.employee.set(null);
  }

  signIn(employee: Employee): void {
    this.employee.set(employee);
  }
}

describe('authGuard', () => {
  let authService: StubAuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
      ],
    });

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    router = TestBed.inject(Router);
  });

  function employee(overrides: Partial<Employee> = {}): Employee {
    return {
      id: 'e-1',
      name: 'Avery Brooks',
      role: 'Associate',
      department: 'Grocery',
      jobFunction: 'Sales Floor',
      ...overrides,
    };
  }

  /**
   * The router hands a guard the snapshot of the route being activated and the
   * state of the whole navigation; `data` and `url` are all this guard reads of
   * either.
   */
  function activate(url: string, data: Record<string, unknown> = {}): boolean | UrlTree {
    const route = { data } as unknown as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;

    return TestBed.runInInjectionContext(() => authGuard(route, state)) as boolean | UrlTree;
  }

  function redirectOf(result: boolean | UrlTree): string {
    expect(result).not.toBe(true);

    return router.serializeUrl(result as UrlTree);
  }

  describe('a signed-in employee', () => {
    it.each<EmployeeRole>(['Associate', 'DepartmentManager', 'StoreManager', 'ReceivingAssociate'])(
      'lets a %s activate a route their nav covers',
      (role) => {
        authService.signIn(employee({ role }));

        expect(activate('/products')).toBe(true);
      },
    );

    it('turns an Associate away from a route reserved for a Store Manager', () => {
      authService.signIn(employee({ role: 'Associate' }));

      const result = activate('/employee-roster', { navItem: 'Employee roster' });

      expect(result).not.toBe(true);
      expect(redirectOf(result)).toBe('/sale');
    });

    it('lets a Store Manager activate that same route', () => {
      authService.signIn(employee({ role: 'StoreManager' }));

      expect(activate('/employee-roster', { navItem: 'Employee roster' })).toBe(true);
    });

    it('sends the turned-away employee somewhere real rather than nowhere', () => {
      authService.signIn(employee({ role: 'Associate' }));

      const result = activate('/receiving', { navItem: 'Receiving' });

      expect(redirectOf(result)).toBe('/sale');
    });

    it('leaves a route no nav item governs to the guards that do cover it', () => {
      authService.signIn(employee({ role: 'Associate' }));

      expect(activate('/payment')).toBe(true);
    });
  });

  describe('a visitor who is not signed in', () => {
    it('is sent to the login screen', () => {
      const result = activate('/products');

      expect(redirectOf(result)).toContain('/login');
    });

    it('has the route they were headed for preserved on the way', () => {
      const result = activate('/buyers');

      expect(redirectOf(result)).toBe('/login?returnUrl=%2Fbuyers');
    });

    it('keeps the query string of the route they were headed for', () => {
      const result = activate('/products?query=milk');

      expect(redirectOf(result)).toBe('/login?returnUrl=%2Fproducts%3Fquery%3Dmilk');
    });

    it.each(['/', '/sale'])(
      'is sent to a clean login screen from %s, which is where sign-in lands anyway',
      (url) => {
        expect(redirectOf(activate(url))).toBe('/login');
      },
    );

    /**
     * The role gate is not reached at all here — an unknown visitor is turned
     * back to sign in, not told which routes exist.
     */
    it('is sent to the login screen even for a route no role could reach', () => {
      const result = activate('/employee-roster', { navItem: 'Employee roster' });

      expect(redirectOf(result)).toBe('/login?returnUrl=%2Femployee-roster');
    });
  });

  describe('after signing out', () => {
    it('stops letting the route through', () => {
      authService.signIn(employee());

      expect(activate('/products')).toBe(true);

      authService.logout();

      expect(redirectOf(activate('/products'))).toBe('/login?returnUrl=%2Fproducts');
    });
  });
});
