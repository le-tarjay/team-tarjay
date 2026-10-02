/**
 * One day of the signed-in employee's schedule, exactly as the shifts endpoint
 * serializes it: a shift with its time range, or a day off with none.
 *
 * A union rather than one shape with optional times, so a day off can never be
 * read as a shift with a missing range — `dayOff` narrows it, and only a
 * `WorkedShift` has a `start` and `end` to read.
 *
 * Informational only. Being scheduled is never the same as being on shift; the
 * shift status comes from `ShiftState`, and nothing derives it from this.
 */
export type ScheduledShift = WorkedShift | ScheduledDayOff;

interface ScheduledDay {
  /** ISO 8601 calendar date, `yyyy-MM-dd`, in the store's local calendar. */
  date: string;

  /** The weekday name the server sends (`Monday`), not a display label. */
  day: string;

  department: string;
}

export interface WorkedShift extends ScheduledDay {
  dayOff: false;

  /** 24-hour `HH:mm`. */
  start: string;

  /** 24-hour `HH:mm`, later the same day than `start`. */
  end: string;
}

export interface ScheduledDayOff extends ScheduledDay {
  dayOff: true;
  start: null;
  end: null;
}
