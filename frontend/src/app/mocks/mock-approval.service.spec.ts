import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { MockApprovalService } from './mock-approval.service';
import { IApprovalService } from '../core/approval/approval.service';
import {
  APPROVAL_NOT_ELIGIBLE_MESSAGE,
  APPROVAL_NOT_RECOGNIZED_MESSAGE,
} from '../core/approval/approval-messages';
import { StubAuthService } from '../core/auth/testing/stub-auth.service';
import { Employee } from '../core/models/auth/employee.model';
import { ApprovalCredentials, Approver } from '../core/models/approval/approval.model';
import { AUTH_SERVICE } from '../core/tokens';

const NEXT_EMPLOYEE: Employee = {
  id: '10047',
  name: 'Jamie Ortiz',
  role: 'Associate',
  department: 'Electronics',
  jobFunction: 'Stocking',
};

interface Outcome {
  approver: Approver | null;
  message: string | null;
}

describe('MockApprovalService', () => {
  let service: IApprovalService;
  let authService: StubAuthService;

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        MockApprovalService,
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
      ],
    });

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    // Typed as the interface, so a mock that drifts from it stops compiling.
    service = TestBed.inject(MockApprovalService);
    authService.signIn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function check(credentials: ApprovalCredentials): Outcome {
    const outcome: Outcome = { approver: null, message: null };

    service.check(credentials).subscribe({
      next: (approver) => (outcome.approver = approver),
      error: (error: unknown) => (outcome.message = (error as Error).message),
    });
    vi.runAllTimers();

    return outcome;
  }

  it.each([
    [
      { employeeId: '10042', pin: '2468' },
      { name: 'Sam Rivera', role: 'DepartmentManager', department: 'Grocery' },
    ],
    [
      { employeeId: '10043', pin: '1357' },
      { name: 'Alex Mercer', role: 'StoreManager', department: 'Store Operations' },
    ],
  ])(
    'approves an eligible manager with their name, tier and department',
    (credentials, approver) => {
      expect(check(credentials).approver).toEqual(approver);
    },
  );

  it('refuses a wrong PIN as not recognized', () => {
    expect(check({ employeeId: '10042', pin: '0000' }).message).toBe(
      APPROVAL_NOT_RECOGNIZED_MESSAGE,
    );
  });

  it('refuses an unknown Employee ID the same way as a wrong PIN', () => {
    expect(check({ employeeId: '99999', pin: '2468' }).message).toBe(
      APPROVAL_NOT_RECOGNIZED_MESSAGE,
    );
  });

  it('refuses an ID that only exists on the prototype as not recognized', () => {
    expect(check({ employeeId: 'toString', pin: '2468' }).message).toBe(
      APPROVAL_NOT_RECOGNIZED_MESSAGE,
    );
  });

  it('refuses a manager from another department as not eligible, distinct from not recognized', () => {
    expect(check({ employeeId: '10046', pin: '8642' }).message).toBe(APPROVAL_NOT_ELIGIBLE_MESSAGE);
  });

  it('holds the credentials after an approval, once only', () => {
    check({ employeeId: '10042', pin: '2468' });

    expect(service.takeCredentials()).toEqual({ employeeId: '10042', pin: '2468' });
    expect(service.takeCredentials()).toBeNull();
  });

  it('holds nothing after a refusal', () => {
    check({ employeeId: '10042', pin: '2468' });
    check({ employeeId: '10046', pin: '8642' });

    expect(service.takeCredentials()).toBeNull();
  });

  it('holds nothing until something subscribes, like the real check', () => {
    check({ employeeId: '10042', pin: '2468' });
    service.check({ employeeId: '10046', pin: '8642' });

    expect(service.takeCredentials()).toEqual({ employeeId: '10042', pin: '2468' });
  });

  it('forgets them on discard', () => {
    check({ employeeId: '10042', pin: '2468' });
    service.discardCredentials();

    expect(service.takeCredentials()).toBeNull();
  });

  it('hands nothing over once the signed-in employee has changed', () => {
    check({ employeeId: '10042', pin: '2468' });

    authService.logout();
    authService.signIn(NEXT_EMPLOYEE);

    expect(service.takeCredentials()).toBeNull();
  });
});
