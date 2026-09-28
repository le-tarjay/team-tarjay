import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { ScheduledShift, WorkedShift } from '../../core/models/schedule/scheduled-shift.model';
import { ShiftState, ShiftStatus } from '../../core/models/shift/shift-status.model';
import { DEFAULT_SIGNED_IN_ROUTE, MY_SCHEDULE_ROUTE } from '../../core/navigation/route-access';
import { shiftHours, shiftTimeRange } from '../../core/schedule/scheduled-shift-display';
import { shiftStatusLabel } from '../../core/shift/shift-status-label';
import { AUTH_SERVICE, SCHEDULE_SERVICE, SHIFT_SERVICE } from '../../core/tokens';
import { localIsoDate, upcomingShifts } from './upcoming-shifts';

/** The two states Home speaks to. On shift, the employee belongs at work. */
type OffDutyStatus = Extract<ShiftStatus, 'OffShift' | 'OnBreak'>;

interface HomeHero {
  status: OffDutyStatus;
  statusLabel: string;
  greeting: string;
  explanation: string;
}

interface SchedulePreviewRow {
  date: string;
  dayLabel: string;
  department: string;
  timeRange: string;
  hours: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly shiftService = inject(SHIFT_SERVICE);
  private readonly scheduleService = inject(SCHEDULE_SERVICE);
  private readonly router = inject(Router);

  /** Fixed when the screen opens, so the preview and its labels agree. */
  private readonly today = new Date();

  protected readonly myScheduleRoute = MY_SCHEDULE_ROUTE;

  protected readonly shifts = signal<ScheduledShift[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  /** True while a clock-in or end-break call is in flight. */
  protected readonly isActing = signal(false);

  /**
   * Copy is final shipping text from the design asset (API map, design row
   * D5). `null` until the server has reported off shift or on break: before
   * the first read lands there is nothing trustworthy to explain, and on shift
   * there is nothing for this hero to offer.
   */
  protected readonly hero = computed<HomeHero | null>(() => {
    const employee = this.authService.currentEmployee();
    const status = this.shiftService.currentShift()?.status;

    if (!employee || (status !== 'OffShift' && status !== 'OnBreak')) {
      return null;
    }

    const firstName = employee.name.trim().split(/\s+/)[0] ?? employee.name;

    if (status === 'OnBreak') {
      return {
        status,
        statusLabel: shiftStatusLabel(status),
        greeting: `You’re on break, ${firstName}`,
        explanation: 'Your shift is still active. End your break to return to your work tools.',
      };
    }

    return {
      status,
      statusLabel: shiftStatusLabel(status),
      greeting: `Welcome, ${firstName}`,
      explanation:
        'You’re signed in but not on the clock. Clock in to start your shift and unlock your work tools.',
    };
  });

  protected readonly schedulePreview = computed<SchedulePreviewRow[]>(() => {
    const today = localIsoDate(this.today);

    return upcomingShifts(this.shifts(), today).map((shift) => this.previewRow(shift));
  });

  ngOnInit(): void {
    this.loadSchedule();
  }

  /**
   * The same `clockIn()` the account menu calls, so there is one clock-in, not
   * two. Clocking in lands on the default on-shift screen (API map, design row
   * D2).
   */
  protected clockIn(): void {
    this.startWork(this.shiftService.clockIn());
  }

  /**
   * Ending a break goes straight back to the default on-shift screen, never
   * through Home (API map, design row D11).
   */
  protected endBreak(): void {
    this.startWork(this.shiftService.endBreak());
  }

  /**
   * The held shift already reflects the server's answer by the time `next`
   * runs, so the route gate sees on shift when the navigation lands.
   */
  private startWork(transition: Observable<ShiftState>): void {
    this.isActing.set(true);

    transition.subscribe({
      next: () => {
        this.isActing.set(false);
        this.router.navigateByUrl(DEFAULT_SIGNED_IN_ROUTE);
      },
      error: () => {
        // What a failed shift action says, and the resync behind it, belong to
        // the shift-action failure story (LET-146). Until then the button is
        // simply offered again.
        this.isActing.set(false);
      },
    });
  }

  private loadSchedule(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.scheduleService.list().subscribe({
      next: (shifts) => {
        this.shifts.set(shifts);
        this.isLoading.set(false);
      },
      error: () => {
        this.shifts.set([]);
        this.errorMessage.set('Your schedule could not be loaded.');
        this.isLoading.set(false);
      },
    });
  }

  private previewRow(shift: WorkedShift): SchedulePreviewRow {
    return {
      date: shift.date,
      dayLabel: this.dayLabel(shift),
      department: shift.department,
      timeRange: shiftTimeRange(shift),
      hours: shiftHours(shift),
    };
  }

  private dayLabel(shift: WorkedShift): string {
    const tomorrow = new Date(
      this.today.getFullYear(),
      this.today.getMonth(),
      this.today.getDate() + 1,
    );

    if (shift.date === localIsoDate(this.today)) {
      return 'Today';
    }

    if (shift.date === localIsoDate(tomorrow)) {
      return 'Tomorrow';
    }

    return shift.day;
  }
}
