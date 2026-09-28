import { Employee } from '../models/auth/employee.model';
import { ShiftState } from '../models/shift/shift-status.model';
import { MY_SCHEDULE_NAV_ITEM } from './my-schedule-entry';
import { NavItem, roleSpecificNavItem, SHARED_NAV_ITEMS } from './role-navigation';
import { HOME_ROUTE, routePath } from './route-access';

/**
 * Kept out of `ALL_NAV_ITEMS` for the same reason My Schedule is: the role gate
 * turns away any URL an item in that list governs, and Home is open to every
 * signed-in employee in every shift state.
 */
export const HOME_NAV_ITEM: NavItem & { readonly route: string } = {
  label: 'Home',
  route: HOME_ROUTE,
};

/**
 * The whole nav while off shift or on break, and the only routes the shift gate
 * lets through then (API map, design rows D9 and D10). Guest state grants no
 * associate work at all (Reference ADR (frontend) §§5, 9), so this is an
 * allow-list: a route reached from inside the sale flow, such as `/payment`,
 * is turned away too.
 */
export const SUSPENDED_NAV_ITEMS: readonly NavItem[] = [HOME_NAV_ITEM, MY_SCHEDULE_NAV_ITEM];

/**
 * Reads the server's own `onDuty` fact rather than re-deriving it from the
 * status, so there is one definition of on duty (API map, row T12).
 *
 * `null` — no read yet, or a failed one — never suspends anything. Only a
 * positive answer from the server restricts the employee.
 */
export function isFullNavSuspended(shift: ShiftState | null): boolean {
  return shift !== null && !shift.onDuty;
}

/**
 * The main nav for a signed-in employee.
 *
 * Empty until the server has reported a shift. Every item depends on the shift,
 * so showing either set before then would be a guess, and a wrong guess flashes
 * the wrong nav (API map, design row D15).
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
 * The shift half of the route gate. It sits beside the role check in
 * `authGuard` and does not replace it: on shift, or with no shift read yet,
 * this allows everything and the role check decides.
 */
export function isRouteAllowedForShift(shift: ShiftState | null, url: string): boolean {
  if (!isFullNavSuspended(shift)) {
    return true;
  }

  const path = routePath(url);

  return SUSPENDED_NAV_ITEMS.some((item) => item.route === path);
}
