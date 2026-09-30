import { computed, provideZonelessChangeDetection, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  ActivationEnd,
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
import { AppShellComponent } from '../layout/app-shell/app-shell';
import { SaleBuilderComponent } from '../../features/sale-builder/sale-builder.component';
import { MockProductService } from '../../mocks/mock-product.service';
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

const OFF_DUTY: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

/** Every route the full nav reaches, plus `/payment`, which completes a sale. */
const FULL_NAV_ROUTES: readonly { url: string; data?: Record<string, unknown> }[] = [
  { url: '/sale' },
  { url: '/products' },
  { url: '/sales' },
  { url: '/buyers' },
  { url: '/payment' },
  { url: '/products?query=milk' },
  { url: '/receiving', data: { navItem: 'Receiving' } },
  { url: '/employee-roster', data: { navItem: 'Employee roster' } },
];

describe('authGuard', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;
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

  describe('after signing out', () => {
    it('stops letting the route through', () => {
      authService.signIn(employee());

      expect(activate('/products')).toBe(true);

      authService.logout();

      expect(redirectOf(activate('/products'))).toBe('/login?returnUrl=%2Fproducts');
    });
  });

  describe('the shift gate', () => {
    describe.each(OFF_DUTY)('%s', (status) => {
      beforeEach(() => {
        shiftService.report(status);
      });

      it.each(FULL_NAV_ROUTES)('turns $url away to Home', ({ url, data }) => {
        authService.signIn(employee({ role: 'StoreManager' }));

        expect(redirectOf(activate(url, data))).toBe('/home');
      });

      it.each(['/home', '/schedule', '/schedule?week=next'])('lets %s through', (url) => {
        authService.signIn(employee());

        expect(activate(url)).toBe(true);
      });

      it("sends a route the role does not earn to Home, not to the role gate's default", () => {
        authService.signIn(employee({ role: 'Associate' }));

        expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
          '/home',
        );
      });

      it('still sends a visitor who is not signed in to the login screen', () => {
        expect(redirectOf(activate('/sale'))).toBe('/login');
      });
    });

    describe('on shift', () => {
      beforeEach(() => {
        shiftService.report('OnShift');
      });

      it.each<EmployeeRole>([
        'Associate',
        'DepartmentManager',
        'StoreManager',
        'ReceivingAssociate',
      ])('lets a %s reach every shared route, Home and My schedule', (role) => {
        authService.signIn(employee({ role }));

        for (const url of [
          '/sale',
          '/products',
          '/sales',
          '/buyers',
          '/payment',
          '/home',
          '/schedule',
        ]) {
          expect(activate(url)).toBe(true);
        }
      });

      it('keeps the role gate in force', () => {
        authService.signIn(employee({ role: 'Associate' }));

        expect(redirectOf(activate('/employee-roster', { navItem: 'Employee roster' }))).toBe(
          '/sale',
        );
        expect(activate('/employee-roster', { navItem: 'Employee roster' })).not.toBe(true);
      });
    });

    describe('before the shift status is known', () => {
      it.each(FULL_NAV_ROUTES.filter(({ data }) => data === undefined))(
        'lets $url through while no shift status has been read',
        ({ url }) => {
          authService.signIn(employee());
          shiftService.clear();

          expect(activate(url)).toBe(true);
        },
      );

      it('lets every full-nav route through after a failed read clears the held status', () => {
        authService.signIn(employee());
        shiftService.report('OffShift');
        shiftService.clear();

        for (const url of ['/sale', '/products', '/sales', '/buyers', '/payment']) {
          expect(activate(url)).toBe(true);
        }
      });

      it.each(['/home', '/schedule'])('lets %s through', (url) => {
        authService.signIn(employee());
        shiftService.clear();

        expect(activate(url)).toBe(true);
      });

      it('keeps the role gate in force', () => {
        authService.signIn(employee({ role: 'Associate' }));
        shiftService.clear();

        expect(redirectOf(activate('/receiving', { navItem: 'Receiving' }))).toBe('/sale');
      });
    });
  });
});

/**
 * The gate through the app's own route table, so a redirect is proven by where
 * the router actually ends up and which screens it actually activated.
 */
describe('authGuard through the real route table', () => {
  let authService: SignInStubAuthService;
  let shiftService: StubShiftService;
  let activated: Type<unknown>[];

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

    activated = [];
    TestBed.inject(Router).events.subscribe((event) => {
      if (event instanceof ActivationEnd && event.snapshot.component) {
        activated.push(event.snapshot.component);
      }
    });
  });

  async function visit(url: string): Promise<RouterTestingHarness> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);

    return harness;
  }

  it.each(OFF_DUTY)(
    'lands a direct visit to Sale on Home when %s, with no screen in between',
    async (status) => {
      authService.signIn();
      shiftService.report(status);

      const harness = await visit('/sale');

      expect(TestBed.inject(Router).url).toBe('/home');
      expect(harness.routeNativeElement?.querySelector('app-home')).not.toBeNull();
      expect(new Set(activated)).toEqual(new Set([AppShellComponent, HomeComponent]));
      expect(activated).not.toContain(SaleBuilderComponent);
    },
  );

  it.each(OFF_DUTY)('lands the bare root on Home when %s', async (status) => {
    authService.signIn();
    shiftService.report(status);

    await visit('/');

    expect(TestBed.inject(Router).url).toBe('/home');
  });

  it('loads Sale directly on shift', async () => {
    authService.signIn();
    shiftService.report('OnShift');

    const harness = await visit('/sale');

    expect(TestBed.inject(Router).url).toBe('/sale');
    expect(harness.routeNativeElement?.querySelector('app-sale-builder')).not.toBeNull();
  });

  it('loads Sale directly before the shift status is known', async () => {
    authService.signIn();
    shiftService.clear();

    await visit('/sale');

    expect(TestBed.inject(Router).url).toBe('/sale');
  });

  it.each<ShiftStatus>(['OnShift', 'OnBreak', 'OffShift'])(
    'loads My schedule directly when %s',
    async (status) => {
      authService.signIn();
      shiftService.report(status);

      const harness = await visit('/schedule');

      expect(TestBed.inject(Router).url).toBe('/schedule');
      expect(harness.routeNativeElement?.querySelector('app-my-schedule')).not.toBeNull();
    },
  );
});
