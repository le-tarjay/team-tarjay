/**
 * Raised when a background refresh proves this device's session no longer
 * exists — Keycloak answered the refresh with OAuth's `invalid_grant`, which
 * for a refresh-token grant means the session behind it was terminated. On a
 * shared terminal that means one thing: the employee signed in somewhere else.
 *
 * It exists as its own type for the same reason `SignInValidationError` does
 * (`CONVENTIONS.md`, "Error, loading & empty states"): a caller has to tell
 * this failure apart from every other one, and the epic turns on that single
 * distinction. A refresh that fails for a network, timeout or server reason is
 * *not* this — it stays an `HttpErrorResponse` and the session keeps running.
 *
 * It still extends `Error` and carries a user-facing message, so a caller that
 * only knows how to show one banner keeps working.
 */
export class SessionEndedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionEndedError';
  }
}
