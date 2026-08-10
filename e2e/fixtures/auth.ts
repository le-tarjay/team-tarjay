import { test as base, expect, type Page } from '@playwright/test';

import { CASHIER_CREDENTIALS, type SeededEmployeeCredentials } from './credentials';

/**
 * MockAuthService keeps auth state in a plain in-memory signal — nothing is
 * written to localStorage or a cookie (confirmed by reading
 * frontend/src/app/mocks/mock-auth.service.ts and
 * frontend/src/app/core/auth/auth.guard.ts). Playwright's usual
 * storageState-reuse trick has nothing to capture here, so every
 * authenticated test still drives the real login form once, via this
 * helper, rather than replaying a saved session.
 *
 * Shared by the authenticatedPage fixture below (always the Cashier
 * Associate) and by specs that need to sign in as a specific tier
 * (role-based-navigation.spec.ts) without repeating the form-fill steps.
 *
 * Only asserts that sign-in succeeded (navigated away from /login) — not
 * which route it lands on. LoginComponent always requests /sale on success,
 * but navPermissionGuard (LET-82) can redirect that away again for a tier
 * whose visible set excludes /sale (Receiving Associate lands on /products
 * instead), so a fixed post-login URL isn't a safe assertion across tiers.
 */
export async function signIn(page: Page, credentials: SeededEmployeeCredentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Employee ID').fill(credentials.employeeId);
  await page.getByLabel('PIN').fill(credentials.pin);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/**
 * Simulates a signed-in employee typing a URL directly into the address bar
 * — as opposed to clicking a rendered nav link — without the full browser
 * navigation a real address-bar entry would cause. A real `page.goto()` to
 * a second URL mid-test reloads the document, and because MockAuthService's
 * session lives only in an in-memory signal (see this file's top comment),
 * that reload discards it: the app boots signed-out and authGuard sends it
 * to /login regardless of the target route, which would test "not signed
 * in" rather than "signed in but outside my visible set" — the case
 * role-based-navigation.spec.ts's blocked-navigation checks need.
 *
 * `history.pushState` + a manually dispatched `popstate` event is what a
 * browser back/forward navigation looks like from Angular's Router
 * (PathLocationStrategy listens for `popstate`), so the Router processes
 * the new URL — running navPermissionGuard and friends — exactly as it
 * would for a real direct navigation, without tearing down the page's JS
 * state. Assertions afterward are still against the resulting URL and
 * visible content, never against this mechanism itself.
 */
export async function simulateDirectNavigation(page: Page, path: string): Promise<void> {
  await page.evaluate((targetPath) => {
    window.history.pushState(null, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * Not yet consumed by any spec — login.spec.ts tests the login screen
 * itself and doesn't need to already be signed in. A feature spec that only
 * needs *some* authenticated employee (rather than a specific tier) should
 * reach for this instead of repeating the login steps inline.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await signIn(page, CASHIER_CREDENTIALS);

    await use(page);
  },
});

export { expect };
