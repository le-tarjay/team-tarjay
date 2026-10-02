import { HttpErrorResponse } from '@angular/common/http';

import * as approvalMessages from './approval-messages';
import {
  APPROVAL_NOT_ELIGIBLE_MESSAGE,
  APPROVAL_NOT_RECOGNIZED_MESSAGE,
  APPROVAL_UNCHECKED_MESSAGE,
  approvalFailureCause,
  approvalFailureMessage,
} from './approval-messages';
import * as authServiceModule from '../auth/auth.service';
import * as shiftActionMessages from '../shift/shift-action-messages';

function httpError(status: number, body: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Error',
    url: '/v1/manager-approvals/check',
    error: body,
  });
}

/** Every string constant a module exports, i.e. every sentence it can show. */
function exportedMessages(module: Record<string, unknown>): string[] {
  return Object.values(module).filter((value): value is string => typeof value === 'string');
}

describe('approvalFailureCause', () => {
  it('reads a 422 naming NotRecognized as unrecognized credentials', () => {
    expect(approvalFailureCause(httpError(422, { reason: 'NotRecognized' }))).toBe('notRecognized');
  });

  it('reads a 422 naming NotEligible as an ineligible manager', () => {
    expect(approvalFailureCause(httpError(422, { reason: 'NotEligible' }))).toBe('notEligible');
  });

  it('reads no response at all (status 0) as a check not completed', () => {
    expect(approvalFailureCause(httpError(0))).toBe('unchecked');
  });

  it.each([401, 500, 502, 503, 504])('reads a %i as a check not completed', (status) => {
    expect(approvalFailureCause(httpError(status, { reason: 'Unavailable' }))).toBe('unchecked');
  });

  it.each([
    ['no body', null],
    ['a validation body with no reason', { errors: { pin: ['Required.'] } }],
    ['a reason this surface does not know', { reason: 'Unavailable' }],
    ['a reason that is not a string', { reason: 1 }],
    ['a reason inherited from the prototype, not set on the body', { reason: 'toString' }],
  ])('reads a 422 with %s as a check not completed', (_why, body) => {
    expect(approvalFailureCause(httpError(422, body))).toBe('unchecked');
  });

  it('reads a refusal reason on a status other than 422 as a check not completed', () => {
    expect(approvalFailureCause(httpError(500, { reason: 'NotRecognized' }))).toBe('unchecked');
  });

  it('reads a failure that is not an HTTP error, such as an unreadable body, as a check not completed', () => {
    expect(approvalFailureCause(new Error('Unreadable.'))).toBe('unchecked');
  });
});

describe('approvalFailureMessage', () => {
  it("uses the designer's wording for unrecognized credentials, which also covers a lockout", () => {
    expect(approvalFailureMessage(httpError(422, { reason: 'NotRecognized' }))).toBe(
      "That PIN wasn't recognized.",
    );
  });

  it("uses the designer's wording for a manager who can't approve right now", () => {
    expect(approvalFailureMessage(httpError(422, { reason: 'NotEligible' }))).toBe(
      "That manager can't approve this right now. They need to be clocked in, off break, and managing this department.",
    );
  });

  it("uses the designer's wording for a check that could not be completed", () => {
    expect(approvalFailureMessage(httpError(503))).toBe(
      "Approval couldn't be checked right now. Try again.",
    );
  });

  it('gives each of the three causes its own sentence', () => {
    expect(
      new Set([
        APPROVAL_NOT_RECOGNIZED_MESSAGE,
        APPROVAL_NOT_ELIGIBLE_MESSAGE,
        APPROVAL_UNCHECKED_MESSAGE,
      ]).size,
    ).toBe(3);
  });
});

describe('where the approval messages live', () => {
  it('exports exactly the three sentences, beside the approval service', () => {
    expect(exportedMessages(approvalMessages).sort()).toEqual(
      [
        APPROVAL_NOT_RECOGNIZED_MESSAGE,
        APPROVAL_NOT_ELIGIBLE_MESSAGE,
        APPROVAL_UNCHECKED_MESSAGE,
      ].sort(),
    );
  });

  it('shares none of them with the sign-in or shift-action messages', () => {
    const elsewhere = [
      ...exportedMessages(authServiceModule),
      ...exportedMessages(shiftActionMessages),
    ];

    for (const message of exportedMessages(approvalMessages)) {
      expect(elsewhere).not.toContain(message);
    }
  });
});
