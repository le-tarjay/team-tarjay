import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { AppShellComponent } from './app-shell';
import { AUTH_SERVICE } from '../../tokens';
import { IAuthService } from '../../auth/auth.service';
import { MockAuthService } from '../../../mocks/mock-auth.service';
import { NavPermissionService } from '../../permissions/nav-permission.service';

function navLinkLabels(fixture: ComponentFixture<AppShellComponent>): string[] {
  const links = fixture.nativeElement.querySelectorAll(
    '.navbar-nav a.nav-link',
  ) as NodeListOf<HTMLAnchorElement>;

  return Array.from(links).map((link) => link.textContent?.trim() ?? '');
}

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let authService: IAuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: MockAuthService,
        },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE);
    router = TestBed.inject(Router);

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  it.each([
    {
      employeeId: 'cashier',
      pin: '1234',
      name: 'Alex Rivera',
      initials: 'AR',
      departmentRole: 'Cashier · Associate',
    },
    {
      employeeId: 'jlee',
      pin: '2345',
      name: 'Jordan Lee',
      initials: 'JL',
      departmentRole: 'Electronics · Department Manager',
    },
    {
      employeeId: 'spatel',
      pin: '3456',
      name: 'Sam Patel',
      initials: 'SP',
      departmentRole: 'Customer Support · Store Manager',
    },
    {
      employeeId: 'ckim',
      pin: '4567',
      name: 'Casey Kim',
      initials: 'CK',
      departmentRole: 'storewide · Receiving Associate',
    },
  ])(
    'renders initials, name, and department · role for the $employeeId tier',
    async ({ employeeId, pin, name, initials, departmentRole }) => {
      await firstValueFrom(authService.login({ employeeId, pin }));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.textContent).toContain(initials);
      expect(compiled.textContent).toContain(name);
      expect(compiled.textContent).toContain(departmentRole);
    },
  );

  it("renders the Receiving Associate's storewide value in the department position, not a named department", async () => {
    await firstValueFrom(authService.login({ employeeId: 'ckim', pin: '4567' }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('storewide · Receiving Associate');
    expect(compiled.textContent).not.toMatch(/Grocery|Electronics|Cashier|Customer Support · Receiving Associate/);
  });

  it('opens the identity-click menu on click, showing exactly one action, Logout', async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();

    const toggle = fixture.nativeElement.querySelector('.identity-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('[role="menu"]') as HTMLElement;
    const menuItems = menu.querySelectorAll('[role="menuitem"]');

    expect(menu).toBeTruthy();
    expect(menuItems.length).toBe(1);
    expect(menuItems[0].textContent?.trim()).toBe('Logout');
  });

  it('still logs out and navigates to /login when Logout is clicked from the menu', async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    const toggle = fixture.nativeElement.querySelector('.identity-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const logoutButton = fixture.nativeElement.querySelector(
      '[role="menuitem"]',
    ) as HTMLButtonElement;
    logoutButton.click();

    expect(authService.isAuthenticated()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });
});
