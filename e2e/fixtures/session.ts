/**
 * e2e-owned constants for the single-active-session flow (LET-107).
 *
 * Same decoupling rule as `credentials.ts`: these mirror values that live in
 * the frontend and the realm, and this surface keeps its own copy rather than
 * importing across a surface boundary. Where a value is a mirror, the original
 * is named so a drift is a deliberate edit here rather than a silent break.
 */

/**
 * How often the signed-in app refreshes its token, mirroring
 * `frontend: core/auth/auth.service.ts` → `SESSION_REFRESH_INTERVAL_MS`
 * (`60_000`). Nothing in the running app exposes this, so a flow test cannot
 * shorten it — it can only wait for a real tick. Documented here because every
 * budget below is derived from it.
 */
export const SESSION_REFRESH_INTERVAL_MS = 60_000;

/**
 * How long to wait for the device holding an ended session to notice.
 *
 * Two intervals plus margin, not one, and the second interval is the point.
 * The refresh timer starts when *that* device signs in, so the tick that
 * catches the termination is the first one to fire after the other device
 * signed in. If a tick happens to land in the seconds between the two
 * sign-ins, that refresh still succeeds and the device waits out a full
 * further interval before discovering anything. Budgeting one interval would
 * make this suite fail on a timing coincidence rather than on a defect.
 *
 * This is a poll budget, not a sleep: the assertions using it return as soon
 * as the redirect lands, which is typically inside the first interval.
 */
export const SESSION_END_OBSERVATION_TIMEOUT_MS = SESSION_REFRESH_INTERVAL_MS * 2 + 30_000;

/**
 * The explanation shown on Login after a session was ended by a sign-in
 * elsewhere, matched on the part both candidate wordings agree on.
 *
 * **This is deliberately a pattern rather than a literal, and that is a
 * finding rather than a convenience.** Two humans' wording decisions are in
 * conflict and neither has been withdrawn:
 *
 * - API map design row 3, "confirmed by the designer (David Dieruf,
 *   2026-09-18), with exact wording supplied", says: "You were signed out
 *   because your employee ID was signed in on another device. Sign in again to
 *   continue."
 * - `frontend: core/auth/auth.service.ts` →
 *   `SESSION_ENDED_ELSEWHERE_MESSAGE` currently reads: "Your session was
 *   closed because you signed in from another device." That shorter line was
 *   set on review of PR #42 and shipped through LET-133 and LET-135, whose
 *   reports both flagged the disagreement and named this story as the next
 *   consumer of whichever line wins.
 *
 * Pinning either literal here would make this suite cast the deciding vote on
 * copy that is not this surface's to settle, and would put a second surface in
 * the way of a one-line fix. Matching the clause both wordings share keeps the
 * behavior under test — that the device is told a sign-in elsewhere ended its
 * session — while leaving the decision costing exactly one line in
 * `auth.service.ts`. Tighten this to the exact literal once a human settles it.
 */
export const SESSION_ENDED_ELSEWHERE_PATTERN = /signed in (from|on) another device/i;

/**
 * The rejected-credential message, mirroring
 * `frontend: core/auth/auth.service.ts`. Used to assert that the explanation
 * above is *not* this one: both render into the same `role="alert"` slot on
 * Login, so asserting an alert exists proves nothing on its own.
 */
export const REJECTED_CREDENTIAL_MESSAGE = 'Invalid employee ID or PIN.';

/**
 * Keycloak's token endpoint, as the browser calls it.
 *
 * The background refresh goes to the identity provider directly rather than
 * through the API (`frontend: core/auth/session-refresh.ts` →
 * `SESSION_REFRESH_CONFIG`), so this is the one request a flow test can
 * intercept to simulate a transient failure. Sign-in does not go here — it
 * posts to the API, which talks to Keycloak server-side — so intercepting this
 * cannot break a sign-in.
 */
export const TOKEN_REFRESH_ENDPOINT_GLOB =
  '**/realms/team-targe/protocol/openid-connect/token';

/** Where a device lands once its session has ended, or after a logout. */
export const LOGIN_URL = /\/login$/;
