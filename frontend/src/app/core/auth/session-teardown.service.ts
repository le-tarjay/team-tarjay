import { effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { SaleService } from '../sale/sale.service';
import { AUTH_SERVICE } from '../tokens';

/**
 * Where a device goes when its session ends. No `returnUrl` rides along, and
 * that is the point rather than an omission: the query parameter exists to
 * carry an *interrupted* employee back to what they were doing
 * (`return-url.ts`), and the next person to sign in at this terminal is a
 * different employee. Handing them the previous one's screen is the thing this
 * teardown exists to prevent.
 */
export const LOGIN_ROUTE = '/login';

/**
 * Turns "this session was ended by a sign-in elsewhere" into an empty screen
 * and a return to Login, without the employee touching the terminal first.
 *
 * `AuthService` detects and classifies; it deliberately does not act (see
 * `bearer-token.interceptor.ts` and `auth.service.spec.ts` "leaves the held
 * session in place when it detects the end"). This is what acts. Keeping the
 * two apart is what stops a failed refresh anywhere in the app being able to
 * log a register out, and it is why the teardown reads a signal rather than
 * being called from inside the refresh pipeline.
 *
 * It is a root service with an `effect` rather than a method somebody calls,
 * because the trigger arrives with nobody on the call stack: an idle terminal
 * discovers an ended session on a timer, not in response to an interaction.
 * `app.config.ts` instantiates it eagerly through `provideEnvironmentInitializer`
 * — a watcher nothing injects would never watch anything.
 *
 * **What it does not touch, deliberately.** Clock and break state are a shift,
 * not a session, and a session ending is not the end of a shift (epic scope
 * boundary). A held sale is expired by store close and by nothing else. Neither
 * concept exists in this surface yet, and when they arrive they stay out of
 * this method — see the story's completion report.
 */
@Injectable({
  providedIn: 'root',
})
export class SessionTeardownService {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly saleService = inject(SaleService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.authService.sessionEnded()) {
        return;
      }

      /**
       * The teardown writes signals that nothing here reads back, so there is
       * nothing for the effect to re-run on — `untracked` states that rather
       * than relying on it, matching `tender-selector.ts`.
       */
      untracked(() => this.tearDown());
    });
  }

  /**
   * The order is load-bearing, not incidental.
   *
   * The in-progress sale goes first, while the session it belongs to is still
   * identifiable. Then the session itself: `logout()` clears the employee and
   * both tokens, which is what empties the header — the shell renders identity
   * from `currentEmployee` — and stops the refresh timer. It pointedly leaves
   * `sessionEnded` set, so the Login screen can still say why the device is
   * there (LET-135).
   *
   * Navigation is last, and has to be. `LoginComponent.ngOnInit` bounces an
   * employee who is still signed in straight back to `/sale`, so arriving at
   * Login before the session was cleared would land the device back on the
   * screen it was just torn down from.
   *
   * There is no confirmation step anywhere in here, and no transitional or
   * "reconnecting" screen between the two: the session is already gone, so
   * there is nothing left to ask the employee about and nothing to wait for.
   */
  private tearDown(): void {
    this.saleService.reset();
    this.authService.logout();
    this.router.navigateByUrl(LOGIN_ROUTE);
  }
}
