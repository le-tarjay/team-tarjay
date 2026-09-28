import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ScheduledShift } from '../models/schedule/scheduled-shift.model';

export interface IScheduleService {
  /**
   * The signed-in employee's own schedule, one entry per day, oldest first.
   * The server decides the span: from the start of the current calendar week
   * through two weeks ahead, so the list includes days already past. Choosing
   * which of them to show is the reader's job.
   */
  list(): Observable<ScheduledShift[]>;
}

/**
 * Relative and `me`-scoped, like the shift endpoints: the backend takes the
 * employee from the bearer token, so nothing here names one.
 */
const SHIFTS_ENDPOINT = '/v1/employees/me/shifts';

export const UNREADABLE_SCHEDULE_MESSAGE = 'Your schedule could not be read.';

interface ScheduleEnvelope {
  data: unknown;
}

/**
 * Stateless, unlike `ShiftService`: a schedule read holds nothing between
 * calls, so each screen that shows one asks for it when it loads.
 */
@Injectable({
  providedIn: 'root',
})
export class ScheduleService implements IScheduleService {
  private readonly http = inject(HttpClient);

  list(): Observable<ScheduledShift[]> {
    return this.http
      .get<ScheduleEnvelope>(SHIFTS_ENDPOINT)
      .pipe(map((envelope: ScheduleEnvelope | null) => toScheduledShifts(envelope)));
  }
}

function toScheduledShifts(envelope: ScheduleEnvelope | null): ScheduledShift[] {
  const data = envelope?.data;

  if (!Array.isArray(data) || !data.every(isScheduledShift)) {
    throw new Error(UNREADABLE_SCHEDULE_MESSAGE);
  }

  return data;
}

function isScheduledShift(value: unknown): value is ScheduledShift {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  const hasDay =
    typeof entry['date'] === 'string' &&
    typeof entry['day'] === 'string' &&
    typeof entry['department'] === 'string';

  if (!hasDay) {
    return false;
  }

  if (entry['dayOff'] === true) {
    return entry['start'] === null && entry['end'] === null;
  }

  return (
    entry['dayOff'] === false &&
    typeof entry['start'] === 'string' &&
    typeof entry['end'] === 'string'
  );
}
