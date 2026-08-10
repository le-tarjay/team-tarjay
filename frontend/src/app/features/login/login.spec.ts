import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { LoginComponent } from './login';
import { AUTH_SERVICE } from '../../core/tokens';
import { MockAuthService } from '../../mocks/mock-auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: MockAuthService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resolves a non-Cashier tier from the expanded seeded set and navigates to /sale', async () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    component.employeeId.set('ckim');
    component.pin.set('4567');
    component.login();

    await vi.waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/sale'));

    expect(component.errorMessage()).toBe('');
  });

  it('shows the existing invalid-credential error for a pair not in the seeded table, without navigating', async () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    component.employeeId.set('nobody');
    component.pin.set('0000');
    component.login();

    await vi.waitFor(() => expect(component.errorMessage()).toBe('Invalid employee ID or PIN.'));

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
