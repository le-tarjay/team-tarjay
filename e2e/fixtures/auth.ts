import { test as base, expect, type Page } from '@playwright/test';

import { CASHIER_CREDENTIALS } from './credentials';

/**
 * MockAuthService keeps auth state in a plain in-memory signal — nothing is
 * written to localStorage or a cookie (confirmed by reading
 * frontend/src/app/mocks/mock-auth.service.ts and
 * frontend/src/app/core/auth/auth.guard.ts). Playwright's usual
 * storageState-reuse trick has nothing to capture here, so every
 * authenticated test still drives the real login form once, via this
 * fixture, rather than replaying a saved session.
 *
 * Not yet consumed by any spec — login.spec.ts tests the login screen
 * itself and doesn't need to already be signed in. The next feature spec
 * (sale, products, buyers, ...) is what should reach for this instead of
 * repeating the login steps inline.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Employee ID').fill(CASHIER_CREDENTIALS.employeeId);
    await page.getByLabel('PIN').fill(CASHIER_CREDENTIALS.pin);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/sale$/);

    await use(page);
  },
});

export { expect };
