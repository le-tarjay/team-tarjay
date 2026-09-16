import { EmployeeRole } from '../models/auth/employee.model';

/**
 * The role's wire value turned into the text the header shows.
 *
 * `employee.model.ts` keeps the wire strings verbatim (`'DepartmentManager'`)
 * so there is no translation table between the endpoint and the model to drift
 * out of sync, and it says outright that turning one into display text is a
 * rendering concern. This is that rendering concern, kept out of the model on
 * purpose.
 */
const ROLE_LABELS: Readonly<Record<EmployeeRole, string>> = {
  Associate: 'Associate',
  DepartmentManager: 'Department Manager',
  StoreManager: 'Store Manager',
  ReceivingAssociate: 'Receiving Associate',
};

export function employeeRoleLabel(role: EmployeeRole): string {
  return ROLE_LABELS[role];
}
