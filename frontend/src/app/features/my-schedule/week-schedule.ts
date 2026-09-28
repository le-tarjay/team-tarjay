import { ScheduledShift, WorkedShift } from '../../core/models/schedule/scheduled-shift.model';
import { weekdayName } from '../../core/schedule/calendar-week';
import { shiftHourCount } from '../../core/schedule/scheduled-shift-display';

/**
 * One day of the week view. `shift` is `null` on a day off, and on a day the
 * schedule says nothing about: either way the employee is not scheduled.
 */
export interface WeekScheduleDay {
  date: string;
  day: string;
  department: string | null;
  shift: WorkedShift | null;
}

/**
 * Exactly one entry per date in `week`, in the week's order.
 *
 * The endpoint returns more than a week, from days already past to two weeks
 * ahead, so everything outside `week` is dropped here.
 */
export function weekSchedule(
  shifts: readonly ScheduledShift[],
  week: readonly string[],
): WeekScheduleDay[] {
  return week.map((date) => {
    const scheduled = shifts.find((shift) => shift.date === date);

    if (!scheduled) {
      return { date, day: weekdayName(date), department: null, shift: null };
    }

    return {
      date,
      day: scheduled.day,
      department: scheduled.department,
      shift: scheduled.dayOff ? null : scheduled,
    };
  });
}

/** Scheduled hours across the given days. Days off count for nothing. */
export function weekHourCount(days: readonly WeekScheduleDay[]): number {
  return days.reduce((total, day) => total + (day.shift ? shiftHourCount(day.shift) : 0), 0);
}
