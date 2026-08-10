
import { computed, Injectable, signal } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import { IAuthService, LoginCredentials } from '../core/auth/auth.service';
import { Employee } from '../core/models/auth/employee.model';

@Injectable()
export class MockAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(credentials: LoginCredentials): Observable<Employee> {
    const isValidLogin =
      credentials.employeeId.trim().toLowerCase() === 'cashier' &&
      credentials.pin === '1234';

    if (!isValidLogin) {
      return throwError(() => new Error('Invalid employee ID or PIN.'));
    }

    const employee: Employee = {
      id: 'cashier',
      name: 'Alex Rivera',
      tier: 'Associate',
      department: 'Cashier',
    };

    this.employee.set(employee);

    return of(employee).pipe(delay(300));
  }

  logout(): void {
    this.employee.set(null);
  }
}
