
import { computed, Injectable, signal } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import {
  IAuthService,
  INVALID_CREDENTIALS_MESSAGE,
  LoginCredentials,
} from '../core/auth/auth.service';
import { Employee } from '../core/models/auth/employee.model';

/**
 * Shaped like the real thing — three dot-separated base64url segments — so
 * anything reading it sees a credential, not a placeholder. It is not signed
 * and no backend would accept it; the mock never reaches one.
 */
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJjYXNoaWVyIiwic3RvcmVfcm9sZSI6IkFzc29jaWF0ZSJ9.' +
  'bW9jay1zaWduYXR1cmUtbm90LXZlcmlmaWFibGU';

@Injectable()
export class MockAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);
  private readonly access = signal<string | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken = this.access.asReadonly();

  login(credentials: LoginCredentials): Observable<Employee> {
    const isValidLogin =
      credentials.employeeId.trim().toLowerCase() === 'cashier' &&
      credentials.pin === '1234';

    if (!isValidLogin) {
      return throwError(() => new Error(INVALID_CREDENTIALS_MESSAGE));
    }

    const employee: Employee = {
      id: 'cashier',
      name: 'Alex Rivera',
      role: 'Associate',
      department: 'Grocery',
      jobFunction: 'Register',
    };

    this.employee.set(employee);
    this.access.set(MOCK_ACCESS_TOKEN);

    return of(employee).pipe(delay(300));
  }

  logout(): void {
    this.employee.set(null);
    this.access.set(null);
  }
}
