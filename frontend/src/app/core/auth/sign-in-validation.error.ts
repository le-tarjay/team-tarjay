/**
 * Raised when the sign-in endpoint answers with per-field validation detail
 * (a `422`) rather than a single failure. It carries the per-field messages
 * so a caller can render each one next to the field that failed instead of
 * folding them all into one banner — the distinct-error-type rule in
 * `CONVENTIONS.md`'s "Error, loading & empty states".
 *
 * It still extends `Error` with a user-facing `message`, so a caller that
 * only knows how to show one banner keeps working.
 */
export class SignInValidationError extends Error {
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;

  constructor(message: string, fieldErrors: Readonly<Record<string, readonly string[]>>) {
    super(message);
    this.name = 'SignInValidationError';
    this.fieldErrors = fieldErrors;
  }
}
