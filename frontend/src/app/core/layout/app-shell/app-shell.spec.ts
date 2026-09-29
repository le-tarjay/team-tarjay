import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { MockInstance, vi } from 'vitest';

import { AppShellComponent } from './app-shell';
import { IAuthService } from '../../auth/auth.service';
import { Employee, EmployeeRole } from '../../models/auth/employee.model';
import { ShiftStatus } from '../../models/shift/shift-status.model';
import {
  CLOCK_IN_REJECTED_MESSAGE,
  CLOCK_IN_UNREACHABLE_MESSAGE,
  CLOCK_OUT_REJECTED_MESSAGE,
  CLOCK_OUT_UNREACHABLE_MESSAGE,
  END_BREAK_REJECTED_MESSAGE,
  END_BREAK_UNREACHABLE_MESSAGE,
  START_BREAK_REJECTED_MESSAGE,
  START_BREAK_UNREACHABLE_MESSAGE,
} from '../../shift/shift-action-messages';
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
      signIn({ role });

      expect(navLabels().slice(0, SHARED_LABELS.length)).toEqual(SHARED_LABELS);
    });

    it('keep the shared items ahead of exactly one role-specific item, for every role', () => {
      for (const { role } of ROLE_LABELS) {
        signIn({ role });

        expect(navLabels()).toHaveLength(SHARED_LABELS.length + 1);
        expect(navLabels().slice(0, SHARED_LABELS.length)).toEqual(SHARED_LABELS);
      }
    });

    it('does not render a "Price check" item, which has no page or route yet', () => {
      signIn();

      expect(navLabels()).not.toContain('Price check');
    });
  });

  describe('role-specific nav item', () => {
    it('gives a Receiving Associate the "Receiving" item', () => {
      signIn({ role: 'ReceivingAssociate', jobFunction: 'Receiving' });

      expect(roleSpecificLabel()).toBe('Receiving');
    });

    it('gives a Receiving Associate "Receiving" whatever their job function says', () => {
      signIn({ role: 'ReceivingAssociate', jobFunction: 'Customer Support' });

      expect(roleSpecificLabel()).toBe('Receiving');
    });

    it('gives the Customer Support job function the "Fulfillment" item', () => {
      signIn({ role: 'Associate', department: 'Customer Support', jobFunction: 'Customer Support' });

      expect(roleSpecificLabel()).toBe('Fulfillment');
    });

    it('matches the Customer Support job function regardless of casing or padding', () => {
      signIn({ role: 'Associate', jobFunction: '  customer support ' });

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
        signIn({ role, jobFunction });

        expect(roleSpecificLabel()).toBe(expected);
      },
    );

    it.each(['', '   '])(
      'still gives a stocking item when the job function resolves to nothing ("%s")',
      (jobFunction) => {
        signIn({ role: 'Associate', jobFunction });

        expect(roleSpecificLabel()).toBe('My tasks');
      },
    );

    it('never leaves the role-specific slot empty for any role', () => {
      for (const { role } of ROLE_LABELS) {
        signIn({ role, jobFunction: 'Something Corporate Invented' });

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
      signIn({ role: 'ReceivingAssociate' });

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

      signIn({ role: 'StoreManager' });

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
        'Start break',
        'Clock out',
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
   * Which shift actions the account menu offers in each state (API map, design
   * rows D2, D3 and D4). What choosing one does is covered against the real
   * `ShiftService` below.
   */
  describe('shift actions in the account menu', () => {
    const SHIFT_ACTION_LABELS = ['Clock in', 'Start break', 'End break', 'Clock out'];

    function reportShift(status: ShiftStatus): void {
      shiftService.report(status);
      fixture.detectChanges();
    }

    function shiftActionItems(): HTMLButtonElement[] {
      return accountMenuItems().filter((item) =>
        SHIFT_ACTION_LABELS.includes(item.textContent?.trim() ?? ''),
      );
    }

    function shiftActionLabels(): string[] {
      return shiftActionItems().map((item) => item.textContent?.trim() ?? '');
    }

    it('shows exactly "Clock in" when off shift', () => {
      signIn();
      reportShift('OffShift');
      openAccountMenu();

      expect(shiftActionLabels()).toEqual(['Clock in']);
    });

    it('shows exactly "Start break" and "Clock out" when on shift', () => {
      signIn();
      reportShift('OnShift');
      openAccountMenu();

      expect(shiftActionLabels()).toEqual(['Start break', 'Clock out']);
    });

    it('shows exactly "End break" and "Clock out" when on break, with End break primary', () => {
      signIn();
      reportShift('OnBreak');
      openAccountMenu();

      const [endBreak, clockOut] = shiftActionItems();

      expect(shiftActionLabels()).toEqual(['End break', 'Clock out']);
      expect(endBreak?.classList).toContain('shift-action-primary');
      expect(clockOut?.classList).not.toContain('shift-action-primary');
    });

    it('marks "Clock in" as the primary action off shift', () => {
      signIn();
      reportShift('OffShift');
      openAccountMenu();

      expect(shiftActionItems()[0]?.classList).toContain('shift-action-primary');
    });

    it('marks neither on-shift action as primary', () => {
      signIn();
      reportShift('OnShift');
      openAccountMenu();

      expect(
        shiftActionItems().some((item) => item.classList.contains('shift-action-primary')),
      ).toBe(false);
    });

    it('offers no shift action before the first shift-status read lands', () => {
      signIn();
      openAccountMenu();

      expect(shiftActionLabels()).toEqual([]);
    });

    it('sits at the top of the menu, ahead of every existing entry', () => {
      signIn({ role: 'StoreManager' });
      reportShift('OnBreak');
      openAccountMenu();

      expect(accountMenuLabels()).toEqual([
        'End break',
        'Clock out',
        'Employee roster',
        'Register status',
        'Logout',
      ]);
    });

    it('follows the held status as it changes', () => {
      signIn();
      reportShift('OffShift');
      openAccountMenu();

      expect(shiftActionLabels()).toEqual(['Clock in']);

      reportShift('OnShift');

      expect(shiftActionLabels()).toEqual(['Start break', 'Clock out']);

      reportShift('OnBreak');

      expect(shiftActionLabels()).toEqual(['End break', 'Clock out']);
    });

    it('renders every shift action as a real, enabled button carrying its label', () => {
      signIn();
      reportShift('OnBreak');
      openAccountMenu();

      for (const item of shiftActionItems()) {
        expect(item.tagName).toBe('BUTTON');
        expect(item.disabled).toBe(false);
      }
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
      signIn();

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

  /**
   * Choosing a shift action from the account menu: the endpoint it calls, where
   * it lands, and that everything on screen comes from the server's answer.
   */
  describe('choosing a shift action', () => {
    let navigate: MockInstance<Router['navigateByUrl']>;

    beforeEach(() => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    });

    function signInAs(status: ShiftStatus): void {
      signIn();
      httpMock
        .expectOne(SHIFT_URL)
        .flush({ data: { status, onDuty: status === 'OnShift' }, meta: {} });
      fixture.detectChanges();
    }

    function openAccountMenu(): void {
      (fixture.nativeElement.querySelector('.dropdown-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function menuItem(label: string): HTMLButtonElement | undefined {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.dropdown-item') as NodeListOf<HTMLButtonElement>,
      ).find((item) => item.textContent?.trim() === label);
    }

    function menuLabels(): string[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>,
      ).map((item) => item.textContent?.trim() ?? '');
    }

    function choose(label: string): void {
      openAccountMenu();
      menuItem(label)?.click();
      fixture.detectChanges();
    }

    function respond(url: string, status: ShiftStatus): void {
      httpMock
        .expectOne({ method: 'POST', url })
        .flush({ data: { status, onDuty: status === 'OnShift' }, meta: {} });
      fixture.detectChanges();
    }

    function isMenuOpen(): boolean {
      return (
        (fixture.nativeElement.querySelector('.dropdown-toggle') as HTMLButtonElement).getAttribute(
          'aria-expanded',
        ) === 'true'
      );
    }

    function identityText(): string {
      return (
        (
          fixture.nativeElement.querySelector('.navbar-text') as HTMLElement | null
        )?.textContent?.trim() ?? ''
      );
    }

    it('"Clock in" calls the clock-in endpoint and lands on the on-shift default screen', () => {
      signInAs('OffShift');
      choose('Clock in');
      respond('/v1/employees/me/clock-in', 'OnShift');

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/sale');
      expect(shiftIndicatorText()).toBe('On the clock');
      expect(isMenuOpen()).toBe(false);
    });

    it('"End break" calls the end-break endpoint and lands on the default screen, never Home', () => {
      signInAs('OnBreak');
      choose('End break');
      respond('/v1/employees/me/end-break', 'OnShift');

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/sale');
      expect(navigate).not.toHaveBeenCalledWith('/home');
      expect(shiftIndicatorText()).toBe('On the clock');
    });

    it('"Clock out" calls the clock-out endpoint and stays on Home, still signed in', () => {
      signInAs('OnShift');
      choose('Clock out');
      respond('/v1/employees/me/clock-out', 'OffShift');

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/home');
      expect(navigate).not.toHaveBeenCalledWith('/login');
      expect(identityText()).toBe('Avery Brooks · Grocery · Associate');
      expect(shiftIndicatorText()).toBe('Not on the clock');
    });

    it('"Clock out" from on break calls the clock-out endpoint', () => {
      signInAs('OnBreak');
      choose('Clock out');
      respond('/v1/employees/me/clock-out', 'OffShift');

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/home');
      expect(shiftIndicatorText()).toBe('Not on the clock');
    });

    it('"Start break" calls the start-break endpoint and lands on Home', () => {
      signInAs('OnShift');
      choose('Start break');
      respond('/v1/employees/me/start-break', 'OnBreak');

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/home');
      expect(shiftIndicatorText()).toBe('On break');
    });

    it('changes nothing on screen until the server answers, then shows what it answered', () => {
      signInAs('OnShift');
      choose('Start break');

      expect(shiftIndicatorText()).toBe('On the clock');
      expect(menuLabels().slice(0, 2)).toEqual(['Start break', 'Clock out']);
      expect(navigate).not.toHaveBeenCalled();

      respond('/v1/employees/me/start-break', 'OnBreak');
      openAccountMenu();

      expect(shiftIndicatorText()).toBe('On break');
      expect(menuLabels().slice(0, 2)).toEqual(['End break', 'Clock out']);
    });

    it('shows the status the server returned, not the one the action implies', () => {
      signInAs('OffShift');
      choose('Clock in');
      respond('/v1/employees/me/clock-in', 'OnBreak');

      expect(shiftIndicatorText()).toBe('On break');
    });

    it('disables the shift actions while a transition is in flight', () => {
      signInAs('OnShift');
      choose('Clock out');

      expect(menuItem('Start break')?.disabled).toBe(true);
      expect(menuItem('Clock out')?.disabled).toBe(true);

      respond('/v1/employees/me/clock-out', 'OffShift');
    });

    it('on an unreachable backend, leaves the status as it was, stays put, and offers the action again', () => {
      signInAs('OnShift');
      choose('Clock out');
      httpMock
        .expectOne({ method: 'POST', url: '/v1/employees/me/clock-out' })
        .error(new ProgressEvent('error'));
      fixture.detectChanges();

      expect(shiftIndicatorText()).toBe('On the clock');
      expect(navigate).not.toHaveBeenCalled();
      expect(isMenuOpen()).toBe(true);
      expect(menuItem('Clock out')?.disabled).toBe(false);
    });

    /**
     * What a failed shift action says, and whether the shift is re-read behind
     * it (LET-146). Driven through the real service, so the re-read is a real
     * request that `httpMock.verify()` would catch if it went unasked or
     * unexpected.
     */
    describe('when the action fails', () => {
      interface ActionCase {
        label: string;
        url: string;
        from: ShiftStatus;
        rejected: string;
        unreachable: string;
      }

      const ACTIONS: readonly ActionCase[] = [
        {
          label: 'Clock in',
          url: '/v1/employees/me/clock-in',
          from: 'OffShift',
          rejected: CLOCK_IN_REJECTED_MESSAGE,
          unreachable: CLOCK_IN_UNREACHABLE_MESSAGE,
        },
        {
          label: 'Clock out',
          url: '/v1/employees/me/clock-out',
          from: 'OnShift',
          rejected: CLOCK_OUT_REJECTED_MESSAGE,
          unreachable: CLOCK_OUT_UNREACHABLE_MESSAGE,
        },
        {
          label: 'Start break',
          url: '/v1/employees/me/start-break',
          from: 'OnShift',
          rejected: START_BREAK_REJECTED_MESSAGE,
          unreachable: START_BREAK_UNREACHABLE_MESSAGE,
        },
        {
          label: 'End break',
          url: '/v1/employees/me/end-break',
          from: 'OnBreak',
          rejected: END_BREAK_REJECTED_MESSAGE,
          unreachable: END_BREAK_UNREACHABLE_MESSAGE,
        },
      ];

      function reject(url: string): void {
        httpMock
          .expectOne({ method: 'POST', url })
          .flush(null, { status: 409, statusText: 'Conflict' });
        fixture.detectChanges();
      }

      function failToReach(url: string): void {
        httpMock.expectOne({ method: 'POST', url }).error(new ProgressEvent('error'));
        fixture.detectChanges();
      }

      function answerReread(status: ShiftStatus): void {
        httpMock
          .expectOne({ method: 'GET', url: SHIFT_URL })
          .flush({ data: { status, onDuty: status === 'OnShift' }, meta: {} });
        fixture.detectChanges();
      }

      function alertText(): string | null {
        const alert = fixture.nativeElement.querySelector(
          '.dropdown-menu [role="alert"]',
        ) as HTMLElement | null;

        return alert ? (alert.textContent?.trim() ?? '') : null;
      }

      it.each(ACTIONS)(
        'a 409 from "$label" shows its rejection message and re-reads the shift',
        ({ label, url, from, rejected }) => {
          signInAs(from);
          choose(label);
          reject(url);

          expect(alertText()).toBe(rejected);
          answerReread(from);
          expect(navigate).not.toHaveBeenCalled();
        },
      );

      it.each(ACTIONS)(
        'an unreachable backend on "$label" shows its try-again message and does not re-read',
        ({ label, url, from, unreachable }) => {
          signInAs(from);
          choose(label);
          failToReach(url);

          expect(alertText()).toBe(unreachable);
          httpMock.expectNone({ method: 'GET', url: SHIFT_URL });
          expect(navigate).not.toHaveBeenCalled();
        },
      );

      it('leaves the header and menu as they were before the attempt when unreachable', () => {
        signInAs('OnShift');
        choose('Start break');
        failToReach('/v1/employees/me/start-break');

        expect(shiftIndicatorText()).toBe('On the clock');
        expect(menuLabels().slice(0, 2)).toEqual(['Start break', 'Clock out']);
      });

      it('shows the server\'s actual status in the header and menu once the re-read lands', () => {
        signInAs('OffShift');
        choose('Clock in');
        reject('/v1/employees/me/clock-in');

        expect(shiftIndicatorText()).toBe('Not on the clock');

        answerReread('OnBreak');

        expect(shiftIndicatorText()).toBe('On break');
        expect(menuLabels().slice(0, 2)).toEqual(['End break', 'Clock out']);
        expect(alertText()).toBe(CLOCK_IN_REJECTED_MESSAGE);
      });

      it('shows a different message for a 409 than for an unreachable backend', () => {
        signInAs('OnShift');
        choose('Clock out');
        reject('/v1/employees/me/clock-out');
        answerReread('OnShift');
        const rejectedText = alertText();

        menuItem('Clock out')?.click();
        fixture.detectChanges();
        failToReach('/v1/employees/me/clock-out');

        expect(rejectedText).toBe(CLOCK_OUT_REJECTED_MESSAGE);
        expect(alertText()).toBe(CLOCK_OUT_UNREACHABLE_MESSAGE);
      });

      it('shows each action\'s own message when two actions fail for the same reason', () => {
        signInAs('OnShift');
        choose('Start break');
        failToReach('/v1/employees/me/start-break');
        const startBreakText = alertText();

        menuItem('Clock out')?.click();
        fixture.detectChanges();
        failToReach('/v1/employees/me/clock-out');

        expect(startBreakText).toBe(START_BREAK_UNREACHABLE_MESSAGE);
        expect(alertText()).toBe(CLOCK_OUT_UNREACHABLE_MESSAGE);
      });

      it('clears the message when another action is tried', () => {
        signInAs('OnShift');
        choose('Start break');
        failToReach('/v1/employees/me/start-break');

        menuItem('Start break')?.click();
        fixture.detectChanges();

        expect(alertText()).toBeNull();
        respond('/v1/employees/me/start-break', 'OnBreak');
      });

      it('clears the message when the account menu is closed and reopened', () => {
        signInAs('OnShift');
        choose('Start break');
        failToReach('/v1/employees/me/start-break');

        openAccountMenu();
        openAccountMenu();

        expect(isMenuOpen()).toBe(true);
        expect(alertText()).toBeNull();
      });
    });
  });
});
