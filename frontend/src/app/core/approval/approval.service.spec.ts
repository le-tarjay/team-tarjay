import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { vi } from 'vitest';

import {
  APPROVAL_NOT_ELIGIBLE_MESSAGE,
  APPROVAL_NOT_RECOGNIZED_MESSAGE,
  APPROVAL_UNCHECKED_MESSAGE,
} from './approval-messages';
import { ApprovalService } from './approval.service';
import { StubAuthService } from '../auth/testing/stub-auth.service';
import { Employee } from '../models/auth/employee.model';
import { ApprovalCredentials, Approver } from '../models/approval/approval.model';
import { AUTH_SERVICE } from '../tokens';

const CHECK_URL = '/v1/manager-approvals/check';

/** Distinctive on purpose, so a leak into a log line or a message is unmistakable. */
const CREDENTIALS: ApprovalCredentials = { employeeId: '10042', pin: '4826' };

const OTHER_CREDENTIALS: ApprovalCredentials = { employeeId: '10043', pin: '7391' };

const NEXT_EMPLOYEE: Employee = {
  id: '10047',
  name: 'Jamie Ortiz',
  role: 'Associate',
  department: 'Electronics',
  jobFunction: 'Stocking',
};

/** What `ManagerApprovalCheckResponse` serializes, inside its `{ data, meta }` envelope. */
function approved(approver: Approver) {
  return { data: approver, meta: {} };
}

const DEPARTMENT_MANAGER: Approver = {
  name: 'Sam Rivera',
  role: 'DepartmentManager',
  department: 'Grocery',
};

const STORE_MANAGER: Approver = {
  name: 'Alex Mercer',
  role: 'StoreManager',
  department: 'Store Operations',
};

/** The problem-details body `ApprovalExceptionHandler` writes for each refusal. */
function refusal(reason: 'NotRecognized' | 'NotEligible' | 'Unavailable', status: number) {
  return {
    type: 'https://tools.ietf.org/html/rfc4918#section-11.2',
    title: 'The approving manager was refused.',
    status,
    detail: 'Fixed text from the approval aggregate.',
    instance: CHECK_URL,
    reason,
  };
}

interface Outcome {
  approver: Approver | null;
  message: string | null;
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let authService: StubAuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
      ],
    });

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ApprovalService);
    authService.signIn();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Starts a check and records how it settles. */
  function check(credentials: ApprovalCredentials = CREDENTIALS): {
    outcome: Outcome;
    subscription: Subscription;
  } {
    const outcome: Outcome = { approver: null, message: null };
    const subscription = service.check(credentials).subscribe({
      next: (approver) => (outcome.approver = approver),
      error: (error: unknown) => (outcome.message = (error as Error).message),
    });

    return { outcome, subscription };
  }

  function expectCheck(): TestRequest {
    const request = httpMock.expectOne(CHECK_URL);

    expect(request.request.method).toBe('POST');

    return request;
  }

  function checkAndFlush(
    body: Parameters<TestRequest['flush']>[0],
    init?: { status: number; statusText: string },
    credentials: ApprovalCredentials = CREDENTIALS,
  ): Outcome {
    const { outcome } = check(credentials);

    expectCheck().flush(body, init);

    return outcome;
  }

  function checkAndFailToConnect(): Outcome {
    const { outcome } = check();

    expectCheck().error(new ProgressEvent('error'));

    return outcome;
  }

  describe('the request', () => {
    it("posts the manager's Employee ID and PIN to the check endpoint, and nothing else", () => {
      check();

      const request = expectCheck();

      expect(request.request.body).toEqual({ employeeId: '10042', pin: '4826' });

      request.flush(approved(DEPARTMENT_MANAGER));
    });

    it("sends no department, because the backend scopes the check from the requester's token", () => {
      check();

      const request = expectCheck();

      expect(Object.keys(request.request.body as object)).not.toContain('department');

      request.flush(approved(DEPARTMENT_MANAGER));
    });

    it('makes no request until something subscribes', () => {
      service.check(CREDENTIALS);

      httpMock.expectNone(CHECK_URL);
    });
  });

  describe('a check that approves (criterion 1)', () => {
    it.each([
      ['a Department Manager', DEPARTMENT_MANAGER],
      ['a Store Manager', STORE_MANAGER],
    ])('resolves with the name, tier and department of %s', (_who, approver) => {
      const outcome = checkAndFlush(approved(approver));

      expect(outcome.approver).toEqual(approver);
      expect(outcome.message).toBeNull();
    });
  });

  describe('a check the backend refuses', () => {
    it('rejects with "That PIN wasn\'t recognized" for unrecognized credentials (criterion 2)', () => {
      const outcome = checkAndFlush(refusal('NotRecognized', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });

      expect(outcome.message).toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);
      expect(outcome.message).toBe("That PIN wasn't recognized.");
      expect(outcome.approver).toBeNull();
    });

    it('rejects with "can\'t approve this right now" for an ineligible manager (criterion 3)', () => {
      const outcome = checkAndFlush(refusal('NotEligible', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });

      expect(outcome.message).toBe(APPROVAL_NOT_ELIGIBLE_MESSAGE);
      expect(outcome.message).toContain("can't approve this right now");
      expect(outcome.approver).toBeNull();
    });

    it('tells an ineligible manager apart from unrecognized credentials, though both are 422 (criterion 3)', () => {
      const unrecognized = checkAndFlush(refusal('NotRecognized', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      const ineligible = checkAndFlush(refusal('NotEligible', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });

      expect(ineligible.message).not.toBe(unrecognized.message);
    });
  });

  describe('a check that could not be completed (criterion 4)', () => {
    it('rejects with "couldn\'t be checked right now" when the backend answers 503', () => {
      const outcome = checkAndFlush(refusal('Unavailable', 503), {
        status: 503,
        statusText: 'Service Unavailable',
      });

      expect(outcome.message).toBe(APPROVAL_UNCHECKED_MESSAGE);
      expect(outcome.message).toContain("couldn't be checked right now");
    });

    it('rejects with "couldn\'t be checked right now" when the backend cannot be reached at all', () => {
      const outcome = checkAndFailToConnect();

      expect(outcome.message).toBe(APPROVAL_UNCHECKED_MESSAGE);
    });

    it('never reads a network failure or a 503 as unrecognized credentials', () => {
      const unreachable = checkAndFailToConnect();
      const unavailable = checkAndFlush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(unreachable.message).not.toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);
      expect(unavailable.message).not.toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);
    });

    it.each([
      [500, 'Internal Server Error'],
      [502, 'Bad Gateway'],
      [504, 'Gateway Timeout'],
      [401, 'Unauthorized'],
    ])('rejects with "couldn\'t be checked" for a %i', (status, statusText) => {
      const outcome = checkAndFlush(null, { status, statusText });

      expect(outcome.message).toBe(APPROVAL_UNCHECKED_MESSAGE);
    });

    it('rejects with "couldn\'t be checked" for a 422 validation body that names no refusal', () => {
      const outcome = checkAndFlush(
        { status: 422, errors: { pin: ["The approving manager's PIN is required."] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(outcome.message).toBe(APPROVAL_UNCHECKED_MESSAGE);
    });

    it.each([
      { body: null, why: 'an empty body' },
      {
        body: { data: { ...DEPARTMENT_MANAGER, role: 'Associate' }, meta: {} },
        why: 'a tier that cannot approve',
      },
      {
        body: { data: { role: 'StoreManager', department: 'Store Operations' }, meta: {} },
        why: 'no name',
      },
      {
        body: { data: { name: 'Sam Rivera', role: 'DepartmentManager' }, meta: {} },
        why: 'no department',
      },
    ])(
      'rejects with "couldn\'t be checked", and approves nothing, for a 200 with $why',
      ({ body }) => {
        const outcome = checkAndFlush(body);

        expect(outcome.approver).toBeNull();
        expect(outcome.message).toBe(APPROVAL_UNCHECKED_MESSAGE);
        expect(service.takeCredentials()).toBeNull();
      },
    );
  });

  describe('holding the credentials for the action', () => {
    it('holds the checked ID and PIN after an approval, for the action to take', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      expect(service.takeCredentials()).toEqual(CREDENTIALS);
    });

    it('hands them over once only', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      service.takeCredentials();

      expect(service.takeCredentials()).toBeNull();
    });

    it('holds nothing before any check', () => {
      expect(service.takeCredentials()).toBeNull();
    });

    it('holds nothing while a check is still in flight', () => {
      check();

      const request = expectCheck();

      expect(service.takeCredentials()).toBeNull();

      request.flush(approved(DEPARTMENT_MANAGER));
    });

    it.each([
      ['unrecognized credentials', refusal('NotRecognized', 422), 422],
      ['an ineligible manager', refusal('NotEligible', 422), 422],
      ['an unavailable identity provider', refusal('Unavailable', 503), 503],
    ])('holds nothing after a refusal for %s', (_why, body, status) => {
      checkAndFlush(body, { status, statusText: 'Refused' });

      expect(service.takeCredentials()).toBeNull();
    });

    it('drops an earlier approval as soon as another check starts', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      check(OTHER_CREDENTIALS);

      const request = expectCheck();

      expect(service.takeCredentials()).toBeNull();

      request.flush(refusal('NotRecognized', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
    });

    it("holds only the newest check's credentials when an older answer lands last", () => {
      check(CREDENTIALS);
      check(OTHER_CREDENTIALS);

      const [older, newer] = httpMock.match(CHECK_URL);

      newer.flush(approved(STORE_MANAGER));
      older.flush(approved(DEPARTMENT_MANAGER));

      expect(service.takeCredentials()).toEqual(OTHER_CREDENTIALS);
    });

    it('forgets them on discard, as Cancel does', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      service.discardCredentials();

      expect(service.takeCredentials()).toBeNull();
    });

    it('hands nothing over once the signed-in employee has changed', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      authService.logout();
      authService.signIn(NEXT_EMPLOYEE);

      expect(service.takeCredentials()).toBeNull();
    });

    it('hands nothing over once the requester has signed out', () => {
      checkAndFlush(approved(DEPARTMENT_MANAGER));

      authService.logout();

      expect(service.takeCredentials()).toBeNull();
    });

    it('holds a copy, so a caller changing its own object afterwards changes nothing held', () => {
      const typed: ApprovalCredentials = { ...CREDENTIALS };

      checkAndFlush(approved(DEPARTMENT_MANAGER), undefined, typed);
      typed.pin = '0000';

      expect(service.takeCredentials()).toEqual(CREDENTIALS);
    });
  });

  describe('logging', () => {
    const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('writes the Employee ID and PIN to no log call, on any path through the service', () => {
      const spies = CONSOLE_METHODS.map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );

      checkAndFlush(approved(DEPARTMENT_MANAGER));
      service.takeCredentials();
      checkAndFlush(refusal('NotRecognized', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      checkAndFlush(refusal('NotEligible', 422), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      checkAndFlush(refusal('Unavailable', 503), {
        status: 503,
        statusText: 'Service Unavailable',
      });
      checkAndFlush(null, { status: 500, statusText: 'Internal Server Error' });
      checkAndFlush(null);
      checkAndFailToConnect();
      checkAndFlush(approved(DEPARTMENT_MANAGER));
      service.discardCredentials();

      const logged = spies.flatMap((spy) => spy.mock.calls.flat()).map((arg) => String(arg));

      for (const line of logged) {
        expect(line).not.toContain(CREDENTIALS.employeeId);
        expect(line).not.toContain(CREDENTIALS.pin);
      }
    });

    it('carries neither the Employee ID nor the PIN in any rejection it raises', () => {
      const messages = [
        checkAndFlush(refusal('NotRecognized', 422), {
          status: 422,
          statusText: 'Unprocessable Entity',
        }),
        checkAndFlush(refusal('NotEligible', 422), {
          status: 422,
          statusText: 'Unprocessable Entity',
        }),
        checkAndFlush(refusal('Unavailable', 503), {
          status: 503,
          statusText: 'Service Unavailable',
        }),
        checkAndFailToConnect(),
        checkAndFlush(null),
      ].map((outcome) => outcome.message ?? '');

      for (const message of messages) {
        expect(message).not.toContain(CREDENTIALS.employeeId);
        expect(message).not.toContain(CREDENTIALS.pin);
      }
    });
  });
});
