
import { computed, Injectable, signal } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import { IAuthService, LoginCredentials } from '../core/auth/auth.service';
import { Employee } from '../core/models/auth/employee.model';

interface SeededCredential {
  pin: string;
  employee: Employee;
}

/**
 * Employee ID + PIN pairs the mock resolves to a real tier/department, one
 * per tier (ADR-frontend §5: role/department is looked up, never chosen
 * client-side). 'cashier' doubles as the Cashier-department Associate.
 */
const SEEDED_CREDENTIALS: Record<string, SeededCredential> = {
  cashier: {
    pin: '1234',
    employee: {
      id: 'cashier',
      name: 'Alex Rivera',
      tier: 'Associate',
      department: 'Cashier',
    },
  },
  jlee: {
    pin: '2345',
    employee: {
      id: 'jlee',
      name: 'Jordan Lee',
      tier: 'Department Manager',
      department: 'Electronics',
    },
  },
  spatel: {
    pin: '3456',
    employee: {
      id: 'spatel',
      name: 'Sam Patel',
      tier: 'Store Manager',
      department: 'Customer Support',
    },
  },
  ckim: {
    pin: '4567',
    employee: {
      id: 'ckim',
      name: 'Casey Kim',
      tier: 'Receiving Associate',
      department: 'storewide',
    },
  },
};

@Injectable()
export class MockAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(credentials: LoginCredentials): Observable<Employee> {
    const seeded = SEEDED_CREDENTIALS[credentials.employeeId.trim().toLowerCase()];
    const isValidLogin = seeded !== undefined && credentials.pin === seeded.pin;

    if (!isValidLogin) {
      return throwError(() => new Error('Invalid employee ID or PIN.'));
    }

    const employee = seeded.employee;

    this.employee.set(employee);

    return of(employee).pipe(delay(300));
  }

  logout(): void {
    this.employee.set(null);
  }
}
