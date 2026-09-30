import { HttpErrorResponse } from '@angular/common/http';

import * as authServiceModule from '../auth/auth.service';
import * as shiftActionMessages from './shift-action-messages';
import {
  CLOCK_IN_REJECTED_MESSAGE,
  CLOCK_IN_UNREACHABLE_MESSAGE,
  shiftActionFailure,
  shiftActionFailureCause,
} from './shift-action-messages';
import { ShiftActionKind } from './shift-actions';

const KINDS: readonly ShiftActionKind[] = ['clockIn', 'clockOut', 'startBreak', 'endBreak'];

function httpError(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'Error', url: '/v1/employees/me/clock-in' });
}

/** Every string constant the module exports, i.e. every sentence it can show. */
function exportedMessages(module: Record<string, unknown>): string[] {
  return Object.values(module).filter((value): value is string => typeof value === 'string');
}

describe('shiftActionFailureCause', () => {
  it('reads a 409 as a rejected transition', () => {
    expect(shiftActionFailureCause(httpError(409))).toBe('rejected');
  });

  it('reads no response at all (status 0) as an unreachable backend', () => {
    expect(shiftActionFailureCause(httpError(0))).toBe('unreachable');
  });

  it.each([502, 503, 504])('reads a %i from a proxy as an unreachable backend', (status) => {
    expect(shiftActionFailureCause(httpError(status))).toBe('unreachable');
  });

  it.each([400, 401, 500])('makes no claim about a %i beyond "failed"', (status) => {
    expect(shiftActionFailureCause(httpError(status))).toBe('failed');
  });

  it('makes no claim about a failure that is not an HTTP error, such as an unreadable body', () => {
    expect(shiftActionFailureCause(new Error('Your shift status could not be read.'))).toBe(
      'failed',
    );
  });
});

describe('shiftActionFailure', () => {
  it.each(KINDS)('asks for a re-read after a 409 from %s', (kind) => {
    expect(shiftActionFailure(kind, httpError(409)).resync).toBe(true);
  });

  it.each(KINDS)('asks for no re-read when the backend is unreachable from %s', (kind) => {
    expect(shiftActionFailure(kind, httpError(0)).resync).toBe(false);
  });

  it.each(KINDS)('asks for no re-read after any other failure from %s', (kind) => {
    expect(shiftActionFailure(kind, httpError(500)).resync).toBe(false);
  });

  it('shows the clock-in rejection and clock-in try-again sentences for clock-in', () => {
    expect(shiftActionFailure('clockIn', httpError(409)).message).toBe(CLOCK_IN_REJECTED_MESSAGE);
    expect(shiftActionFailure('clockIn', httpError(0)).message).toBe(CLOCK_IN_UNREACHABLE_MESSAGE);
  });

  it.each(KINDS)(
    'gives %s a different sentence for a 409 than for an unreachable backend',
    (kind) => {
      const rejected = shiftActionFailure(kind, httpError(409)).message;
      const unreachable = shiftActionFailure(kind, httpError(0)).message;
      const failed = shiftActionFailure(kind, httpError(500)).message;

      expect(new Set([rejected, unreachable, failed]).size).toBe(3);
    },
  );

  it('asks the employee to try again when the backend is unreachable', () => {
    for (const kind of KINDS) {
      expect(shiftActionFailure(kind, httpError(0)).message).toMatch(/try again\.$/i);
    }
  });

  it.each([
    ['a 409', 409],
    ['an unreachable backend', 0],
    ['any other failure', 500],
  ])('gives each of the four actions its own sentence for %s', (_cause, status) => {
    const messages = KINDS.map((kind) => shiftActionFailure(kind, httpError(status)).message);

    expect(new Set(messages).size).toBe(KINDS.length);
  });
});

describe('where the shift-action messages live', () => {
  it('exports every sentence from this module, beside the shift-status service', () => {
    const shown = KINDS.flatMap((kind) =>
      [409, 0, 500].map((status) => shiftActionFailure(kind, httpError(status)).message),
    );

    expect(exportedMessages(shiftActionMessages)).toEqual(expect.arrayContaining(shown));
  });

  it('adds none of them to the sign-in messages in the auth service', () => {
    const authMessages = exportedMessages(authServiceModule);

    for (const message of exportedMessages(shiftActionMessages)) {
      expect(authMessages).not.toContain(message);
    }
  });
});
