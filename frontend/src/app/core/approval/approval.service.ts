import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, defer, map, Observable, tap, throwError } from 'rxjs';

import { APPROVAL_UNCHECKED_MESSAGE, approvalFailureMessage } from './approval-messages';
import {
  ApprovalCredentials,
  Approver,
  APPROVER_ROLES,
  ApproverRole,
} from '../models/approval/approval.model';
import { AUTH_SERVICE } from '../tokens';

export interface IApprovalService {
  /**
   * Asks whether the named manager may approve a restricted action for the
   * signed-in employee right now. Resolves with the approving manager.
   *
   * Rejects with an `Error` whose message is written for the modal to show as
   * it is: one of the three sentences in `approval-messages.ts`.
   *
   * A successful check holds the credentials until the action takes them with
   * `takeCredentials()`. Starting another check, or any failed check, drops
   * whatever was held first.
   */
  check(credentials: ApprovalCredentials): Observable<Approver>;

  /**
   * Hands the credentials from the last successful check to the action that
   * submits them with its own request, and forgets them. Single-use: a second
   * call returns `null`. So does a call after the signed-in employee changed,
   * because the approval was given for someone else's request.
   */
  takeCredentials(): ApprovalCredentials | null;

  /** Forgets any held credentials without handing them over, as Cancel does. */
  discardCredentials(): void;
}

/**
 * Relative, like every endpoint this surface calls: no API base URL reaches it
 * at runtime. No department is sent. The backend scopes the check to the
 * requester's own department, read from their token.
 */
const APPROVAL_CHECK_ENDPOINT = '/v1/manager-approvals/check';

/** The `data` member of the check endpoint's `{ data, meta }` envelope. */
interface ApprovalCheckResponse {
  name: string;
  role: string;
  department: string;
}

interface ApprovalCheckEnvelope {
  data: ApprovalCheckResponse;
}

/**
 * The credentials are tied to the requester they were checked for, so a
 * terminal that changed hands before the action submitted never passes one
 * employee's approval to the next.
 */
interface HeldApproval {
  requesterId: string | null;
  credentials: ApprovalCredentials;
}

/**
 * The manager's Employee ID and PIN live in memory here, between a successful
 * check and the action submitting its own request, and nowhere else (API map,
 * technical row T7). They are never written to storage and never logged.
 */
@Injectable({
  providedIn: 'root',
})
export class ApprovalService implements IApprovalService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AUTH_SERVICE);

  /**
   * A plain field rather than a signal: nothing renders it, and a signal would
   * expose the PIN to anything that can read the service's reactive graph.
   */
  private held: HeldApproval | null = null;

  /** Only the newest check may hold credentials, whichever answer lands first. */
  private latestCheck = 0;

  check(credentials: ApprovalCredentials): Observable<Approver> {
    return defer(() => {
      const attempt = ++this.latestCheck;
      const requesterId = this.authService.currentEmployee()?.id ?? null;

      this.held = null;

      return this.http
        .post<ApprovalCheckEnvelope>(APPROVAL_CHECK_ENDPOINT, {
          employeeId: credentials.employeeId,
          pin: credentials.pin,
        })
        .pipe(
          map((envelope: ApprovalCheckEnvelope | null) => toApprover(envelope)),
          tap(() => {
            if (attempt === this.latestCheck) {
              this.held = { requesterId, credentials: { ...credentials } };
            }
          }),
          catchError((error: unknown) =>
            throwError(() => new Error(approvalFailureMessage(error))),
          ),
        );
    });
  }

  takeCredentials(): ApprovalCredentials | null {
    const held = this.held;
    const requesterId = this.authService.currentEmployee()?.id ?? null;

    this.held = null;

    return held !== null && held.requesterId === requesterId ? held.credentials : null;
  }

  discardCredentials(): void {
    this.held = null;
  }
}

/**
 * A 200 this surface cannot read approves nothing. It reads as a check that
 * was not completed, never as a refusal, because the server refused nothing.
 */
function toApprover(envelope: ApprovalCheckEnvelope | null): Approver {
  const data = envelope?.data;

  if (
    !data ||
    typeof data.name !== 'string' ||
    typeof data.department !== 'string' ||
    !isApproverRole(data.role)
  ) {
    throw new Error(APPROVAL_UNCHECKED_MESSAGE);
  }

  return { name: data.name, role: data.role, department: data.department };
}

function isApproverRole(value: unknown): value is ApproverRole {
  return typeof value === 'string' && (APPROVER_ROLES as readonly string[]).includes(value);
}
