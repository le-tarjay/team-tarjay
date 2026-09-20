import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';

import { IAuthService } from './auth.service';
import { AUTHORIZATION_HEADER, bearerTokenInterceptor } from './bearer-token.interceptor';
import { Employee } from '../models/auth/employee.model';
import { AUTH_SERVICE } from '../tokens';

const API_URL = '/v1/sales';

const ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDA0ODIifQ.c2lnbmF0dXJl';

/**
 * The interceptor reads one thing — the held credential — and `MockAuthService`
 * only ever produces its own. Driving the signal directly is how the other
 * specs in `core/` handle the same need (see `auth.guard.spec.ts`), and it
 * keeps the mock from growing behavior `IAuthService` doesn't declare.
 */
class StubAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);
  private readonly token = signal<string | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken: Signal<string | null> = this.token.asReadonly();

  login(): Observable<Employee> {
    return throwError(() => new Error('Not exercised by the interceptor.'));
  }

  logout(): void {
    this.token.set(null);
  }

  hold(token: string | null): void {
    this.token.set(token);
  }
}

describe('bearerTokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: StubAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([bearerTokenInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
  });

  afterEach(() => {
    httpMock.verify();
  });

  function send(url = API_URL) {
    http.get(url).subscribe({ next: () => undefined, error: () => undefined });

    return httpMock.expectOne(url).request;
  }

  it('attaches the held access token as the bearer credential', () => {
    authService.hold(ACCESS_TOKEN);

    expect(send().headers.get(AUTHORIZATION_HEADER)).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('attaches it to a request of any method, not only reads', () => {
    authService.hold(ACCESS_TOKEN);

    http.post(API_URL, { total: 12.5 }).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const request = httpMock.expectOne(API_URL).request;

    expect(request.method).toBe('POST');
    expect(request.headers.get(AUTHORIZATION_HEADER)).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('attaches no header when no employee is signed in', () => {
    expect(send().headers.has(AUTHORIZATION_HEADER)).toBe(false);
  });

  it('attaches no header once the employee has signed out', () => {
    authService.hold(ACCESS_TOKEN);
    authService.logout();

    expect(send().headers.has(AUTHORIZATION_HEADER)).toBe(false);
  });

  it('follows the held credential from one request to the next', () => {
    expect(send().headers.has(AUTHORIZATION_HEADER)).toBe(false);

    authService.hold(ACCESS_TOKEN);

    expect(send().headers.get(AUTHORIZATION_HEADER)).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  describe('a credential that could not be sent as a header', () => {
    const unusable: readonly { label: string; token: string }[] = [
      { label: 'an empty string', token: '' },
      { label: 'whitespace only', token: '   ' },
      { label: 'a value carrying a newline', token: 'abc\ndef' },
      { label: 'a value carrying a carriage return', token: 'abc\r\ndef' },
      { label: 'a value carrying a control character', token: 'abc' + String.fromCharCode(7) + 'def' },
      { label: 'a value carrying an inner space', token: 'abc def' },
    ];

    unusable.forEach(({ label, token }) => {
      it(`sends no header for ${label}`, () => {
        authService.hold(token);

        expect(send().headers.has(AUTHORIZATION_HEADER)).toBe(false);
      });
    });

    it('sends the trimmed value when the credential is merely padded', () => {
      authService.hold(`  ${ACCESS_TOKEN}  `);

      expect(send().headers.get(AUTHORIZATION_HEADER)).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
  });

  describe('requests that are not this origin', () => {
    const foreign: readonly string[] = [
      'https://keycloak.example.com/realms/team-targe/protocol/openid-connect/token',
      'http://corporate.example.com/v1/sales',
      '//cdn.example.com/v1/sales',
    ];

    foreign.forEach((url) => {
      it(`sends no credential to ${url}`, () => {
        authService.hold(ACCESS_TOKEN);

        expect(send(url).headers.has(AUTHORIZATION_HEADER)).toBe(false);
      });
    });
  });

  it('leaves an Authorization header the caller set itself alone', () => {
    authService.hold(ACCESS_TOKEN);

    http.get(API_URL, { headers: { [AUTHORIZATION_HEADER]: 'Basic c2VydmljZTpzZWNyZXQ=' } }).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    expect(httpMock.expectOne(API_URL).request.headers.get(AUTHORIZATION_HEADER)).toBe(
      'Basic c2VydmljZTpzZWNyZXQ=',
    );
  });
});
