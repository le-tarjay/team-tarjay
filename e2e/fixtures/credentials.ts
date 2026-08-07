/**
 * e2e-owned test data, deliberately decoupled from
 * frontend/src/app/mocks/*.service.ts. These values happen to match
 * MockAuthService's accepted credentials today, but are not imported from
 * it — a demo-data change in mocks/ should not silently break these tests,
 * and a change here should be a conscious edit, not an accidental one.
 */
export const CASHIER_CREDENTIALS = {
  employeeId: 'cashier',
  pin: '1234',
} as const;

export const INVALID_PIN = '0000';
