import { Employee } from '../models/auth/employee.model';
import {
  adminNavItems,
  ALL_NAV_ITEMS,
  NavItem,
  roleSpecificNavItem,
  SHARED_NAV_ITEMS,
} from './role-navigation';

/**
 * Where a signed-in employee lands when nothing more specific applies: the
 * route table's own default, and a shared nav item every role sees, so it is
 * never itself something the gate would turn away.
 */
export const DEFAULT_SIGNED_IN_ROUTE = '/sale';

/**
 * Everything this employee's identity earns them, nav bar and account menu
 * together. The shell renders those two in separate places; the gate only
 * cares that an item is one they'd see somewhere.
 */
export function navItemsFor(employee: Employee): readonly NavItem[] {
  return [...SHARED_NAV_ITEMS, roleSpecificNavItem(employee), ...adminNavItems(employee)];
}

/**
 * The one rule: a route is reachable only if the nav item that governs it is
 * one this employee would see. A route no nav item governs — `/payment`, which
 * is reached from inside the sale flow rather than from the nav — is left to
 * whatever else guards it, sign-in included.
 *
 * Which item governs a route is answered two ways, because a nav item's
 * `route` is `null` until that screen exists (see `role-navigation.ts`):
 *
 * 1. `declaredNavItem` — a route table entry naming its own nav item via
 *    `data: { navItem: '...' }`. Needed for a screen whose item has no route
 *    yet, and authoritative when present.
 * 2. Otherwise, the item whose `route` is this URL. This is the path that
 *    matters day to day: filling in a `route` in `role-navigation.ts` gates
 *    the matching route with no second edit here or in the route table, so
 *    there is no annotation to forget.
 *
 * A `declaredNavItem` naming an item no identity can produce — a typo — matches
 * nobody and turns everybody away. That is deliberate: this gate fails closed.
 */
export function isRouteAllowedForEmployee(
  employee: Employee,
  url: string,
  declaredNavItem?: string,
): boolean {
  const governingLabel = declaredNavItem ?? navItemLabelForRoute(url);

  if (governingLabel === null) {
    return true;
  }

  return navItemsFor(employee).some((item) => item.label === governingLabel);
}

function navItemLabelForRoute(url: string): string | null {
  const path = routePath(url);
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.route === path);

  return item?.label ?? null;
}

/**
 * `RouterStateSnapshot.url` is the whole URL — query string and fragment
 * included — while a nav item's `route` is just the path.
 */
function routePath(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}
