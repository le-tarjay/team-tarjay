import { test as base, expect, type Browser, type Page } from '@playwright/test';

import { ASSOCIATE, type SeededEmployee } from './credentials';

/**
 * Where a signed-in employee who is off shift, or on break, ends up: Home. The
 * full role-based nav is suspended until they clock in, and the route gate
 * turns every full-nav route away to Home (`frontend: core/navigation/
 * shift-navigation.ts`, `core/navigation/off-duty-redirect.service.ts`).
 *
 * Seeded employees start off shift, so this is where a sign-in lands.
 */
export const SIGNED_IN_URL = /\/home$/;

/**
 * Where an employee who is on shift works: Sale, the full nav's default
 * screen. Clocking in from Home lands here.
 */
export const ON_SHIFT_URL = /\/sale$/;

/**
 * The header's shift indicator text, mirroring `frontend: core/shift/
 * shift-status-label.ts`. Kept as this suite's own copy, per CONVENTIONS.md's
 * Test data.
 */
export const SHIFT_LABELS = {
  OffShift: 'Not on the clock',
  OnShift: 'On the clock',
  OnBreak: 'On break',
} as const;

const ANY_SHIFT_LABEL = new RegExp(`^\\s*(${Object.values(SHIFT_LABELS).join('|')})\\s*$`);

/**
 * Drives the real login form and nothing else. Where the app lands afterwards
 * depends on the employee's shift, which the server holds, so callers assert
 * that themselves or use `signInOffShift` / `signInOnShift`.
 *
 * Real auth landed, and the session still lives in an in-memory signal:
 * `AuthService` holds the employee in `signal<Employee | null>` and writes
 * nothing to `localStorage` or a cookie (`frontend/src/app/core/auth/
 * auth.service.ts`). So Playwright's `storageState`-reuse pattern still has
 * nothing to capture, and every authenticated test drives the real login form.
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
 * then reads `userinfo` — not a mock's fixed delay. The shift read follows it.
 */
const SIGN_IN_TIMEOUT_MS = 20_000;

/** The shift indicator beside the account menu, in the header. */
export function shiftIndicator(page: Page) {
  return page.getByRole('navigation').getByRole('status');
}

/**
 * Signs in and leaves the employee off shift, on Home.
 *
 * Seeded employees start off shift, but attendance is held by the API for as
 * long as the stack runs, so an employee a previous test clocked in is still
 * on the clock here. When the first shift read says so, this clocks them out
 * through the real account menu. That keeps every spec independent of which
 * ran before it.
 */
export async function signInOffShift(page: Page, employee: SeededEmployee): Promise<void> {
  await signIn(page, employee);

  const current = await settledShiftLabel(page, employee);

  if (current !== SHIFT_LABELS.OffShift) {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Clock out', exact: true }).click();
  }

  await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OffShift);
  await expect(page).toHaveURL(SIGNED_IN_URL);
}

/**
 * Clocks in with the real "Clock in" button on Home. Expects the page to be on
 * Home, off shift, and leaves it on Sale, on shift.
 */
export async function clockIn(page: Page): Promise<void> {
  await page.getByRole('main').getByRole('button', { name: 'Clock in', exact: true }).click();

  await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);
  await expect(page).toHaveURL(ON_SHIFT_URL);
}

/** Signs in, then clocks in from Home: on shift, on Sale. */
export async function signInOnShift(page: Page, employee: SeededEmployee): Promise<void> {
  await signInOffShift(page, employee);
  await clockIn(page);
}

/**
 * Puts an employee off shift from a throwaway browser context, so a spec that
 * drives the login form by hand starts from the seeded state. Signing in there
 * ends that context's session again the moment the spec's own sign-in lands.
 */
export async function resetToOffShift(browser: Browser, employee: SeededEmployee): Promise<void> {
  const context = await browser.newContext();

  try {
    await signInOffShift(await context.newPage(), employee);
  } finally {
    await context.close();
  }
}

/**
 * Waits for the first shift read after sign-in to land and returns its label.
 *
 * A sign-in that fails here has to fail the test here, loudly and with the
 * reason attached. Handing back an unauthenticated page makes some later
 * assertion fail somewhere confusing, and the real cause then gets diagnosed
 * as a nav bug.
 */
async function settledShiftLabel(page: Page, employee: SeededEmployee): Promise<string> {
  try {
    await expect(shiftIndicator(page)).toHaveText(ANY_SHIFT_LABEL, {
      timeout: SIGN_IN_TIMEOUT_MS,
    });
  } catch {
    const reported = await page
      .getByRole('alert')
      .first()
      .textContent()
      .catch(() => null);

    throw new Error(
      `Could not sign in as ${employee.employeeId} (${employee.name}, ${employee.role}) ` +
        `and read a shift status: the app is at ${page.url()} with no shift indicator. ` +
        (reported
          ? `The screen reported: "${reported.trim()}".`
          : `The screen showed no error, so the sign-in or the shift read may not have ` +
            `completed — check that the stack's api and id services are up.`),
    );
  }

  return ((await shiftIndicator(page).textContent()) ?? '').trim();
}

/**
 * Two fixtures, signed in as whichever employee the spec asks for. Defaults to
 * the Associate; override per file or per describe block with
 * `test.use({ employee: STORE_MANAGER })`.
 *
 * - `authenticatedPage` — signed in, off shift, on Home.
 * - `onShiftPage` — signed in, clocked in, on Sale.
 *
 * Parameterized by employee rather than by role because two seeded employees
 * share the `Associate` role and differ by job function — see
 * `CUSTOMER_SUPPORT_ASSOCIATE`. `EMPLOYEES_BY_ROLE` is there when a spec wants
 * to select by role.
 */
export const test = base.extend<{
  employee: SeededEmployee;
  authenticatedPage: Page;
  onShiftPage: Page;
}>({
  employee: [ASSOCIATE, { option: true }],

  authenticatedPage: async ({ page, employee }, use) => {
    await signInOffShift(page, employee);
    await use(page);
  },

  onShiftPage: async ({ page, employee }, use) => {
    await signInOnShift(page, employee);
    await use(page);
  },
});

export { expect };
