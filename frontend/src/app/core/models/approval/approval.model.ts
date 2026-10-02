import { EmployeeRole } from '../auth/employee.model';

/**
 * The two tiers that can approve. Associates and Receiving Associates never
 * approve (API map, technical row T5), so a check that names one of them is
 * refused on the server and never resolves to an `Approver`.
 */
export type ApproverRole = Extract<EmployeeRole, 'DepartmentManager' | 'StoreManager'>;

export const APPROVER_ROLES: readonly ApproverRole[] = ['DepartmentManager', 'StoreManager'];

/**
 * The manager a check accepted: who they are, the tier they approved under,
 * and their own department. Named `role` rather than `tier` to match
 * `Employee` and the wire, which both call the tier a role.
 */
export interface Approver {
  name: string;
  role: ApproverRole;
  department: string;
}

/** What the approving manager types into the modal. */
export interface ApprovalCredentials {
  employeeId: string;
  pin: string;
}

/**
 * What the approval modal hands back to the action that opened it: the
 * manager to show, and the credentials the action submits with its own
 * request, where they are checked again (API map, design row D11).
 */
export interface ManagerApproval {
  approver: Approver;
  credentials: ApprovalCredentials;
}
