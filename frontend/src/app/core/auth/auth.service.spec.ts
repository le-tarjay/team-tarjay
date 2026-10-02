import { HttpParams, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  AuthService,
  CORPORATE_UNREACHABLE_MESSAGE,
  IDENTITY_INCOMPLETE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  LoginCredentials,
  OFFLINE_MESSAGE,
  SESSION_REFRESH_INTERVAL_MS,
  SIGN_IN_FAILED_MESSAGE,
} from './auth.service';
import { bearerTokenInterceptor } from './bearer-token.interceptor';
import { SignInValidationError } from './sign-in-validation.error';
import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { AUTH_SERVICE } from '../tokens';

const SIGN_IN_URL = '/v1/employees/sign-in';

/** The default `SESSION_REFRESH_CONFIG` resolves to this. */
const TOKEN_ENDPOINT = 'http://localhost:8080/realms/team-targe/protocol/openid-connect/token';

/**
 * The interceptor is registered here, not just in `app.config.ts`, because it
 * is where a refused refresh becomes a terminated session — `AuthService`
 * asks for the refresh and reads the classified failure, and neither half
 * means anything without the other. `app.config.spec.ts` is what proves the
 * running app wires the same pair together.
 */
function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([bearerTokenInterceptor])),
      provideHttpClientTesting(),
      {
        provide: AUTH_SERVICE,
        useExisting: AuthService,
      },
    ],
  });
}

const CREDENTIALS: LoginCredentials = { employeeId: '100482', pin: '8321' };

/**
 * The endpoint returns Keycloak's own artifacts under Keycloak's own names —
 * see `SignInResponse` on the API side — so the fixture carries them the same
 * way. Values are structurally plausible, not signed; nothing here verifies one.
 */
const ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDA0ODIifQ.c2lnbmF0dXJl';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDA0ODIifQ.cmVmcmVzaA';

function signInEnvelope(overrides: Partial<Record<string, string>> = {}) {
  return {
    data: {
      employeeId: '100482',
      name: 'Avery Brooks',
      role: 'DepartmentManager',
      department: 'Grocery',
      jobFunction: 'Customer Support',
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      ...overrides,
    },
    meta: {},
  };
}

function storedValues(storage: Storage): readonly string[] {
  return Object.keys(storage).map((key) => storage.getItem(key) ?? '');
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // So that "nothing is in storage" can only mean this service put nothing there.
    localStorage.clear();
    sessionStorage.clear();

    configureTestBed();

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created with no employee signed in', () => {
    expect(service).toBeTruthy();
    expect(service.currentEmployee()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
    expect(service.refreshToken()).toBeNull();
  });

  describe('login', () => {
    it('posts the credentials to the sign-in endpoint', () => {
      service.login(CREDENTIALS).subscribe();

      const request = httpMock.expectOne(SIGN_IN_URL);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ employeeId: '100482', pin: '8321' });

      request.flush(signInEnvelope());
    });

    it('populates currentEmployee with the resolved role, department and job function', () => {
      let resolved: Employee | undefined;

      service.login(CREDENTIALS).subscribe((employee) => (resolved = employee));

      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      const expected: Employee = {
        id: '100482',
        name: 'Avery Brooks',
        role: 'DepartmentManager',
        department: 'Grocery',
        jobFunction: 'Customer Support',
      };

      expect(resolved).toEqual(expected);
      expect(service.currentEmployee()).toEqual(expected);
      expect(service.isAuthenticated()).toBe(true);
    });

    const roles: readonly EmployeeRole[] = [
      'Associate',
      'DepartmentManager',
      'StoreManager',
      'ReceivingAssociate',
    ];

    roles.forEach((role) => {
      it(`resolves the ${role} role from the endpoint response`, () => {
        service.login(CREDENTIALS).subscribe();

        httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope({ role }));

        expect(service.currentEmployee()?.role).toBe(role);
      });
    });

    it('throws the invalid-credentials message when the endpoint rejects the credentials', () => {
      let caught: Error | undefined;
      let nexted = false;

      service.login(CREDENTIALS).subscribe({
        next: () => (nexted = true),
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).flush(
        {
          title: 'Sign-in was rejected.',
          status: 401,
          detail: 'The Employee ID or PIN is not valid.',
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(nexted).toBe(false);
      expect(caught).toBeInstanceOf(Error);
      expect(caught?.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(service.currentEmployee()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('throws a distinct message when the endpoint reports corporate unreachable', () => {
      let caught: Error | undefined;

      service.login(CREDENTIALS).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).flush(
        {
          title: 'Sign-in is unavailable.',
          status: 503,
          detail: 'The identity provider could not be reached. (the connection failed)',
        },
        { status: 503, statusText: 'Service Unavailable' },
      );

      expect(caught?.message).toBe(CORPORATE_UNREACHABLE_MESSAGE);
      expect(caught?.message).not.toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(service.currentEmployee()).toBeNull();
    });

    it('throws its own message when the endpoint cannot resolve a usable identity', () => {
      let caught: Error | undefined;

      service.login(CREDENTIALS).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock
        .expectOne(SIGN_IN_URL)
        .flush(
          { title: 'The employee identity could not be resolved.', status: 502 },
          { status: 502, statusText: 'Bad Gateway' },
        );

      expect(caught?.message).toBe(IDENTITY_INCOMPLETE_MESSAGE);
      expect(caught?.message).not.toBe(CORPORATE_UNREACHABLE_MESSAGE);
      expect(caught?.message).not.toBe(INVALID_CREDENTIALS_MESSAGE);
    });

    it('surfaces a network-level failure as a user-actionable error', () => {
      let caught: Error | undefined;
      let nexted = false;

      service.login(CREDENTIALS).subscribe({
        next: () => (nexted = true),
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).error(new ProgressEvent('error'));

      expect(nexted).toBe(false);
      expect(caught).toBeInstanceOf(Error);
      expect(caught?.message).toBe(OFFLINE_MESSAGE);
      expect(service.currentEmployee()).toBeNull();
    });

    it('surfaces an unexpected server failure as a user-actionable error', () => {
      let caught: Error | undefined;

      service.login(CREDENTIALS).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock
        .expectOne(SIGN_IN_URL)
        .flush(null, { status: 500, statusText: 'Internal Server Error' });

      expect(caught).toBeInstanceOf(Error);
      expect(caught?.message).toBe(SIGN_IN_FAILED_MESSAGE);
    });

    it('carries the per-field messages when the endpoint reports a validation failure', () => {
      let caught: Error | undefined;

      service.login({ employeeId: '', pin: '' }).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).flush(
        {
          title: 'The request could not be processed.',
          status: 422,
          errors: {
            employeeId: ['An Employee ID is required.'],
            pin: ['A PIN is required.'],
          },
        },
        { status: 422, statusText: 'Unprocessable Content' },
      );

      expect(caught).toBeInstanceOf(SignInValidationError);
      expect((caught as SignInValidationError).fieldErrors).toEqual({
        employeeId: ['An Employee ID is required.'],
        pin: ['A PIN is required.'],
      });
      expect(caught?.message).toBeTruthy();
      expect(service.currentEmployee()).toBeNull();
    });

    it('rejects a response carrying a role this app does not know', () => {
      let caught: Error | undefined;

      service.login(CREDENTIALS).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope({ role: 'RegionalDirector' }));

      expect(caught).toBeInstanceOf(Error);
      expect(caught?.message).toBe(SIGN_IN_FAILED_MESSAGE);
      expect(service.currentEmployee()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('rejects a success response with no employee data', () => {
      let caught: Error | undefined;

      service.login(CREDENTIALS).subscribe({
        next: () => undefined,
        error: (error: Error) => (caught = error),
      });

      httpMock.expectOne(SIGN_IN_URL).flush({ meta: {} });

      expect(caught?.message).toBe(SIGN_IN_FAILED_MESSAGE);
      expect(service.currentEmployee()).toBeNull();
    });
  });

  describe('session tokens', () => {
    it('holds the access and refresh tokens the endpoint returned', () => {
      service.login(CREDENTIALS).subscribe();

      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      expect(service.accessToken()).toBe(ACCESS_TOKEN);
      expect(service.refreshToken()).toBe(REFRESH_TOKEN);
    });

    /**
     * A regression guard on the shared terminal, where one employee signs in
     * over another's session all day. `hold()` writes all three signals
     * unconditionally; if a later change ever made a write conditional on the
     * slot being empty, the outgoing employee's credential would go on signing
     * the incoming employee's requests and every other test here would still
     * pass.
     */
    it('replaces the held session when a second employee signs in at the same terminal', () => {
      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      expect(service.accessToken()).toBe(ACCESS_TOKEN);

      service.login({ employeeId: '200913', pin: '4470' }).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(
        signInEnvelope({
          employeeId: '200913',
          name: 'Jordan Reyes',
          role: 'StoreManager',
          access_token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.c2Vjb25k',
          refresh_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.cmVmcmVzaDI',
        }),
      );

      expect(service.currentEmployee()?.id).toBe('200913');
      expect(service.accessToken()).toBe('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.c2Vjb25k');
      expect(service.refreshToken()).toBe(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.cmVmcmVzaDI',
      );
    });

    it('writes neither token to localStorage or sessionStorage', () => {
      service.login(CREDENTIALS).subscribe();

      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      expect(service.accessToken()).toBe(ACCESS_TOKEN);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(storedValues(localStorage)).not.toContain(ACCESS_TOKEN);
      expect(storedValues(localStorage)).not.toContain(REFRESH_TOKEN);
      expect(storedValues(sessionStorage)).not.toContain(ACCESS_TOKEN);
      expect(storedValues(sessionStorage)).not.toContain(REFRESH_TOKEN);
    });

    /**
     * A reload is a new application instance reading whatever survived it.
     * Nothing did — which is the whole point of holding the session in
     * signals — so a service built afresh starts signed out.
     */
    it('starts with no session when the app is rebuilt, as it is on a page refresh', () => {
      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());
      httpMock.verify();

      TestBed.resetTestingModule();
      configureTestBed();

      const reloaded = TestBed.inject(AuthService);
      httpMock = TestBed.inject(HttpTestingController);

      expect(reloaded).not.toBe(service);
      expect(reloaded.accessToken()).toBeNull();
      expect(reloaded.refreshToken()).toBeNull();
      expect(reloaded.currentEmployee()).toBeNull();
      expect(reloaded.isAuthenticated()).toBe(false);
    });

    it('holds no token when the response carries none', () => {
      const untokenized = signInEnvelope();
      delete (untokenized.data as Partial<Record<string, string>>)['access_token'];
      delete (untokenized.data as Partial<Record<string, string>>)['refresh_token'];

      service.login(CREDENTIALS).subscribe();

      httpMock.expectOne(SIGN_IN_URL).flush(untokenized);

      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBeNull();
      expect(service.refreshToken()).toBeNull();
    });

    it('holds no token when the response carries an empty one', () => {
      service.login(CREDENTIALS).subscribe();

      httpMock
        .expectOne(SIGN_IN_URL)
        .flush(signInEnvelope({ access_token: '', refresh_token: '' }));

      expect(service.accessToken()).toBeNull();
      expect(service.refreshToken()).toBeNull();
    });

    it('holds no token when the sign-in itself failed', () => {
      service.login(CREDENTIALS).subscribe({ next: () => undefined, error: () => undefined });

      httpMock
        .expectOne(SIGN_IN_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(service.accessToken()).toBeNull();
      expect(service.refreshToken()).toBeNull();
    });

    it('drops the tokens with the identity when the role is one this app does not know', () => {
      service.login(CREDENTIALS).subscribe({ next: () => undefined, error: () => undefined });

      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope({ role: 'RegionalDirector' }));

      expect(service.currentEmployee()).toBeNull();
      expect(service.accessToken()).toBeNull();
      expect(service.refreshToken()).toBeNull();
    });
  });

  /**
   * The clock is faked so a minute passes in a test without one being spent.
   * `vi.advanceTimersByTime` runs the interval synchronously, so the refresh
   * request is in flight by the time the assertion reads it.
   */
  describe('background session refresh', () => {
    const RENEWED_ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDA0ODIiLCJuIjoyfQ.cmVuZXdlZA';
    const RENEWED_REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDA0ODIiLCJuIjoyfQ.cmVuZXcy';

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function signIn(): void {
      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());
    }

    function elapse(intervals = 1): void {
      vi.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS * intervals);
    }

    function expectRefresh() {
      return httpMock.expectOne(TOKEN_ENDPOINT);
    }

    function invalidGrant(): void {
      expectRefresh().flush(
        { error: 'invalid_grant', error_description: 'Session not active' },
        { status: 400, statusText: 'Bad Request' },
      );
    }

    it('refreshes against Keycloak once the interval has elapsed', () => {
      signIn();

      elapse();

      const request = expectRefresh().request;

      expect(request.method).toBe('POST');

      const body = request.body as HttpParams;

      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe(REFRESH_TOKEN);
      expect(body.get('client_id')).toBe('team-targe-store');

      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    it('makes no refresh call before the interval has elapsed', () => {
      signIn();

      vi.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS - 1);

      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    it('makes no refresh call while nobody is signed in', () => {
      elapse(5);

      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    it('keeps refreshing on each interval that follows', () => {
      signIn();

      elapse();
      expectRefresh().flush({
        access_token: RENEWED_ACCESS_TOKEN,
        refresh_token: RENEWED_REFRESH_TOKEN,
      });

      elapse();
      expectRefresh().flush({
        access_token: RENEWED_ACCESS_TOKEN,
        refresh_token: RENEWED_REFRESH_TOKEN,
      });
    });

    it('holds the renewed tokens a successful refresh returns', () => {
      signIn();

      elapse();
      expectRefresh().flush({
        access_token: RENEWED_ACCESS_TOKEN,
        refresh_token: RENEWED_REFRESH_TOKEN,
      });

      expect(service.accessToken()).toBe(RENEWED_ACCESS_TOKEN);
      expect(service.refreshToken()).toBe(RENEWED_REFRESH_TOKEN);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.sessionEnded()).toBe(false);
    });

    it('presents the renewed refresh token on the next refresh', () => {
      signIn();

      elapse();
      expectRefresh().flush({
        access_token: RENEWED_ACCESS_TOKEN,
        refresh_token: RENEWED_REFRESH_TOKEN,
      });

      elapse();

      expect((expectRefresh().request.body as HttpParams).get('refresh_token')).toBe(
        RENEWED_REFRESH_TOKEN,
      );
    });

    /**
     * A response that left a token out is not evidence the session ended, so
     * the credential this app already holds is kept rather than dropped —
     * dropping it would break the session the refresh just proved alive.
     */
    it('keeps the tokens it holds when a refresh response carries none', () => {
      signIn();

      elapse();
      expectRefresh().flush({});

      expect(service.accessToken()).toBe(ACCESS_TOKEN);
      expect(service.refreshToken()).toBe(REFRESH_TOKEN);
    });

    it('classifies an invalid_grant refusal as the session having ended elsewhere', () => {
      signIn();

      elapse();
      invalidGrant();

      expect(service.sessionEnded()).toBe(true);
    });

    /**
     * Detection only. Tearing the screen down and returning to Login is
     * LET-134's work, and it cannot happen if this story has already thrown
     * away the employee the teardown reads.
     */
    it('leaves the held session in place when it detects the end, rather than tearing it down', () => {
      signIn();

      elapse();
      invalidGrant();

      expect(service.currentEmployee()?.id).toBe('100482');
      expect(service.isAuthenticated()).toBe(true);
    });

    it('stops refreshing once the session is known to have ended', () => {
      signIn();

      elapse();
      invalidGrant();

      expect(vi.getTimerCount()).toBe(0);

      elapse(3);

      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    describe('a refresh that fails for any other reason', () => {
      const failures: readonly { label: string; fail: (request: TestRequest) => void }[] = [
        {
          label: 'the identity provider is unreachable',
          fail: (request) => request.error(new ProgressEvent('error')),
        },
        {
          label: 'the request timed out',
          fail: (request) => request.flush(null, { status: 504, statusText: 'Gateway Timeout' }),
        },
        {
          label: 'the identity provider answered 503',
          fail: (request) =>
            request.flush(null, { status: 503, statusText: 'Service Unavailable' }),
        },
        {
          label: 'the refresh request itself was rejected as malformed',
          fail: (request) =>
            request.flush({ error: 'invalid_request' }, { status: 400, statusText: 'Bad Request' }),
        },
      ];

      failures.forEach(({ label, fail }) => {
        it(`keeps the session signed in when ${label}`, () => {
          signIn();

          elapse();
          fail(expectRefresh());

          expect(service.isAuthenticated()).toBe(true);
          expect(service.sessionEnded()).toBe(false);
          expect(service.accessToken()).toBe(ACCESS_TOKEN);
          expect(service.refreshToken()).toBe(REFRESH_TOKEN);
        });

        it(`retries on the next interval when ${label}`, () => {
          signIn();

          elapse();
          fail(expectRefresh());

          elapse();

          expect(expectRefresh().request.method).toBe('POST');
        });
      });

      /**
       * The fail-open rule has no threshold behind it. A register on a noisy
       * local network fails this way all day and must still be signed in at
       * the end of it.
       */
      it('does not accumulate repeated failures into a sign-out', () => {
        signIn();

        for (let attempt = 0; attempt < 5; attempt += 1) {
          elapse();
          expectRefresh().error(new ProgressEvent('error'));
        }

        expect(service.isAuthenticated()).toBe(true);
        expect(service.sessionEnded()).toBe(false);

        elapse();

        expect(expectRefresh().request.method).toBe('POST');
      });

      /**
       * The recovery case the fail-open rule exists for: the network comes
       * back and the session carries on, having never been interrupted.
       */
      it('renews the session when a later refresh succeeds', () => {
        signIn();

        elapse();
        expectRefresh().error(new ProgressEvent('error'));

        elapse();
        expectRefresh().flush({
          access_token: RENEWED_ACCESS_TOKEN,
          refresh_token: RENEWED_REFRESH_TOKEN,
        });

        expect(service.accessToken()).toBe(RENEWED_ACCESS_TOKEN);
        expect(service.sessionEnded()).toBe(false);
      });
    });

    it('makes no refresh call when the sign-in returned no refresh token', () => {
      const untokenized = signInEnvelope();
      delete (untokenized.data as Partial<Record<string, string>>)['refresh_token'];

      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(untokenized);

      elapse(3);

      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    it('refreshes for the employee who signed in most recently at the terminal', () => {
      signIn();

      service.login({ employeeId: '200913', pin: '4470' }).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(
        signInEnvelope({
          employeeId: '200913',
          name: 'Jordan Reyes',
          role: 'StoreManager',
          access_token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.c2Vjb25k',
          refresh_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.cmVmcmVzaDI',
        }),
      );

      elapse();

      const body = expectRefresh().request.body as HttpParams;

      expect(body.get('refresh_token')).toBe(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDA5MTMifQ.cmVmcmVzaDI',
      );
      httpMock.expectNone(TOKEN_ENDPOINT);
    });

    it('clears a previously detected session end when the next employee signs in', () => {
      signIn();

      elapse();
      invalidGrant();

      expect(service.sessionEnded()).toBe(true);

      signIn();

      expect(service.sessionEnded()).toBe(false);
    });

    it('refreshes again for the employee who signs in after a detected session end', () => {
      signIn();

      elapse();
      invalidGrant();

      signIn();

      elapse();

      expect(expectRefresh().request.method).toBe('POST');
    });

    /**
     * Both of these assert the timer count as well as the absence of a
     * request, because on its own "no request was made" does not prove the
     * timer stopped. `logout()` clears the refresh token, and `refreshSession`
     * returns `EMPTY` without a token — so a timer left running would tick
     * silently and `expectNone` would still pass. `vi.getTimerCount()` reads
     * the interval itself: the only thing that takes it to zero is the
     * subscription being torn down.
     */
    describe('after a deliberate logout', () => {
      it('stops refreshing', () => {
        signIn();

        elapse();
        expectRefresh().flush({
          access_token: RENEWED_ACCESS_TOKEN,
          refresh_token: RENEWED_REFRESH_TOKEN,
        });

        expect(vi.getTimerCount()).toBeGreaterThan(0);

        service.logout();

        expect(vi.getTimerCount()).toBe(0);

        elapse(3);

        httpMock.expectNone(TOKEN_ENDPOINT);
      });

      it('stops refreshing even if no refresh has happened yet', () => {
        signIn();

        expect(vi.getTimerCount()).toBeGreaterThan(0);

        service.logout();

        expect(vi.getTimerCount()).toBe(0);

        elapse(3);

        httpMock.expectNone(TOKEN_ENDPOINT);
      });

      /**
       * The distinction the Login screen will read: leaving deliberately is
       * not being displaced, and only one of the two has anything to explain.
       */
      it('reports no session ended elsewhere', () => {
        signIn();

        service.logout();

        expect(service.sessionEnded()).toBe(false);
      });

      /**
       * The other half of that distinction, and a contract LET-134 depends on:
       * the teardown that fires on a detected session end calls `logout()` to
       * clear the session, so a `logout()` that also cleared this signal would
       * erase the reason the device is on its way to Login before the Login
       * screen could read it (LET-135). Only the next sign-in clears it.
       */
      it('keeps a detected session end set when the teardown logs the device out', () => {
        signIn();

        elapse();
        invalidGrant();

        service.logout();

        expect(service.sessionEnded()).toBe(true);
        expect(service.isAuthenticated()).toBe(false);
      });
    });
  });

  describe('logout', () => {
    it('clears currentEmployee and isAuthenticated', () => {
      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      expect(service.isAuthenticated()).toBe(true);

      service.logout();

      expect(service.currentEmployee()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('clears both tokens', () => {
      service.login(CREDENTIALS).subscribe();
      httpMock.expectOne(SIGN_IN_URL).flush(signInEnvelope());

      expect(service.accessToken()).toBe(ACCESS_TOKEN);

      service.logout();

      expect(service.accessToken()).toBeNull();
      expect(service.refreshToken()).toBeNull();
    });
  });
});
