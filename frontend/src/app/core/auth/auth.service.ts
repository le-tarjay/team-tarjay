import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, OnDestroy, signal, Signal } from '@angular/core';
import {
  catchError,
  EMPTY,
  exhaustMap,
  map,
  Observable,
  Subscription,
  tap,
  throwError,
  timer,
} from 'rxjs';

import { Employee, EMPLOYEE_ROLES, EmployeeRole } from '../models/auth/employee.model';
import { SessionEndedError } from './session-ended.error';
import { SESSION_REFRESH_CONFIG, SESSION_REFRESH_REQUEST } from './session-refresh';
import { SignInValidationError } from './sign-in-validation.error';

export interface LoginCredentials {
  employeeId: string;
  pin: string;
}

export interface IAuthService {
  currentEmployee: Signal<Employee | null>;
  isAuthenticated: Signal<boolean>;

  /**
   * The credential outgoing requests are signed with, or `null` when nobody is
   * signed in. On the interface because the HTTP interceptor reads it through
   * `AUTH_SERVICE` like every other consumer. The refresh token deliberately is
   * not: nothing outside `AuthService` renews a session, so widening the
   * contract for it would oblige every implementer to carry a value no consumer
   * of the token ever reads.
   */
  accessToken: Signal<string | null>;

  /**
   * True once a background refresh has proved this device's session was ended
   * by a sign-in somewhere else — and false for every other way a session can
   * end, a deliberate logout above all. It is on the interface because the
   * screens that react to it reach `AuthService` through `AUTH_SERVICE` like
   * every other consumer.
   *
   * It stays true until the next successful sign-in, deliberately: the device
   * has to return to Login and say why, and both of those happen after the
   * session itself is already gone.
   */
  sessionEnded: Signal<boolean>;

  login(credentials: LoginCredentials): Observable<Employee>;
  logout(): void;
}

/**
 * Relative on purpose: no API base URL reaches this surface at runtime yet,
 * and baking a build-time host into the bundle is exactly what
 * `CONVENTIONS.md`'s "Infrastructure impact" says to raise rather than
 * assume. A same-origin path needs no config value at all.
 */
const SIGN_IN_ENDPOINT = '/v1/employees/sign-in';

/**
 * Sign-in failures are shown to the employee standing at the terminal
 * verbatim — login renders a thrown `Error`'s message directly, per
 * `CONVENTIONS.md`'s "user-initiated actions" rule. So each failure the
 * endpoint can report gets its own text, and the two the epic turns on — a
 * rejected credential and an unreachable corporate — can never be mistaken
 * for one another on screen.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid employee ID or PIN.';

export const CORPORATE_UNREACHABLE_MESSAGE =
  'Sign-in is unavailable because corporate could not be reached. Wait a moment and try again.';

export const IDENTITY_INCOMPLETE_MESSAGE =
  'Your employee record is missing a role or department, so sign-in could not be completed. ' +
  'Ask your manager to have it corrected.';

export const OFFLINE_MESSAGE =
  'Sign-in could not be completed because this terminal is offline. ' +
  'Check its connection and try again.';

export const SIGN_IN_FAILED_MESSAGE =
  'Sign-in could not be completed. Try again, and tell your manager if it keeps happening.';

export const INVALID_REQUEST_MESSAGE = 'Enter your employee ID and PIN.';

/**
 * The one failure that is not the employee's doing and not a fault either:
 * their ID was used to sign in somewhere else, which ended this session.
 *
 * The wording is the reviewer's, set on review of PR #42. It replaces the
 * longer line the designer confirmed for the epic (API map, design row 3), and
 * that disagreement is still open — see PR #42's thread and LET-135's report.
 * **This is now what the Login screen shows**, so changing the copy is a change
 * to what the employee reads, and it is a change here rather than there: this
 * constant is the only place the wording lives, which is why the Login screen
 * renders it instead of a literal of its own.
 *
 * It is defined here, with the sign-in messages, because that is the pattern
 * the Login screen reads message text from. It is also the message a
 * `SessionEndedError` carries.
 */
export const SESSION_ENDED_ELSEWHERE_MESSAGE =
  'Your session was closed because you signed in from another device.';

/**
 * Roughly a minute, per the epic: short enough that an idle terminal is not
 * left showing an ended session for long, and well inside the realm's
 * 300-second access-token lifespan, so a refresh that succeeds always renews a
 * credential that was still valid.
 *
 * This is the whole discovery mechanism. There is no poll endpoint — a session
 * ended elsewhere is discovered by the refresh that Keycloak then refuses.
 */
export const SESSION_REFRESH_INTERVAL_MS = 60_000;

/** The `data` member of the sign-in endpoint's `{ data, meta }` envelope. */
interface SignInResponse {
  employeeId: string;
  name: string;
  role: string;
  department: string;
  jobFunction: string;

  /**
   * Snake_case because that is the wire contract: the endpoint passes
   * Keycloak's own artifacts through untouched and names them as Keycloak
   * does, so a token read here and one read from a refresh against Keycloak
   * directly are the same field under the same name.
   */
  access_token?: string;
  refresh_token?: string;
}

interface SignInEnvelope {
  data: SignInResponse;
}

/**
 * Keycloak's own token response, read straight off its token endpoint. Same
 * snake_case wire names as `SignInResponse`'s two token fields, because it is
 * the same pair of artifacts from the same issuer — the API just passed them
 * through at sign-in and this asks for them directly.
 */
interface RefreshedTokens {
  access_token?: string;
  refresh_token?: string;
}

/** What one successful sign-in resolved to: who, plus what the session runs on. */
interface ResolvedSession {
  employee: Employee;
  accessToken: string | null;
  refreshToken: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements IAuthService, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refreshConfig = inject(SESSION_REFRESH_CONFIG);

  private readonly employee = signal<Employee | null>(null);

  /**
   * Memory only, on purpose — never `localStorage` or `sessionStorage`. These
   * are shared terminals, and a credential written to disk outlives both the
   * tab and the employee standing at it. The accepted cost is that a page
   * refresh loses the session and returns the employee to Login; that matches
   * how `employee` above has always behaved.
   */
  private readonly access = signal<string | null>(null);
  private readonly refresh = signal<string | null>(null);

  private readonly endedElsewhere = signal(false);

  /**
   * The live refresh timer, or `null` when nothing is being refreshed. Held as
   * a subscription rather than as signal state because it is not state the UI
   * reads — it is a resource this service owns and has to be able to cancel.
   */
  private refreshing: Subscription | null = null;

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken = this.access.asReadonly();
  readonly refreshToken = this.refresh.asReadonly();
  readonly sessionEnded = this.endedElsewhere.asReadonly();

  login(credentials: LoginCredentials): Observable<Employee> {
    return this.http.post<SignInEnvelope>(SIGN_IN_ENDPOINT, credentials).pipe(
      map((envelope: SignInEnvelope | null) => toResolvedSession(envelope)),
      tap((session) => this.hold(session)),
      map((session) => session.employee),
      catchError((error: unknown) => throwError(() => toUserFacingError(error))),
    );
  }

  /**
   * A deliberate sign-out. It stops the refresh timer — there is no session
   * left to renew, and a timer left running would keep asking Keycloak about a
   * token this app has already thrown away.
   *
   * It pointedly does **not** touch `endedElsewhere`. Leaving deliberately and
   * being displaced by another device are the two ways a session ends, and
   * telling them apart is the whole point of that signal: a logout that
   * cleared it would erase the reason the device is on its way back to Login.
   * The next successful sign-in is what clears it.
   */
  logout(): void {
    this.stopRefreshing();
    this.employee.set(null);
    this.access.set(null);
    this.refresh.set(null);
  }

  /** The root injector going away takes the timer with it. */
  ngOnDestroy(): void {
    this.stopRefreshing();
  }

  /**
   * Commits one resolved sign-in to the session: who is standing at the
   * terminal, and the two Keycloak artifacts that session runs on.
   *
   * Three things about it are deliberate.
   *
   * **It is the only writer of all three signals.** Employee, access token and
   * refresh token are one fact — a session — split across three signals only
   * because they are read separately. Writing them from one place is what
   * stops a future caller setting an employee without the credential that
   * request-signing needs, or the reverse. The two other writers are narrower
   * by design and say so: `logout()` clears all three at once, and `renew()`
   * replaces the two tokens and never touches the employee, because a refresh
   * renews a session rather than establishing one.
   *
   * **It runs after validation, never around it.** `toResolvedSession` throws
   * for an identity this app cannot use, and it throws upstream of this in the
   * `map`/`tap` pair, so a rejected sign-in never reaches here at all. That is
   * why there is no "roll back what I just set" path: nothing is set until the
   * response has already proven usable. A sign-in either lands whole or leaves
   * the previous state untouched.
   *
   * **Every write is `set`, unconditionally.** Signing in over an existing
   * session replaces all three values rather than merging with them, so one
   * employee's credential can never survive into the next employee's session
   * on a shared terminal. `auth.service.spec.ts` "replaces the held session
   * when a second employee signs in at the same terminal" is the guard on
   * that.
   *
   * The signals are `set` rather than mutated because this app is zoneless:
   * a field assignment would update the value and re-render nothing.
   */
  private hold(session: ResolvedSession): void {
    this.employee.set(session.employee);
    this.access.set(session.accessToken);
    this.refresh.set(session.refreshToken);
    this.endedElsewhere.set(false);

    this.startRefreshing();
  }

  /**
   * Starts the clock that discovers an ended session. A sign-in that returned
   * no refresh token starts nothing: there is nothing to present to Keycloak,
   * so a timer would only produce failures this app is required to ignore.
   *
   * `exhaustMap`, not `switchMap`: a refresh still in flight when the next
   * minute comes around wins, and the tick is skipped. Cancelling the in-flight
   * one instead would mean a terminal on a slow connection could refresh
   * forever without ever completing a request — and never discover anything.
   *
   * Any previous timer is stopped first, so signing in over an existing
   * session leaves exactly one running.
   */
  private startRefreshing(): void {
    this.stopRefreshing();

    if (this.refresh() === null) {
      return;
    }

    this.refreshing = timer(SESSION_REFRESH_INTERVAL_MS, SESSION_REFRESH_INTERVAL_MS)
      .pipe(exhaustMap(() => this.refreshSession()))
      .subscribe();
  }

  private stopRefreshing(): void {
    this.refreshing?.unsubscribe();
    this.refreshing = null;
  }

  /**
   * One refresh against Keycloak's own token endpoint — the epic's discovery
   * mechanism, and the reason there is no poll endpoint to build.
   *
   * It is marked `SESSION_REFRESH_REQUEST` so the HTTP interceptor knows this
   * is the request whose `invalid_grant` refusal means a terminated session;
   * see `bearer-token.interceptor.ts`. The same interceptor leaves it
   * unsigned, because the endpoint is absolute: a refresh authenticates with
   * the refresh token in its body, and this app's access token has no business
   * being sent to it.
   *
   * It never errors to its subscriber. A refresh outcome is either a renewed
   * session, an ended one, or nothing at all — and the timer above has to
   * survive all three.
   */
  private refreshSession(): Observable<unknown> {
    const refreshToken = this.refresh();

    if (refreshToken === null) {
      return EMPTY;
    }

    const body = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('client_id', this.refreshConfig.clientId)
      .set('refresh_token', refreshToken);

    return this.http
      .post<RefreshedTokens>(this.refreshConfig.tokenEndpoint, body, {
        context: new HttpContext().set(SESSION_REFRESH_REQUEST, true),
      })
      .pipe(
        tap((tokens: RefreshedTokens | null) => this.renew(tokens)),
        catchError((error: unknown) => this.handleRefreshFailure(error)),
      );
  }

  /**
   * Takes the renewed credential, and keeps the previous one for anything the
   * response left out. Keycloak returns both tokens on a refresh, but a
   * response missing one is not evidence that the session ended, and dropping
   * a credential this app still holds would break the very session this call
   * just proved is alive.
   */
  private renew(tokens: RefreshedTokens | null): void {
    const access = toHeldToken(tokens?.access_token);
    const refresh = toHeldToken(tokens?.refresh_token);

    if (access !== null) {
      this.access.set(access);
    }

    if (refresh !== null) {
      this.refresh.set(refresh);
    }
  }

  /**
   * Fail open, with exactly one exception.
   *
   * A `SessionEndedError` is Keycloak saying the session behind this refresh
   * token is gone — the employee signed in somewhere else. That is recorded
   * and the timer stops, because there is nothing left to refresh and every
   * subsequent attempt would fail the same way.
   *
   * Everything else — an unreachable store network, a timeout, a 5xx, a
   * Keycloak restart — is discarded. The session stays exactly as it was and
   * the next tick tries again. Nothing accumulates: there is no failure count
   * here to reach a threshold, because a register that signs itself out on
   * local-network noise is a worse failure than one that finds out a minute
   * late.
   */
  private handleRefreshFailure(error: unknown): Observable<never> {
    if (error instanceof SessionEndedError) {
      this.endedElsewhere.set(true);
      this.stopRefreshing();
    }

    return EMPTY;
  }
}

/**
 * Role and department are resolved once here and held for the session; a
 * corporate-side change takes effect at the employee's next sign-in.
 */
function toResolvedSession(envelope: SignInEnvelope | null): ResolvedSession {
  const data = envelope?.data;

  if (!data || !isEmployeeRole(data.role)) {
    throw new Error(SIGN_IN_FAILED_MESSAGE);
  }

  return {
    employee: {
      id: data.employeeId,
      name: data.name,
      role: data.role,
      department: data.department,
      jobFunction: data.jobFunction,
    },
    accessToken: toHeldToken(data.access_token),
    refreshToken: toHeldToken(data.refresh_token),
  };
}

/**
 * Held verbatim when there is anything to hold, and `null` otherwise, so that
 * "signed in without a usable credential" reads the same here as "not signed
 * in" does. Whether a held value is fit to put in a header is the
 * interceptor's call, not this one's — see `bearer-token.interceptor.ts`.
 */
function toHeldToken(value: string | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isEmployeeRole(value: string): value is EmployeeRole {
  return (EMPLOYEE_ROLES as readonly string[]).includes(value);
}

/**
 * The endpoint distinguishes its failures by status code, not by a field in
 * the body — the `detail` text carries a variable reason and is not a stable
 * contract to match on.
 */
function toUserFacingError(error: unknown): Error {
  if (!(error instanceof HttpErrorResponse)) {
    // A malformed success body, already carrying a user-facing message.
    return error instanceof Error ? error : new Error(SIGN_IN_FAILED_MESSAGE);
  }

  switch (error.status) {
    case 401:
      return new Error(INVALID_CREDENTIALS_MESSAGE);
    case 422:
      return toSignInValidationError(error);
    case 502:
      return new Error(IDENTITY_INCOMPLETE_MESSAGE);
    case 503:
      return new Error(CORPORATE_UNREACHABLE_MESSAGE);
    case 0:
      return new Error(OFFLINE_MESSAGE);
    default:
      return new Error(SIGN_IN_FAILED_MESSAGE);
  }
}

function toSignInValidationError(error: HttpErrorResponse): SignInValidationError {
  const body = error.error as { errors?: unknown } | null;
  const fieldErrors: Record<string, readonly string[]> = {};

  if (body?.errors && typeof body.errors === 'object') {
    for (const [field, messages] of Object.entries(body.errors as Record<string, unknown>)) {
      if (Array.isArray(messages)) {
        fieldErrors[field] = messages.filter(
          (message): message is string => typeof message === 'string',
        );
      }
    }
  }

  return new SignInValidationError(INVALID_REQUEST_MESSAGE, fieldErrors);
}
