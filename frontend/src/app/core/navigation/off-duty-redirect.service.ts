import { effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { ShiftState } from '../models/shift/shift-status.model';
import { SHIFT_SERVICE } from '../tokens';
import { HOME_ROUTE, LOGIN_ROUTE, routePath } from './route-access';
import { isFullNavSuspended, isRouteAllowedForShift } from './shift-navigation';

/**
 * Moves an employee to Home when the shift status turns out to be off shift or
 * on break while they are on a screen the route gate would turn away.
 *
 * The gate only runs when the employee navigates. The shift status arrives on
 * its own, after sign-in or after a transition, with nobody navigating. An
 * off-shift employee who lands on Sale before the first read comes back would
 * otherwise stay there. This is the same shape as `SessionTeardownService`: a
 * root service with an `effect`, created eagerly in `app.config.ts`.
 *
 * It never moves anyone because the status is unknown or on shift. An unknown
 * status is not off duty, and a failed read must not move an employee off
 * their register.
 */
@Injectable({
  providedIn: 'root',
})
export class OffDutyRedirectService {
  private readonly shiftService = inject(SHIFT_SERVICE);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const shift = this.shiftService.currentShift();

      if (!isFullNavSuspended(shift)) {
        return;
      }

      untracked(() => this.moveOffDutyEmployee(shift));
    });
  }

  /**
   * Login is left alone. It forwards a signed-in employee on its own, to their
   * `returnUrl` when they have one, and the gate checks wherever that lands.
   * Moving them from here could override a `returnUrl` of My schedule.
   */
  private moveOffDutyEmployee(shift: ShiftState | null): void {
    const url = this.router.url;

    if (routePath(url) === LOGIN_ROUTE || isRouteAllowedForShift(shift, url)) {
      return;
    }

    this.router.navigateByUrl(HOME_ROUTE);
  }
}
