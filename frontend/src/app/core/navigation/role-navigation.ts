import { Employee } from '../models/auth/employee.model';

export interface NavItem {
  /**
   * The visible text, which is also the accessible name `../../../e2e` locates
   * by — see `CONVENTIONS.md`, "What this surface owes the surfaces that test
   * it".
   */
  readonly label: string;

  /**
   * `null` where this app has no such route yet. Every role-specific item and
   * both Store Manager admin entries land there today: their screens belong to
   * later epics (Receiving §11, BOPIS/Fulfillment §12, admin tools §14), and a
   * `routerLink` to an undefined path would fall through `app.routes.ts`'s
   * `**` wildcard to `/login` — a signed-in employee bounced to the sign-in
   * screen by a nav click. The shell renders these as disabled instead, so the
   * item an employee's role earns them is visible and honest about not being
   * reachable yet.
   */
  readonly route: string | null;
}

/**
 * Fixed order, identical for every role — identity adds and removes the tail,
 * it never reorders the head (Reference ADR (frontend) §5).
 *
 * "Price check" sits in the resolved map's shared-items row and is
 * deliberately absent: no page or route for it exists anywhere in the
 * codebase, and building that capability is outside this epic. Flagged for the
 * architect on LET-115.
 */
export const SHARED_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Sale', route: '/sale' },
  { label: 'Products', route: '/products' },
  { label: 'Sales', route: '/sales' },
  { label: 'Buyers', route: '/buyers' },
];

const RECEIVING_ITEM: NavItem = { label: 'Receiving', route: null };
const FULFILLMENT_ITEM: NavItem = { label: 'Fulfillment', route: null };

/**
 * Two labels for the one stocking slot, per the design asset
 * (Team-Targét.dc.html, generated-nav block): an Associate executes the tasks
 * assigned to them, so they get "My tasks", while a manager owns their
 * department's whole queue and gets "Stocking" (Reference ADR (frontend) §4).
 */
const MY_TASKS_ITEM: NavItem = { label: 'My tasks', route: null };
const STOCKING_ITEM: NavItem = { label: 'Stocking', route: null };

const STORE_MANAGER_ADMIN_ITEMS: readonly NavItem[] = [
  { label: 'Employee roster', route: null },
  { label: 'Register status', route: null },
];

const CUSTOMER_SUPPORT_JOB_FUNCTION = 'customer support';

/**
 * Exactly one item, always — an employee whose job function resolves to
 * nothing recognized still gets a stocking item rather than an empty slot.
 *
 * Role is tested before job function because Receiving Associate is a distinct,
 * storewide role rather than a function an associate happens to be doing
 * (Reference ADR (frontend) §§4, 11) — it decides the slot whatever the job
 * function says.
 */
export function roleSpecificNavItem(employee: Employee): NavItem {
  if (employee.role === 'ReceivingAssociate') {
    return RECEIVING_ITEM;
  }

  if (isCustomerSupport(employee.jobFunction)) {
    return FULFILLMENT_ITEM;
  }

  return employee.role === 'Associate' ? MY_TASKS_ITEM : STOCKING_ITEM;
}

/**
 * `jobFunction` is a free-form claim value off the identity provider rather
 * than a closed set the way `role` is (see `backend`'s `EmployeeIdentity`), so
 * matching it tolerates casing and surrounding whitespace instead of trusting
 * the claim to be typed exactly.
 */
function isCustomerSupport(jobFunction: string): boolean {
  return jobFunction.trim().toLowerCase() === CUSTOMER_SUPPORT_JOB_FUNCTION;
}

/** Store Manager only — every other role gets neither entry. */
export function adminNavItems(employee: Employee): readonly NavItem[] {
  return employee.role === 'StoreManager' ? STORE_MANAGER_ADMIN_ITEMS : [];
}
