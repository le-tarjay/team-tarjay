import { ScheduledShift, WorkedShift } from '../../core/models/schedule/scheduled-shift.model';

/** How many shifts Home's schedule preview shows (API map, design row D6). */
export const SCHEDULE_PREVIEW_LENGTH = 3;

/**
 * The next worked shifts from today on, soonest first, skipping days off.
 *
 * A rolling window, not the calendar week: the preview answers "when do I next
 * work", so it runs straight past the end of the week when it has to. Today's
 * own shift counts as upcoming.
 *
 * Dates compare as strings because both sides are ISO `yyyy-MM-dd`.
 */
export function upcomingShifts(
  shifts: readonly ScheduledShift[],
  today: string,
  count: number = SCHEDULE_PREVIEW_LENGTH,
): WorkedShift[] {
  return shifts
    .filter((shift): shift is WorkedShift => !shift.dayOff && shift.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, count);
}

/**
 * The terminal's own calendar date, as ISO `yyyy-MM-dd`. Local, not UTC: the
 * schedule is the store's local calendar, and the terminal sits in the store.
 */
export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
