import { ShiftStatus } from '../models/shift/shift-status.model';
import { DEFAULT_SIGNED_IN_ROUTE, HOME_ROUTE } from '../navigation/route-access';

/** One per shift transition endpoint. */
export type ShiftActionKind = 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut';

export interface ShiftAction {
  readonly kind: ShiftActionKind;

  /** The visible text, which is also the accessible name `../../../e2e` locates by. */
  readonly label: string;

  /** The state's way back to work: Clock in off shift, End break on break. */
  readonly primary: boolean;

  /** Where the employee is taken once the server has accepted the transition. */
  readonly landsOn: string;
}

/**
 * Clocking in or ending a break goes to the default on-shift screen, never
 * through Home (API map, design rows D2 and D11). Starting a break or clocking
 * out goes to Home, where the hero explains the state (design row D12, and the
 * design asset's `startBreak` transition). The employee stays signed in
 * throughout.
 */
const CLOCK_IN: ShiftAction = {
  kind: 'clockIn',
  label: 'Clock in',
  primary: true,
  landsOn: DEFAULT_SIGNED_IN_ROUTE,
};

const START_BREAK: ShiftAction = {
  kind: 'startBreak',
  label: 'Start break',
  primary: false,
  landsOn: HOME_ROUTE,
};

const END_BREAK: ShiftAction = {
  kind: 'endBreak',
  label: 'End break',
  primary: true,
  landsOn: DEFAULT_SIGNED_IN_ROUTE,
};

const CLOCK_OUT: ShiftAction = {
  kind: 'clockOut',
  label: 'Clock out',
  primary: false,
  landsOn: HOME_ROUTE,
};

/**
 * The account menu's shift actions for a status, in the order the design asset
 * lists them (API map, design rows D2, D3 and D4).
 *
 * None before the server has reported a status. Offering one then would be
 * guessing the shift state (design row D15).
 */
export function shiftActionsFor(status: ShiftStatus | null): readonly ShiftAction[] {
  switch (status) {
    case 'OffShift':
      return [CLOCK_IN];
    case 'OnShift':
      return [START_BREAK, CLOCK_OUT];
    case 'OnBreak':
      return [END_BREAK, CLOCK_OUT];
    default:
      return [];
  }
}
