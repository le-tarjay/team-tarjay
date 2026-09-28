import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { MyScheduleComponent } from './my-schedule';
import { routes } from '../../app.routes';
import { StubAuthService } from '../../core/auth/testing/stub-auth.service';
import { EmployeeRole } from '../../core/models/auth/employee.model';
import {
  ScheduledDayOff,
  ScheduledShift,
  WorkedShift,
} from '../../core/models/schedule/scheduled-shift.model';
import { ShiftStatus } from '../../core/models/shift/shift-status.model';
import { StubScheduleService } from '../../core/schedule/testing/stub-schedule.service';
import { StubShiftService } from '../../core/shift/testing/stub-shift.service';
import { AUTH_SERVICE, SCHEDULE_SERVICE, SHIFT_SERVICE } from '../../core/tokens';

function worked(
  date: string,
  day: string,
  start = '09:00',
  end = '17:00',
  department = 'Grocery',
): WorkedShift {
  return { date, day, department, dayOff: false, start, end };
}

function off(date: string, day: string, department = 'Grocery'): ScheduledDayOff {
  return { date, day, department, dayOff: true, start: null, end: null };
}

/**
 * The terminal's clock is stopped at 10:00 on Wednesday 23 September 2026. The
 * calendar week runs Monday 21 to Sunday 27.
 */
const NOW = new Date(2026, 8, 23, 10, 0);

/** What the endpoint sends: from six days back to two weeks ahead. */
const SCHEDULE: ScheduledShift[] = [
  worked('2026-09-17', 'Thursday'),
  worked('2026-09-18', 'Friday'),
  off('2026-09-19', 'Saturday'),
  off('2026-09-20', 'Sunday'),
  worked('2026-09-21', 'Monday', '11:00', '19:00'),
  worked('2026-09-22', 'Tuesday', '09:00', '15:00'),
  off('2026-09-23', 'Wednesday'),
  worked('2026-09-24', 'Thursday', '12:00', '20:00', 'Produce'),
  worked('2026-09-25', 'Friday', '07:00', '15:30'),
  worked('2026-09-26', 'Saturday', '09:00', '17:00'),
  off('2026-09-27', 'Sunday'),
  worked('2026-09-28', 'Monday', '11:00', '19:00'),
  worked('2026-09-29', 'Tuesday', '09:00', '15:00'),
];

describe('MyScheduleComponent', () => {
  let fixture: ComponentFixture<MyScheduleComponent>;
  let scheduleService: StubScheduleService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    await TestBed.configureTestingModule({
      imports: [MyScheduleComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
      ],
    }).compileComponents();

    scheduleService = TestBed.inject(SCHEDULE_SERVICE) as StubScheduleService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(schedule: ScheduledShift[] = SCHEDULE): HTMLElement {
    scheduleService.respondWith(schedule);

    return create();
  }

  function create(): HTMLElement {
    fixture = TestBed.createComponent(MyScheduleComponent);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  function columnHeaders(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('thead th')).map((cell) => text(cell));
  }

  function bodyRows(root: HTMLElement): string[][] {
    return Array.from(root.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => text(cell)),
    );
  }

  function weekTotal(root: HTMLElement): string | undefined {
    const total = root.querySelector('.week-hours-total');

    return total ? text(total) : undefined;
  }

  function text(element: Element): string {
    return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  describe('the week', () => {
    it('lists all seven days of the calendar week, days off included, with day, date, department and time', () => {
      const root = render();

      expect(columnHeaders(root)).toEqual(['Day', 'Date', 'Department', 'Time', 'Hours']);
      expect(bodyRows(root)).toEqual([
        ['Monday', 'Sep 21', 'Grocery', '11:00 AM – 7:00 PM', '8h'],
        ['Tuesday', 'Sep 22', 'Grocery', '9:00 AM – 3:00 PM', '6h'],
        ['Wednesday', 'Sep 23', 'Grocery', 'Off', '—'],
        ['Thursday', 'Sep 24', 'Produce', '12:00 PM – 8:00 PM', '8h'],
        ['Friday', 'Sep 25', 'Grocery', '7:00 AM – 3:30 PM', '8.5h'],
        ['Saturday', 'Sep 26', 'Grocery', '9:00 AM – 5:00 PM', '8h'],
        ['Sunday', 'Sep 27', 'Grocery', 'Off', '—'],
      ]);
    });

    it('shows "Off" for a day the schedule says nothing about', () => {
      const root = render([worked('2026-09-21', 'Monday')]);

      expect(bodyRows(root)).toHaveLength(7);
      expect(bodyRows(root)[1]).toEqual(['Tuesday', 'Sep 22', '—', 'Off', '—']);
    });

    it('states that scheduled hours do not clock the employee in', () => {
      const root = render();

      expect(root.querySelector('h1')?.textContent?.trim()).toBe('My schedule');
      expect(root.textContent).toContain(
        'Your shifts this week. Scheduled hours are informational — they don’t clock you in.',
      );
    });
  });

  describe('the week\'s total', () => {
    it('sums only this calendar week\'s worked shifts, leaving out days off', () => {
      const root = render();

      expect(root.querySelector('.week-hours-label')?.textContent?.trim()).toBe('This week');
      expect(weekTotal(root)).toBe('38.5h');
    });

    it('ignores shifts from the weeks either side', () => {
      const root = render([
        worked('2026-09-20', 'Sunday'),
        worked('2026-09-23', 'Wednesday'),
        worked('2026-09-28', 'Monday'),
      ]);

      expect(weekTotal(root)).toBe('8h');
    });

    it('reads "0h" for a week with every day off', () => {
      const root = render([]);

      expect(weekTotal(root)).toBe('0h');
      expect(bodyRows(root).every((row) => row[3] === 'Off')).toBe(true);
    });
  });

  describe('loading and failure', () => {
    it('shows the table\'s loading row and no total while the schedule is being read', () => {
      scheduleService.hang();

      const root = create();

      expect(bodyRows(root)).toEqual([['Loading...']]);
      expect(weekTotal(root)).toBeUndefined();
    });

    it('shows a plain failure message, and neither table nor total, when the schedule cannot be read', () => {
      scheduleService.fail();

      const root = create();

      expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Your schedule could not be loaded.',
      );
      expect(root.querySelector('table')).toBeNull();
      expect(weekTotal(root)).toBeUndefined();
    });
  });
});

/**
 * The real route table, behind the real gate, for every shift state. My
 * Schedule reads no shift status, so nothing about the shift may keep an
 * employee from it.
 */
describe('reaching My Schedule', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;

  /**
   * The harness's own component check reads the top-level routed component,
   * which is the shell, so this asserts on the URL and the screen instead.
   */
  async function open(url: string): Promise<Element | null> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);

    expect(TestBed.inject(Router).url).toBe(url);

    return harness.routeNativeElement?.querySelector('app-my-schedule') ?? null;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: AUTH_SERVICE, useClass: StubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    (TestBed.inject(SCHEDULE_SERVICE) as StubScheduleService).respondWith(SCHEDULE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<ShiftStatus>(['OnBreak', 'OffShift', 'OnShift'])(
    'opens directly at /schedule when the employee is %s',
    async (status) => {
      authService.signIn();
      shiftService.report(status);

      const screen = await open('/schedule');

      expect(screen).not.toBeNull();
      expect(screen?.querySelectorAll('tbody tr')).toHaveLength(7);
    },
  );

  it('opens directly at /schedule before the first shift-status read has landed', async () => {
    authService.signIn();
    shiftService.clear();

    expect(await open('/schedule')).not.toBeNull();
  });

  it.each<EmployeeRole>(['Associate', 'DepartmentManager', 'StoreManager', 'ReceivingAssociate'])(
    'lets a %s through the route gate',
    async (role) => {
      authService.signIn({
        id: 'e-1',
        name: 'Avery Brooks',
        role,
        department: 'Grocery',
        jobFunction: 'Sales Floor',
      });
      shiftService.report('OnBreak');

      expect(await open('/schedule')).not.toBeNull();
    },
  );
});
