import { NEVER, Observable, of, throwError } from 'rxjs';

import { ScheduledShift } from '../../models/schedule/scheduled-shift.model';
import { IScheduleService } from '../schedule.service';

/**
 * A test double for specs that render something reading `SCHEDULE_SERVICE`.
 *
 * Test-only, for the reason `stub-shift.service.ts` gives: the shifts endpoint
 * was real before this service existed, so no `MockScheduleService` was ever
 * wired into `app.config.ts`. HTTP is `schedule.service.spec.ts`'s job; a
 * consumer's spec only needs to decide what the next `list()` answers.
 */
export class StubScheduleService implements IScheduleService {
  private next: Observable<ScheduledShift[]> = of([]);

  list(): Observable<ScheduledShift[]> {
    return this.next;
  }

  respondWith(shifts: ScheduledShift[]): void {
    this.next = of(shifts);
  }

  fail(): void {
    this.next = throwError(() => new Error('The schedule could not be read.'));
  }

  /** A read that never lands, for asserting on the loading state. */
  hang(): void {
    this.next = NEVER;
  }
}
