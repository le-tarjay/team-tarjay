import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SESSION_ENDED_ELSEWHERE_MESSAGE } from './auth.service';
import { SessionEndedError } from './session-ended.error';
import { SESSION_REFRESH_REQUEST } from './session-refresh';
import { AUTH_SERVICE } from '../tokens';

export const AUTHORIZATION_HEADER = 'Authorization';

/**
 * Only this origin's requests are signed. The store's API is reached by
 * relative path (see `SIGN_IN_ENDPOINT`), so a relative URL is this app's own
 * backend and an absolute one is somebody else's — including Keycloak's token
 * endpoint, which a later refresh will call directly and which must never be
 * handed this app's bearer credential.
 */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:|^\/\//i;

/**
 * A header value has to be visible ASCII. A token carrying anything else —
 * whitespace, a stray newline, a control character — cannot be sent as one,
 * so it is treated as no credential at all rather than as a broken header the
 * backend has to reject.
 */
const HEADER_UNSAFE = /[^!-~]/;

/**
 * Attaches the signed-in employee's access token to the store's own requests,
 * as `Authorization: Bearer <access_token>`, and classifies the one failure
 * that means this device's session is gone.
 *
 * Registered once, in `app.config.ts` via
 * `provideHttpClient(withInterceptors([...]))`, so every `HttpClient` call in
 * the app passes through here. No caller asks for the credential and no caller
 * can forget it.
 *
 * It reads the token through `AUTH_SERVICE` rather than `AuthService`, like
 * every other consumer, and it reads it on each request rather than caching
 * it. The token lives in a signal that sign-in and sign-out both write, so
 * reading per request is what makes the credential follow the session:
 * signing out stops the next request being signed, with nothing to invalidate.
 *
 * **Three conditions send the request through unsigned**, each for its own
 * reason, and each with a test of its own:
 *
 * 1. *No usable token* — nobody is signed in, or what is held could not go in
 *    a header (see `usableBearerToken`). An unsigned request gets a clean 401
 *    from the backend; a malformed header gets an ambiguous one.
 * 2. *Not this origin* — the credential is scoped to the store's own API and
 *    must not leak to a third party. Keycloak's token endpoint is the case
 *    that matters: the refresh story will call it absolutely, and it
 *    authenticates with the refresh token, not with this one.
 * 3. *The caller set `Authorization` itself* — a caller that supplied its own
 *    credential meant it. Silently overwriting it would make this interceptor
 *    the thing breaking a call that looks correct at the call site.
 *
 * Shaped as one guarded clone feeding a single `next(...)` on purpose, and
 * this is the story that called that in: the terminated-session
 * (`invalid_grant`) versus transport-failure distinction hangs off that one
 * call, in `toClassifiedFailure` below, rather than arriving as a second
 * interceptor doing its own HTTP plumbing.
 *
 * **What it classifies, and what it deliberately leaves alone.** Only a
 * request the caller marked `SESSION_REFRESH_REQUEST` is a candidate, and only
 * an OAuth `invalid_grant` refusal on it becomes a `SessionEndedError`. Every
 * other failure — a timeout, an unreachable host, a 5xx, a `400` for any other
 * reason — is rethrown exactly as it arrived. That asymmetry is the fail-open
 * rule the epic requires: only positive proof that the session is gone ends
 * it, and silence proves nothing.
 *
 * **It classifies; it does not act.** Nothing is signed out here and nothing
 * is navigated. The caller that asked for the refresh decides what a
 * `SessionEndedError` means, which is what keeps this from turning into a
 * place where any failed request can log the terminal out.
 *
 * The request is cloned rather than mutated because `HttpRequest` is
 * immutable by contract; `clone({ setHeaders })` is how a header is added.
 */
export const bearerTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const token = usableBearerToken(inject(AUTH_SERVICE).accessToken());

  const outgoing =
    token === null || !isThisOrigin(request.url) || request.headers.has(AUTHORIZATION_HEADER)
      ? request
      : request.clone({
          setHeaders: { [AUTHORIZATION_HEADER]: `Bearer ${token}` },
        });

  return next(outgoing).pipe(
    catchError((error: unknown) => throwError(() => toClassifiedFailure(request, error))),
  );
};

function usableBearerToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const token = value.trim();

  return token.length > 0 && !HEADER_UNSAFE.test(token) ? token : null;
}

function isThisOrigin(url: string): boolean {
  return !ABSOLUTE_URL.test(url);
}

/**
 * Keyed on the status first and the body second, the same shape
 * `auth.service.ts`'s `toUserFacingError` uses for sign-in: the status says
 * which failures are even worth reading a body for, and the body says which
 * of those is a terminated session.
 *
 * `400` is what RFC 6749 §5.2 specifies for a rejected grant and what Keycloak
 * actually answers a dead refresh token with. `401` is here because a token
 * endpoint may answer a client-authentication failure that way and Keycloak's
 * exact choice is a realm-configuration detail, not a contract — reading the
 * body on both costs nothing and misreads neither. A `0` (unreachable), a
 * timeout, or any 5xx never reaches the body check at all, because none of
 * them is evidence about the session.
 */
function toClassifiedFailure(request: HttpRequest<unknown>, error: unknown): unknown {
  if (!request.context.get(SESSION_REFRESH_REQUEST) || !(error instanceof HttpErrorResponse)) {
    return error;
  }

  switch (error.status) {
    case 400:
    case 401:
      return isInvalidGrant(error) ? new SessionEndedError(SESSION_ENDED_ELSEWHERE_MESSAGE) : error;
    default:
      return error;
  }
}

/**
 * OAuth reports its own failures in the body, under `error`, not in the status
 * — a rejected refresh token and a malformed refresh request are both `400`,
 * and only the first one means the session ended.
 */
function isInvalidGrant(error: HttpErrorResponse): boolean {
  const body = error.error as { error?: unknown } | null;

  return body?.error === 'invalid_grant';
}
