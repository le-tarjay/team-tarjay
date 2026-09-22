import { computed, signal } from '@angular/core';
import { Observable, of } from 'rxjs';

import { IAuthService } from '../auth.service';
import { Employee } from '../../models/auth/employee.model';

/** The employee this stub signs in as, exported so a spec can assert against it. */
export const SIGNED_IN_EMPLOYEE: Employee = {
  id: 'cashier',
  name: 'Alex Rivera',
  role: 'Associate',
  department: 'Grocery',
  jobFunction: 'Register',
};

/**
 * A test double for specs that need `sessionEnded` to flip.
 *
 * `MockAuthService` reports `sessionEnded` as a constant `false` — it reaches
 * no Keycloak, so it has no refresh to be refused — and teaching it to flip
 * would hand it behavior `IAuthService` does not declare, the anti-pattern
 * `CONVENTIONS.md` names. So specs that need a session to end drive the signal
 * from this stub instead, the same shape `app-shell.spec.ts` and
 * `session-teardown.service.spec.ts` already hand-roll.
 *
 * Two things here mirror the real `AuthService` because the screens under test
 * depend on them: a session ended elsewhere leaves `sessionEnded` set with
 * nobody signed in — the teardown has already called `logout()` by the time
 * Login renders — and a successful sign-in is what clears it.
 *
 * This file is test-only. Nothing in the app imports it, so it is never
 * bundled; it lives outside `mocks/` because a `Mock*Service` is app code
 * wired into `app.config.ts`, and this is not.
 */
export class StubAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);
  private readonly ended = signal(false);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken = signal<string | null>(null).asReadonly();
  readonly sessionEnded = this.ended.asReadonly();

  login(): Observable<Employee> {
    this.signIn();

    return of(SIGNED_IN_EMPLOYEE);
  }

  signIn(): void {
    this.employee.set(SIGNED_IN_EMPLOYEE);
    this.ended.set(false);
  }

  logout(): void {
    this.employee.set(null);
  }

  endSessionElsewhere(): void {
    this.ended.set(true);
    this.employee.set(null);
  }
}
