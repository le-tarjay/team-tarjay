/**
 * The four roles corporate resolves at sign-in. Cashier is a department, not
 * a role — an employee working a register is an `Associate` whose
 * `jobFunction` says what they do.
 *
 * The literal values are the exact strings the sign-in endpoint serializes,
 * so there is no translation table between the wire and this model to drift
 * out of sync. Turning one into display text ("Department Manager") is a
 * rendering concern, not a model one.
 */
export type EmployeeRole =
  | 'Associate'
  | 'DepartmentManager'
  | 'StoreManager'
  | 'ReceivingAssociate';

export const EMPLOYEE_ROLES: readonly EmployeeRole[] = [
  'Associate',
  'DepartmentManager',
  'StoreManager',
  'ReceivingAssociate',
];

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  department: string;
  jobFunction: string;
}
