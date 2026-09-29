import { test, expect } from '@playwright/test';

import { resetToOffShift, SHIFT_LABELS, shiftIndicator, SIGNED_IN_URL } from '../../fixtures/auth';
import { ASSOCIATE, INVALID_PIN } from '../../fixtures/credentials';

/**
 * Smoke/regression coverage for sign-in against the real identity provider:
 * the credential below is a seeded Keycloak employee, and the API resolves it
 * by password grant plus `userinfo`. Written against observable behavior —
 * labels, roles, and the resulting URL — not against component internals.
 *
 * The per-role happy paths and the remaining regression scenarios belong to
 * LET-117, deliberately not bundled in here.
 */
test.describe('login', () => {
  test(
    'valid credentials sign an off-shift employee in and land on Home',
    { tag: '@smoke' },
    async ({ page, browser }) => {
      // Attendance outlives a sign-in, so an earlier spec may have left this
      // employee on the clock. Start from the seeded state: off shift.
      await resetToOffShift(browser, ASSOCIATE);

      await page.goto('/login');

      await page.getByLabel('Employee ID').fill(ASSOCIATE.employeeId);
      await page.getByLabel('PIN').fill(ASSOCIATE.pin);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OffShift);
      await expect(page).toHaveURL(SIGNED_IN_URL);
    },
  );

  test(
    'invalid credentials show an error and stay on the login screen',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto('/login');

      // A real Employee ID with a PIN no employee has, so this exercises a
      // rejected credential specifically — Keycloak refuses the password
      // grant, the API answers 401, and AuthService maps that status to the
      // invalid-credentials message rather than the generic one.
      await page.getByLabel('Employee ID').fill(ASSOCIATE.employeeId);
      await page.getByLabel('PIN').fill(INVALID_PIN);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByRole('alert')).toHaveText('Invalid employee ID or PIN.');
      await expect(page).toHaveURL(/\/login$/);
    },
  );
});
