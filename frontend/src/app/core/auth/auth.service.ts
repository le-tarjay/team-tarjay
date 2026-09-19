import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal, Signal } from '@angular/core';
import { catchError, map, Observable, tap, throwError } from 'rxjs';

import { Employee, EMPLOYEE_ROLES, EmployeeRole } from '../models/auth/employee.model';
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

/** What one successful sign-in resolved to: who, plus what the session runs on. */
interface ResolvedSession {
  employee: Employee;
  accessToken: string | null;
  refreshToken: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements IAuthService {
  private readonly http = inject(HttpClient);

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

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken = this.access.asReadonly();
  readonly refreshToken = this.refresh.asReadonly();

  login(credentials: LoginCredentials): Observable<Employee> {
    return this.http.post<SignInEnvelope>(SIGN_IN_ENDPOINT, credentials).pipe(
      map((envelope: SignInEnvelope | null) => toResolvedSession(envelope)),
      tap((session) => this.hold(session)),
      map((session) => session.employee),
      catchError((error: unknown) => throwError(() => toUserFacingError(error))),
    );
  }

  logout(): void {
    this.employee.set(null);
    this.access.set(null);
    this.refresh.set(null);
  }

  /**
   * One place, so a sign-in can never leave the session half-held: an identity
   * this app can't use throws before any of this runs, and the tokens are
   * dropped with it rather than outliving a failed sign-in.
   */
  private hold(session: ResolvedSession): void {
    this.employee.set(session.employee);
    this.access.set(session.accessToken);
    this.refresh.set(session.refreshToken);
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
