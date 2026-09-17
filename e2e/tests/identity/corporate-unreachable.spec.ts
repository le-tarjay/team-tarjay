import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { DEPARTMENT_MANAGER } from '../../fixtures/credentials';

/**
 * A valid credential, and an identity provider that cannot be reached.
 *
 * This is the scenario the whole error-handling design exists for: a rejected
 * credential and an unreachable authority must never be mistaken for one
 * another on screen. `AuthService` maps the API's `401` and `503` to different
 * messages, and the API only distinguishes them because
 * `KeycloakEmployeeIdentityResolver` treats "Keycloak answered no" and
 * "Keycloak did not answer" as different failures. Nothing below that chain is
 * mocked, so this test is the only thing that proves the whole of it.
 *
 * **This spec stops a container the rest of the suite depends on.** That is why
 * `playwright.config.ts` runs a single worker: with more, a concurrent spec
 * would see its own valid credential rejected and fail for a reason that has
 * nothing to do with it. The teardown restores Keycloak and waits for the realm
 * to finish importing before anything else runs.
 */
const run = promisify(exec);

/** Where `docker-compose.yml` lives, relative to this surface's root. */
const STACK_DIR = '../infrastructure/local';

/** The identity service's name in the compose file. */
const IDENTITY_SERVICE = 'id';

const REALM_DISCOVERY_URL =
  'http://localhost:8080/realms/team-targe/.well-known/openid-configuration';

/**
 * Generous because this covers a container start plus the realm import, which
 * was measured between 25 and 57 seconds on one machine in one afternoon. A
 * fixed sleep is what this deliberately is not.
 */
const REALM_READY_TIMEOUT_MS = 180_000;

async function realmIsReady(): Promise<boolean> {
  try {
    const response = await fetch(REALM_DISCOVERY_URL, { signal: AbortSignal.timeout(5_000) });

    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForRealm(): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < REALM_READY_TIMEOUT_MS) {
    if (await realmIsReady()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Keycloak was restarted but its realm never became ready within ` +
      `${REALM_READY_TIMEOUT_MS / 1_000}s. Every later sign-in in this run would be ` +
      `rejected as an invalid credential. Check \`docker compose logs ${IDENTITY_SERVICE}\` ` +
      `in ${STACK_DIR}.`,
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('corporate unreachable', () => {
  test.beforeAll(async () => {
    await run(`docker compose stop ${IDENTITY_SERVICE}`, { cwd: STACK_DIR });
  });

  test.afterAll(async () => {
    // Restoring is not optional cleanup: leaving Keycloak down would fail every
    // sign-in for the rest of the run, and on a developer's machine for every
    // run afterwards too.
    await run(`docker compose start ${IDENTITY_SERVICE}`, { cwd: STACK_DIR });
    await waitForRealm();
  });

  test(
    'a valid credential reports the authority as unreachable, not as rejected',
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Employee ID').fill(DEPARTMENT_MANAGER.employeeId);
      await page.getByLabel('PIN').fill(DEPARTMENT_MANAGER.pin);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // The API gives Keycloak 5s before calling it unreachable, and a refused
      // connection resolves well inside that.
      await expect(page.getByRole('alert')).toHaveText(
        'Sign-in is unavailable because corporate could not be reached. Wait a moment and try again.',
        { timeout: 30_000 },
      );

      // Distinct from the rejected-credential message asserted in
      // `tests/login/login.spec.ts`, which is the whole point: the credential
      // here is valid, and saying "invalid employee ID or PIN" would send the
      // employee to fix something that is not wrong.
      await expect(page.getByRole('alert')).not.toHaveText('Invalid employee ID or PIN.');

      await expect(page).toHaveURL(/\/login$/);
    },
  );
});
