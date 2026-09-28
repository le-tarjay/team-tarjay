import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ScheduleService, UNREADABLE_SCHEDULE_MESSAGE } from './schedule.service';
import { ScheduledShift } from '../models/schedule/scheduled-shift.model';

const SHIFTS_URL = '/v1/employees/me/shifts';

/** What the backend's `ScheduledShiftResponse` list serializes, inside its `{ data, meta }` envelope. */
const WIRE_SHIFTS = [
  {
    date: '2026-09-23',
    day: 'Wednesday',
    department: 'Grocery',
    dayOff: true,
    start: null,
    end: null,
  },
  {
    date: '2026-09-24',
    day: 'Thursday',
    department: 'Grocery',
    dayOff: false,
    start: '12:00',
    end: '20:00',
  },
];

describe('ScheduleService', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function read(): { shifts: ScheduledShift[] | null; error: unknown } {
    const result: { shifts: ScheduledShift[] | null; error: unknown } = {
      shifts: null,
      error: null,
    };

    service.list().subscribe({
      next: (shifts) => (result.shifts = shifts),
      error: (error: unknown) => (result.error = error),
    });

    return result;
  }

  it('reads the signed-in employee\'s own schedule from the me-scoped shifts endpoint', () => {
    read();

    const request = httpMock.expectOne(SHIFTS_URL);

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);

    request.flush({ data: [], meta: {} });
  });

  it('returns every day the server sends, in the order it sent them', () => {
    const result = read();

    httpMock.expectOne(SHIFTS_URL).flush({ data: WIRE_SHIFTS, meta: {} });

    expect(result.shifts).toEqual(WIRE_SHIFTS);
  });

  it('keeps a day off distinct from a worked shift, with no time range', () => {
    const result = read();

    httpMock.expectOne(SHIFTS_URL).flush({ data: WIRE_SHIFTS, meta: {} });

    const [dayOff, worked] = result.shifts ?? [];

    expect(dayOff).toEqual(expect.objectContaining({ dayOff: true, start: null, end: null }));
    expect(worked).toEqual(expect.objectContaining({ dayOff: false, start: '12:00', end: '20:00' }));
  });

  it('fails rather than passing on a body that is not a schedule', () => {
    const result = read();

    httpMock.expectOne(SHIFTS_URL).flush({ data: { unexpected: true }, meta: {} });

    expect(result.shifts).toBeNull();
    expect(result.error).toEqual(new Error(UNREADABLE_SCHEDULE_MESSAGE));
  });

  it('fails rather than passing on a worked shift with no time range', () => {
    const result = read();

    httpMock.expectOne(SHIFTS_URL).flush({
      data: [{ ...WIRE_SHIFTS[1], start: null }],
      meta: {},
    });

    expect(result.error).toEqual(new Error(UNREADABLE_SCHEDULE_MESSAGE));
  });

  it('passes an HTTP failure on to the caller', () => {
    const result = read();

    httpMock
      .expectOne(SHIFTS_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(result.shifts).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
