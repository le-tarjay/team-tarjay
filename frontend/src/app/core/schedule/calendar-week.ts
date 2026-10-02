/**
 * Calendar arithmetic for reading the schedule. Dates are ISO `yyyy-MM-dd`
 * strings throughout, the shape the shifts endpoint sends, so a date compares
 * and matches as a string.
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const DAYS_IN_WEEK = 7;

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

/**
 * The seven dates of the calendar week holding `today`, Monday first.
 *
 * The shifts endpoint leaves the first day of the week to the client. Monday
 * is the ISO 8601 convention.
 */
export function calendarWeek(today: Date): string[] {
  const daysSinceMonday = (today.getDay() + DAYS_IN_WEEK - 1) % DAYS_IN_WEEK;

  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) =>
    localIsoDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday + offset),
    ),
  );
}

/** "Monday" for an ISO date, read in the local calendar. */
export function weekdayName(isoDate: string): string {
  return WEEKDAY_NAMES[localDate(isoDate).getDay()] ?? '';
}

function localDate(isoDate: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);

  return new Date(year, month - 1, day);
}
