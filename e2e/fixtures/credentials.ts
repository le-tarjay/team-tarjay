/**
 * e2e-owned test data: the employees seeded into the local stack's Keycloak
 * realm (`infrastructure/local/keycloak/team-targe-realm.json`).
 *
 * These are real credentials against a real identity provider. The previous
 * `CASHIER_CREDENTIALS` (`cashier` / `1234`) were `MockAuthService`'s accepted
 * pair; that service is no longer wired into the running app, so those values
 * authenticated against nothing.
 *
 * Still not imported from another surface, per CONVENTIONS.md's "Test data":
 * the realm export is the seed's source of truth, and these constants are this
 * suite's own copy of it. A drift between the two is a deliberate edit here,
 * not a side effect of someone else's change — and the realm's five employees
 * are fixed by LET-119's table rather than being demo data anyone may retune.
 *
 * Employee ID is the Keycloak username; PIN is the password.
 */

/**
 * The four roles corporate resolves at sign-in, as the wire serializes them.
 * Declared here rather than imported from `frontend/src/app/core/models` —
 * same decoupling rule as the credentials themselves.
 */
export type StoreRole = 'Associate' | 'DepartmentManager' | 'StoreManager' | 'ReceivingAssociate';

export interface SeededEmployee {
  readonly employeeId: string;
  readonly pin: string;
  /** The display name the app shell renders once signed in. */
  readonly name: string;
  readonly role: StoreRole;
  readonly department: string;
  readonly jobFunction: string;
}

export const ASSOCIATE: SeededEmployee = {
  employeeId: '10041',
  pin: '4417',
  name: 'Dana Okafor',
  role: 'Associate',
  department: 'Grocery',
  jobFunction: 'Stocking',
};

export const DEPARTMENT_MANAGER: SeededEmployee = {
  employeeId: '10042',
  pin: '5528',
  name: 'Sam Rivera',
  role: 'DepartmentManager',
  department: 'Grocery',
  jobFunction: 'Stocking',
};

export const STORE_MANAGER: SeededEmployee = {
  employeeId: '10043',
  pin: '6639',
  name: 'Alex Mercer',
  role: 'StoreManager',
  department: 'Store Operations',
  jobFunction: 'Store Management',
};

export const RECEIVING_ASSOCIATE: SeededEmployee = {
  employeeId: '10044',
  pin: '7741',
  name: 'Priya Raman',
  role: 'ReceivingAssociate',
  department: 'Receiving',
  jobFunction: 'Receiving',
};

/**
 * An Associate whose job function is Customer Support. Same role as
 * `ASSOCIATE`, deliberately separate: job function rather than role decides
 * this employee's nav tail, so the two are not interchangeable in a spec.
 */
export const CUSTOMER_SUPPORT_ASSOCIATE: SeededEmployee = {
  employeeId: '10045',
  pin: '8852',
  name: 'Chris Bell',
  role: 'Associate',
  department: 'Grocery',
  jobFunction: 'Customer Support',
};

/**
 * One employee per role, for a spec that cares about the role rather than the
 * individual. `Associate` maps to `ASSOCIATE`; reach for
 * `CUSTOMER_SUPPORT_ASSOCIATE` by name when the job function is the point.
 */
export const EMPLOYEES_BY_ROLE: Readonly<Record<StoreRole, SeededEmployee>> = {
  Associate: ASSOCIATE,
  DepartmentManager: DEPARTMENT_MANAGER,
  StoreManager: STORE_MANAGER,
  ReceivingAssociate: RECEIVING_ASSOCIATE,
};

/** Every seeded employee, for a spec that walks all of them. */
export const ALL_SEEDED_EMPLOYEES: readonly SeededEmployee[] = [
  ASSOCIATE,
  DEPARTMENT_MANAGER,
  STORE_MANAGER,
  RECEIVING_ASSOCIATE,
  CUSTOMER_SUPPORT_ASSOCIATE,
];

/**
 * A PIN no seeded employee has, so Keycloak rejects the password grant and the
 * API answers `401`. Paired with a real Employee ID it exercises the
 * rejected-credential path specifically, rather than an unknown-user path.
 */
export const INVALID_PIN = '0000';
