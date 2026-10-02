import { formatDate } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, OnInit, signal } from '@angular/core';

import { ScheduledShift } from '../../core/models/schedule/scheduled-shift.model';
import { calendarWeek } from '../../core/schedule/calendar-week';
import {
  hoursLabel,
  shiftHours,
  shiftTimeRange,
} from '../../core/schedule/scheduled-shift-display';
import { SCHEDULE_SERVICE } from '../../core/tokens';
import { DataTableColumn, DataTableComponent } from '../../shared/data-table/data-table.component';
import { weekHourCount, weekSchedule, WeekScheduleDay } from './week-schedule';

interface WeekScheduleRow {
  day: string;
  date: string;
  department: string | null;
  timeRange: string;
  hours: string | null;
}

const OFF_LABEL = 'Off';

/**
 * The employee's own schedule for the current calendar week (API map, design
 * row D7). Read-only and reachable in every shift state: nothing here reads
 * the shift status.
 */
@Component({
  selector: 'app-my-schedule',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './my-schedule.html',
  styleUrl: './my-schedule.scss',
})
export class MyScheduleComponent implements OnInit {
  private readonly scheduleService = inject(SCHEDULE_SERVICE);
  private readonly locale = inject(LOCALE_ID);

  /** Fixed when the screen opens, so the week does not shift under the employee. */
  private readonly week = calendarWeek(new Date());

  protected readonly shifts = signal<ScheduledShift[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  private readonly days = computed<WeekScheduleDay[]>(() =>
    weekSchedule(this.shifts(), this.week),
  );

  protected readonly rows = computed<WeekScheduleRow[]>(() =>
    this.days().map((day) => this.row(day)),
  );

  /** Only shown once the week has loaded, so a blank or failed read never reads as "0h". */
  protected readonly weekHours = computed(() => hoursLabel(weekHourCount(this.days())));

  /**
   * Every value is formatted before it reaches the table. The table's own
   * `date` type parses `yyyy-MM-dd` as UTC midnight, which is the previous day
   * west of Greenwich.
   */
  protected readonly columns: DataTableColumn[] = [
    { key: 'day', label: 'Day' },
    { key: 'date', label: 'Date' },
    { key: 'department', label: 'Department' },
    { key: 'timeRange', label: 'Time', align: 'end' },
    { key: 'hours', label: 'Hours', align: 'end' },
  ];

  ngOnInit(): void {
    this.loadSchedule();
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

  private row(day: WeekScheduleDay): WeekScheduleRow {
    return {
      day: day.day,
      date: formatDate(day.date, 'MMM d', this.locale),
      department: day.department,
      timeRange: day.shift ? shiftTimeRange(day.shift) : OFF_LABEL,
      hours: day.shift ? shiftHours(day.shift) : null,
    };
  }
}
