import { expect, test, type Browser, type Page } from '@playwright/test';

import { signIn, SIGNED_IN_URL } from '../../fixtures/auth';
import { ASSOCIATE, type SeededEmployee } from '../../fixtures/credentials';
import {
  LOGIN_URL,
  REJECTED_CREDENTIAL_MESSAGE,
  SESSION_END_OBSERVATION_TIMEOUT_MS,
  SESSION_ENDED_ELSEWHERE_PATTERN,
} from '../../fixtures/session';

/**
 * The assembled single-active-session flow (LET-107), end to end through two
 * real browsers against the real stack.
 *
 * Nothing here is simulated. Two independent browser contexts are two
 * terminals; the same seeded employee signs in on both; the API calls
 * Keycloak's admin endpoint to terminate the first session
 * (`api: Tarjay.Team.Infrastructure/Identity/KeycloakEmployeeIdentityResolver`
 * → `TerminateOtherSessionsAsync`, which excludes the session it just issued);
 * and the first terminal's own background refresh is what discovers it. Each
 * story in this epic proved its own piece against a double — this is the only
 * thing that proves the pieces meet.
 *
 * **These tests take minutes, not seconds, and that is inherent rather than
 * lazy.** The refresh interval is a hard-coded 60 seconds in the shipped
 * bundle with no runtime seam to shorten it, so the wait for a real tick is
 * the wait. Faking the browser clock would make the suite fast and would stop
 * it testing the thing it exists for: `CONVENTIONS.md`'s Scope says nothing on
 * this side is rigged. The waits below are polls on real signals that return
 * the moment the app acts, never `waitForTimeout`.
 *
 * Nothing here is tagged `@smoke` for the same reason — a multi-minute test
 * does not belong in the subset whose whole purpose is being fast.
 */

interface Device {
  readonly page: Page;
  readonly close: () => Promise<void>;
}

/**
 * A terminal: its own browser context, so the two devices share no cookies,
 * storage, or in-memory Angular state. Signing in through the real form is the
 * only way to authenticate here — `AuthService` keeps the session in an
 * in-memory signal, so there is no `storageState` to reuse
 * (`CONVENTIONS.md`, "Auth in tests").
 */
async function signInOnDevice(browser: Browser, employee: SeededEmployee): Promise<Device> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await signIn(page, employee);
  await expect(page).toHaveURL(SIGNED_IN_URL);

  return { page, close: () => context.close() };
}

/** One sample of what a terminal is showing. */
interface ScreenObservation {
  readonly pathname: string;
  readonly alertTexts: readonly string[];
}

async function observe(page: Page): Promise<ScreenObservation> {
  const pathname = new URL(page.url()).pathname;

  try {
    const alertTexts = await page.getByRole('alert').allTextContents();

    return { pathname, alertTexts: alertTexts.map((text) => text.trim()) };
  } catch {
    // Defensive only. The app routes client-side, so the execution context is
    // not torn down mid-sample; a pathname with no alert reading is still a
    // usable sample if that ever changes.
    return { pathname, alertTexts: [] };
  }
}

/**
 * Polls the terminal until it reaches Login, returning everything it was seen
 * showing on the way.
 *
 * The samples are the point, not a by-product: the story's fringe cases ask
 * that no transitional or "reconnecting" screen appears at any point, and
 * design row 6 asks that no in-context error is shown before the redirect.
 * Both are claims about the states in between, which an assertion on the
 * destination alone cannot make.
 */
async function waitForReturnToLogin(page: Page): Promise<ScreenObservation[]> {
  const samples: ScreenObservation[] = [];

  await expect
    .poll(
      async () => {
        const observation = await observe(page);
        samples.push(observation);

        return observation.pathname;
      },
      { timeout: SESSION_END_OBSERVATION_TIMEOUT_MS, intervals: [500] },
    )
    .toBe('/login');

  return samples;
}

/**
 * Asserts the journey itself, not just where it ended: the terminal was only
 * ever on the sale screen or on Login, and said nothing while it was still on
 * the sale screen.
 */
function expectNoTransitionalScreen(samples: readonly ScreenObservation[]): void {
  const pathsSeen = [...new Set(samples.map((sample) => sample.pathname))].sort();
  expect(pathsSeen).toEqual(['/login', '/sale']);

  const alertsBeforeRedirect = samples
    .filter((sample) => sample.pathname === '/sale')
    .flatMap((sample) => sample.alertTexts);
  expect(alertsBeforeRedirect).toEqual([]);
}

/** The explanation on Login, and that it is the right one. */
async function expectSessionEndedExplanation(page: Page): Promise<void> {
  const alert = page.getByRole('alert');

  await expect(alert).toHaveText(SESSION_ENDED_ELSEWHERE_PATTERN);

  // The same slot carries sign-in failures, so an alert existing proves
  // nothing. A terminal bounced by a colleague signing in has done nothing
  // wrong, and being told its credential was rejected would send the employee
  // to fix something that is not broken.
  await expect(alert).not.toHaveText(REJECTED_CREDENTIAL_MESSAGE);
}

/** Shared terminals: the next person at one is usually somebody else. */
async function expectBlankEmployeeIdField(page: Page): Promise<void> {
  await expect(page.getByLabel('Employee ID')).toHaveValue('');
}

test.describe('single active session', () => {
  test(
    'signing in on a second device returns the first to Login on its own',
    { tag: '@regression' },
    async ({ browser }) => {
      // Two full refresh intervals of observation, plus two real sign-ins and
      // the suite's own setup.
      test.setTimeout(SESSION_END_OBSERVATION_TIMEOUT_MS + 90_000);

      const deviceA = await signInOnDevice(browser, ASSOCIATE);
      const deviceB = await signInOnDevice(browser, ASSOCIATE);

      try {
        // Device A is deliberately left alone from here. The epic's definition
        // of done is that it finds out "without the employee attempting
        // anything there" — so touching it at all would test something weaker.
        const samples = await waitForReturnToLogin(deviceA.page);

        await expectSessionEndedExplanation(deviceA.page);
        await expectBlankEmployeeIdField(deviceA.page);
        expectNoTransitionalScreen(samples);

        // Device B is still working, which is the half of the mechanism a
        // test on Device A alone would miss: the admin call terminates the
        // employee's *other* sessions, not all of them.
        await expect(deviceB.page).toHaveURL(SIGNED_IN_URL);
      } finally {
        await deviceA.close();
        await deviceB.close();
      }
    },
  );

  test(
    'the device that ended the other session shows no sign of having done so',
    { tag: '@regression' },
    async ({ browser }) => {
      const deviceA = await signInOnDevice(browser, ASSOCIATE);
      const deviceB = await signInOnDevice(browser, ASSOCIATE);

      try {
        // No banner, no "this ended a session on Register 3" notice, nothing.
        // An associate moving between registers is routine, so a notice here
        // would fire on the happy path of most sign-ins (design row 5).
        await expect(deviceB.page.getByRole('alert')).toHaveCount(0);

        // It is signed in as the employee who just signed in, on the screen
        // every role lands on, with the normal signed-in shell around it.
        await expect(deviceB.page).toHaveURL(SIGNED_IN_URL);
        await expect(deviceB.page.getByText(ASSOCIATE.name)).toBeVisible();
        await expect(deviceB.page.getByRole('button', { name: 'Account' })).toBeVisible();
      } finally {
        await deviceA.close();
        await deviceB.close();
      }
    },
  );

  test(
    'an action taken after the session ended still completes, and the next refresh is what ends it',
    { tag: '@regression' },
    async ({ browser }) => {
      test.setTimeout(SESSION_END_OBSERVATION_TIMEOUT_MS + 90_000);

      const deviceA = await signInOnDevice(browser, ASSOCIATE);

      try {
        // Start the action before the session is terminated: search the
        // catalogue, leaving results on screen and a sale not yet built.
        await deviceA.page.getByRole('button', { name: 'Search' }).click();

        // Any product's accessible name carries its price, which is what makes
        // this independent of whatever the catalogue happens to hold.
        const firstResult = deviceA.page.getByRole('button', { name: /\$\d/ }).first();
        await expect(firstResult).toBeVisible();

        const continueToPayment = deviceA.page.getByRole('button', {
          name: 'Continue to Payment',
        });
        await expect(continueToPayment).toBeDisabled();

        const deviceB = await signInOnDevice(browser, ASSOCIATE);

        try {
          // Device A's session is now terminated in Keycloak. Finishing the
          // action anyway must work: token validation checks a signature and
          // an expiry locally and never asks Keycloak whether the session is
          // still alive, so an action inside the refresh window succeeds
          // (design row 6, corrected 2026-09-18 for exactly this reason — the
          // superseded mechanism would have failed it).
          await firstResult.click();

          await expect(continueToPayment).toBeEnabled();
          await expect(
            deviceA.page.getByText('No products added yet.'),
          ).toBeHidden();
          await expect(deviceA.page).toHaveURL(SIGNED_IN_URL);

          // And only then, at the refresh that follows, does the terminal go
          // back to Login — mid-task, with no warning and nothing preserved.
          const samples = await waitForReturnToLogin(deviceA.page);

          await expectSessionEndedExplanation(deviceA.page);
          expectNoTransitionalScreen(samples);
        } finally {
          await deviceB.close();
        }
      } finally {
        await deviceA.close();
      }
    },
  );

  test(
    'a deliberate logout returns to a plain Login screen with no explanation',
    { tag: '@regression' },
    async ({ browser }) => {
      const device = await signInOnDevice(browser, ASSOCIATE);

      try {
        await device.page.getByRole('button', { name: 'Account' }).click();
        await device.page.getByRole('button', { name: 'Logout' }).click();

        await expect(device.page).toHaveURL(LOGIN_URL);

        // The distinction this epic exists to draw: the explanation appears
        // only when the session was ended by a sign-in elsewhere, never on a
        // sign-out the employee chose (design row 8). Asserting no alert at
        // all, rather than "not the session-ended text", is what makes the
        // screen plain rather than differently worded.
        await expect(device.page.getByRole('alert')).toHaveCount(0);
        await expectBlankEmployeeIdField(device.page);
      } finally {
        await device.close();
      }
    },
  );
});
