import { HttpErrorResponse } from '@angular/common/http';

/**
 * What the manager approval modal says when a check does not approve (API
 * map, design rows D7, D8, D10 and D15). The wording is the designer's.
 *
 * Kept beside the approval service and apart from the sign-in messages in
 * `auth.service.ts`, following `shift-action-messages.ts`: approval is its own
 * concern, even though both start from an Employee ID and a PIN.
 */

/**
 * An unknown Employee ID, a wrong PIN, and a locked-out manager all read this
 * way, so the modal never reveals which IDs exist (D7, D15).
 */
export const APPROVAL_NOT_RECOGNIZED_MESSAGE = "That PIN wasn't recognized.";

/** The credentials were good, but this manager can't approve right now (D8). */
export const APPROVAL_NOT_ELIGIBLE_MESSAGE =
  "That manager can't approve this right now. They need to be clocked in, off break, and managing this department.";

/**
 * Anything that is not one of the two refusals above (D10). Nothing was
 * decided about the manager, so trying again is safe.
 */
export const APPROVAL_UNCHECKED_MESSAGE = "Approval couldn't be checked right now. Try again.";

export type ApprovalFailureCause = 'notRecognized' | 'notEligible' | 'unchecked';

/**
 * The `reason` extension `ApprovalExceptionHandler` writes on each refusal's
 * problem-details body. Both refusals are 422, so the status alone cannot
 * tell them apart.
 */
const REASON_CAUSES: Readonly<Record<string, ApprovalFailureCause>> = {
  NotRecognized: 'notRecognized',
  NotEligible: 'notEligible',
};

const APPROVAL_FAILURE_MESSAGES: Readonly<Record<ApprovalFailureCause, string>> = {
  notRecognized: APPROVAL_NOT_RECOGNIZED_MESSAGE,
  notEligible: APPROVAL_NOT_ELIGIBLE_MESSAGE,
  unchecked: APPROVAL_UNCHECKED_MESSAGE,
};

/**
 * Only a 422 that names one of the two refusals is a refusal. Everything else
 * is a check that was not completed: no response (status 0), a 503 from an
 * unreachable identity provider, a proxy's 502 or 504, a 500, a 401 on the
 * requester's own token, and a 422 validation body that carries no `reason`.
 */
export function approvalFailureCause(error: unknown): ApprovalFailureCause {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return 'unchecked';
  }

  const reason = (error.error as { reason?: unknown } | null)?.reason;

  return typeof reason === 'string' && Object.hasOwn(REASON_CAUSES, reason)
    ? REASON_CAUSES[reason]
    : 'unchecked';
}

export function approvalFailureMessage(error: unknown): string {
  return APPROVAL_FAILURE_MESSAGES[approvalFailureCause(error)];
}
