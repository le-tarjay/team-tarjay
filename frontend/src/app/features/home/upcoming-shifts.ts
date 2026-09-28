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
 * Dates compare as strings because both sides are ISO `yyyy-MM-dd`. Each
 * entry is one whole day, so the date alone orders them.
 */
export function upcomingShifts(
  shifts: readonly ScheduledShift[],
  today: string,
  count: number = SCHEDULE_PREVIEW_LENGTH,
): WorkedShift[] {
  return shifts
    .filter((shift): shift is WorkedShift => !shift.dayOff && shift.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
