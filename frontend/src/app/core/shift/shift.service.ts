import { HttpClient } from '@angular/common/http';
import {
  computed,
  effect,
  inject,
  Injectable,
  OnDestroy,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { defer, map, Observable, Subscription, tap } from 'rxjs';

import { SHIFT_STATUSES, ShiftState, ShiftStatus } from '../models/shift/shift-status.model';
import { AUTH_SERVICE } from '../tokens';

export interface IShiftService {
  /**
   * The signed-in employee's shift as the server last reported it, or `null`
   * when there is nothing trustworthy to show: nobody is signed in, the first
   * read since sign-in has not landed yet, or the last read failed.
   *
   * `null` is never a stand-in for off shift. Guessing off shift before the
   * server has answered would flash the wrong header and, once the nav gate
   * reads this, the wrong nav (API map, design row D15).
   */
  currentShift: Signal<ShiftState | null>;

  /**
   * Re-reads the shift from the server and replaces whatever is held with the
   * answer. The seam a rejected transition resyncs through: the display is put
   * back to what the server holds, never to what the client expected.
   *
   * Fire-and-forget on purpose — every consumer reads `currentShift`, so there
   * is nothing for a caller to wait on. A read already in flight is cancelled,
   * so the newest request is always the one that lands.
   */
  refresh(): void;

  clockIn(): Observable<ShiftState>;
  clockOut(): Observable<ShiftState>;
  startBreak(): Observable<ShiftState>;
  endBreak(): Observable<ShiftState>;
}

/**
 * Relative, for the same reason `SIGN_IN_ENDPOINT` is: no API base URL reaches
 * this surface at runtime, and a same-origin path needs no config value. All
 * five are `me`-scoped — the backend takes the employee from the bearer token,
 * so nothing here names one.
 */
const SHIFT_ENDPOINT = '/v1/employees/me/shift';
const CLOCK_IN_ENDPOINT = '/v1/employees/me/clock-in';
const CLOCK_OUT_ENDPOINT = '/v1/employees/me/clock-out';
const START_BREAK_ENDPOINT = '/v1/employees/me/start-break';
const END_BREAK_ENDPOINT = '/v1/employees/me/end-break';

export const UNREADABLE_SHIFT_MESSAGE = 'Your shift status could not be read. Try again.';

/** The `data` member of every shift endpoint's `{ data, meta }` envelope. */
interface ShiftStatusResponse {
  status: string;
  onDuty: boolean;
}

interface ShiftStatusEnvelope {
  data: ShiftStatusResponse;
}

/**
 * A shift is always somebody's. Holding the employee alongside it is what lets
 * a response that lands after the terminal changed hands be recognised and
 * dropped, rather than shown to the next person to sign in.
 */
interface HeldShift {
  employeeId: string;
  state: ShiftState;
}

@Injectable({
  providedIn: 'root',
})
export class ShiftService implements IShiftService, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AUTH_SERVICE);

  private readonly held = signal<HeldShift | null>(null);

  /**
   * The read in flight, if any. A subscription rather than signal state
   * because the UI never reads it — it is a request this service owns and has
   * to be able to cancel when a newer answer supersedes it.
   */
  private reading: Subscription | null = null;

  /**
   * Only ever the signed-in employee's own shift. The held value is keyed to
   * the employee it was read for, so between a session ending and the redirect
   * to Login, and between one employee signing out and the next signing in,
   * nothing belonging to someone else is exposed.
   */
  readonly currentShift = computed<ShiftState | null>(() => {
    const held = this.held();
    const employee = this.authService.currentEmployee();

    if (held === null || employee === null || held.employeeId !== employee.id) {
      return null;
    }

    return held.state;
  });

  /**
   * Each sign-in is a fresh read, never an assumption. `AuthService` writes a
   * new `Employee` on every successful sign-in — the same employee signing
   * back in included — so this runs once per sign-in and not otherwise.
   *
   * Signing out writes `null`, which returns early: logout triggers no read
   * and clears nothing, exactly as `SessionTeardownService` leaves shift state
   * alone. Attendance is the backend's, so there is no client value worth
   * tearing down; the next sign-in replaces it with the server's.
   */
  constructor() {
    effect(() => {
      const employee = this.authService.currentEmployee();

      if (employee === null) {
        return;
      }

      untracked(() => this.readAtSignIn(employee.id));
    });
  }

  refresh(): void {
    const employee = this.authService.currentEmployee();

    if (employee === null) {
      return;
    }

    this.read(employee.id);
  }

  clockIn(): Observable<ShiftState> {
    return this.transition(CLOCK_IN_ENDPOINT);
  }

  clockOut(): Observable<ShiftState> {
    return this.transition(CLOCK_OUT_ENDPOINT);
  }

  startBreak(): Observable<ShiftState> {
    return this.transition(START_BREAK_ENDPOINT);
  }

  endBreak(): Observable<ShiftState> {
    return this.transition(END_BREAK_ENDPOINT);
  }

  ngOnDestroy(): void {
    this.stopReading();
  }

  /**
   * Clears before reading, so the header shows nothing rather than the last
   * employee's shift — or this employee's, from before they signed out — while
   * the first read is in flight.
   */
  private readAtSignIn(employeeId: string): void {
    this.held.set(null);
    this.read(employeeId);
  }

  /**
   * A failed read clears what is held rather than keeping it. Whatever was
   * there is exactly the value the server just failed to confirm, and showing
   * it would be showing a guess (story criterion 5).
   */
  private read(employeeId: string): void {
    this.stopReading();

    this.reading = this.http
      .get<ShiftStatusEnvelope>(SHIFT_ENDPOINT)
      .pipe(map((envelope: ShiftStatusEnvelope | null) => toShiftState(envelope)))
      .subscribe({
        next: (state) => this.hold(employeeId, state),
        error: () => this.clear(employeeId),
      });
  }

  /**
   * The held shift changes only from the server's own answer, never
   * optimistically: a transition the backend rejected must not leave the
   * display showing a state it disagrees with. A failure therefore changes
   * nothing here and reaches the caller as it arrived, so whoever shows the
   * failure can tell a rejected transition from an unreachable backend.
   *
   * The employee is captured when the call is made, not when it returns, so a
   * response that lands after the terminal changed hands is dropped by `hold`.
   */
  private transition(endpoint: string): Observable<ShiftState> {
    return defer(() => {
      const employeeId = this.authService.currentEmployee()?.id ?? null;

      return this.http.post<ShiftStatusEnvelope>(endpoint, null).pipe(
        map((envelope: ShiftStatusEnvelope | null) => toShiftState(envelope)),
        tap((state) => {
          if (employeeId !== null) {
            this.hold(employeeId, state);
          }
        }),
      );
    });
  }

  /**
   * Any read still in flight is cancelled first: it was asked before this
   * answer, so it can only be as new as this one, and letting it land
   * afterwards could put an older state back on screen.
   */
  private hold(employeeId: string, state: ShiftState): void {
    if (!this.isSignedIn(employeeId)) {
      return;
    }

    this.stopReading();
    this.held.set({ employeeId, state });
  }

  private clear(employeeId: string): void {
    if (!this.isSignedIn(employeeId)) {
      return;
    }

    this.held.set(null);
  }

  private isSignedIn(employeeId: string): boolean {
    return this.authService.currentEmployee()?.id === employeeId;
  }

  private stopReading(): void {
    this.reading?.unsubscribe();
    this.reading = null;
  }
}

function toShiftState(envelope: ShiftStatusEnvelope | null): ShiftState {
  const data = envelope?.data;

  if (!data || !isShiftStatus(data.status) || typeof data.onDuty !== 'boolean') {
    throw new Error(UNREADABLE_SHIFT_MESSAGE);
  }

  return { status: data.status, onDuty: data.onDuty };
}

function isShiftStatus(value: unknown): value is ShiftStatus {
  return typeof value === 'string' && (SHIFT_STATUSES as readonly string[]).includes(value);
}
