
import { computed, Injectable, signal } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import { IAuthService, LoginCredentials } from '../core/auth/auth.service';
import { Employee } from '../core/models/auth/employee.model';

// Mocked/local credential resolution table (API map rows 2, 5) — one seed per
// in-scope tier, plus a dedicated Associate-with-Cashier-function seed so the
// "cashier" tier-vs-function distinction (ADR-frontend §4.2) has coverage.
// `employeeId` is matched case-insensitively, trimmed, against the resolved
// input; `pin` is matched exactly. Real credential verification against the
// authoritative employee system stays out of scope per the epic.
interface SeedCredential {
  employeeId: string;
  pin: string;
  employee: Employee;
}

const SEED_CREDENTIALS: SeedCredential[] = [
  {
    employeeId: 'cashier',
    pin: '1234',
    employee: { id: 'cashier', name: 'Alex Rivera', tier: 'associate', department: 'grocery', function: 'cashier' },
  },
  {
    employeeId: 'associate',
    pin: '1111',
    employee: { id: 'associate', name: 'Morgan Diaz', tier: 'associate', department: 'electronics' },
  },
  {
    employeeId: 'deptmgr',
    pin: '2222',
    employee: { id: 'deptmgr', name: 'Jordan Lee', tier: 'department-manager', department: 'electronics' },
  },
  {
    employeeId: 'storemgr',
    pin: '3333',
    employee: { id: 'storemgr', name: 'Sam Patel', tier: 'store-manager', department: 'grocery' },
  },
  {
    employeeId: 'receiving',
    pin: '4444',
    employee: { id: 'receiving', name: 'Riley Chen', tier: 'receiving-associate', department: 'storewide' },
  },
];

@Injectable()
export class MockAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);

  login(credentials: LoginCredentials): Observable<Employee> {
    const normalizedEmployeeId = credentials.employeeId.trim().toLowerCase();

    const seed = SEED_CREDENTIALS.find(
      (candidate) => candidate.employeeId === normalizedEmployeeId && candidate.pin === credentials.pin,
    );

    if (!seed) {
      return throwError(() => new Error('Invalid employee ID or PIN.'));
    }

    this.employee.set(seed.employee);

    return of(seed.employee).pipe(delay(300));
  }

  logout(): void {
    this.employee.set(null);
  }
}
