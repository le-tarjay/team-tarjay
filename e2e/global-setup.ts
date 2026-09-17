/**
 * Waits for the identity provider's realm to finish importing before any spec
 * runs.
 *
 * Why this exists as a second gate, after `webServer` already waited for
 * http://localhost:4200 to answer: the stack being *started* is not the stack
 * being *ready*. Keycloak's container reports up roughly 25 seconds before
 * `--import-realm` finishes, and a sign-in attempted inside that window is
 * rejected as an invalid credential — it presents as a code failure rather
 * than a timing one, which is what makes it expensive to diagnose. Measured on
 * 2026-09-17: the discovery document answers `200` at ~25s from cold, ~16s
 * after restarting `id` alone.
 *
 * Playwright runs `globalSetup` after the `webServer` plugin has reported
 * ready, which is exactly the ordering this needs.
 *
 * A fixed sleep is the thing this deliberately is not: short enough to fail
 * intermittently, long enough to hurt when it doesn't. `CONVENTIONS.md`'s
 * "Never in this codebase" rules arbitrary sleeps out anyway.
 */

/**
 * The realm's OIDC discovery document. `team-targe` is the realm's name, not a
 * truncation of `team-target` — confirmed by the architect on 2026-09-16 and
 * fixed by `backend/src/Tarjay.Team.Api/appsettings.json`. Port 8080 is the
 * authority that same file configures.
 */
const REALM_DISCOVERY_URL =
  'http://localhost:8080/realms/team-targe/.well-known/openid-configuration';

/**
 * The realm import is the tail of a cold start, and by the time this runs the
 * images are already built and the containers already up — so this budget
 * covers the import only, not the build. Comfortably clear of the ~25s
 * measured, while still failing rather than hanging if the import is broken.
 */
const READY_TIMEOUT_MS = 180_000;

const POLL_INTERVAL_MS = 1_000;

async function realmIsReady(): Promise<boolean> {
  try {
    const response = await fetch(REALM_DISCOVERY_URL, {
      signal: AbortSignal.timeout(5_000),
    });

    return response.status === 200;
  } catch {
    // Connection refused, DNS failure, or the request timing out all mean the
    // same thing here: not ready yet. Keep polling until the budget runs out.
    return false;
  }
}

export default async function waitForRealmImport(): Promise<void> {
  const startedAt = Date.now();
  let lastFailure = '';

  process.stdout.write(`Waiting for the realm at ${REALM_DISCOVERY_URL} ...\n`);

  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (await realmIsReady()) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1_000).toFixed(1);
      process.stdout.write(`Realm ready after ${elapsedSeconds}s.\n`);

      return;
    }

    lastFailure = `${REALM_DISCOVERY_URL} has not answered 200`;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // A timeout here is a real failure, not something a retry papers over: every
  // sign-in in the suite would be rejected as an invalid credential.
  //
  // Two very different causes look identical from here, so the message names
  // both rather than picking one. An earlier version asserted "the stack's
  // containers were up", which it never checked — and the first time it fired,
  // they were not: an `ng serve` left running had satisfied `webServer` on the
  // frontend's port, so the stack was never started at all.
  throw new Error(
    `The identity provider's realm was not ready within ${READY_TIMEOUT_MS / 1_000}s ` +
      `(${lastFailure}).\n\n` +
      `Check which of these it is, from ../infrastructure/local:\n` +
      `  1. The stack never started. \`reuseExistingServer\` silently reuses whatever ` +
      `already answers on the frontend's port — including an \`ng serve\` you forgot ` +
      `was running. Run \`docker compose ps\`.\n` +
      `  2. The stack is up but the realm import failed. Run \`docker compose logs id\`.`,
  );
}
