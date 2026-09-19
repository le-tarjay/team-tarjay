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
 * Attaches the signed-in employee's access token to the store's own requests.
 *
 * Shaped as one guarded clone feeding a single `next(...)` on purpose: the
 * story that distinguishes a terminated session (`invalid_grant`) from a
 * transport failure hangs its handling off that one call, and so extends this
 * rather than replacing it.
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
