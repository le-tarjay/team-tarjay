/**
 * The three shift states, exactly one at a time. Being signed in is a separate
 * fact: a signed-in employee is in one of these, and signing out changes none
 * of them.
 *
 * The literal values are the exact strings the shift endpoints serialize, so
 * there is no translation table between the wire and this model to drift out
 * of sync — the same choice `EmployeeRole` makes.
 */
export type ShiftStatus = 'OffShift' | 'OnShift' | 'OnBreak';

export const SHIFT_STATUSES: readonly ShiftStatus[] = ['OffShift', 'OnShift', 'OnBreak'];

/**
 * One read of an employee's shift, as the server reported it.
 *
 * `onDuty` travels with `status` rather than being derived from it here, so
 * the one definition of on duty — clocked in and not on break — stays on the
 * server. The nav gate and, later, manager-approval eligibility read it; they
 * never re-derive it.
 */
export interface ShiftState {
  status: ShiftStatus;
  onDuty: boolean;
}
