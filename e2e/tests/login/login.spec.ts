import { test, expect } from '@playwright/test';

import { CASHIER_CREDENTIALS, INVALID_PIN } from '../../fixtures/credentials';

/**
 * Smoke/regression coverage for the one real auth path MockAuthService
 * implements today (see ../../../frontend/src/app/mocks/mock-auth.service.ts).
 * Written against observable behavior — labels, roles, and the resulting
 * URL — not against component internals.
 */
test.describe('login', () => {
  test(
    'valid credentials sign the employee in and land on the sale screen',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Employee ID').fill(CASHIER_CREDENTIALS.employeeId);
      await page.getByLabel('PIN').fill(CASHIER_CREDENTIALS.pin);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL(/\/sale$/);
    },
  );

  test(
    'invalid credentials show an error and stay on the login screen',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Employee ID').fill(CASHIER_CREDENTIALS.employeeId);
      await page.getByLabel('PIN').fill(INVALID_PIN);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByRole('alert')).toHaveText('Invalid employee ID or PIN.');
      await expect(page).toHaveURL(/\/login$/);
    },
  );
});
