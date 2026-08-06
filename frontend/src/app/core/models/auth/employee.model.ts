/**
 * Approval level (ADR-frontend §4.2). Cashier is deliberately not a tier of
 * its own — it's a `function` scoped to `'associate'` (see `AssociateFunction`).
 */
export type Tier = 'associate' | 'department-manager' | 'store-manager' | 'receiving-associate';

/**
 * Named departments this app knows about today (ADR-frontend §4.1, §12 —
 * Grocery/Electronics as illustrative departments, Cashier and Customer
 * Support as concretely named ones). Extend as corporate names more.
 */
export type NamedDepartment = 'grocery' | 'electronics' | 'cashier' | 'customer-support';

/**
 * A department-bound employee's department, or `'storewide'` for roles that
 * aren't bound to one (e.g. Receiving Associate — ADR-frontend §4, §11).
 * Explicit rather than `null`/`undefined` so every consumer has a defined,
 * renderable value.
 */
export type Department = NamedDepartment | 'storewide';

/**
 * A job function within a tier, orthogonal to tier (ADR-frontend §4.2).
 * Only `'cashier'` (scoped to `tier: 'associate'`) is named so far.
 */
export type AssociateFunction = 'cashier';

export interface Employee {
  id: string;
  name: string;
  tier: Tier;
  department: Department;
  function?: AssociateFunction;
}
