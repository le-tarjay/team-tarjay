import { expect, test } from '@playwright/test';

import { signIn, SIGNED_IN_URL } from '../../fixtures/auth';
import { ASSOCIATE } from '../../fixtures/credentials';
import {
  SESSION_END_OBSERVATION_TIMEOUT_MS,
  TOKEN_REFRESH_ENDPOINT_GLOB,
} from '../../fixtures/session';

/**
 * Fail-open: a background refresh that cannot reach the identity provider must
 * never sign the terminal out.
 *
 * This is the rule that decides whether the whole mechanism is safe to ship.
 * Getting it wrong does not look like a bug in a demo — it looks like
 * registers logging themselves out during ordinary local-network noise, at the
 * one moment a store cannot afford it. It is also the only case in this epic
 * with no naturally occurring trigger, which is why the story asks for a
 * *simulated* transient failure.
 *
 * **What is simulated, and what is not.** Only the transport is: Playwright
 * fails the browser's own request to Keycloak's token endpoint, the way a
 * dropped link would. The app, the API, the realm and the signed-in session
 * are all real and untouched. Two alternatives were weighed and declined.
 * Stopping the `id` container, as `tests/identity/corporate-unreachable.spec.ts`
 * does, is more faithful but takes the identity provider away from a suite
 * that runs serially against one stack, and costs a realm re-import of up to
 * 57 seconds afterwards for no gain here. Returning a `5xx` would exercise a
 * different branch: only `400`/`401` carrying `invalid_grant` ends a session
 * (`frontend: core/auth/bearer-token.interceptor.ts` → `toClassifiedFailure`),
 * so a refused connection is the sharper test of "anything that is not
 * `invalid_grant` keeps the session".
 *
 * Intercepting this endpoint cannot disturb signing in: sign-in posts to the
 * API, which reaches Keycloak server-side, never from the browser.
 */
test.describe('background refresh fail-open', () => {
  test(
    'a refresh that cannot reach the identity provider leaves the device signed in and working',
    { tag: '@regression' },
    async ({ page }) => {
      test.setTimeout(SESSION_END_OBSERVATION_TIMEOUT_MS + 90_000);

      await signIn(page, ASSOCIATE);
      await expect(page).toHaveURL(SIGNED_IN_URL);

      let failedRefreshes = 0;

      // Registered after sign-in, so there is no doubt about what it affects.
      await page.route(TOKEN_REFRESH_ENDPOINT_GLOB, async (route) => {
        failedRefreshes += 1;

        await route.abort('failed');
      });

      // Wait for a refresh to actually fire and actually fail. Without this
      // the test would pass on a terminal that simply never refreshed, which
      // is the vacuous version of this assertion and the easy one to ship by
      // accident.
      await expect
        .poll(() => failedRefreshes, {
          timeout: SESSION_END_OBSERVATION_TIMEOUT_MS,
          intervals: [500],
        })
        .toBeGreaterThan(0);

      // Still signed in, on the same screen, with the session intact.
      await expect(page).toHaveURL(SIGNED_IN_URL);
      await expect(page.getByText(ASSOCIATE.name)).toBeVisible();

      // Deliberately silent, too. No error, and no persistent "reconnecting"
      // indicator of any kind — an indicator that lit up on ordinary local
      // noise would teach associates to distrust a terminal that is fine
      // (design row 7).
      await expect(page.getByRole('alert')).toHaveCount(0);

      // "Continues working" asserted as work, not as an absence of symptoms:
      // the terminal can still build a sale after the failed refresh.
      await page.getByRole('button', { name: 'Search' }).click();

      const firstResult = page.getByRole('button', { name: /\$\d/ }).first();
      await expect(firstResult).toBeVisible();
      await firstResult.click();

      await expect(page.getByRole('button', { name: 'Continue to Payment' })).toBeEnabled();
      await expect(page).toHaveURL(SIGNED_IN_URL);
    },
  );
});
