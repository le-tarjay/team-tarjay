import { ShiftStatus } from '../models/shift/shift-status.model';

/**
 * The shift status's wire value turned into the text the employee reads, as
 * the designer confirmed it (API map, design row D1). Kept out of the model for
 * the reason `employee-role-label.ts` gives: display text is a rendering
 * concern, and the model keeps the wire strings verbatim.
 */
const SHIFT_STATUS_LABELS: Readonly<Record<ShiftStatus, string>> = {
  OffShift: 'Not on the clock',
  OnShift: 'On the clock',
  OnBreak: 'On break',
};

export function shiftStatusLabel(status: ShiftStatus): string {
  return SHIFT_STATUS_LABELS[status];
}
