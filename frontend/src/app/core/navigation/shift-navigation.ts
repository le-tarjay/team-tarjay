import { Employee } from '../models/auth/employee.model';
import { ShiftState } from '../models/shift/shift-status.model';
import { MY_SCHEDULE_NAV_ITEM } from './my-schedule-entry';
import { NavItem, roleSpecificNavItem, SHARED_NAV_ITEMS } from './role-navigation';
import { HOME_ROUTE, LOGIN_ROUTE, MY_SCHEDULE_ROUTE } from './route-access';

/** The off-shift and on-break screen, as a nav item. Only the suspended nav carries it. */
export const HOME_NAV_ITEM: NavItem & { readonly route: string } = {
  label: 'Home',
  route: HOME_ROUTE,
};

/**
 * The whole nav while off shift or on break, in this order (API map, design row
 * D9). The full role-based nav is hidden entirely rather than disabled.
 */
export const SUSPENDED_NAV_ITEMS: readonly NavItem[] = [HOME_NAV_ITEM, MY_SCHEDULE_NAV_ITEM];

/**
 * The only routes reachable while the full nav is suspended. An allow-list
 * rather than a list of full-nav routes: `/payment` has no nav item, and a held
 * sale survives a break (design row D16), so a deny-list would leave a sale
 * completable on break.
 */
const SUSPENDED_ROUTES: readonly string[] = [HOME_ROUTE, MY_SCHEDULE_ROUTE];

/**
 * True only on the server's positive word that the employee is not on duty.
 * `null` — no read yet, or a failed one — is never off shift (design row D15),
 * so it suspends nothing: a register that locks an on-shift employee out
 * because the attendance endpoint hiccuped is the worse failure.
 *
 * Reads `onDuty` rather than the status, so the one definition of on duty stays
 * on the server (`shift-status.model.ts`).
 */
export function isFullNavSuspended(shift: ShiftState | null): boolean {
  return shift !== null && !shift.onDuty;
}

/**
 * The shell's main nav for a signed-in employee.
 *
 * Empty until the server has reported a shift. Every item here depends on the
 * shift, so showing any of them before then would be a guess, and showing the
 * full set would flash it before an off-shift answer collapses it.
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
 * The shift half of the route gate. It sits beside the role half
 * (`isRouteAllowedForEmployee`) and does not replace it: a route has to pass
 * both.
 */
export function isRouteAllowedForShift(shift: ShiftState | null, url: string): boolean {
  if (!isFullNavSuspended(shift)) {
    return true;
  }

  return SUSPENDED_ROUTES.includes(routePath(url));
}

/**
 * Whether an employee sitting on `url` should be moved to Home now that `shift`
 * has arrived. Login is outside the shell and is left alone: it navigates on to
 * its own destination, and the gate checks that destination on arrival.
 */
export function shouldLeaveForHome(shift: ShiftState | null, url: string): boolean {
  if (routePath(url) === LOGIN_ROUTE) {
    return false;
  }

  return !isRouteAllowedForShift(shift, url);
}

function routePath(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}
