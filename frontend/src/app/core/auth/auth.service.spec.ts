import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  AuthService,
  CORPORATE_UNREACHABLE_MESSAGE,
  IDENTITY_INCOMPLETE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  LoginCredentials,
  OFFLINE_MESSAGE,
  SIGN_IN_FAILED_MESSAGE,
} from './auth.service';
import { SignInValidationError } from './sign-in-validation.error';
import { Employee, EmployeeRole } from '../models/auth/employee.model';

const SIGN_IN_URL = '/v1/employees/sign-in';

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

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

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
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });

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
