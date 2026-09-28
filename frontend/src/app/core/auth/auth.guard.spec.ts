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
import { StubAuthService as SignInStubAuthService } from './testing/stub-auth.service';
import { routes } from '../../app.routes';
import { HomeComponent } from '../../features/home/home';
import { MockProductService } from '../../mocks/mock-product.service';
import { AppShellComponent } from '../layout/app-shell/app-shell';
import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { ShiftStatus } from '../models/shift/shift-status.model';
import { StubScheduleService } from '../schedule/testing/stub-schedule.service';
import { StubShiftService } from '../shift/testing/stub-shift.service';
import { AUTH_SERVICE, PRODUCT_SERVICE, SCHEDULE_SERVICE, SHIFT_SERVICE } from '../tokens';

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

describe('authGuard', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;
  let router: Router;

  /**
   * No shift status is held unless a test reports one, which is also what the
   * app looks like before the first read lands. The role-gate specs below run
   * in that state, and the gate fails open on it.
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

  /**
   * LET-142. The shift half of the gate, beside the role half above.
   */
  describe('the shift gate', () => {
    const FULL_NAV_ROUTES = ['/sale', '/products', '/sales', '/buyers'];
    const OFF_DUTY_STATUSES: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

    it.each(OFF_DUTY_STATUSES)('turns every full-nav route away to Home when %s', (status) => {
      authService.signIn(employee());
      shiftService.report(status);

      for (const url of FULL_NAV_ROUTES) {
        expect(redirectOf(activate(url))).toBe('/home');
      }
    });

    it.each(OFF_DUTY_STATUSES)(
      'turns a role-specific route away to Home, not Sale, when %s',
      (status) => {
        authService.signIn(employee({ role: 'ReceivingAssociate' }));
        shiftService.report(status);

        expect(redirectOf(activate('/receiving', { navItem: 'Receiving' }))).toBe('/home');
      },
    );

    it.each(OFF_DUTY_STATUSES)(
      'turns a route away to Home, not Sale, even when the role would not earn it, when %s',
      (status) => {
        authService.signIn(employee({ role: 'Associate' }));
        shiftService.report(status);

        expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
          '/home',
        );
      },
    );

    it.each(OFF_DUTY_STATUSES)('turns /payment away to Home when %s', (status) => {
      authService.signIn(employee());
      shiftService.report(status);

      expect(redirectOf(activate('/payment'))).toBe('/home');
    });

    it.each(OFF_DUTY_STATUSES)('keeps a query string from getting past it when %s', (status) => {
      authService.signIn(employee());
      shiftService.report(status);

      expect(redirectOf(activate('/products?query=milk'))).toBe('/home');
    });

    it.each(OFF_DUTY_STATUSES)('lets Home and My schedule through when %s', (status) => {
      authService.signIn(employee());
      shiftService.report(status);

      expect(activate('/home')).toBe(true);
      expect(activate('/schedule')).toBe(true);
    });

    it.each<EmployeeRole>(['Associate', 'DepartmentManager', 'StoreManager', 'ReceivingAssociate'])(
      'lets a %s on shift reach every full-nav route, Home and My schedule',
      (role) => {
        authService.signIn(employee({ role }));
        shiftService.report('OnShift');

        for (const url of [...FULL_NAV_ROUTES, '/payment', '/home', '/schedule']) {
          expect(activate(url)).toBe(true);
        }
      },
    );

    it('keeps the role gate in force on shift', () => {
      authService.signIn(employee({ role: 'Associate' }));
      shiftService.report('OnShift');

      expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
        '/sale',
      );
    });

    it('lets every route through while no shift status has been read', () => {
      authService.signIn(employee());
      shiftService.clear();

      for (const url of [...FULL_NAV_ROUTES, '/payment', '/home', '/schedule']) {
        expect(activate(url)).toBe(true);
      }
    });

    it('lets every route through after a failed read clears the held status', () => {
      authService.signIn(employee());
      shiftService.report('OffShift');
      shiftService.clear();

      for (const url of [...FULL_NAV_ROUTES, '/home', '/schedule']) {
        expect(activate(url)).toBe(true);
      }
    });

    it('stops turning full-nav routes away the moment the employee is on shift', () => {
      authService.signIn(employee());
      shiftService.report('OffShift');

      expect(redirectOf(activate('/sale'))).toBe('/home');

      shiftService.report('OnShift');

      expect(activate('/sale')).toBe(true);
    });

    it('still sends a signed-out visitor to sign in, whatever shift was last held', () => {
      shiftService.report('OffShift');

      expect(redirectOf(activate('/sale'))).toBe('/login');
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

/**
 * The shift gate through the app's real route table: what the employee
 * actually lands on, and what renders on the way.
 */
describe('authGuard through the app route table', () => {
  let authService: SignInStubAuthService;
  let shiftService: StubShiftService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: AUTH_SERVICE, useClass: SignInStubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
        { provide: PRODUCT_SERVICE, useClass: MockProductService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as SignInStubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    router = TestBed.inject(Router);
  });

  async function open(url: string, status: ShiftStatus | null): Promise<RouterTestingHarness> {
    authService.signIn();

    if (status === null) {
      shiftService.clear();
    } else {
      shiftService.report(status);
    }

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);

    return harness;
  }

  it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
    'lands a direct visit to Sale on Home, with no screen in between, when %s',
    async (status) => {
      authService.signIn();
      shiftService.report(status);
      const harness = await RouterTestingHarness.create();

      const activated: (Type<unknown> | string | null)[] = [];
      const finished: string[] = [];
      const subscription = router.events.subscribe((event) => {
        if (event instanceof ActivationEnd) {
          activated.push(event.snapshot.component);
        }

        if (event instanceof NavigationEnd) {
          finished.push(event.urlAfterRedirects);
        }
      });

      await harness.navigateByUrl('/sale');
      subscription.unsubscribe();

      expect(router.url).toBe('/home');
      expect(finished).toEqual(['/home']);
      expect(new Set(activated)).toEqual(new Set([HomeComponent, AppShellComponent]));
      expect(harness.routeNativeElement?.querySelector('app-home')).not.toBeNull();
      expect(harness.routeNativeElement?.querySelector('app-sale-builder')).toBeNull();
    },
  );

  it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
    'lands the shell default route on Home when %s',
    async (status) => {
      await open('/', status);

      expect(router.url).toBe('/home');
    },
  );

  it.each<ShiftStatus>(['OnShift', 'OnBreak', 'OffShift'])(
    'loads My schedule directly when %s',
    async (status) => {
      const harness = await open('/schedule', status);

      expect(router.url).toBe('/schedule');
      expect(harness.routeNativeElement?.querySelector('app-my-schedule')).not.toBeNull();
    },
  );

  it('loads Sale directly on shift', async () => {
    const harness = await open('/sale', 'OnShift');

    expect(router.url).toBe('/sale');
    expect(harness.routeNativeElement?.querySelector('app-sale-builder')).not.toBeNull();
  });

  it('loads Sale directly while no shift status has been read', async () => {
    await open('/sale', null);

    expect(router.url).toBe('/sale');
  });
});
