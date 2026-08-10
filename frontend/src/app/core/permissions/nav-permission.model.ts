import { Department, Employee } from '../models/auth/employee.model';

/**
 * The route destinations nav-permission decisions are made about — mirrors
 * the route paths in app.routes.ts. `payment` is included even though it
 * isn't a nav link today; its visibility still has to be explicitly decided
 * rather than assumed.
 */
export type NavDestination = 'sale' | 'products' | 'sales' | 'buyers' | 'payment';

const EMPTY_DESTINATIONS: ReadonlySet<NavDestination> = new Set();

/**
 * Associate, Department Manager, and Store Manager all carry ADR-frontend
 * §4's "Build sale, process payment, returns with receipt, product lookup"
 * authority (Department Manager and Store Manager both read as "everything
 * above, plus..."), and §4.4 establishes sale-building and payment as
 * storewide rather than confined to the employee's own department. So for
 * every one of these tiers, in every named department, all five routes are
 * visible.
 */
const FULL_ACCESS: ReadonlySet<NavDestination> = new Set([
  'sale',
  'products',
  'sales',
  'buyers',
  'payment',
]);

/**
 * Receiving Associate's ADR-frontend §4 authority is shipment counts,
 * discrepancy logs, and department stocking queues — no sale-building,
 * payment, or returns authority is listed for this tier anywhere in the
 * ADR. Only the read-only product catalog (SKU/name/price) overlaps with
 * verifying a shipment's contents, so that's the only route this tier sees.
 */
const RECEIVING_ASSOCIATE_ACCESS: ReadonlySet<NavDestination> = new Set(['products']);

type DepartmentTier = 'Associate' | 'Department Manager' | 'Store Manager';

/**
 * Explicit, cell-by-cell tier x department -> visible-destination mapping.
 * Every tier/named-department combination the Employee model can produce
 * has its own entry here — deliberately, even where several entries share
 * the same value — because no route defaults to visible and nothing here is
 * derived implicitly from tier alone. Receiving Associate is mapped
 * separately below since it pairs with `storewide`, not a named department.
 */
const DEPARTMENT_TIER_MAP: Readonly<Record<DepartmentTier, Readonly<Record<Department, ReadonlySet<NavDestination>>>>> = {
  Associate: {
    Grocery: FULL_ACCESS,
    Electronics: FULL_ACCESS,
    Cashier: FULL_ACCESS,
    'Customer Support': FULL_ACCESS,
  },
  'Department Manager': {
    Grocery: FULL_ACCESS,
    Electronics: FULL_ACCESS,
    Cashier: FULL_ACCESS,
    'Customer Support': FULL_ACCESS,
  },
  'Store Manager': {
    Grocery: FULL_ACCESS,
    Electronics: FULL_ACCESS,
    Cashier: FULL_ACCESS,
    'Customer Support': FULL_ACCESS,
  },
};

/**
 * Resolves the set of nav destinations an Employee is allowed to see.
 *
 * Least-privilege default: a tier/department combination with no explicit
 * entry above resolves to an empty set — never an error, never allow-all.
 * The Employee union's own typing means every value it can legally produce
 * already has an entry; the fallback exists for defensive safety against a
 * combination the type system didn't anticipate (e.g. a department added
 * later without updating this map, or data arriving from an untyped
 * source), not for a case this story expects to occur today.
 */
export function resolveVisibleDestinations(employee: Employee): ReadonlySet<NavDestination> {
  if (employee.tier === 'Receiving Associate') {
    return RECEIVING_ASSOCIATE_ACCESS;
  }

  const departmentMap = DEPARTMENT_TIER_MAP[employee.tier] as Readonly<
    Record<string, ReadonlySet<NavDestination>>
  >;
  return departmentMap[employee.department] ?? EMPTY_DESTINATIONS;
}
