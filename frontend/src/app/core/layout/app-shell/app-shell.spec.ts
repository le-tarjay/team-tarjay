import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AppShellComponent, deriveInitials } from './app-shell';
import { AUTH_SERVICE } from '../../tokens';
import { MockAuthService } from '../../../mocks/mock-auth.service';

// Pure-function coverage for the initials derivation (LET-66 fringe case:
// degrade gracefully for a single-word name). Tested directly since none of
// MockAuthService's seeded employees carry a single-word name, and this
// logic has no dependency on component/DI state.
describe('deriveInitials', () => {
  it('derives the first and last initial from a two-word name', () => {
    expect(deriveInitials('Avery Brooks')).toBe('AB');
  });

  it('degrades gracefully to a single initial for a single-word name', () => {
    expect(deriveInitials('Cher')).toBe('C');
  });

  it('uses the first and last word for a name with more than two words', () => {
    expect(deriveInitials('Mary Jane Watson')).toBe('MW');
  });
});

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let authService: MockAuthService;

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

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AUTH_SERVICE) as MockAuthService;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders no identity block when currentEmployee() is null', () => {
    expect(fixture.nativeElement.querySelector('.identity-block')).toBeNull();
  });

  it('renders "Electronics · Department Manager" for a Department Manager in Electronics', async () => {
    await firstValueFrom(authService.login({ employeeId: 'deptmgr', pin: '2222' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.employee-name').textContent.trim()).toBe('Jordan Lee');
    expect(fixture.nativeElement.querySelector('.department-role').textContent.trim()).toBe(
      'Electronics · Department Manager',
    );
  });

  it('renders "Grocery · Store Manager" for a Store Manager in Grocery', async () => {
    await firstValueFrom(authService.login({ employeeId: 'storemgr', pin: '3333' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.department-role').textContent.trim()).toBe(
      'Grocery · Store Manager',
    );
  });

  it('renders "Electronics · Associate" for an Associate', async () => {
    await firstValueFrom(authService.login({ employeeId: 'associate', pin: '1111' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.department-role').textContent.trim()).toBe('Electronics · Associate');
  });

  it('renders "Storewide · Receiving Associate" rather than a blank department for a Receiving Associate', async () => {
    await firstValueFrom(authService.login({ employeeId: 'receiving', pin: '4444' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.department-role').textContent.trim()).toBe(
      'Storewide · Receiving Associate',
    );
  });

  it('renders "Associate", not "Cashier", for an Associate with function: cashier', async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.department-role').textContent.trim()).toBe('Grocery · Associate');
  });

  it('derives and renders initials for the signed-in employee', async () => {
    await firstValueFrom(authService.login({ employeeId: 'associate', pin: '1111' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.avatar-initials').textContent.trim()).toBe('MD');
  });

  it('removes the identity block again once currentEmployee() goes back to null', async () => {
    await firstValueFrom(authService.login({ employeeId: 'associate', pin: '1111' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.identity-block')).not.toBeNull();

    // Exercises the auth service directly (not component.logout(), which also
    // navigates — routing isn't this story's concern) to confirm the identity
    // block itself reacts to currentEmployee() dropping back to null.
    authService.logout();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.identity-block')).toBeNull();
  });

  // Nav-bar generation from the tier × department × function permission
  // model (LET-68). Each case below exercises a different seeded tier via
  // MockAuthService, so the coverage exercises the real permission model
  // (NavPermissionService) rather than a stubbed visible set.
  describe('nav-bar generation from the permission model', () => {
    function navLinkTexts(): string[] {
      const links: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.navbar-nav .nav-link');
      return Array.from(links).map((el) => el.textContent!.trim());
    }

    it('renders no destination nav links (but brand + logout remain) when currentEmployee() is null', () => {
      expect(navLinkTexts()).toEqual([]);
      expect(fixture.nativeElement.querySelector('.navbar-brand')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button.btn-outline-light')).not.toBeNull();
    });

    it("renders exactly a Store Manager's visible set (all five destinations)", async () => {
      await firstValueFrom(authService.login({ employeeId: 'storemgr', pin: '3333' }));
      fixture.detectChanges();

      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
    });

    it("renders exactly a Department Manager's visible set (all five destinations)", async () => {
      await firstValueFrom(authService.login({ employeeId: 'deptmgr', pin: '2222' }));
      fixture.detectChanges();

      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
    });

    it("renders exactly a Cashier Associate's visible set, including Buyers", async () => {
      await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
      fixture.detectChanges();

      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
    });

    it('does not render a link for a destination the employee\'s tier lacks, even though it exists in the static route table', async () => {
      await firstValueFrom(authService.login({ employeeId: 'associate', pin: '1111' }));
      fixture.detectChanges();

      // Non-Cashier Associate: /buyers exists in app.routes.ts but is not in
      // this employee's visible set, so it must not render as a nav link.
      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Payment']);
      expect(navLinkTexts()).not.toContain('Buyers');
    });

    it('renders zero destination links (brand + logout remain) for a Receiving Associate (empty visible set)', async () => {
      await firstValueFrom(authService.login({ employeeId: 'receiving', pin: '4444' }));
      fixture.detectChanges();

      expect(navLinkTexts()).toEqual([]);
      expect(fixture.nativeElement.querySelector('.navbar-brand')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button.btn-outline-light')).not.toBeNull();
    });

    it('re-renders the nav to match the newly signed-in employee when currentEmployee switches tiers', async () => {
      await firstValueFrom(authService.login({ employeeId: 'associate', pin: '1111' }));
      fixture.detectChanges();
      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Payment']);

      authService.logout();
      await firstValueFrom(authService.login({ employeeId: 'storemgr', pin: '3333' }));
      fixture.detectChanges();

      expect(navLinkTexts()).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
    });
  });
});
