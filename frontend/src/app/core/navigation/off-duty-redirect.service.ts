import { effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { SHIFT_SERVICE } from '../tokens';
import { HOME_ROUTE } from './route-access';
import { shouldLeaveForHome } from './shift-navigation';

/**
 * Moves an employee off a full-nav route to Home when an off-shift or on-break
 * status arrives while they are on it.
 *
 * The route gate only runs when somebody navigates, and it lets an unknown
 * shift through. Sign-in lands on Sale before the first shift read comes back,
 * so without this an off-shift employee would land on Sale and stay there.
 *
 * A root service with an `effect`, like `SessionTeardownService`, because the
 * trigger is a read landing with nobody on the call stack. `app.config.ts`
 * creates it eagerly: a watcher nothing injects would never watch anything.
 *
 * It acts on a settled URL rather than `Router.url`. A read can land while the
 * sign-in navigation is still in flight, after the gate has already let it
 * through; re-running when that navigation ends is what catches it.
 */
@Injectable({
  providedIn: 'root',
})
export class OffDutyRedirectService implements OnDestroy {
  private readonly shiftService = inject(SHIFT_SERVICE);
  private readonly router = inject(Router);

  /** `null` until a navigation has ended, so the pre-navigation `/` is never judged. */
  private readonly settledUrl = signal<string | null>(
    this.router.navigated ? this.router.url : null,
  );

  private readonly navigationEnds: Subscription = this.router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe((event) => this.settledUrl.set(event.urlAfterRedirects));

  constructor() {
    effect(() => {
      const shift = this.shiftService.currentShift();
      const url = this.settledUrl();

      if (url === null || !shouldLeaveForHome(shift, url)) {
        return;
      }

      /**
       * Straight to Home with nothing in between (design row D10). Home is
       * always allowed, so the navigation this starts cannot bring the effect
       * back here.
       */
      untracked(() => this.router.navigateByUrl(HOME_ROUTE));
    });
  }

  ngOnDestroy(): void {
    this.navigationEnds.unsubscribe();
  }
}
