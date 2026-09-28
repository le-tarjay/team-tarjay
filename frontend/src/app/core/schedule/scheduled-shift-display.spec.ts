import { shiftHours, shiftTimeRange } from './scheduled-shift-display';
import { WorkedShift } from '../models/schedule/scheduled-shift.model';

function worked(start: string, end: string): WorkedShift {
  return {
    date: '2026-09-24',
    day: 'Thursday',
    department: 'Grocery',
    dayOff: false,
    start,
    end,
  };
}

describe('scheduled shift display', () => {
  it.each([
    ['09:00', '17:00', '9:00 AM – 5:00 PM'],
    ['12:00', '20:00', '12:00 PM – 8:00 PM'],
    ['00:30', '07:15', '12:30 AM – 7:15 AM'],
  ])('shows %s–%s as "%s"', (start, end, expected) => {
    expect(shiftTimeRange(worked(start, end))).toBe(expected);
  });

  it.each([
    ['09:00', '17:00', '8h'],
    ['07:00', '15:30', '8.5h'],
    ['09:00', '15:00', '6h'],
  ])('shows the length of %s–%s as "%s"', (start, end, expected) => {
    expect(shiftHours(worked(start, end))).toBe(expected);
  });
});
