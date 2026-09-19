import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { AuthService } from './core/auth/auth.service';
import { AUTHORIZATION_HEADER } from './core/auth/bearer-token.interceptor';
import { AUTH_SERVICE } from './core/tokens';
import { MockAuthService } from './mocks/mock-auth.service';

const SIGN_IN_URL = '/v1/employees/sign-in';

const ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDA0ODIifQ.c2lnbmF0dXJl';

describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
  });

  it('resolves AUTH_SERVICE to the real AuthService', () => {
    const authService = TestBed.inject(AUTH_SERVICE);

    expect(authService).toBeInstanceOf(AuthService);
  });

  it('does not wire MockAuthService into the running app', () => {
    const authService = TestBed.inject(AUTH_SERVICE);

    expect(authService).not.toBeInstanceOf(MockAuthService);
  });

  it('resolves AUTH_SERVICE to the same instance as the root AuthService', () => {
    expect(TestBed.inject(AUTH_SERVICE)).toBe(TestBed.inject(AuthService));
  });

  /**
   * The interceptor's own spec registers it by hand, which proves what it does
   * but not that the running app asks for it. This is the wiring itself.
   */
  it('signs the running app\'s own requests with the token sign-in returned', () => {
    const authService = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);

    authService.login({ employeeId: '100482', pin: '8321' }).subscribe();
    httpMock.expectOne(SIGN_IN_URL).flush({
      data: {
        employeeId: '100482',
        name: 'Avery Brooks',
        role: 'DepartmentManager',
        department: 'Grocery',
        jobFunction: 'Customer Support',
        access_token: ACCESS_TOKEN,
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDA0ODIifQ.cmVmcmVzaA',
      },
      meta: {},
    });

    TestBed.inject(HttpClient).get('/v1/sales').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const request = httpMock.expectOne('/v1/sales').request;

    expect(request.headers.get(AUTHORIZATION_HEADER)).toBe(`Bearer ${ACCESS_TOKEN}`);

    httpMock.verify();
  });
});
