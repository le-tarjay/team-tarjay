import { test as base, expect, type Page } from '@playwright/test';

import { ASSOCIATE, type SeededEmployee } from './credentials';

/**
 * Where the app lands a signed-in employee, whatever their role: `/sale` is a
 * shared nav item every role earns, so the route gate never turns anyone away
 * from it (`frontend/src/app/core/navigation/route-access.ts`'s
 * `DEFAULT_SIGNED_IN_ROUTE`, governed by `SHARED_NAV_ITEMS`).
 */
export const SIGNED_IN_URL = /\/sale$/;

/**
 * Real auth landed, and the session still lives in an in-memory signal:
 * `AuthService` holds the employee in `signal<Employee | null>` and writes
 * nothing to `localStorage` or a cookie (`frontend/src/app/core/auth/
 * auth.service.ts`). So Playwright's `storageState`-reuse pattern still has
 * nothing to capture, and every authenticated test drives the real login form
 * once through this fixture. The fixture removes the boilerplate, not the
 * login.
 */
export async function signIn(page: Page, employee: SeededEmployee): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Employee ID').fill(employee.employeeId);
  await page.getByLabel('PIN').fill(employee.pin);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * How long to wait for a sign-in to resolve. Generous because this is a real
 * round trip — the API exchanges the credential for a token with Keycloak and
 * then reads `userinfo` — not a mock's fixed delay.
 */
const SIGN_IN_TIMEOUT_MS = 20_000;

/**
 * `authenticatedPage`, signed in as whichever employee the spec asks for.
 * Defaults to the Associate; override per file or per describe block with
 * `test.use({ employee: STORE_MANAGER })`.
 *
 * Parameterized by employee rather than by role because two seeded employees
 * share the `Associate` role and differ by job function — see
 * `CUSTOMER_SUPPORT_ASSOCIATE`. `EMPLOYEES_BY_ROLE` is there when a spec wants
 * to select by role.
 */
export const test = base.extend<{ employee: SeededEmployee; authenticatedPage: Page }>({
  employee: [ASSOCIATE, { option: true }],

  authenticatedPage: async ({ page, employee }, use) => {
    await signIn(page, employee);

    // A sign-in that fails here has to fail the test here, loudly and with the
    // reason attached. Handing back an unauthenticated page makes some later
    // assertion fail somewhere confusing, and the real cause then gets
    // diagnosed as a nav bug.
    try {
      await expect(page).toHaveURL(SIGNED_IN_URL, { timeout: SIGN_IN_TIMEOUT_MS });
    } catch {
      const reported = await page
        .getByRole('alert')
        .textContent()
        .catch(() => null);

      throw new Error(
        `authenticatedPage could not sign in as ${employee.employeeId} ` +
          `(${employee.name}, ${employee.role}): the app stayed at ${page.url()} ` +
          `instead of reaching /sale. ` +
          (reported
            ? `The login screen reported: "${reported.trim()}".`
            : `The login screen showed no error, so the sign-in request may not have ` +
              `completed — check that the stack's api and id services are up.`),
      );
    }

    await use(page);
  },
});

export { expect };
