import { expect, test } from '@playwright/test';

import { shiftIndicator } from '../../fixtures/auth';
import { ASSOCIATE, INVALID_PIN } from '../../fixtures/credentials';

/**
 * A deep link into a gated route, for someone who is not signed in.
 *
 * The pair matters more than either half: the destination has to survive the
 * bounce through sign-in, and it has to be discarded when sign-in never
 * succeeds. A guard that forwarded on failure would be worse than one that
 * never forwarded at all.
 *
 * `/schedule` is open to every role in every shift state, so neither the role
 * gate nor the shift gate is under test here — only the unauthenticated
 * redirect and the return afterwards. A full-nav route such as `/products`
 * would not do: seeded employees start off shift, and the shift gate sends an
 * off-shift employee from any full-nav route to Home.
 *
 * Neither test uses the `signIn` fixture, and that is load-bearing: it begins
 * with its own `page.goto('/login')`, which would discard the `returnUrl` the
 * redirect had just set. A test written that way passes against an app that
 * forgot the destination entirely — it was written that way first, and it did.
 * The visitor is already on the login screen here, so both tests sign in from
 * where they stand.
 */
const GATED_ROUTE = '/schedule';

/** What the guard appends when it sends an unauthenticated visitor to sign in. */
const LOGIN_WITH_RETURN_URL = /\/login\?returnUrl=%2Fschedule$/;

const GATED_ROUTE_REACHED = /\/schedule$/;

test.describe('deep link into a gated route', () => {
  test(
    'an unauthenticated visitor is sent to sign in, then forwarded to where they were headed',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(GATED_ROUTE);

      // The attempted URL rides to the login screen on a query parameter, so it
      // survives the reload a deep link often arrives with.
      await expect(page).toHaveURL(LOGIN_WITH_RETURN_URL);

      await page.getByLabel('Employee ID').fill(ASSOCIATE.employeeId);
      await page.getByLabel('PIN').fill(ASSOCIATE.pin);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL(GATED_ROUTE_REACHED);

      // Still there once the shift read has landed, whatever it said: the
      // destination survives the shift gate as well as the sign-in bounce.
      await expect(shiftIndicator(page)).toBeVisible();
      await expect(page).toHaveURL(GATED_ROUTE_REACHED);
    },
  );

  test(
    'a visitor who never signs in successfully is never forwarded anywhere',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(GATED_ROUTE);
      await expect(page).toHaveURL(LOGIN_WITH_RETURN_URL);

      await page.getByLabel('Employee ID').fill(ASSOCIATE.employeeId);
      await page.getByLabel('PIN').fill(INVALID_PIN);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByRole('alert')).toHaveText('Invalid employee ID or PIN.');

      // Still on the login screen, and the captured destination is still only
      // captured — a failed attempt must not spend it.
      await expect(page).toHaveURL(LOGIN_WITH_RETURN_URL);
    },
  );
});
