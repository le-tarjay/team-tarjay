export type EmployeeTier =
  | 'Associate'
  | 'Department Manager'
  | 'Store Manager'
  | 'Receiving Associate';

export type Department = 'Grocery' | 'Electronics' | 'Cashier' | 'Customer Support';

interface EmployeeIdentity {
  id: string;
  name: string;
}

/**
 * An Associate, Department Manager, or Store Manager, tied to one named
 * department (Cashier is a department here, not a separate tier or function).
 */
export interface DepartmentEmployee extends EmployeeIdentity {
  tier: 'Associate' | 'Department Manager' | 'Store Manager';
  department: Department;
}

/**
 * A Receiving Associate is storewide rather than department-bound, so the
 * literal 'storewide' is the only department value the type allows.
 */
export interface ReceivingAssociateEmployee extends EmployeeIdentity {
  tier: 'Receiving Associate';
  department: 'storewide';
}

export type Employee = DepartmentEmployee | ReceivingAssociateEmployee;
