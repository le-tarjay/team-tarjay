import { effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { SHIFT_SERVICE } from '../tokens';
import { HOME_ROUTE, LOGIN_ROUTE, routePath } from './route-access';
import { isRouteAllowedForShift } from './shift-navigation';

/**
 * Moves an employee to Home when the server reports them off shift or on break
 * while they are on a route the shift gate would turn away.
 *
 * The gate only runs when the employee navigates, and it lets everything
 * through while no shift has been read. An employee who lands on Sale at
 * sign-in, before the first read comes back, would otherwise stay there. So
 * would one who starts a break from Sale.
 *
 * A root service with an `effect`, for the reason `SessionTeardownService`
 * gives: the status arrives with nobody on the call stack. `app.config.ts`
 * creates it eagerly.
 *
 * It watches the settled URL as well as the shift. A read can land while the
 * sign-in navigation is still resolving, and the route that navigation lands on
 * is only known once it ends.
 */
@Injectable({
  providedIn: 'root',
})
export class OffDutyRedirectService {
  private readonly shiftService = inject(SHIFT_SERVICE);
  private readonly router = inject(Router);

  private readonly settledUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    effect(() => {
      const url = this.settledUrl();
      const shift = this.shiftService.currentShift();

      /**
       * Login forwards a signed-in employee itself, to their `returnUrl` when
       * they have one. Moving them from here as well would race that.
       */
      if (routePath(url) === LOGIN_ROUTE || isRouteAllowedForShift(shift, url)) {
        return;
      }

      untracked(() => this.router.navigateByUrl(HOME_ROUTE));
    });
  }
}
