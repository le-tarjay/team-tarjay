import { computed, provideZonelessChangeDetection, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  ActivationEnd,
  NavigationEnd,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, throwError } from 'rxjs';

import { authGuard } from './auth.guard';
import { IAuthService } from './auth.service';
import { routes } from '../../app.routes';
import { HomeComponent } from '../../features/home/home';
import { MyScheduleComponent } from '../../features/my-schedule/my-schedule';
import { SaleBuilderComponent } from '../../features/sale-builder/sale-builder.component';
import { MockBuyerService } from '../../mocks/mock-buyer.service';
import { MockProductService } from '../../mocks/mock-product.service';
import { MockSalesService } from '../../mocks/mock-sales.service';
import { AppShellComponent } from '../layout/app-shell/app-shell';
import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { ShiftStatus } from '../models/shift/shift-status.model';
import { StubScheduleService } from '../schedule/testing/stub-schedule.service';
import { StubShiftService } from '../shift/testing/stub-shift.service';
import {
  AUTH_SERVICE,
  BUYER_SERVICE,
  PRODUCT_SERVICE,
  SALES_SERVICE,
  SCHEDULE_SERVICE,
  SHIFT_SERVICE,
} from '../tokens';

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

  /** The guard reads identity, never the credential or how a session ended. */
  readonly accessToken = signal<string | null>(null).asReadonly();
  readonly sessionEnded = signal(false).asReadonly();

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

const ALL_ROLES: readonly EmployeeRole[] = [
  'Associate',
  'DepartmentManager',
  'StoreManager',
  'ReceivingAssociate',
];

const OFF_DUTY: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

const EVERY_SHELL_ROUTE = [
  '/sale',
  '/products',
  '/sales',
  '/buyers',
  '/payment',
  '/home',
  '/schedule',
];

/** A Receiving Associate's own item is only theirs with the Receiving function. */
function jobFunctionFor(role: EmployeeRole): string {
  return role === 'ReceivingAssociate' ? 'Receiving' : 'Sales Floor';
}

/** Every shared nav route, plus a role-specific one by its declared item. */
const FULL_NAV_ROUTES: readonly { url: string; data: Record<string, unknown> }[] = [
  { url: '/sale', data: {} },
  { url: '/products', data: {} },
  { url: '/sales', data: {} },
  { url: '/buyers', data: {} },
  { url: '/receiving', data: { navItem: 'Receiving' } },
];

describe('authGuard', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;
  let router: Router;

  /**
   * The existing role-gate specs run with no shift read yet, which the shift
   * gate lets through (LET-142 thread, criterion 7). The shift gate's own
   * specs below report a status.
   */
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
        {
          provide: SHIFT_SERVICE,
          useClass: StubShiftService,
        },
      ],
    });

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
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

  describe('the shift gate', () => {
    describe.each(OFF_DUTY)('while %s', (status) => {
      it.each(ALL_ROLES)('turns every full-nav route away to Home for a %s', (role) => {
        authService.signIn(employee({ role, jobFunction: jobFunctionFor(role) }));
        shiftService.report(status);

        for (const { url, data } of FULL_NAV_ROUTES) {
          if (data['navItem'] === 'Receiving' && role !== 'ReceivingAssociate') {
            continue;
          }

          expect(redirectOf(activate(url, data))).toBe('/home');
        }
      });

      it('turns a full-nav route away to Home whatever its query string', () => {
        authService.signIn(employee());
        shiftService.report(status);

        expect(redirectOf(activate('/products?query=milk'))).toBe('/home');
      });

      it('turns /payment away to Home too, since no associate work is open off duty', () => {
        authService.signIn(employee());
        shiftService.report(status);

        expect(redirectOf(activate('/payment'))).toBe('/home');
      });

      it('sends a route the role does not earn to Home, not to Sale', () => {
        authService.signIn(employee({ role: 'Associate' }));
        shiftService.report(status);

        expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
          '/home',
        );
      });

      it.each(['/home', '/schedule'])('lets %s through', (url) => {
        authService.signIn(employee());
        shiftService.report(status);

        expect(activate(url)).toBe(true);
      });
    });

    describe('on shift', () => {
      it.each(ALL_ROLES)('lets a %s reach every full-nav route their role earns', (role) => {
        authService.signIn(employee({ role, jobFunction: jobFunctionFor(role) }));
        shiftService.report('OnShift');

        for (const { url, data } of FULL_NAV_ROUTES) {
          if (data['navItem'] === 'Receiving' && role !== 'ReceivingAssociate') {
            continue;
          }

          expect(activate(url, data)).toBe(true);
        }

        expect(activate('/home')).toBe(true);
        expect(activate('/schedule')).toBe(true);
        expect(activate('/payment')).toBe(true);
      });

      it('keeps the role gate in force', () => {
        authService.signIn(employee({ role: 'Associate' }));
        shiftService.report('OnShift');

        expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
          '/sale',
        );
      });
    });

    describe('with no shift status held', () => {
      it('lets every route through while no shift status has been read', () => {
        authService.signIn(employee());

        for (const url of EVERY_SHELL_ROUTE) {
          expect(activate(url)).toBe(true);
        }
      });

      it('lets every route through after a failed read clears the held status', () => {
        authService.signIn(employee());
        shiftService.report('OffShift');
        shiftService.clear();

        expect(activate('/sale')).toBe(true);
        expect(activate('/home')).toBe(true);
        expect(activate('/schedule')).toBe(true);
      });

      it('keeps the role gate in force', () => {
        authService.signIn(employee({ role: 'Associate' }));

        expect(redirectOf(activate('/receiving', { navItem: 'Receiving' }))).toBe('/sale');
      });
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

/**
 * The real route table behind the real gate. This is what a saved link or the
 * browser's back button goes through.
 */
describe('authGuard through the app route table', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: AUTH_SERVICE, useClass: StubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
        { provide: PRODUCT_SERVICE, useClass: MockProductService },
        { provide: SALES_SERVICE, useClass: MockSalesService },
        { provide: BUYER_SERVICE, useClass: MockBuyerService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    router = TestBed.inject(Router);

    authService.signIn({
      id: 'e-1',
      name: 'Avery Brooks',
      role: 'Associate',
      department: 'Grocery',
      jobFunction: 'Sales Floor',
    });
  });

  /** Every component the router activated, and every URL a navigation ended on. */
  async function visit(url: string): Promise<{ activated: Type<unknown>[]; ended: string[] }> {
    const activated: Type<unknown>[] = [];
    const ended: string[] = [];
    const harness = await RouterTestingHarness.create();

    const subscription = router.events.subscribe((event) => {
      if (event instanceof ActivationEnd && event.snapshot.component) {
        activated.push(event.snapshot.component);
      }

      if (event instanceof NavigationEnd) {
        ended.push(event.urlAfterRedirects);
      }
    });

    await harness.navigateByUrl(url);
    subscription.unsubscribe();

    return { activated, ended };
  }

  it.each(OFF_DUTY)(
    'lands a direct visit to Sale on Home when %s, with no screen in between',
    async (status) => {
      shiftService.report(status);

      const { activated, ended } = await visit('/sale');

      expect(router.url).toBe('/home');
      expect(ended).toEqual(['/home']);
      expect(activated).toEqual([HomeComponent, AppShellComponent]);
      expect(activated).not.toContain(SaleBuilderComponent);
    },
  );

  it.each(OFF_DUTY)('lands the app root on Home when %s', async (status) => {
    shiftService.report(status);

    await visit('/');

    expect(router.url).toBe('/home');
  });

  it('loads Sale directly on shift', async () => {
    shiftService.report('OnShift');

    const { activated } = await visit('/sale');

    expect(router.url).toBe('/sale');
    expect(activated).toContain(SaleBuilderComponent);
  });

  it('loads Sale directly while no shift status has been read', async () => {
    const { activated } = await visit('/sale');

    expect(router.url).toBe('/sale');
    expect(activated).toContain(SaleBuilderComponent);
  });

  /** LET-144 criterion 5 rests on this. */
  it.each<ShiftStatus>(['OnShift', 'OnBreak', 'OffShift'])(
    'loads My schedule directly when %s',
    async (status) => {
      shiftService.report(status);

      const { activated } = await visit('/schedule');

      expect(router.url).toBe('/schedule');
      expect(activated).toContain(MyScheduleComponent);
    },
  );

  it.each<ShiftStatus>(['OnShift', 'OnBreak', 'OffShift'])(
    'loads Home directly when %s',
    async (status) => {
      shiftService.report(status);

      const { activated } = await visit('/home');

      expect(router.url).toBe('/home');
      expect(activated).toContain(HomeComponent);
    },
  );
});
