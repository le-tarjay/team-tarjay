import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AppShellComponent } from './app-shell';
import { IAuthService } from '../../auth/auth.service';
import { Employee, EmployeeRole } from '../../models/auth/employee.model';
import { AUTH_SERVICE } from '../../tokens';

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

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(): Observable<Employee> {
    return throwError(() => new Error('Not exercised by the app shell.'));
  }

  logout(): void {
    this.employee.set(null);
  }

  signIn(employee: Employee): void {
    this.employee.set(employee);
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
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

    it('keeps the account toggle and the logout control named', () => {
      signIn();

      expect(accountToggle().textContent?.trim()).toBe('Account');

      openAccountMenu();

      expect(accountMenuLabels()).toContain('Logout');
    });
  });
});
