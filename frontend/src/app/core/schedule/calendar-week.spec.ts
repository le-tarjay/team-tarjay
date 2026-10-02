import { calendarWeek, localIsoDate, weekdayName } from './calendar-week';

const MONDAY_21_TO_SUNDAY_27 = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
];

describe('localIsoDate', () => {
  it('uses the terminal\'s own calendar date, zero-padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('calendarWeek', () => {
  it.each([
    ['Monday', new Date(2026, 8, 21, 0, 0)],
    ['Wednesday', new Date(2026, 8, 23, 10, 0)],
    ['Sunday', new Date(2026, 8, 27, 23, 59)],
  ])('runs Monday to Sunday when today is a %s', (_, today) => {
    expect(calendarWeek(today)).toEqual(MONDAY_21_TO_SUNDAY_27);
  });

  it('crosses a month and a year boundary', () => {
    expect(calendarWeek(new Date(2027, 0, 1))).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});

describe('weekdayName', () => {
  it('names the weekday of an ISO date in the local calendar', () => {
    expect(weekdayName('2026-09-21')).toBe('Monday');
    expect(weekdayName('2026-09-27')).toBe('Sunday');
  });
});
