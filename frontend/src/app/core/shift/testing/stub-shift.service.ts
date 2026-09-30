import { signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { ShiftState, ShiftStatus } from '../../models/shift/shift-status.model';
import { IShiftService } from '../shift.service';

/**
 * A test double for specs that render something reading `SHIFT_SERVICE` and
 * need to put a shift status in front of it directly.
 *
 * There is no `MockShiftService` to reuse: the shift endpoints were real
 * before this service existed, so nothing was ever mock-wired in
 * `app.config.ts`. A consumer's spec is not the place to exercise HTTP — that
 * is `shift.service.spec.ts`'s job — so this drives `currentShift` by hand.
 *
 * Test-only, like `core/auth/testing/stub-auth.service.ts`: nothing in the app
 * imports it, so it is never bundled.
 */
export class StubShiftService implements IShiftService {
  private readonly shift = signal<ShiftState | null>(null);

  readonly currentShift = this.shift.asReadonly();

  refresh(): void {
    // A consumer's spec asserts on what renders, not on the read behind it.
  }

  clockIn(): Observable<ShiftState> {
    return throwError(() => new Error('Not exercised by this stub.'));
  }

  clockOut(): Observable<ShiftState> {
    return throwError(() => new Error('Not exercised by this stub.'));
  }

  startBreak(): Observable<ShiftState> {
    return throwError(() => new Error('Not exercised by this stub.'));
  }

  endBreak(): Observable<ShiftState> {
    return throwError(() => new Error('Not exercised by this stub.'));
  }

  /** What a successful read does: the server's answer becomes what is held. */
  report(status: ShiftStatus): void {
    this.shift.set({ status, onDuty: status === 'OnShift' });
  }

  /** What no read yet, or a failed one, leaves behind. */
  clear(): void {
    this.shift.set(null);
  }
}
