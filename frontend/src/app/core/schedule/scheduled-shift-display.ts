import { WorkedShift } from '../models/schedule/scheduled-shift.model';

/**
 * A worked shift's times and length as the employee reads them, in the design
 * asset's format: "9:00 AM – 5:00 PM" and "8h". Kept out of the model for the
 * reason `shift-status-label.ts` gives: display text is a rendering concern,
 * and the model keeps the wire strings verbatim.
 */
export function shiftTimeRange(shift: WorkedShift): string {
  return `${clockTime(shift.start)} – ${clockTime(shift.end)}`;
}

export function shiftHours(shift: WorkedShift): string {
  const minutes = minutesOfDay(shift.end) - minutesOfDay(shift.start);
  const hours = Math.round((minutes / 60) * 100) / 100;

  return `${hours}h`;
}

/** 24-hour `HH:mm` to 12-hour "h:mm AM". */
function clockTime(value: string): string {
  const [hours, minutes] = splitTime(value);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function minutesOfDay(value: string): number {
  const [hours, minutes] = splitTime(value);

  return hours * 60 + minutes;
}

function splitTime(value: string): [number, number] {
  const [hours = '0', minutes = '0'] = value.split(':');

  return [Number(hours), Number(minutes)];
}
