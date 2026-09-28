import { localIsoDate, upcomingShifts } from './upcoming-shifts';
import {
  ScheduledDayOff,
  ScheduledShift,
  WorkedShift,
} from '../../core/models/schedule/scheduled-shift.model';

function worked(date: string, day: string, start = '09:00', end = '17:00'): WorkedShift {
  return { date, day, department: 'Grocery', dayOff: false, start, end };
}

function off(date: string, day: string): ScheduledDayOff {
  return { date, day, department: 'Grocery', dayOff: true, start: null, end: null };
}

/**
 * Wednesday 23 September 2026 is today. The week runs Monday 21 to Sunday 27;
 * the next one starts Monday 28.
 */
const TODAY = '2026-09-23';

describe('upcomingShifts', () => {
  it('shows only the next three worked shifts when more are scheduled', () => {
    const schedule: ScheduledShift[] = [
      worked('2026-09-23', 'Wednesday'),
      worked('2026-09-24', 'Thursday'),
      worked('2026-09-25', 'Friday'),
      worked('2026-09-26', 'Saturday'),
      worked('2026-09-29', 'Tuesday'),
    ];

    expect(upcomingShifts(schedule, TODAY).map((shift) => shift.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('rolls forward from today, leaving out days already past', () => {
    const schedule: ScheduledShift[] = [
      worked('2026-09-21', 'Monday'),
      worked('2026-09-22', 'Tuesday'),
      worked('2026-09-24', 'Thursday'),
      worked('2026-09-25', 'Friday'),
      worked('2026-09-26', 'Saturday'),
    ];

    expect(upcomingShifts(schedule, TODAY).map((shift) => shift.date)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
  });

  it('skips days off rather than counting them among the three', () => {
    const schedule: ScheduledShift[] = [
      off('2026-09-23', 'Wednesday'),
      worked('2026-09-24', 'Thursday'),
      off('2026-09-25', 'Friday'),
      worked('2026-09-26', 'Saturday'),
      off('2026-09-27', 'Sunday'),
      worked('2026-09-28', 'Monday'),
      worked('2026-09-29', 'Tuesday'),
    ];

    const preview = upcomingShifts(schedule, TODAY);

    expect(preview.map((shift) => shift.date)).toEqual(['2026-09-24', '2026-09-26', '2026-09-28']);
    expect(preview.every((shift) => !shift.dayOff)).toBe(true);
  });

  it('carries on into the following week instead of stopping at the end of this one', () => {
    const schedule: ScheduledShift[] = [
      worked('2026-09-21', 'Monday'),
      worked('2026-09-22', 'Tuesday'),
      off('2026-09-23', 'Wednesday'),
      off('2026-09-24', 'Thursday'),
      off('2026-09-25', 'Friday'),
      worked('2026-09-26', 'Saturday'),
      off('2026-09-27', 'Sunday'),
      worked('2026-09-28', 'Monday'),
      worked('2026-09-29', 'Tuesday'),
      worked('2026-09-30', 'Wednesday'),
    ];

    expect(upcomingShifts(schedule, TODAY).map((shift) => shift.date)).toEqual([
      '2026-09-26',
      '2026-09-28',
      '2026-09-29',
    ]);
  });

  it('puts the shifts in chronological order whatever order they arrive in', () => {
    const schedule: ScheduledShift[] = [
      worked('2026-09-29', 'Tuesday'),
      worked('2026-09-24', 'Thursday'),
      worked('2026-09-26', 'Saturday'),
      worked('2026-09-25', 'Friday'),
    ];

    expect(upcomingShifts(schedule, TODAY).map((shift) => shift.date)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
  });

  it('shows fewer than three when fewer are scheduled, and none when none are', () => {
    expect(upcomingShifts([worked('2026-09-24', 'Thursday')], TODAY)).toHaveLength(1);
    expect(upcomingShifts([off('2026-09-24', 'Thursday')], TODAY)).toEqual([]);
    expect(upcomingShifts([], TODAY)).toEqual([]);
  });
});

describe('localIsoDate', () => {
  it('uses the terminal\'s own calendar date, zero-padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});
