/**
 * e2e-owned test data, deliberately decoupled from
 * frontend/src/app/mocks/*.service.ts. These values happen to match
 * MockAuthService's accepted credentials today, but are not imported from
 * it — a demo-data change in mocks/ should not silently break these tests,
 * and a change here should be a conscious edit, not an accidental one.
 *
 * One entry per seeded tier (LET-79), each carrying the identity fields the
 * header display and nav bar are expected to reflect once signed in.
 */
export interface SeededEmployeeCredentials {
  employeeId: string;
  pin: string;
  name: string;
  tier: string;
  department: string;
}

export const CASHIER_CREDENTIALS: SeededEmployeeCredentials = {
  employeeId: 'cashier',
  pin: '1234',
  name: 'Alex Rivera',
  tier: 'Associate',
  department: 'Cashier',
} as const;

export const DEPARTMENT_MANAGER_CREDENTIALS: SeededEmployeeCredentials = {
  employeeId: 'jlee',
  pin: '2345',
  name: 'Jordan Lee',
  tier: 'Department Manager',
  department: 'Electronics',
} as const;

export const STORE_MANAGER_CREDENTIALS: SeededEmployeeCredentials = {
  employeeId: 'spatel',
  pin: '3456',
  name: 'Sam Patel',
  tier: 'Store Manager',
  department: 'Customer Support',
} as const;

export const RECEIVING_ASSOCIATE_CREDENTIALS: SeededEmployeeCredentials = {
  employeeId: 'ckim',
  pin: '4567',
  name: 'Casey Kim',
  tier: 'Receiving Associate',
  department: 'storewide',
} as const;

export const INVALID_PIN = '0000';
