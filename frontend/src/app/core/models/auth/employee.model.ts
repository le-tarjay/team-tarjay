export type EmployeeTier =
  | 'associate'
  | 'department-manager'
  | 'store-manager'
  | 'receiving-associate';

// Named departments confirmed in ADR-frontend §4.1/§12 (Grocery, Electronics as the
// worked examples; Customer Support added for BOPIS). Not an exhaustive store-wide
// taxonomy — extend as more departments are confirmed.
export type Department = 'grocery' | 'electronics' | 'customer-support';

// Job function within a tier, orthogonal to department scope (ADR-frontend §4.2).
// Cashier is modeled here, not as a department or tier, per the resolved API map.
export type EmployeeFunction = 'cashier';

export interface Employee {
  id: string;
  name: string;
  tier: EmployeeTier;
  department: Department | 'storewide';
  function?: EmployeeFunction;
}
