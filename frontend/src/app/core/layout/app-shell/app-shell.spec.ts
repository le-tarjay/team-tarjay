import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AppShellComponent } from './app-shell';
import { IAuthService } from '../../auth/auth.service';
import { Employee, EmployeeRole } from '../../models/auth/employee.model';
import { ShiftStatus } from '../../models/shift/shift-status.model';
import { ShiftService } from '../../shift/shift.service';
import { StubShiftService } from '../../shift/testing/stub-shift.service';
import { AUTH_SERVICE, SHIFT_SERVICE } from '../../tokens';

/**
 * `MockAuthService` resolves exactly one hardcoded employee — an Associate in
 * Grocery — and this story turns on all four roles plus job functions that mock
 * never produces. Teaching it to become an arbitrary employee would hand it
 * behavior `IAuthService` doesn't declare, which `CONVENTIONS.md` calls out as
 * an anti-pattern ("a mock is a contract"), so the identity signal is driven
 * directly here instead.
 */
class StubAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);
  private readonly ended = signal(false);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  /** The shell reads identity and, since LET-134, how the session ended. */
  readonly accessToken = signal<string | null>(null).asReadonly();
  readonly sessionEnded = this.ended.asReadonly();

  login(): Observable<Employee> {
    return throwError(() => new Error('Not exercised by the app shell.'));
  }

  logout(): void {
    this.employee.set(null);
  }

  signIn(employee: Employee): void {
    this.employee.set(employee);
  }

  /**
   * What `SessionTeardownService` observes and then acts on: the signal flips,
   * and the teardown clears the session behind it. Both halves are driven here
   * because the shell's own reaction — closing its account menu — has to hold
   * while the redirect is still in flight and the shell is still on screen.
   */
  endSessionElsewhere(): void {
    this.ended.set(true);
    this.employee.set(null);
  }
}

const SHARED_LABELS = ['Sale', 'Products', 'Sales', 'Buyers'];

const ROLE_LABELS: readonly { role: EmployeeRole; displayed: string }[] = [
  { role: 'Associate', displayed: 'Associate' },
  { role: 'DepartmentManager', displayed: 'Department Manager' },
  { role: 'StoreManager', displayed: 'Store Manager' },
  { role: 'ReceivingAssociate', displayed: 'Receiving Associate' },
];

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let authService: StubAuthService;
  let shiftService: StubShiftService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
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
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    fixture.detectChanges();
  });

  /**
   * The shell's template-only members are `protected`, so every test here
   * asserts on rendered output — which is also the only thing the employee at
   * the terminal actually sees.
   */
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

  function signIn(overrides: Partial<Employee> = {}): void {
    authService.signIn(employee(overrides));
    fixture.detectChanges();
  }

  /**
   * The full role-based nav only renders on shift, and no nav renders before
   * the first shift read (LET-142). Specs about that nav's contents sign in on
   * shift.
   */
  function signInOnShift(overrides: Partial<Employee> = {}): void {
    signIn(overrides);
    shiftService.report('OnShift');
    fixture.detectChanges();
  }

  function navItemElements(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.navbar-nav .nav-link'));
  }

  function navLabels(): string[] {
    return navItemElements().map((item) => item.textContent?.trim() ?? '');
  }

  function identityText(): string {
    const identity = fixture.nativeElement.querySelector('.navbar-text');

    return identity?.textContent?.trim() ?? '';
  }

  function accountToggle(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.dropdown-toggle') as HTMLButtonElement;
  }

  function shiftIndicator(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="status"]');
  }

  function shiftIndicatorDot(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.shift-indicator-dot');
  }

  function openAccountMenu(): void {
    accountToggle().click();
    fixture.detectChanges();
  }

  function accountMenuItems(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.dropdown-item'));
  }

  function accountMenuLabels(): string[] {
    return accountMenuItems().map((item) => item.textContent?.trim() ?? '');
  }

  function roleSpecificLabel(): string {
    return navLabels()[SHARED_LABELS.length] ?? '';
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('header identity display', () => {
    it.each(ROLE_LABELS)('renders name, department and role for a $role', ({ role, displayed }) => {
      signIn({ name: 'Sam Rivera', department: 'Grocery', role });

      expect(identityText()).toBe(`Sam Rivera · Grocery · ${displayed}`);
    });

    it('renders the department it was given rather than a fixed one', () => {
      signIn({ name: 'Casey Kim', department: 'Receiving', role: 'ReceivingAssociate' });

      expect(identityText()).toBe('Casey Kim · Receiving · Receiving Associate');
    });
  });

  describe('shared nav items', () => {
    it.each(ROLE_LABELS)('render in fixed order for a $role', ({ role }) => {
      signInOnShift({ role });

      expect(navLabels().slice(0, SHARED_LABELS.length)).toEqual(SHARED_LABELS);
    });

    it('keep the shared items ahead of exactly one role-specific item, for every role', () => {
      for (const { role } of ROLE_LABELS) {
        signInOnShift({ role });

        expect(navLabels()).toHaveLength(SHARED_LABELS.length + 1);
        expect(navLabels().slice(0, SHARED_LABELS.length)).toEqual(SHARED_LABELS);
      }
    });

    it('does not render a "Price check" item, which has no page or route yet', () => {
      signInOnShift();

      expect(navLabels()).not.toContain('Price check');
    });
  });

  describe('role-specific nav item', () => {
    it('gives a Receiving Associate the "Receiving" item', () => {
      signInOnShift({ role: 'ReceivingAssociate', jobFunction: 'Receiving' });

      expect(roleSpecificLabel()).toBe('Receiving');
    });

    it('gives a Receiving Associate "Receiving" whatever their job function says', () => {
      signInOnShift({ role: 'ReceivingAssociate', jobFunction: 'Customer Support' });

      expect(roleSpecificLabel()).toBe('Receiving');
    });

    it('gives the Customer Support job function the "Fulfillment" item', () => {
      signInOnShift({
        role: 'Associate',
        department: 'Customer Support',
        jobFunction: 'Customer Support',
      });

      expect(roleSpecificLabel()).toBe('Fulfillment');
    });

    it('matches the Customer Support job function regardless of casing or padding', () => {
      signInOnShift({ role: 'Associate', jobFunction: '  customer support ' });

      expect(roleSpecificLabel()).toBe('Fulfillment');
    });

    it.each([
      { role: 'Associate' as EmployeeRole, jobFunction: 'Register', expected: 'My tasks' },
      { role: 'Associate' as EmployeeRole, jobFunction: 'Sales Floor', expected: 'My tasks' },
      {
        role: 'DepartmentManager' as EmployeeRole,
        jobFunction: 'Sales Floor',
        expected: 'Stocking',
      },
      {
        role: 'StoreManager' as EmployeeRole,
        jobFunction: 'Store Operations',
        expected: 'Stocking',
      },
    ])(
      'gives a $role doing $jobFunction the default "$expected" item',
      ({ role, jobFunction, expected }) => {
        signInOnShift({ role, jobFunction });

        expect(roleSpecificLabel()).toBe(expected);
      },
    );

    it.each(['', '   '])(
      'still gives a stocking item when the job function resolves to nothing ("%s")',
      (jobFunction) => {
        signInOnShift({ role: 'Associate', jobFunction });

        expect(roleSpecificLabel()).toBe('My tasks');
      },
    );

    it('never leaves the role-specific slot empty for any role', () => {
      for (const { role } of ROLE_LABELS) {
        signInOnShift({ role, jobFunction: 'Something Corporate Invented' });

        expect(roleSpecificLabel()).not.toBe('');
      }
    });

    /**
     * Deliberate, and the first thing to change when Receiving, Fulfillment or
     * stocking ships a real screen: the item renders disabled because no route
     * exists for it yet, and a `routerLink` to an undefined path would fall
     * through `app.routes.ts`'s `**` wildcard and bounce a signed-in employee
     * to `/login`.
     */
    it('renders the role-specific item disabled while it has no route', () => {
      signInOnShift({ role: 'ReceivingAssociate' });

      const roleSpecific = navItemElements()[SHARED_LABELS.length] as HTMLButtonElement;

      expect(roleSpecific.tagName).toBe('BUTTON');
      expect(roleSpecific.disabled).toBe(true);
    });
  });

  describe('account menu', () => {
    it('shows both admin entries to a Store Manager', () => {
      signIn({ role: 'StoreManager' });
      openAccountMenu();

      expect(accountMenuLabels()).toContain('Employee roster');
      expect(accountMenuLabels()).toContain('Register status');
    });

    it.each(ROLE_LABELS.filter(({ role }) => role !== 'StoreManager'))(
      'shows neither admin entry to a $role',
      ({ role }) => {
        signIn({ role });
        openAccountMenu();

        expect(accountMenuLabels()).not.toContain('Employee roster');
        expect(accountMenuLabels()).not.toContain('Register status');
        expect(accountMenuLabels()).toContain('Logout');
      },
    );

    it('stays closed until the account toggle is used', () => {
      signIn({ role: 'StoreManager' });

      expect(accountMenuLabels()).toEqual([]);
      expect(accountToggle().getAttribute('aria-expanded')).toBe('false');

      openAccountMenu();

      expect(accountToggle().getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('signing out', () => {
    it('clears the header identity and reverts the nav to its pre-sign-in state', () => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      signInOnShift({ role: 'StoreManager' });

      expect(identityText()).not.toBe('');
      expect(navLabels()).toHaveLength(SHARED_LABELS.length + 1);

      openAccountMenu();

      const logout = accountMenuItems().find(
        (item) => item.textContent?.trim() === 'Logout',
      ) as HTMLButtonElement;

      logout.click();
      fixture.detectChanges();

      expect(identityText()).toBe('');
      expect(navLabels()).toEqual(SHARED_LABELS);
      expect(navigate).toHaveBeenCalledWith('/login');
    });
  });

  /**
   * The shell's half of LET-134's teardown. The redirect itself, and clearing
   * the session that empties this header, are `SessionTeardownService`'s — see
   * `core/auth/session-teardown.service.spec.ts`. What the shell owns is the one
   * open layer that lives above the routed screens and therefore outlives them
   * until the redirect resolves.
   */
  describe('a session ended elsewhere', () => {
    it('clears the header identity and reverts the nav, with no employee action', () => {
      signIn({ role: 'StoreManager' });

      expect(identityText()).not.toBe('');

      authService.endSessionElsewhere();
      fixture.detectChanges();

      expect(identityText()).toBe('');
      expect(navLabels()).toEqual(SHARED_LABELS);
    });

    it('closes an open account menu rather than leaving it over an empty header', () => {
      signIn({ role: 'StoreManager' });
      openAccountMenu();

      expect(accountToggle().getAttribute('aria-expanded')).toBe('true');

      authService.endSessionElsewhere();
      fixture.detectChanges();

      expect(accountToggle().getAttribute('aria-expanded')).toBe('false');
      expect(accountMenuLabels()).toEqual([]);
    });

    it('shows no reconnecting or transitional message in place of the identity', () => {
      signIn({ role: 'StoreManager' });

      authService.endSessionElsewhere();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toMatch(/reconnect/i);
      expect(fixture.nativeElement.textContent).not.toMatch(/signing you out/i);
    });
  });

  describe('shift status indicator', () => {
    function reportShift(status: ShiftStatus): void {
      shiftService.report(status);
      fixture.detectChanges();
    }

    it('renders no indicator while no shift status is held', () => {
      signIn();

      expect(shiftIndicator()).toBeNull();
      expect(fixture.nativeElement.textContent).not.toMatch(/on the clock|on break/i);
    });

    it.each<{ status: ShiftStatus; label: string; dot: string }>([
      { status: 'OffShift', label: 'Not on the clock', dot: 'shift-indicator-dot-off' },
      { status: 'OnShift', label: 'On the clock', dot: 'shift-indicator-dot-on' },
      { status: 'OnBreak', label: 'On break', dot: 'shift-indicator-dot-break' },
    ])('reads "$label" with its own dot for $status', ({ status, label, dot }) => {
      signIn();
      reportShift(status);

      expect(shiftIndicator()?.textContent?.trim()).toBe(label);
      expect(shiftIndicatorDot()?.classList).toContain(dot);
    });

    it('follows the held status as it changes', () => {
      signIn();
      reportShift('OffShift');
      reportShift('OnShift');

      expect(shiftIndicator()?.textContent?.trim()).toBe('On the clock');

      reportShift('OnBreak');

      expect(shiftIndicator()?.textContent?.trim()).toBe('On break');
    });

    it('removes the indicator when the held status is cleared, not keeping a stale one', () => {
      signIn();
      reportShift('OnShift');

      shiftService.clear();
      fixture.detectChanges();

      expect(shiftIndicator()).toBeNull();
    });

    it('sits beside the account menu button', () => {
      signIn();
      reportShift('OnShift');

      expect(shiftIndicator()?.nextElementSibling?.contains(accountToggle())).toBe(true);
    });
  });

  /**
   * Off shift or on break, the nav is Home and My schedule and nothing else. On
   * shift, it is the full role-based nav (API map, design row D9).
   */
  describe('full nav suspension', () => {
    function reportShift(status: ShiftStatus): void {
      shiftService.report(status);
      fixture.detectChanges();
    }

    function navLinkHref(label: string): string | null {
      const link = navItemElements().find((item) => item.textContent?.trim() === label);

      return link?.tagName === 'A' ? link.getAttribute('href') : null;
    }

    it.each(ROLE_LABELS)('shows exactly Home and My schedule to a $role off shift', ({ role }) => {
      signIn({ role });
      reportShift('OffShift');

      expect(navLabels()).toEqual(['Home', 'My schedule']);
    });

    it.each(ROLE_LABELS)('shows exactly Home and My schedule to a $role on break', ({ role }) => {
      signIn({ role });
      reportShift('OnBreak');

      expect(navLabels()).toEqual(['Home', 'My schedule']);
    });

    it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
      'renders Home and My schedule as real links when %s',
      (status) => {
        signIn();
        reportShift(status);

        expect(navLinkHref('Home')).toBe('/home');
        expect(navLinkHref('My schedule')).toBe('/schedule');
      },
    );

    it.each([
      { role: 'Associate' as EmployeeRole, roleSpecific: 'My tasks' },
      { role: 'DepartmentManager' as EmployeeRole, roleSpecific: 'Stocking' },
      { role: 'StoreManager' as EmployeeRole, roleSpecific: 'Stocking' },
      { role: 'ReceivingAssociate' as EmployeeRole, roleSpecific: 'Receiving' },
    ])('shows a $role on shift the full role-based nav, as before', ({ role, roleSpecific }) => {
      signIn({ role });
      reportShift('OnShift');

      expect(navLabels()).toEqual([...SHARED_LABELS, roleSpecific]);
    });

    it('brings the full nav back the moment an off-shift employee is on shift', () => {
      signIn();
      reportShift('OffShift');

      expect(navLabels()).toEqual(['Home', 'My schedule']);

      reportShift('OnShift');

      expect(navLabels()).toEqual([...SHARED_LABELS, 'My tasks']);
    });

    it('brings the full nav back the moment a break ends', () => {
      signIn();
      reportShift('OnShift');
      reportShift('OnBreak');

      expect(navLabels()).toEqual(['Home', 'My schedule']);

      reportShift('OnShift');

      expect(navLabels()).toEqual([...SHARED_LABELS, 'My tasks']);
    });

    it('suspends the full nav the moment a break starts', () => {
      signIn();
      reportShift('OnShift');
      reportShift('OnBreak');

      expect(navLabels()).not.toContain('Sale');
    });

    it('shows no nav item at all before the first shift-status read lands', () => {
      signIn({ role: 'StoreManager' });

      expect(navLabels()).toEqual([]);
    });

    it('shows no nav item at all once a failed read clears the held status', () => {
      signIn();
      reportShift('OnShift');

      shiftService.clear();
      fixture.detectChanges();

      expect(navLabels()).toEqual([]);
    });
  });

  /**
   * On shift, My Schedule is in the account menu beside the shift actions; off
   * shift or on break it is a nav item (API map, design rows D8 and D9).
   */
  describe('My schedule entry point', () => {
    function reportShift(status: ShiftStatus): void {
      shiftService.report(status);
      fixture.detectChanges();
    }

    function myScheduleNavLink(): HTMLAnchorElement | undefined {
      return navItemElements().find((item) => item.textContent?.trim() === 'My schedule') as
        | HTMLAnchorElement
        | undefined;
    }

    function myScheduleMenuLink(): HTMLAnchorElement | undefined {
      return accountMenuItems().find((item) => item.textContent?.trim() === 'My schedule') as
        | HTMLAnchorElement
        | undefined;
    }

    it('is in the account menu, and not the nav, when on shift', () => {
      signIn();
      reportShift('OnShift');
      openAccountMenu();

      const link = myScheduleMenuLink();

      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe('/schedule');
      expect(myScheduleNavLink()).toBeUndefined();
    });

    it('sits ahead of Logout in the account menu', () => {
      signIn({ role: 'StoreManager' });
      reportShift('OnShift');
      openAccountMenu();

      expect(accountMenuLabels()).toEqual([
        'My schedule',
        'Employee roster',
        'Register status',
        'Logout',
      ]);
    });

    it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
      'is a nav item, and not in the account menu, when %s',
      (status) => {
        signIn();
        reportShift(status);
        openAccountMenu();

        const link = myScheduleNavLink();

        expect(link?.tagName).toBe('A');
        expect(link?.getAttribute('href')).toBe('/schedule');
        expect(navLabels().at(-1)).toBe('My schedule');
        expect(myScheduleMenuLink()).toBeUndefined();
      },
    );

    it('moves between the nav and the account menu as the shift changes', () => {
      signIn();
      reportShift('OffShift');

      expect(myScheduleNavLink()).toBeDefined();

      reportShift('OnShift');
      openAccountMenu();

      expect(myScheduleNavLink()).toBeUndefined();
      expect(myScheduleMenuLink()).toBeDefined();

      reportShift('OnBreak');

      expect(myScheduleNavLink()).toBeDefined();
      expect(myScheduleMenuLink()).toBeUndefined();
    });

    it('is offered in neither place before the first shift-status read lands', () => {
      signIn();
      openAccountMenu();

      expect(myScheduleNavLink()).toBeUndefined();
      expect(myScheduleMenuLink()).toBeUndefined();
      expect(accountMenuLabels()).toEqual(['Logout']);
    });

    it('opens My Schedule and closes the account menu when chosen', () => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      signIn();
      reportShift('OnShift');
      openAccountMenu();

      myScheduleMenuLink()?.click();
      fixture.detectChanges();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(router.serializeUrl(navigate.mock.calls[0]?.[0] as UrlTree)).toBe('/schedule');
      expect(accountToggle().getAttribute('aria-expanded')).toBe('false');
      expect(accountMenuLabels()).toEqual([]);
    });
  });

  /**
   * `../../../../../e2e` locates every element by role and accessible name
   * only, so a markup change here that drops one breaks a suite this surface
   * cannot see — see `CONVENTIONS.md`, "What this surface owes the surfaces
   * that test it".
   */
  describe('accessible names the e2e suite locates by', () => {
    it.each(SHARED_LABELS)('keeps "%s" a real link carrying its own name', (label) => {
      signInOnShift();

      const link = Array.from(
        fixture.nativeElement.querySelectorAll('.navbar-nav a.nav-link'),
      ).find((item) => (item as HTMLElement).textContent?.trim() === label) as HTMLAnchorElement;

      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe(`/${label.toLowerCase()}`);
    });

    it('exposes the shift indicator as a status region carrying its label', () => {
      signIn();
      shiftService.report('OffShift');
      fixture.detectChanges();

      const indicator = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;

      expect(indicator.textContent?.trim()).toBe('Not on the clock');
      expect(indicator.querySelector('.shift-indicator-dot')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
    });

    it('keeps the account toggle and the logout control named', () => {
      signIn();

      expect(accountToggle().textContent?.trim()).toBe('Account');

      openAccountMenu();

      expect(accountMenuLabels()).toContain('Logout');
    });
  });
});

/**
 * The header and the real `ShiftService` together, with only HTTP stubbed: the
 * path from a sign-in, through the read it triggers, to what the header shows.
 * The block above drives `currentShift` directly; this one proves the real
 * service feeds it.
 */
describe('AppShellComponent shift indicator, fed by the real ShiftService', () => {
  const SHIFT_URL = '/v1/employees/me/shift';

  let fixture: ComponentFixture<AppShellComponent>;
  let authService: StubAuthService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
        {
          provide: SHIFT_SERVICE,
          useExisting: ShiftService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function signIn(): void {
    authService.signIn({
      id: '10041',
      name: 'Avery Brooks',
      role: 'Associate',
      department: 'Grocery',
      jobFunction: 'Register',
    });
    TestBed.tick();
    fixture.detectChanges();
  }

  function shiftIndicatorText(): string | null {
    const indicator = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement | null;

    return indicator ? (indicator.textContent?.trim() ?? '') : null;
  }

  it('shows no indicator after sign-in until the first read lands, then the right label', () => {
    signIn();

    const request = httpMock.expectOne(SHIFT_URL);

    expect(shiftIndicatorText()).toBeNull();

    request.flush({ data: { status: 'OnBreak', onDuty: false }, meta: {} });
    fixture.detectChanges();

    expect(shiftIndicatorText()).toBe('On break');
  });

  it('shows no indicator when the first read fails', () => {
    signIn();

    httpMock.expectOne(SHIFT_URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(shiftIndicatorText()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toMatch(/on the clock|on break/i);
  });

  function navLabels(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.navbar-nav .nav-link')).map(
      (item) => (item as HTMLElement).textContent?.trim() ?? '',
    );
  }

  function answer(url: string, status: string, onDuty: boolean): void {
    httpMock.expectOne(url).flush({ data: { status, onDuty }, meta: {} });
    fixture.detectChanges();
  }

  it('never shows the full nav while an off-duty read is in flight', () => {
    signIn();

    const request = httpMock.expectOne(SHIFT_URL);

    expect(navLabels()).toEqual([]);

    request.flush({ data: { status: 'OffShift', onDuty: false }, meta: {} });
    fixture.detectChanges();

    expect(navLabels()).toEqual(['Home', 'My schedule']);
  });

  it('shows no nav item when the first read fails', () => {
    signIn();

    httpMock.expectOne(SHIFT_URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(navLabels()).toEqual([]);
  });

  it('brings the full nav back from a clock-in response', () => {
    signIn();
    answer(SHIFT_URL, 'OffShift', false);

    TestBed.inject(ShiftService).clockIn().subscribe();
    answer('/v1/employees/me/clock-in', 'OnShift', true);

    expect(navLabels()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'My tasks']);
  });

  it('brings the full nav back from an end-break response', () => {
    signIn();
    answer(SHIFT_URL, 'OnBreak', false);

    expect(navLabels()).toEqual(['Home', 'My schedule']);

    TestBed.inject(ShiftService).endBreak().subscribe();
    answer('/v1/employees/me/end-break', 'OnShift', true);

    expect(navLabels()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'My tasks']);
  });

  it('updates the label from a clock-in response', () => {
    signIn();
    httpMock
      .expectOne(SHIFT_URL)
      .flush({ data: { status: 'OffShift', onDuty: false }, meta: {} });
    fixture.detectChanges();

    expect(shiftIndicatorText()).toBe('Not on the clock');

    TestBed.inject(ShiftService).clockIn().subscribe();
    httpMock
      .expectOne('/v1/employees/me/clock-in')
      .flush({ data: { status: 'OnShift', onDuty: true }, meta: {} });
    fixture.detectChanges();

    expect(shiftIndicatorText()).toBe('On the clock');
  });
});
