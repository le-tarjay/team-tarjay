import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { HomeComponent } from './home';
import { StubAuthService } from '../../core/auth/testing/stub-auth.service';
import {
  ScheduledDayOff,
  ScheduledShift,
  WorkedShift,
} from '../../core/models/schedule/scheduled-shift.model';
import { StubScheduleService } from '../../core/schedule/testing/stub-schedule.service';
import { StubShiftService } from '../../core/shift/testing/stub-shift.service';
import { AUTH_SERVICE, SCHEDULE_SERVICE, SHIFT_SERVICE } from '../../core/tokens';

@Component({ selector: 'app-destination', template: '' })
class DestinationComponent {}

function worked(date: string, day: string, start = '09:00', end = '17:00'): WorkedShift {
  return { date, day, department: 'Grocery', dayOff: false, start, end };
}

function off(date: string, day: string): ScheduledDayOff {
  return { date, day, department: 'Grocery', dayOff: true, start: null, end: null };
}

/**
 * The terminal's clock is stopped at 10:00 on Wednesday 23 September 2026. The
 * calendar week ends on Sunday 27; Monday 28 is next week.
 */
const NOW = new Date(2026, 8, 23, 10, 0);

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let authService: StubAuthService;
  let shiftService: StubShiftService;
  let scheduleService: StubScheduleService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'schedule', component: DestinationComponent },
          { path: 'sale', component: DestinationComponent },
        ]),
        { provide: AUTH_SERVICE, useClass: StubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    scheduleService = TestBed.inject(SCHEDULE_SERVICE) as StubScheduleService;

    authService.signIn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Creates Home once the stubs say what the server would have answered. */
  function render(schedule: ScheduledShift[] = []): HTMLElement {
    scheduleService.respondWith(schedule);
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  function heroHeading(root: HTMLElement): string | undefined {
    return root.querySelector('h1')?.textContent?.trim();
  }

  function heroExplanation(root: HTMLElement): string | undefined {
    return root.querySelector('.home-hero-explanation')?.textContent?.trim();
  }

  function buttons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll('button'));
  }

  function button(root: HTMLElement, name: string): HTMLButtonElement | undefined {
    return buttons(root).find((candidate) => candidate.textContent?.trim() === name);
  }

  /**
   * Each row's cells, in reading order, one space apart. Angular drops the
   * whitespace between elements, so the row's own `textContent` runs together.
   */
  function previewRows(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('.home-shift')).map((row) =>
      Array.from(row.querySelectorAll('div'))
        .filter((cell) => cell.children.length === 0)
        .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join(' '),
    );
  }

  describe('status hero', () => {
    it('explains off shift and offers "Clock in" when the server reports off shift', () => {
      shiftService.report('OffShift');

      const root = render();

      expect(heroHeading(root)).toBe('Welcome, Alex');
      expect(heroExplanation(root)).toBe(
        'You’re signed in but not on the clock. Clock in to start your shift and unlock your work tools.',
      );
      expect(root.querySelector('.home-status-pill')?.textContent?.trim()).toBe('Not on the clock');
      expect(buttons(root).map((b) => b.textContent?.trim())).toEqual(['Clock in']);
    });

    it('explains the break and offers "End break" when the server reports on break', () => {
      shiftService.report('OnBreak');

      const root = render();

      expect(heroHeading(root)).toBe('You’re on break, Alex');
      expect(heroExplanation(root)).toBe(
        'Your shift is still active. End your break to return to your work tools.',
      );
      expect(root.querySelector('.home-status-pill')?.textContent?.trim()).toBe('On break');
      expect(buttons(root).map((b) => b.textContent?.trim())).toEqual(['End break']);
    });

    it('follows the shift as it changes, without reloading the screen', () => {
      shiftService.report('OffShift');
      const root = render();

      shiftService.report('OnBreak');
      fixture.detectChanges();

      expect(heroHeading(root)).toBe('You’re on break, Alex');
      expect(button(root, 'End break')).toBeDefined();
      expect(button(root, 'Clock in')).toBeUndefined();
    });

    it('shows no hero and no action before the first shift-status read lands', () => {
      shiftService.clear();

      const root = render();

      expect(root.querySelector('.home-hero')).toBeNull();
      expect(buttons(root)).toEqual([]);
    });

    it('shows no hero and no action while on shift', () => {
      shiftService.report('OnShift');

      const root = render();

      expect(root.querySelector('.home-hero')).toBeNull();
      expect(buttons(root)).toEqual([]);
    });
  });

  describe('the hero\'s action', () => {
    it('clocks in through the shared shift service and lands on the on-shift default screen', () => {
      shiftService.report('OffShift');
      const clockIn = vi
        .spyOn(shiftService, 'clockIn')
        .mockReturnValue(of({ status: 'OnShift', onDuty: true }));
      const endBreak = vi.spyOn(shiftService, 'endBreak');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const root = render();

      button(root, 'Clock in')?.click();

      expect(clockIn).toHaveBeenCalledTimes(1);
      expect(endBreak).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/sale');
    });

    it('ends the break through the shared shift service and lands on the on-shift default screen', () => {
      shiftService.report('OnBreak');
      const endBreak = vi
        .spyOn(shiftService, 'endBreak')
        .mockReturnValue(of({ status: 'OnShift', onDuty: true }));
      const clockIn = vi.spyOn(shiftService, 'clockIn');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const root = render();

      button(root, 'End break')?.click();

      expect(endBreak).toHaveBeenCalledTimes(1);
      expect(clockIn).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/sale');
    });

    it('disables the button while the call is in flight, so it cannot be sent twice', () => {
      shiftService.report('OffShift');
      vi.spyOn(shiftService, 'clockIn').mockReturnValue(NEVER);
      const root = render();

      button(root, 'Clock in')?.click();
      fixture.detectChanges();

      expect(button(root, 'Clock in')?.disabled).toBe(true);
    });

    it('stays on Home and offers the button again when the call fails', () => {
      shiftService.report('OffShift');
      vi.spyOn(shiftService, 'clockIn').mockReturnValue(
        throwError(() => new Error('Rejected.')),
      );
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const root = render();

      button(root, 'Clock in')?.click();
      fixture.detectChanges();

      expect(navigate).not.toHaveBeenCalled();
      expect(button(root, 'Clock in')?.disabled).toBe(false);
    });
  });

  describe('"My schedule" preview', () => {
    beforeEach(() => {
      shiftService.report('OffShift');
    });

    it('shows exactly the next three worked shifts, soonest first, skipping days off and past days', () => {
      const root = render([
        worked('2026-09-21', 'Monday'),
        worked('2026-09-22', 'Tuesday'),
        worked('2026-09-23', 'Wednesday', '09:00', '17:00'),
        off('2026-09-24', 'Thursday'),
        worked('2026-09-25', 'Friday', '12:00', '20:00'),
        worked('2026-09-26', 'Saturday', '07:00', '15:30'),
        worked('2026-09-27', 'Sunday'),
      ]);

      expect(previewRows(root)).toEqual([
        'Today · Sep 23 Grocery 9:00 AM – 5:00 PM 8h',
        'Friday · Sep 25 Grocery 12:00 PM – 8:00 PM 8h',
        'Saturday · Sep 26 Grocery 7:00 AM – 3:30 PM 8.5h',
      ]);
    });

    it('labels tomorrow\'s shift "Tomorrow"', () => {
      const root = render([worked('2026-09-24', 'Thursday')]);

      expect(previewRows(root)).toEqual(['Tomorrow · Sep 24 Grocery 9:00 AM – 5:00 PM 8h']);
    });

    it('carries on into next week when this week runs out of shifts', () => {
      const root = render([
        off('2026-09-23', 'Wednesday'),
        off('2026-09-24', 'Thursday'),
        worked('2026-09-25', 'Friday'),
        off('2026-09-26', 'Saturday'),
        off('2026-09-27', 'Sunday'),
        worked('2026-09-28', 'Monday'),
        worked('2026-09-29', 'Tuesday'),
        worked('2026-09-30', 'Wednesday'),
      ]);

      expect(previewRows(root).map((row) => row.split(' Grocery')[0])).toEqual([
        'Friday · Sep 25',
        'Monday · Sep 28',
        'Tuesday · Sep 29',
      ]);
    });

    it('says so when nothing is scheduled ahead', () => {
      const root = render([off('2026-09-24', 'Thursday')]);

      expect(previewRows(root)).toEqual([]);
      expect(root.textContent).toContain('No upcoming shifts scheduled.');
    });

    it('shows a loading line while the schedule is being read', () => {
      scheduleService.hang();
      fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.textContent).toContain('Loading...');
      expect(previewRows(root)).toEqual([]);
    });

    it('shows a plain failure message when the schedule cannot be read, and keeps the hero', () => {
      scheduleService.fail();
      fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Your schedule could not be loaded.',
      );
      expect(button(root, 'Clock in')).toBeDefined();
    });

    it('opens the My Schedule route from "View all"', async () => {
      const root = render([worked('2026-09-24', 'Thursday')]);
      const viewAll = Array.from(root.querySelectorAll('a')).find(
        (link) => link.textContent?.trim() === 'View all',
      );

      expect(viewAll?.getAttribute('href')).toBe('/schedule');

      viewAll?.click();
      await fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/schedule');
    });
  });
});
