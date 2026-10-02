import { HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';

/**
 * What one session refresh needs to know: where Keycloak's token endpoint is,
 * and which public client the refresh is presented as. Both are configuration,
 * not logic, so they sit behind a DI token rather than inside `AuthService`.
 */
export interface SessionRefreshConfig {
  readonly tokenEndpoint: string;
  readonly clientId: string;
}

/**
 * The local identity provider, as the *browser* reaches it. Both ways of
 * running this app put Keycloak on the host's port 8080 — `ng serve` against
 * the composed stack, and the composed stack's own nginx — so one value is
 * correct for both today (`infrastructure/local/docker-compose.yml`, `id`
 * ports).
 *
 * **This is the one value in this surface that a deployed environment cannot
 * use as it stands, and it is deliberately the only one.** Sign-in avoids the
 * problem by posting to a relative path (see `SIGN_IN_ENDPOINT`), which stays
 * same-origin wherever the app runs. A refresh cannot: it goes to Keycloak
 * directly, per the epic's API map — "there is no purpose-built poll endpoint"
 * — and Keycloak is a different origin from the app in every environment,
 * including a developer's own machine.
 *
 * Routing `/realms/*` through the dev-server proxy and nginx the way `/v1/*`
 * is routed would remove the absolute URL entirely, and is the shape worth
 * having. Both of those files live in `infrastructure/`, which this story
 * cannot write — so this token is the seam instead: `app.config.ts` can
 * override it with one provider once a real configuration mechanism reaches
 * this surface. `CONVENTIONS.md`'s "Infrastructure impact" says to raise that
 * rather than assume a build-time value is enough, and the story's completion
 * report raises it.
 */
const LOCAL_IDENTITY_AUTHORITY = 'http://localhost:8080';

/** The realm and public client the API already signs employees in against. */
const REALM = 'team-targe';
const PUBLIC_CLIENT_ID = 'team-targe-store';

export const SESSION_REFRESH_CONFIG = new InjectionToken<SessionRefreshConfig>(
  'SESSION_REFRESH_CONFIG',
  {
    providedIn: 'root',
    factory: () => ({
      tokenEndpoint: `${LOCAL_IDENTITY_AUTHORITY}/realms/${REALM}/protocol/openid-connect/token`,
      clientId: PUBLIC_CLIENT_ID,
    }),
  },
);

/**
 * Marks the one request whose failure can mean "this session was ended
 * elsewhere". The HTTP interceptor reads it to decide whether an OAuth
 * `invalid_grant` refusal is about this device's session at all.
 *
 * A context flag rather than a URL match on purpose. The interceptor would
 * otherwise have to hold its own copy of the token endpoint and agree with
 * `AuthService` about it forever, and an `invalid_grant` body coming back from
 * anything else would be read as a terminated session. The caller that knows
 * what it asked for is the one that says so.
 */
export const SESSION_REFRESH_REQUEST = new HttpContextToken<boolean>(() => false);
