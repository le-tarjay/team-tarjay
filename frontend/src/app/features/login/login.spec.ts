import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Provider, provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { MockInstance, vi } from 'vitest';

import { LoginComponent } from './login';
import {
  CORPORATE_UNREACHABLE_MESSAGE,
  IAuthService,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_ENDED_ELSEWHERE_MESSAGE,
} from '../../core/auth/auth.service';
import { Employee } from '../../core/models/auth/employee.model';
import {
  SIGNED_IN_EMPLOYEE,
  StubAuthService,
} from '../../core/auth/testing/stub-auth.service';
import { AUTH_SERVICE } from '../../core/tokens';
import { MockAuthService } from '../../mocks/mock-auth.service';

const EMPTY_FIELDS_MESSAGE = 'Enter your employee ID and PIN.';

/**
 * The tests about a return to Login use `StubAuthService` rather than
 * `MockAuthService`, because the mock reports `sessionEnded` as a constant
 * `false` and teaching it to flip would hand it behavior `IAuthService` does
 * not declare. That reasoning lives with the stub.
 */
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: IAuthService;
  let stubAuthService: StubAuthService;
  let navigate: MockInstance<Router['navigateByUrl']>;

  /**
   * Read fresh on every access, so a test can set the query string this screen
   * was reached with before the navigation it is about to trigger.
   */
  let queryParams: Record<string, string>;

  /**
   * Configures and renders the screen against one auth double. It is a
   * function rather than a fixed `beforeEach` body because the returned-to-
   * Login tests need a service whose session has *already* ended before the
   * component initialises — `ngOnInit` is where the screen reads why it is
   * being shown, so a signal flipped after rendering would be flipped too
   * late to prove anything.
   */
  async function renderLogin(authProvider: Provider): Promise<void> {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        authProvider,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(queryParams);
              },
            },
          },
        },
      ],
    }).compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AUTH_SERVICE);
    fixture.detectChanges();
  }

  /**
   * The sequence a displaced employee actually goes through: signed in at this
   * terminal, then signed in again somewhere else, which ends this session —
   * `SessionTeardownService` clears it and sends the device here. Rendering
   * only after both steps is what makes "never pre-filled with the employee who
   * was just signed out" a real assertion rather than a vacuous one.
   */
  async function returnAfterSessionEnded(): Promise<void> {
    stubAuthService = new StubAuthService();
    stubAuthService.signIn();
    stubAuthService.endSessionElsewhere();

    await renderLogin({ provide: AUTH_SERVICE, useValue: stubAuthService });
  }

  async function returnAfterDeliberateLogout(): Promise<void> {
    stubAuthService = new StubAuthService();
    stubAuthService.signIn();
    stubAuthService.logout();

    await renderLogin({ provide: AUTH_SERVICE, useValue: stubAuthService });
  }

  beforeEach(async () => {
    queryParams = {};

    await renderLogin({ provide: AUTH_SERVICE, useClass: MockAuthService });
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

  /**
   * The one path that empties the message slot without a keystroke: the
   * employee is rejected, then presses Enter again without touching either
   * field. No `input` event fires on that retry, so the clear at the top of
   * `login()` is the only thing that empties the slot — without it the stale
   * failure sits on screen for the whole of the next in-flight request.
   */
  it('should clear a previous failure when the same credentials are resubmitted', () => {
    fillCredentials('cashier', 'wrong-pin');
    submit();

    expect(alertText()).toBe(INVALID_CREDENTIALS_MESSAGE);

    const inFlight = new Subject<Employee>();
    vi.spyOn(authService, 'login').mockReturnValue(inFlight.asObservable());

    submit();

    expect(alertText()).toBe('');
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

  /**
   * Where sign-in lands is this screen's half of the deal; the route guard
   * captured the destination and re-checks it on arrival. A destination the
   * employee's role doesn't cover is not this screen's to refuse — it navigates
   * there and the guard turns it away, which `core/auth/auth.guard.spec.ts`
   * covers.
   */
  describe('landing after a successful sign-in', () => {
    function signInSuccessfully(): void {
      vi.spyOn(authService, 'login').mockReturnValue(of(SIGNED_IN_EMPLOYEE));

      fillCredentials('cashier', '1234');
      submit();
    }

    it('goes to the captured destination when the guard preserved one', () => {
      queryParams = { returnUrl: '/products' };

      signInSuccessfully();

      expect(navigate).toHaveBeenCalledWith('/products');
    });

    it('keeps the query string of the captured destination', () => {
      queryParams = { returnUrl: '/products?query=milk' };

      signInSuccessfully();

      expect(navigate).toHaveBeenCalledWith('/products?query=milk');
    });

    it('goes to the default destination when no destination was captured', () => {
      signInSuccessfully();

      expect(navigate).toHaveBeenCalledWith('/sale');
    });

    /**
     * `returnUrl` arrives from the query string, so it is caller-supplied
     * whatever put it there. Anything that isn't an in-app path is dropped
     * silently — the employee still signs in and still lands somewhere real.
     */
    it.each(['https://evil.example/steal', '//evil.example/steal', 'products', ''])(
      'ignores "%s" and uses the default destination instead',
      (returnUrl) => {
        queryParams = { returnUrl };

        signInSuccessfully();

        expect(navigate).toHaveBeenCalledWith('/sale');
      },
    );

    it('does not navigate anywhere when the sign-in fails', () => {
      queryParams = { returnUrl: '/products' };

      fillCredentials('cashier', 'wrong-pin');
      submit();

      expect(alertText()).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not navigate while a sign-in is still in flight', () => {
      queryParams = { returnUrl: '/products' };

      vi.spyOn(authService, 'login').mockReturnValue(new Subject<Employee>().asObservable());

      fillCredentials('cashier', '1234');
      submit();

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  /**
   * Design rows 3 and 8: the one return the employee did not ask for is the
   * one that gets explained, and a deliberate sign-out gets a plain screen.
   */
  describe('returning to Login after the session ended elsewhere', () => {
    it('explains why the device is back at Login', async () => {
      await returnAfterSessionEnded();

      expect(alertText()).toBe(SESSION_ENDED_ELSEWHERE_MESSAGE);
    });

    /**
     * The story asks for the existing message slot rather than a banner of its
     * own, so this compares the rendered element against the one a rejected
     * credential produces — same element, same classes, same `role="alert"`.
     */
    it('renders the explanation in the same slot a sign-in failure uses', async () => {
      await returnAfterSessionEnded();

      const explanation = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      const explanationClasses = explanation.className;

      vi.spyOn(stubAuthService, 'login').mockReturnValue(
        throwError(() => new Error(INVALID_CREDENTIALS_MESSAGE)),
      );

      fillCredentials('cashier', 'wrong-pin');
      submit();

      const failure = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

      expect(alertText()).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(failure.className).toBe(explanationClasses);
    });

    it('clears the explanation on the first keystroke in Employee ID', async () => {
      await returnAfterSessionEnded();

      setFieldValue('#employeeId', '1');
      fixture.detectChanges();

      expect(alertText()).toBe('');
    });

    it('clears the explanation on the first keystroke in PIN', async () => {
      await returnAfterSessionEnded();

      setFieldValue('#pin', '1');
      fixture.detectChanges();

      expect(alertText()).toBe('');
    });

    it('does not leave the explanation behind on a successful sign-in', async () => {
      await returnAfterSessionEnded();

      fillCredentials('cashier', '1234');
      submit();

      expect(navigate).toHaveBeenCalledWith('/sale');
      expect(alertText()).toBe('');
    });

    /**
     * The explanation is about one return, not about the terminal. Once the
     * employee has signed back in, the next arrival at Login — here, their own
     * deliberate sign-out — is plain again.
     */
    it('does not explain the next return once the employee has signed back in', async () => {
      await returnAfterSessionEnded();

      fillCredentials('cashier', '1234');
      submit();

      stubAuthService.logout();

      const laterFixture = TestBed.createComponent(LoginComponent);
      laterFixture.detectChanges();

      expect(laterFixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows nothing at all after a deliberate logout', async () => {
      await returnAfterDeliberateLogout();

      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.querySelector('[role="alert"]')).toBeNull();
      expect(compiled.textContent).not.toContain(SESSION_ENDED_ELSEWHERE_MESSAGE);
    });
  });

  /**
   * Shared terminals: whoever walks up next is usually not the employee who
   * just left, so the screen starts empty and ready for them — design row 1.
   */
  describe('the state the screen starts in', () => {
    function employeeIdField(): HTMLInputElement {
      return fixture.nativeElement.querySelector('#employeeId') as HTMLInputElement;
    }

    it('is a blank, focused Employee ID field on a plain arrival', () => {
      expect(employeeIdField().value).toBe('');
      expect(document.activeElement).toBe(employeeIdField());
    });

    it('is a blank, focused Employee ID field after a deliberate logout', async () => {
      await returnAfterDeliberateLogout();

      expect(employeeIdField().value).toBe('');
      expect(document.activeElement).toBe(employeeIdField());
    });

    it('is a blank, focused Employee ID field after the session ended elsewhere', async () => {
      await returnAfterSessionEnded();

      expect(employeeIdField().value).toBe('');
      expect(document.activeElement).toBe(employeeIdField());
    });

    /**
     * A markup-leak check, and only that. The screen cannot know who was
     * signed out — the teardown has already nulled `currentEmployee`, and
     * `ngOnInit` redirects whenever `isAuthenticated()`, so Login never
     * renders with anyone signed in. What this asserts is that no identifier
     * of the previous employee reaches the rendered DOM by any route,
     * including a value or attribute the field assertions alone would miss.
     * The blank-and-focused guarantee itself is carried by the three tests
     * above.
     */
    it('leaves no trace of the previous employee in the rendered markup', async () => {
      await returnAfterSessionEnded();

      const compiled = fixture.nativeElement as HTMLElement;

      expect(employeeIdField().value).toBe('');
      expect(compiled.innerHTML).not.toContain(SIGNED_IN_EMPLOYEE.id);
      expect(compiled.innerHTML).not.toContain(SIGNED_IN_EMPLOYEE.name);
    });
  });

  describe('arriving already signed in', () => {
    function arriveSignedIn(): void {
      authService.login({ employeeId: 'cashier', pin: '1234' }).subscribe();

      const signedInFixture = TestBed.createComponent(LoginComponent);
      signedInFixture.detectChanges();
    }

    it('goes straight to the captured destination', () => {
      queryParams = { returnUrl: '/buyers' };

      arriveSignedIn();

      expect(navigate).toHaveBeenCalledWith('/buyers');
    });

    it('goes straight to the default destination when none was captured', () => {
      arriveSignedIn();

      expect(navigate).toHaveBeenCalledWith('/sale');
    });
  });
});
