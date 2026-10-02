import { HttpErrorResponse } from '@angular/common/http';

import { ShiftActionKind } from './shift-actions';

/**
 * What a failed shift action says to the employee at the terminal (API map,
 * design row D14, technical row T13). Kept apart from the sign-in messages in
 * `auth.service.ts`: attendance and authentication are different concerns,
 * and this module follows the shape of that one rather than living inside it.
 *
 * Every action has its own sentence for each cause, so two actions failing
 * for the same reason never read as one generic line (story criterion 4).
 */

/**
 * A rejected transition (409). Each names the status the backend rejects that
 * action from, so the sentence says what happened. The shift status is re-read
 * alongside, which is what "has been updated" refers to.
 */
export const CLOCK_IN_REJECTED_MESSAGE =
  'You couldn’t clock in because you’re already on the clock. Your shift status has been updated.';

export const CLOCK_OUT_REJECTED_MESSAGE =
  'You couldn’t clock out because you’re already off the clock. Your shift status has been updated.';

export const START_BREAK_REJECTED_MESSAGE =
  'Your break couldn’t start because you’re not on shift. Your shift status has been updated.';

export const END_BREAK_REJECTED_MESSAGE =
  'Your break couldn’t end because you’re not on break. Your shift status has been updated.';

/** The backend could not be reached. Nothing changed, so trying again is safe. */
export const CLOCK_IN_UNREACHABLE_MESSAGE =
  'You couldn’t clock in because the store system couldn’t be reached. Try again.';

export const CLOCK_OUT_UNREACHABLE_MESSAGE =
  'You couldn’t clock out because the store system couldn’t be reached. Try again.';

export const START_BREAK_UNREACHABLE_MESSAGE =
  'Your break couldn’t start because the store system couldn’t be reached. Try again.';

export const END_BREAK_UNREACHABLE_MESSAGE =
  'Your break couldn’t end because the store system couldn’t be reached. Try again.';

/**
 * Any other failure: an unexpected status, or a response too malformed to
 * read. The story names only the two causes above, so this makes no claim
 * about why, and changes nothing on screen.
 */
export const CLOCK_IN_FAILED_MESSAGE = 'You couldn’t clock in. Try again.';

export const CLOCK_OUT_FAILED_MESSAGE = 'You couldn’t clock out. Try again.';

export const START_BREAK_FAILED_MESSAGE = 'Your break couldn’t start. Try again.';

export const END_BREAK_FAILED_MESSAGE = 'Your break couldn’t end. Try again.';

export type ShiftActionFailureCause = 'rejected' | 'unreachable' | 'failed';

const SHIFT_ACTION_FAILURE_MESSAGES: Readonly<
  Record<ShiftActionKind, Readonly<Record<ShiftActionFailureCause, string>>>
> = {
  clockIn: {
    rejected: CLOCK_IN_REJECTED_MESSAGE,
    unreachable: CLOCK_IN_UNREACHABLE_MESSAGE,
    failed: CLOCK_IN_FAILED_MESSAGE,
  },
  clockOut: {
    rejected: CLOCK_OUT_REJECTED_MESSAGE,
    unreachable: CLOCK_OUT_UNREACHABLE_MESSAGE,
    failed: CLOCK_OUT_FAILED_MESSAGE,
  },
  startBreak: {
    rejected: START_BREAK_REJECTED_MESSAGE,
    unreachable: START_BREAK_UNREACHABLE_MESSAGE,
    failed: START_BREAK_FAILED_MESSAGE,
  },
  endBreak: {
    rejected: END_BREAK_REJECTED_MESSAGE,
    unreachable: END_BREAK_UNREACHABLE_MESSAGE,
    failed: END_BREAK_FAILED_MESSAGE,
  },
};

/**
 * Status 0 is a request that got no response at all. 502, 503 and 504 are a
 * proxy in front of the backend saying the same thing: the store system is not
 * answering.
 */
const UNREACHABLE_STATUSES: readonly number[] = [0, 502, 503, 504];

export interface ShiftActionFailure {
  readonly cause: ShiftActionFailureCause;
  readonly message: string;

  /**
   * Whether the caller re-reads the shift status. Only a rejected transition
   * does: the server holds a status the client did not expect. An unreachable
   * backend leaves the displayed status exactly as it was.
   */
  readonly resync: boolean;
}

export function shiftActionFailureCause(error: unknown): ShiftActionFailureCause {
  if (!(error instanceof HttpErrorResponse)) {
    return 'failed';
  }

  if (error.status === 409) {
    return 'rejected';
  }

  return UNREACHABLE_STATUSES.includes(error.status) ? 'unreachable' : 'failed';
}

export function shiftActionFailure(kind: ShiftActionKind, error: unknown): ShiftActionFailure {
  const cause = shiftActionFailureCause(error);

  return {
    cause,
    message: SHIFT_ACTION_FAILURE_MESSAGES[kind][cause],
    resync: cause === 'rejected',
  };
}
