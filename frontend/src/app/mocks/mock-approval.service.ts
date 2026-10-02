import { inject, Injectable } from '@angular/core';
import { defer, delay, Observable, of, throwError } from 'rxjs';

import { IApprovalService } from '../core/approval/approval.service';
import {
  APPROVAL_NOT_ELIGIBLE_MESSAGE,
  APPROVAL_NOT_RECOGNIZED_MESSAGE,
} from '../core/approval/approval-messages';
import { ApprovalCredentials, Approver } from '../core/models/approval/approval.model';
import { AUTH_SERVICE } from '../core/tokens';

interface HeldApproval {
  requesterId: string | null;
  credentials: ApprovalCredentials;
}

interface MockManager {
  pin: string;
  approver: Approver;
  eligible: boolean;
}

/**
 * Three managers, read against `MockAuthService`'s signed-in cashier, who
 * works in Grocery. The Grocery Department Manager and the Store Manager can
 * approve. The Electronics Department Manager has the wrong department, so
 * their correct PIN is refused as not eligible. Every other ID and PIN is not
 * recognized.
 *
 * The PINs are the mock's own. They are not the realm's seeded PINs.
 */
const MOCK_MANAGERS: Readonly<Record<string, MockManager>> = {
  '10042': {
    pin: '2468',
    approver: { name: 'Sam Rivera', role: 'DepartmentManager', department: 'Grocery' },
    eligible: true,
  },
  '10043': {
    pin: '1357',
    approver: { name: 'Alex Mercer', role: 'StoreManager', department: 'Store Operations' },
    eligible: true,
  },
  '10046': {
    pin: '8642',
    approver: { name: 'Morgan Ellis', role: 'DepartmentManager', department: 'Electronics' },
    eligible: false,
  },
};

@Injectable()
export class MockApprovalService implements IApprovalService {
  private readonly authService = inject(AUTH_SERVICE);

  private held: HeldApproval | null = null;

  /** Deferred, like the real check: nothing is held until someone subscribes. */
  check(credentials: ApprovalCredentials): Observable<Approver> {
    return defer(() => {
      this.held = null;

      const manager = Object.hasOwn(MOCK_MANAGERS, credentials.employeeId)
        ? MOCK_MANAGERS[credentials.employeeId]
        : undefined;

      if (manager === undefined || manager.pin !== credentials.pin) {
        return throwError(() => new Error(APPROVAL_NOT_RECOGNIZED_MESSAGE));
      }

      if (!manager.eligible) {
        return throwError(() => new Error(APPROVAL_NOT_ELIGIBLE_MESSAGE));
      }

      this.held = {
        requesterId: this.requesterId(),
        credentials: { ...credentials },
      };

      return of({ ...manager.approver }).pipe(delay(300));
    });
  }

  takeCredentials(): ApprovalCredentials | null {
    const held = this.held;

    this.held = null;

    return held !== null && held.requesterId === this.requesterId() ? held.credentials : null;
  }

  discardCredentials(): void {
    this.held = null;
  }

  private requesterId(): string | null {
    return this.authService.currentEmployee()?.id ?? null;
  }
}
