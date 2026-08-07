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
});
