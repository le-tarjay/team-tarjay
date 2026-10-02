import { weekHourCount, weekSchedule } from './week-schedule';
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

/** Monday 21 to Sunday 27 September 2026. */
const WEEK = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
];

describe('weekSchedule', () => {
  it('gives exactly one entry per day of the week, in order, and nothing outside it', () => {
    const schedule: ScheduledShift[] = [
      worked('2026-09-17', 'Thursday'),
      worked('2026-09-20', 'Sunday'),
      ...WEEK.map((date) => worked(date, 'Any')),
      worked('2026-09-28', 'Monday'),
    ];

    expect(weekSchedule(schedule, WEEK).map((day) => day.date)).toEqual(WEEK);
  });

  it('carries a worked day\'s shift, and no shift on a day off', () => {
    const [monday, tuesday] = weekSchedule(
      [worked('2026-09-21', 'Monday', '11:00', '19:00'), off('2026-09-22', 'Tuesday')],
      WEEK,
    );

    expect(monday).toEqual({
      date: '2026-09-21',
      day: 'Monday',
      department: 'Grocery',
      shift: worked('2026-09-21', 'Monday', '11:00', '19:00'),
    });
    expect(tuesday).toEqual({
      date: '2026-09-22',
      day: 'Tuesday',
      department: 'Grocery',
      shift: null,
    });
  });

  it('treats a day the schedule leaves out as a day off, named from its date', () => {
    const days = weekSchedule([], WEEK);

    expect(days).toHaveLength(7);
    expect(days.every((day) => day.shift === null && day.department === null)).toBe(true);
    expect(days.map((day) => day.day)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });
});

describe('weekHourCount', () => {
  it('sums the week\'s worked shifts and counts days off as nothing', () => {
    const days = weekSchedule(
      [
        worked('2026-09-21', 'Monday', '11:00', '19:00'),
        worked('2026-09-22', 'Tuesday', '09:00', '15:00'),
        off('2026-09-23', 'Wednesday'),
        worked('2026-09-24', 'Thursday', '12:00', '20:00'),
        worked('2026-09-25', 'Friday', '07:00', '15:30'),
        off('2026-09-26', 'Saturday'),
      ],
      WEEK,
    );

    expect(weekHourCount(days)).toBe(30.5);
  });

  it('leaves out shifts from the weeks either side', () => {
    const days = weekSchedule(
      [
        worked('2026-09-20', 'Sunday'),
        worked('2026-09-23', 'Wednesday'),
        worked('2026-09-28', 'Monday'),
      ],
      WEEK,
    );

    expect(weekHourCount(days)).toBe(8);
  });

  it('is zero for a week with nothing scheduled', () => {
    expect(weekHourCount(weekSchedule([], WEEK))).toBe(0);
  });
});
