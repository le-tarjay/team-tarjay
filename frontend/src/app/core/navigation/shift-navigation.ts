import { Employee } from '../models/auth/employee.model';
import { ShiftState } from '../models/shift/shift-status.model';
import { MY_SCHEDULE_NAV_ITEM } from './my-schedule-entry';
import { NavItem, roleSpecificNavItem, SHARED_NAV_ITEMS } from './role-navigation';
import { HOME_ROUTE, MY_SCHEDULE_ROUTE, routePath } from './route-access';

export const HOME_NAV_ITEM: NavItem & { readonly route: string } = {
  label: 'Home',
  route: HOME_ROUTE,
};

/**
 * The whole nav while the full nav is suspended, in this order (API map,
 * design row D9).
 */
export const SUSPENDED_NAV_ITEMS: readonly NavItem[] = [HOME_NAV_ITEM, MY_SCHEDULE_NAV_ITEM];

/**
 * The only routes an off-shift or on-break employee may reach. An allow-list
 * rather than a list of on-duty routes, so a screen added later is gated
 * without anyone remembering to add it here. `/payment` is turned away with
 * the rest: it continues a sale.
 */
const OFF_DUTY_ROUTES: readonly string[] = [HOME_ROUTE, MY_SCHEDULE_ROUTE];

/**
 * True only when the server has said the employee is off duty: off shift, or
 * on break. Reads `onDuty` rather than the status, so the one definition of on
 * duty stays on the server.
 *
 * `null` is never off duty. Nothing has been read yet, or the read failed, and
 * an on-shift employee must not be locked out of their register by an
 * attendance-endpoint fault.
 */
export function isFullNavSuspended(shift: ShiftState | null): boolean {
  return shift !== null && !shift.onDuty;
}

/**
 * The main nav bar for a signed-in employee.
 *
 * Empty while the shift is unknown. Every item depends on the shift now, so
 * showing any of them before the server answers would be guessing it, and
 * would flash the wrong nav (design row D15).
 */
export function mainNavItemsFor(employee: Employee, shift: ShiftState | null): readonly NavItem[] {
  if (shift === null) {
    return [];
  }

  if (isFullNavSuspended(shift)) {
    return SUSPENDED_NAV_ITEMS;
  }

  return [...SHARED_NAV_ITEMS, roleSpecificNavItem(employee)];
}

/**
 * The shift half of the route gate. It sits beside the role half in
 * `route-access.ts` and changes nothing there.
 *
 * On shift, or with the shift unknown, it allows everything and leaves the
 * decision to the role gate. Off duty, it allows only Home and My schedule.
 */
export function isRouteAllowedForShift(shift: ShiftState | null, url: string): boolean {
  if (!isFullNavSuspended(shift)) {
    return true;
  }

  return OFF_DUTY_ROUTES.includes(routePath(url));
}
