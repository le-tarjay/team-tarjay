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
}

interface SignInEnvelope {
  data: SignInResponse;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements IAuthService {
  private readonly http = inject(HttpClient);

  private readonly employee = signal<Employee | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(credentials: LoginCredentials): Observable<Employee> {
    return this.http.post<SignInEnvelope>(SIGN_IN_ENDPOINT, credentials).pipe(
      map((envelope: SignInEnvelope | null) => toEmployee(envelope)),
      tap((employee) => this.employee.set(employee)),
      catchError((error: unknown) => throwError(() => toUserFacingError(error))),
    );
  }

  logout(): void {
    this.employee.set(null);
  }
}

/**
 * Role and department are resolved once here and held for the session; a
 * corporate-side change takes effect at the employee's next sign-in.
 */
function toEmployee(envelope: SignInEnvelope | null): Employee {
  const data = envelope?.data;

  if (!data || !isEmployeeRole(data.role)) {
    throw new Error(SIGN_IN_FAILED_MESSAGE);
  }

  return {
    id: data.employeeId,
    name: data.name,
    role: data.role,
    department: data.department,
    jobFunction: data.jobFunction,
  };
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
