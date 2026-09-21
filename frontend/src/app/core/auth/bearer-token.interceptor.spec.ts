import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';

import { IAuthService, SESSION_ENDED_ELSEWHERE_MESSAGE } from './auth.service';
import { AUTHORIZATION_HEADER, bearerTokenInterceptor } from './bearer-token.interceptor';
import { SessionEndedError } from './session-ended.error';
import { SESSION_REFRESH_REQUEST } from './session-refresh';
import { Employee } from '../models/auth/employee.model';
import { AUTH_SERVICE } from '../tokens';

const API_URL = '/v1/sales';

const TOKEN_ENDPOINT = 'http://localhost:8080/realms/team-targe/protocol/openid-connect/token';

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

  /** The interceptor classifies a failure; it never reads this or writes it. */
  readonly sessionEndedElsewhere = signal(false).asReadonly();

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

  /**
   * The other half of what this interceptor does: telling a session that was
   * ended elsewhere apart from a store network that simply did not answer.
   * Only the first of those may ever end a session, so each case here asserts
   * which of the two it is, not merely that the call failed.
   */
  describe('classifying a failed session refresh', () => {
    function refresh() {
      let caught: unknown;

      http
        .post(
          TOKEN_ENDPOINT,
          { grant_type: 'refresh_token' },
          { context: new HttpContext().set(SESSION_REFRESH_REQUEST, true) },
        )
        .subscribe({
          next: () => undefined,
          error: (error: unknown) => (caught = error),
        });

      return {
        get caught() {
          return caught;
        },
        request: httpMock.expectOne(TOKEN_ENDPOINT),
      };
    }

    it('reports an invalid_grant refusal as the session having ended', () => {
      const attempt = refresh();

      attempt.request.flush(
        { error: 'invalid_grant', error_description: 'Session not active' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(attempt.caught).toBeInstanceOf(SessionEndedError);
      expect((attempt.caught as SessionEndedError).message).toBe(SESSION_ENDED_ELSEWHERE_MESSAGE);
    });

    it('reports an invalid_grant refusal answered as 401 the same way', () => {
      const attempt = refresh();

      attempt.request.flush(
        { error: 'invalid_grant' },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(attempt.caught).toBeInstanceOf(SessionEndedError);
    });

    const transient: readonly { label: string; status: number; statusText: string }[] = [
      { label: 'a gateway failure', status: 502, statusText: 'Bad Gateway' },
      { label: 'an unavailable identity provider', status: 503, statusText: 'Service Unavailable' },
      { label: 'a gateway timeout', status: 504, statusText: 'Gateway Timeout' },
    ];

    transient.forEach(({ label, status, statusText }) => {
      it(`leaves ${label} as the transport failure it is`, () => {
        const attempt = refresh();

        attempt.request.flush(null, { status, statusText });

        expect(attempt.caught).toBeInstanceOf(HttpErrorResponse);
        expect(attempt.caught).not.toBeInstanceOf(SessionEndedError);
      });
    });

    it('leaves an unreachable identity provider as the transport failure it is', () => {
      const attempt = refresh();

      attempt.request.error(new ProgressEvent('error'));

      expect(attempt.caught).toBeInstanceOf(HttpErrorResponse);
      expect(attempt.caught).not.toBeInstanceOf(SessionEndedError);
    });

    /**
     * A malformed refresh request is also a `400`. Reading the status alone
     * would end a live session over a bug in this app's own request.
     */
    it('leaves a rejection that is not invalid_grant as a transport failure', () => {
      const attempt = refresh();

      attempt.request.flush(
        { error: 'invalid_request', error_description: 'Missing form parameter: refresh_token' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(attempt.caught).toBeInstanceOf(HttpErrorResponse);
      expect(attempt.caught).not.toBeInstanceOf(SessionEndedError);
    });

    /**
     * The marker is what scopes this to a refresh. Without it, any endpoint
     * that happened to answer with an OAuth-shaped body could sign the
     * terminal out.
     */
    it('classifies nothing on a request that is not a session refresh', () => {
      let caught: unknown;

      http.get(API_URL).subscribe({
        next: () => undefined,
        error: (error: unknown) => (caught = error),
      });

      httpMock
        .expectOne(API_URL)
        .flush({ error: 'invalid_grant' }, { status: 400, statusText: 'Bad Request' });

      expect(caught).toBeInstanceOf(HttpErrorResponse);
      expect(caught).not.toBeInstanceOf(SessionEndedError);
    });

    it('sends no bearer credential to the token endpoint', () => {
      authService.hold(ACCESS_TOKEN);

      const attempt = refresh();

      expect(attempt.request.request.headers.has(AUTHORIZATION_HEADER)).toBe(false);

      attempt.request.flush({ access_token: ACCESS_TOKEN });
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
