import { Params } from '@angular/router';

import { DEFAULT_SIGNED_IN_ROUTE } from '../navigation/route-access';

/**
 * The destination an interrupted sign-in comes back to. It rides the query
 * string rather than a service field so it survives the page reload a
 * bookmarked deep link often arrives with, and so an abandoned sign-in leaves
 * nothing behind to be honoured later.
 */
export const RETURN_URL_PARAM = 'returnUrl';

/**
 * Empty for a destination the login screen would have picked anyway, so the
 * ordinary cold start — someone opening the app and signing in — keeps a clean
 * `/login` in the address bar instead of `/login?returnUrl=%2Fsale`.
 */
export function returnUrlParams(attemptedUrl: string): Params {
  const path = attemptedUrl.split(/[?#]/)[0] ?? attemptedUrl;

  if (path === '/' || path === DEFAULT_SIGNED_IN_ROUTE) {
    return {};
  }

  return { [RETURN_URL_PARAM]: attemptedUrl };
}

/**
 * A `returnUrl` reaches the login screen from the query string, so it is
 * caller-supplied whatever put it there. Only an in-app absolute path is
 * honoured: `//evil.example` is a protocol-relative URL, not a route, and
 * anything that isn't rooted isn't a destination this app can vouch for.
 *
 * A rejected value is not an error to show anybody — the employee still signs
 * in, and still lands somewhere sensible.
 */
export function inAppReturnUrl(rawReturnUrl: string | null): string | null {
  if (rawReturnUrl === null) {
    return null;
  }

  const isRootedPath = rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//');

  return isRootedPath ? rawReturnUrl : null;
}
