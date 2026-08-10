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

  /**
   * Part of LET-84's scope: role/department is resolved at sign-in, never
   * self-selected (ADR-frontend §5), so the login screen must never grow a
   * role/department control alongside its two fields — confirming this
   * stays true now that sign-in resolves four tiers instead of one.
   */
  test(
    'presents no role or department picker — only Employee ID, PIN, and Sign in',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByLabel('Employee ID')).toBeVisible();
      await expect(page.getByLabel('PIN')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByRole('listbox')).toHaveCount(0);
    },
  );

  /**
   * The demo-credentials hint box (LET-79) must list all four seeded tiers
   * accurately — a stale hint referencing only the old single cashier
   * credential would mislead anyone using it to sign in as another tier.
   */
  test(
    'demo credentials hint lists all four seeded tiers accurately',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByText('Demo credentials', { exact: true })).toBeVisible();

      await expect(page.getByText('cashier / 1234', { exact: false })).toBeVisible();
      await expect(page.getByText('Associate, Cashier', { exact: false })).toBeVisible();

      await expect(page.getByText('jlee / 2345', { exact: false })).toBeVisible();
      await expect(page.getByText('Department Manager, Electronics', { exact: false })).toBeVisible();

      await expect(page.getByText('spatel / 3456', { exact: false })).toBeVisible();
      await expect(page.getByText('Store Manager, Customer Support', { exact: false })).toBeVisible();

      await expect(page.getByText('ckim / 4567', { exact: false })).toBeVisible();
      await expect(page.getByText('Receiving Associate, storewide', { exact: false })).toBeVisible();
    },
  );
});
