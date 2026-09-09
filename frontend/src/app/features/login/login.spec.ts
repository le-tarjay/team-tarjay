import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { LoginComponent } from './login';
import {
  CORPORATE_UNREACHABLE_MESSAGE,
  IAuthService,
  INVALID_CREDENTIALS_MESSAGE,
} from '../../core/auth/auth.service';
import { Employee } from '../../core/models/auth/employee.model';
import { AUTH_SERVICE } from '../../core/tokens';
import { MockAuthService } from '../../mocks/mock-auth.service';

const EMPTY_FIELDS_MESSAGE = 'Enter your employee ID and PIN.';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: IAuthService;

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
    authService = TestBed.inject(AUTH_SERVICE);
    fixture.detectChanges();
  });

  /**
   * The component's template-only signals are `protected`, so every test here
   * drives the real form and asserts on rendered output — which is also the
   * only thing the employee at the terminal actually sees.
   */
  function fillCredentials(employeeId: string, pin: string): void {
    setFieldValue('#employeeId', employeeId);
    setFieldValue('#pin', pin);
  }

  function setFieldValue(selector: string, value: string): void {
    const field = fixture.nativeElement.querySelector(selector) as HTMLInputElement;

    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  function alertText(): string {
    const alert = fixture.nativeElement.querySelector('[role="alert"]');

    return alert?.textContent?.trim() ?? '';
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the invalid-credentials message in the inline alert', () => {
    fillCredentials('cashier', 'wrong-pin');
    submit();

    expect(alertText()).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('should show the corporate-unreachable message, distinct from invalid credentials', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      throwError(() => new Error(CORPORATE_UNREACHABLE_MESSAGE)),
    );

    fillCredentials('cashier', '1234');
    submit();

    expect(alertText()).toBe(CORPORATE_UNREACHABLE_MESSAGE);
    expect(alertText()).not.toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('should render both failure messages in the same alert element', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      throwError(() => new Error(CORPORATE_UNREACHABLE_MESSAGE)),
    );

    fillCredentials('cashier', '1234');
    submit();

    const unreachableAlert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    const unreachableClasses = unreachableAlert.className;

    vi.mocked(authService.login).mockReturnValue(
      throwError(() => new Error(INVALID_CREDENTIALS_MESSAGE)),
    );

    submit();

    const rejectedAlert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(rejectedAlert.className).toBe(unreachableClasses);
  });

  it('should not render the demo-credentials hint anywhere', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.login-hint')).toBeNull();
    expect(compiled.textContent).not.toContain('Demo credentials');
    expect(compiled.textContent).not.toContain('cashier');
    expect(compiled.textContent).not.toContain('1234');
    expect(compiled.innerHTML).not.toContain('cashier');
    expect(compiled.innerHTML).not.toContain('1234');
  });

  it('should reject an empty employee ID without calling AuthService', () => {
    const login = vi.spyOn(authService, 'login');

    fillCredentials('   ', '1234');
    submit();

    expect(alertText()).toBe(EMPTY_FIELDS_MESSAGE);
    expect(login).not.toHaveBeenCalled();
  });

  it('should reject an empty PIN without calling AuthService', () => {
    const login = vi.spyOn(authService, 'login');

    fillCredentials('cashier', '   ');
    submit();

    expect(alertText()).toBe(EMPTY_FIELDS_MESSAGE);
    expect(login).not.toHaveBeenCalled();
  });

  it('should disable submit and show the loading indicator while a sign-in is in flight', () => {
    const inFlight = new Subject<Employee>();
    vi.spyOn(authService, 'login').mockReturnValue(inFlight.asObservable());

    fillCredentials('cashier', '1234');
    submit();

    const button = submitButton();

    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toContain('Signing in...');
    expect(button.querySelector('.spinner-border')).not.toBeNull();
    expect(alertText()).toBe('');
  });

  it('should not start a second sign-in while one is already in flight', () => {
    const inFlight = new Subject<Employee>();
    const login = vi.spyOn(authService, 'login').mockReturnValue(inFlight.asObservable());

    fillCredentials('cashier', '1234');
    submit();
    submit();

    expect(login).toHaveBeenCalledTimes(1);
  });

  it('should stop the loading state once a failed sign-in returns', () => {
    const inFlight = new Subject<Employee>();
    vi.spyOn(authService, 'login').mockReturnValue(inFlight.asObservable());

    fillCredentials('cashier', '1234');
    submit();

    inFlight.error(new Error(CORPORATE_UNREACHABLE_MESSAGE));
    fixture.detectChanges();

    const button = submitButton();

    expect(button.disabled).toBe(false);
    expect(button.textContent?.trim()).toBe('Sign in');
    expect(alertText()).toBe(CORPORATE_UNREACHABLE_MESSAGE);
  });

  /**
   * `../../../e2e` locates these three by accessible name only, so a markup
   * change here that drops a label association or the button's name breaks a
   * suite this surface cannot see — see `CONVENTIONS.md`, "What this surface
   * owes the surfaces that test it".
   */
  it('should keep the accessible names the e2e suite locates by', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    const employeeIdLabel = compiled.querySelector('label[for="employeeId"]');
    const pinLabel = compiled.querySelector('label[for="pin"]');

    expect(employeeIdLabel?.textContent?.trim()).toBe('Employee ID');
    expect(pinLabel?.textContent?.trim()).toBe('PIN');

    expect(compiled.querySelector('#employeeId')).not.toBeNull();
    expect(compiled.querySelector('#pin')).not.toBeNull();

    expect(submitButton().textContent?.trim()).toBe('Sign in');
  });
});
