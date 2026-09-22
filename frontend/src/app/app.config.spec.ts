import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { appConfig } from './app.config';
import { AuthService, SESSION_REFRESH_INTERVAL_MS } from './core/auth/auth.service';
import { AUTHORIZATION_HEADER } from './core/auth/bearer-token.interceptor';
import { LOGIN_ROUTE } from './core/navigation/route-access';
import { SaleService } from './core/sale/sale.service';
import { AUTH_SERVICE } from './core/tokens';
import { MockAuthService } from './mocks/mock-auth.service';

const SIGN_IN_URL = '/v1/employees/sign-in';

/** The default `SESSION_REFRESH_CONFIG` resolves to this. */
const TOKEN_ENDPOINT = 'http://localhost:8080/realms/team-targe/protocol/openid-connect/token';

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

  /**
   * The negative half of the test above, and at the same level: through the
   * app's real provider list rather than a hand-registered interceptor. The
   * interceptor's own spec proves it attaches nothing without a token; this
   * proves the running app attaches nothing once the employee signs out, which
   * is what would break if some later feature cached the credential anywhere
   * between `AuthService` and the wire.
   */
  it('sends no credential through the running app once the employee signs out', () => {
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

    authService.logout();

    TestBed.inject(HttpClient).get('/v1/sales').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const request = httpMock.expectOne('/v1/sales').request;

    expect(request.headers.has(AUTHORIZATION_HEADER)).toBe(false);

    httpMock.verify();
  });

  /**
   * `SessionTeardownService` is a watcher nothing injects, so its own spec has
   * to instantiate it by hand. That proves what it does and not that the
   * running app ever brings it to life — which is the failure mode worth a test
   * of its own: an effect nobody constructs watches nothing, silently, and the
   * device would sit on an ended session forever. This drives the real chain
   * end to end through the app's own provider list — sign-in, refresh timer,
   * `invalid_grant`, teardown — and injects nothing but the service under
   * sign-in.
   */
  describe('a session ended elsewhere, through the running app\'s own wiring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('tears the screen down and returns the device to Login on its own', () => {
      const authService = TestBed.inject(AuthService);
      const saleService = TestBed.inject(SaleService);
      const httpMock = TestBed.inject(HttpTestingController);
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigateByUrl')
        .mockResolvedValue(true);

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

      saleService.addProduct({
        id: 'p-1',
        sku: 'SKU-p-1',
        name: 'Store brand oat milk',
        price: 4.29,
      });

      TestBed.tick();
      expect(navigate).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
      httpMock
        .expectOne(TOKEN_ENDPOINT)
        .flush(
          { error: 'invalid_grant', error_description: 'Session not active' },
          { status: 400, statusText: 'Bad Request' },
        );

      TestBed.tick();

      expect(navigate).toHaveBeenCalledWith(LOGIN_ROUTE);
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.accessToken()).toBeNull();
      expect(saleService.hasActiveSale()).toBe(false);

      httpMock.verify();
    });
  });
});
