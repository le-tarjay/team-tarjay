import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';

import { employeeRoleLabel } from '../../navigation/employee-role-label';
import { MY_SCHEDULE_NAV_ITEM, myScheduleEntryPoint } from '../../navigation/my-schedule-entry';
import { adminNavItems, NavItem, SHARED_NAV_ITEMS } from '../../navigation/role-navigation';
import { LOGIN_ROUTE } from '../../navigation/route-access';
import { mainNavItemsFor } from '../../navigation/shift-navigation';
import { ShiftState, ShiftStatus } from '../../models/shift/shift-status.model';
import { shiftActionFailure } from '../../shift/shift-action-messages';
import { ShiftAction, shiftActionsFor } from '../../shift/shift-actions';
import { shiftStatusLabel } from '../../shift/shift-status-label';
import { AUTH_SERVICE, SHIFT_SERVICE } from '../../tokens';

interface ShiftIndicator {
  status: ShiftStatus;
  label: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly shiftService = inject(SHIFT_SERVICE);
  private readonly router = inject(Router);

  private readonly currentEmployee = this.authService.currentEmployee;

  protected readonly isAccountMenuOpen = signal(false);

  /**
   * "{name} · {department} · {role}", so the *why* behind what's on screen is
   * never a mystery to the employee standing at the terminal (Reference ADR
   * (frontend) §5). Empty while signed out, which is what reverts the header
   * on logout.
   */
  protected readonly identityLabel = computed(() => {
    const employee = this.currentEmployee();

    if (!employee) {
      return '';
    }

    return `${employee.name} · ${employee.department} · ${employeeRoleLabel(employee.role)}`;
  });

  /**
   * The dot and label beside the account menu. `null` — and so nothing on
   * screen — until the server has answered, and again if a read fails: the
   * header never shows a shift status the server has not confirmed, off shift
   * included (API map, design rows D1 and D15).
   */
  protected readonly shiftIndicator = computed<ShiftIndicator | null>(() => {
    const shift = this.shiftService.currentShift();

    if (!shift) {
      return null;
    }

    return { status: shift.status, label: shiftStatusLabel(shift.status) };
  });

  /**
   * Where My Schedule is offered follows the shift the server last reported:
   * the account menu on shift, the nav off shift or on break.
   */
  private readonly myScheduleEntry = computed(() =>
    myScheduleEntryPoint(this.shiftService.currentShift()?.status ?? null),
  );

  protected readonly myScheduleItem = MY_SCHEDULE_NAV_ITEM;

  protected readonly showsMyScheduleInAccountMenu = computed(
    () => this.myScheduleEntry() === 'account-menu',
  );

  /**
   * On shift, the shared items then exactly one role-specific item. Off shift
   * or on break, only Home and My schedule. Nothing until the server has
   * reported a shift. Signing out leaves the shared head, which is the same nav
   * the shell showed before anyone signed in.
   */
  protected readonly navItems = computed<readonly NavItem[]>(() => {
    const employee = this.currentEmployee();

    if (!employee) {
      return SHARED_NAV_ITEMS;
    }

    return mainNavItemsFor(employee, this.shiftService.currentShift());
  });

  /**
   * Clock in, Start break, End break and Clock out, as the server's last
   * reported status allows. They change only when that status does: a choice
   * made here never moves the menu on by itself.
   */
  protected readonly shiftActions = computed(() =>
    shiftActionsFor(this.shiftService.currentShift()?.status ?? null),
  );

  /** True while a shift transition is in flight, so a second one can't race it. */
  protected readonly isShiftActionPending = signal(false);

  /**
   * What the last failed shift action said, shown at the top of the account
   * menu. Empty once the menu closes or another action is tried, so it only
   * ever describes the attempt the employee just made.
   */
  protected readonly shiftActionError = signal('');

  protected readonly accountMenuItems = computed<readonly NavItem[]>(() => {
    const employee = this.currentEmployee();

    return employee ? adminNavItems(employee) : [];
  });

  /**
   * A session ended elsewhere takes this menu down with it.
   *
   * The redirect `SessionTeardownService` fires destroys the shell and every
   * routed screen under it, which is what disposes of a layer a feature
   * component owns. This menu is the exception: it belongs to the shell itself,
   * and `Router.navigateByUrl` resolves asynchronously — so between the
   * teardown and the redirect completing, an open menu would still be on
   * screen, over a header that has already emptied.
   *
   * It closes here rather than in the teardown because the shell is the only
   * writer of its own UI state; reaching into a component's signals from a
   * service is the anti-pattern `CONVENTIONS.md` names.
   */
  constructor() {
    effect(() => {
      if (this.authService.sessionEnded()) {
        this.closeAccountMenu();
      }
    });
  }

  /**
   * Bootstrap's dropdown JavaScript is not loaded (only its stylesheet is, in
   * `styles.scss`), and under zoneless change detection a signal write is what
   * makes the menu re-render anyway.
   */
  protected toggleAccountMenu(): void {
    this.shiftActionError.set('');
    this.isAccountMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeAccountMenu(): void {
    this.shiftActionError.set('');
    this.isAccountMenuOpen.set(false);
  }

  /**
   * The service takes the new status from the server's response before `next`
   * runs, so the header, the menu and the route gate already agree with the
   * server by the time the navigation lands.
   */
  protected takeShiftAction(action: ShiftAction): void {
    this.isShiftActionPending.set(true);
    this.shiftActionError.set('');

    this.transitionFor(action).subscribe({
      next: () => {
        this.isShiftActionPending.set(false);
        this.closeAccountMenu();
        this.router.navigateByUrl(action.landsOn);
      },
      error: (error: unknown) => {
        this.isShiftActionPending.set(false);
        this.shiftActionFailed(action, error);
      },
    });
  }

  protected logout(): void {
    this.closeAccountMenu();
    this.authService.logout();
    this.router.navigateByUrl(LOGIN_ROUTE);
  }

  private transitionFor(action: ShiftAction): Observable<ShiftState> {
    switch (action.kind) {
      case 'clockIn':
        return this.shiftService.clockIn();
      case 'startBreak':
        return this.shiftService.startBreak();
      case 'endBreak':
        return this.shiftService.endBreak();
      case 'clockOut':
        return this.shiftService.clockOut();
    }
  }

  /**
   * The menu stays open with the message at its top. On a rejected transition
   * the re-read replaces the actions under it with the ones the server's
   * actual status allows; on an unreachable backend they stay as they were.
   */
  private shiftActionFailed(action: ShiftAction, error: unknown): void {
    const failure = shiftActionFailure(action.kind, error);

    this.shiftActionError.set(failure.message);

    if (failure.resync) {
      this.shiftService.refresh();
    }
  }

  /**
   * `/sale` matches exactly so it does not also light up as active for the
   * routes nested under the shell alongside it.
   */
  protected isExactLink(item: NavItem): boolean {
    return item.route === '/sale';
  }
}
