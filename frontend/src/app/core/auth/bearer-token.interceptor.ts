import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

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
 * as `Authorization: Bearer <access_token>`.
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
 * Shaped as one guarded clone feeding a single `next(...)` on purpose: the
 * story that distinguishes a terminated session (`invalid_grant`) from a
 * transport failure hangs its handling off that one call, and so extends this
 * rather than replacing it. Returning early with a second `next(...)` per
 * guard would mean that story has to add its handling to each of them.
 *
 * The request is cloned rather than mutated because `HttpRequest` is
 * immutable by contract; `clone({ setHeaders })` is how a header is added.
 */
export const bearerTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const token = usableBearerToken(inject(AUTH_SERVICE).accessToken());

  if (token === null || !isThisOrigin(request.url) || request.headers.has(AUTHORIZATION_HEADER)) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { [AUTHORIZATION_HEADER]: `Bearer ${token}` },
    }),
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
