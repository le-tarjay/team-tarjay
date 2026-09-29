import { ShiftStatus } from '../models/shift/shift-status.model';
import { NavItem } from './role-navigation';
import { MY_SCHEDULE_ROUTE } from './route-access';

/**
 * Deliberately absent from `ALL_NAV_ITEMS`. The route gate turns a URL away
 * when some item in that list governs it and the employee's identity does not
 * earn that item. My Schedule is open to every signed-in employee in every
 * shift state, so no item governs its route.
 *
 * The shift gate (`shift-navigation.ts`) keeps `MY_SCHEDULE_ROUTE` on the
 * short list of routes reachable off shift and on break, so the route stays
 * open in every shift state. Adding this item to `ALL_NAV_ITEMS` would put it
 * under the role gate instead, and break LET-144 criterion 5 (on break, going
 * straight to My Schedule loads the page).
 */
export const MY_SCHEDULE_NAV_ITEM: NavItem & { readonly route: string } = {
  label: 'My schedule',
  route: MY_SCHEDULE_ROUTE,
};

/** Where the shell offers My Schedule: the main nav, the account menu, or nowhere yet. */
export type MyScheduleEntryPoint = 'nav' | 'account-menu' | null;

/**
 * On shift, My Schedule sits in the account menu beside the shift actions. Off
 * shift or on break it is a nav item (API map, design rows D8 and D9).
 *
 * `null` until the server has reported a shift status. Picking a place before
 * then would be guessing the shift state (design row D15). The route itself
 * stays reachable throughout.
 */
export function myScheduleEntryPoint(status: ShiftStatus | null): MyScheduleEntryPoint {
  switch (status) {
    case 'OnShift':
      return 'account-menu';
    case 'OffShift':
    case 'OnBreak':
      return 'nav';
    default:
      return null;
  }
}
