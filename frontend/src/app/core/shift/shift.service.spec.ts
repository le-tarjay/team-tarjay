import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { ShiftService, UNREADABLE_SHIFT_MESSAGE } from './shift.service';
import { SIGNED_IN_EMPLOYEE, StubAuthService } from '../auth/testing/stub-auth.service';
import { Employee } from '../models/auth/employee.model';
import { ShiftState, ShiftStatus } from '../models/shift/shift-status.model';
import { AUTH_SERVICE } from '../tokens';

const SHIFT_URL = '/v1/employees/me/shift';

const SECOND_EMPLOYEE: Employee = {
  id: '10044',
  name: 'Jordan Lee',
  role: 'DepartmentManager',
  department: 'Electronics',
  jobFunction: 'Sales Floor',
};

/** What the backend's `ShiftStatusResponse` serializes, inside its `{ data, meta }` envelope. */
function envelope(status: ShiftStatus) {
  return { data: { status, onDuty: status === 'OnShift' }, meta: {} };
}

function state(status: ShiftStatus): ShiftState {
  return { status, onDuty: status === 'OnShift' };
}

/**
 * The 409 body `AttendanceExceptionHandler` writes: a standalone
 * `ProblemDetails`, with the status the server still holds as an extension.
 */
function rejection(currentStatus: ShiftStatus) {
  return {
    status: 409,
    title: 'The shift action was rejected.',
    detail: 'You are already on the clock.',
    shiftStatus: currentStatus,
  };
}

describe('ShiftService', () => {
  let service: ShiftService;
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
    service = TestBed.inject(ShiftService);
    TestBed.tick();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** A sign-in, and the effect that notices it — which is what issues the read. */
  function signIn(employee: Employee = SIGNED_IN_EMPLOYEE): void {
    authService.signIn(employee);
    TestBed.tick();
  }

  function expectShiftRead(): TestRequest {
    const request = httpMock.expectOne(SHIFT_URL);

    expect(request.request.method).toBe('GET');

    return request;
  }

  function signInAs(status: ShiftStatus, employee: Employee = SIGNED_IN_EMPLOYEE): void {
    signIn(employee);
    expectShiftRead().flush(envelope(status));
  }

  function failRead(request: TestRequest): void {
    request.flush(null, { status: 503, statusText: 'Service Unavailable' });
  }

  describe('before anything is read', () => {
    it('holds no status and makes no request while nobody is signed in', () => {
      expect(service.currentShift()).toBeNull();
      httpMock.expectNone(SHIFT_URL);
    });

    it('holds no status between sign-in and the first read landing, rather than off shift', () => {
      signIn();

      const request = expectShiftRead();

      expect(service.currentShift()).toBeNull();

      request.flush(envelope('OffShift'));
    });
  });

  describe('the read at sign-in', () => {
    it.each<ShiftStatus>(['OffShift', 'OnShift', 'OnBreak'])(
      'holds %s when that is what the server reports',
      (status) => {
        signInAs(status);

        expect(service.currentShift()).toEqual(state(status));
      },
    );

    it('carries the server\'s own on-duty fact rather than deriving one', () => {
      signIn();
      expectShiftRead().flush({ data: { status: 'OnShift', onDuty: true }, meta: {} });

      expect(service.currentShift()?.onDuty).toBe(true);
    });

    it('leaves status unset, not off shift, when the first read fails', () => {
      signIn();
      failRead(expectShiftRead());

      expect(service.currentShift()).toBeNull();
    });

    it('leaves status unset when the backend cannot be reached at all', () => {
      signIn();
      expectShiftRead().error(new ProgressEvent('error'));

      expect(service.currentShift()).toBeNull();
    });

    it.each([
      { body: null, why: 'an empty body' },
      { body: { data: { status: 'Clocked', onDuty: true }, meta: {} }, why: 'an unknown status' },
      { body: { data: { status: 'OnShift' }, meta: {} }, why: 'no on-duty fact' },
    ])('leaves status unset for $why', ({ body }) => {
      signIn();
      expectShiftRead().flush(body);

      expect(service.currentShift()).toBeNull();
    });

    it('reads again when the same employee signs back in, clearing the old value first', () => {
      signInAs('OnShift');
      authService.logout();
      TestBed.tick();

      signIn();

      const request = expectShiftRead();

      expect(service.currentShift()).toBeNull();

      request.flush(envelope('OnBreak'));

      expect(service.currentShift()).toEqual(state('OnBreak'));
    });
  });

  describe('logging out', () => {
    it('does not trigger a further shift-status read', () => {
      signInAs('OnShift');

      authService.logout();
      TestBed.tick();

      httpMock.expectNone(SHIFT_URL);
    });

    it('exposes no status once nobody is signed in', () => {
      signInAs('OnShift');

      authService.logout();
      TestBed.tick();

      expect(service.currentShift()).toBeNull();
    });
  });

  describe('a different employee at the same terminal', () => {
    it('shows that employee\'s own status, not the previous employee\'s', () => {
      signInAs('OnShift');
      authService.logout();
      TestBed.tick();

      signIn(SECOND_EMPLOYEE);

      const request = expectShiftRead();

      expect(service.currentShift()).toBeNull();

      request.flush(envelope('OffShift'));

      expect(service.currentShift()).toEqual(state('OffShift'));
    });

    it('drops the previous employee\'s read if it lands after the terminal changed hands', () => {
      signIn();
      const firstRead = expectShiftRead();

      authService.logout();
      signIn(SECOND_EMPLOYEE);
      const secondRead = expectShiftRead();

      // The first read was superseded by the second employee's sign-in.
      expect(firstRead.cancelled).toBe(true);

      secondRead.flush(envelope('OffShift'));

      expect(service.currentShift()).toEqual(state('OffShift'));
    });

    it('drops a transition response that lands after the terminal changed hands', () => {
      signInAs('OffShift');

      let result: ShiftState | undefined;
      service.clockIn().subscribe((value) => (result = value));
      const clockIn = httpMock.expectOne('/v1/employees/me/clock-in');

      authService.logout();
      signInAs('OffShift', SECOND_EMPLOYEE);

      clockIn.flush(envelope('OnShift'));

      // The caller still hears the answer to the call it made...
      expect(result).toEqual(state('OnShift'));
      // ...but the second employee is not shown the first one's shift.
      expect(service.currentShift()).toEqual(state('OffShift'));
    });
  });

  describe('transitions', () => {
    const TRANSITIONS: readonly {
      name: string;
      call: (shift: ShiftService) => Observable<ShiftState>;
      url: string;
      from: ShiftStatus;
      to: ShiftStatus;
    }[] = [
      {
        name: 'clock-in',
        call: (s) => s.clockIn(),
        url: '/v1/employees/me/clock-in',
        from: 'OffShift',
        to: 'OnShift',
      },
      {
        name: 'clock-out',
        call: (s) => s.clockOut(),
        url: '/v1/employees/me/clock-out',
        from: 'OnShift',
        to: 'OffShift',
      },
      {
        name: 'start-break',
        call: (s) => s.startBreak(),
        url: '/v1/employees/me/start-break',
        from: 'OnShift',
        to: 'OnBreak',
      },
      {
        name: 'end-break',
        call: (s) => s.endBreak(),
        url: '/v1/employees/me/end-break',
        from: 'OnBreak',
        to: 'OnShift',
      },
    ];

    it.each(TRANSITIONS)('$name posts to its me-scoped endpoint', ({ call, url, from, to }) => {
      signInAs(from);

      call(service).subscribe();

      const request = httpMock.expectOne(url);

      expect(request.request.method).toBe('POST');

      request.flush(envelope(to));
    });

    it.each(TRANSITIONS)(
      'takes the held status from the $name response, not an optimistic guess',
      ({ call, url, from, to }) => {
        signInAs(from);

        call(service).subscribe();

        const request = httpMock.expectOne(url);

        // Nothing changes while the call is in flight.
        expect(service.currentShift()).toEqual(state(from));

        request.flush(envelope(to));

        expect(service.currentShift()).toEqual(state(to));
      },
    );

    it('holds what the server returned, even where it differs from what the action implies', () => {
      signInAs('OffShift');

      service.clockIn().subscribe();
      httpMock.expectOne('/v1/employees/me/clock-in').flush(envelope('OnBreak'));

      expect(service.currentShift()).toEqual(state('OnBreak'));
    });

    it('becomes on shift after a clock-in response, even when nothing was held before', () => {
      signIn();
      failRead(expectShiftRead());

      expect(service.currentShift()).toBeNull();

      service.clockIn().subscribe();
      httpMock.expectOne('/v1/employees/me/clock-in').flush(envelope('OnShift'));

      expect(service.currentShift()).toEqual(state('OnShift'));
    });

    it('resolves the caller with the state the server returned', () => {
      signInAs('OffShift');

      let result: ShiftState | undefined;
      service.clockIn().subscribe((value) => (result = value));
      httpMock.expectOne('/v1/employees/me/clock-in').flush(envelope('OnShift'));

      expect(result).toEqual(state('OnShift'));
    });

    it('supersedes a read still in flight, so an older answer cannot land on top of it', () => {
      signInAs('OffShift');

      service.refresh();
      const staleRead = expectShiftRead();

      service.clockIn().subscribe();
      httpMock.expectOne('/v1/employees/me/clock-in').flush(envelope('OnShift'));

      expect(staleRead.cancelled).toBe(true);
      expect(service.currentShift()).toEqual(state('OnShift'));
    });

    it('leaves the held status unchanged on a rejected (409) transition', () => {
      signInAs('OnShift');

      let failure: unknown;
      service.clockIn().subscribe({ error: (error: unknown) => (failure = error) });
      httpMock
        .expectOne('/v1/employees/me/clock-in')
        .flush(rejection('OnShift'), { status: 409, statusText: 'Conflict' });

      expect(service.currentShift()).toEqual(state('OnShift'));
      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect((failure as HttpErrorResponse).status).toBe(409);
    });

    it('leaves the held status unchanged when the backend cannot be reached', () => {
      signInAs('OnShift');

      let failure: unknown;
      service.startBreak().subscribe({ error: (error: unknown) => (failure = error) });
      httpMock.expectOne('/v1/employees/me/start-break').error(new ProgressEvent('error'));

      expect(service.currentShift()).toEqual(state('OnShift'));
      expect((failure as HttpErrorResponse).status).toBe(0);
    });

    it('leaves the held status unchanged when a success response is unreadable', () => {
      signInAs('OnShift');

      let failure: unknown;
      service.clockOut().subscribe({ error: (error: unknown) => (failure = error) });
      httpMock.expectOne('/v1/employees/me/clock-out').flush({ data: null, meta: {} });

      expect(service.currentShift()).toEqual(state('OnShift'));
      expect((failure as Error).message).toBe(UNREADABLE_SHIFT_MESSAGE);
    });

    it('makes no request until the caller subscribes', () => {
      signInAs('OffShift');

      service.clockIn();

      httpMock.expectNone('/v1/employees/me/clock-in');
    });
  });

  describe('refresh', () => {
    it('overwrites a stale held value with a fresh server read', () => {
      signInAs('OnShift');

      service.refresh();
      expectShiftRead().flush(envelope('OnBreak'));

      expect(service.currentShift()).toEqual(state('OnBreak'));
    });

    it('keeps the current value on screen while the re-read is in flight', () => {
      signInAs('OnShift');

      service.refresh();
      const request = expectShiftRead();

      expect(service.currentShift()).toEqual(state('OnShift'));

      request.flush(envelope('OffShift'));

      expect(service.currentShift()).toEqual(state('OffShift'));
    });

    it('resyncs to the server after a rejected transition', () => {
      signInAs('OffShift');

      service.clockIn().subscribe({ error: () => service.refresh() });
      httpMock
        .expectOne('/v1/employees/me/clock-in')
        .flush(rejection('OnShift'), { status: 409, statusText: 'Conflict' });

      expectShiftRead().flush(envelope('OnShift'));

      expect(service.currentShift()).toEqual(state('OnShift'));
    });

    it('clears the held value rather than keeping a stale one when the re-read fails', () => {
      signInAs('OnShift');

      service.refresh();
      failRead(expectShiftRead());

      expect(service.currentShift()).toBeNull();
    });

    it('lets only the newest of two overlapping refreshes land', () => {
      signInAs('OffShift');

      service.refresh();
      const first = expectShiftRead();
      service.refresh();
      const second = expectShiftRead();

      expect(first.cancelled).toBe(true);

      second.flush(envelope('OnShift'));

      expect(service.currentShift()).toEqual(state('OnShift'));
    });

    it('reads nothing while nobody is signed in', () => {
      service.refresh();

      httpMock.expectNone(SHIFT_URL);
    });
  });
});
