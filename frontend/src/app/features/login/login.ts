import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SESSION_ENDED_ELSEWHERE_MESSAGE } from '../../core/auth/auth.service';
import { inAppReturnUrl, RETURN_URL_PARAM } from '../../core/auth/return-url';
import { DEFAULT_SIGNED_IN_ROUTE } from '../../core/navigation/route-access';
import { AUTH_SERVICE } from '../../core/tokens';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  private readonly employeeIdField =
    viewChild.required<ElementRef<HTMLInputElement>>('employeeIdField');

  /**
   * Empty on every arrival, and never seeded from the employee who was just
   * signed out even though `AUTH_SERVICE` still knows who that was: these are
   * shared terminals, and the next person at one is usually somebody else
   * (API map, design row 1).
   */
  protected readonly employeeId = signal('');
  protected readonly pin = signal('');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.destination());
      return;
    }

    this.explainAnEndedSession();
  }

  ngAfterViewInit(): void {
    this.focusEmployeeId();
  }

  /**
   * The two fields go through a handler rather than setting their signal from
   * the template, because typing is also what dismisses whatever the message
   * slot is showing.
   */
  protected enterEmployeeId(employeeId: string): void {
    this.employeeId.set(employeeId);
    this.clearMessage();
  }

  protected enterPin(pin: string): void {
    this.pin.set(pin);
    this.clearMessage();
  }

  protected login(): void {
    // The disabled submit button stops the click path, but not an implicit
    // submit from pressing Enter in a still-enabled field. Against the real
    // endpoint the in-flight window is network latency rather than the mock's
    // fixed delay, so it is wide enough to hit in practice.
    if (this.isLoading()) {
      return;
    }

    this.errorMessage.set('');

    const employeeId = this.employeeId().trim();
    const pin = this.pin().trim();

    if (!employeeId || !pin) {
      this.errorMessage.set('Enter your employee ID and PIN.');
      return;
    }

    this.isLoading.set(true);

    this.authService.login({ employeeId, pin }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigateByUrl(this.destination());
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(error.message);
      },
    });
  }

  /**
   * Says why the device is back here, but only when it was sent back. A session
   * ended by a sign-in on another device is the one return the employee did not
   * ask for, so it is the one that needs explaining; a deliberate logout leaves
   * `sessionEnded` false and this screen plain (API map, design rows 3 and 8).
   *
   * It is read once, on arrival, rather than rendered from the signal
   * continuously: the explanation has to clear on the first keystroke while the
   * fact behind it stays true — `AuthService` keeps `sessionEnded` set until the
   * next successful sign-in, precisely so this screen can still read it after
   * the teardown has already cleared the session.
   *
   * The text is shown in the same slot as a sign-in failure, and comes from the
   * same exported constant pattern those messages use, so there is one place
   * this wording lives.
   */
  private explainAnEndedSession(): void {
    if (this.authService.sessionEnded()) {
      this.errorMessage.set(SESSION_ENDED_ELSEWHERE_MESSAGE);
    }
  }

  /**
   * The message slot holds exactly one message at a time, and every message it
   * can hold describes a state a keystroke has just moved on from — an ended
   * session the employee is now signing back in from, or a credential they are
   * now retyping. So typing clears the slot rather than only the explanation.
   */
  private clearMessage(): void {
    this.errorMessage.set('');
  }

  /**
   * Focus starts on Employee ID on every arrival, so an employee at a shared
   * terminal can sign in without reaching for the screen first. Done here
   * rather than with the `autofocus` attribute because a return to Login is a
   * route change within a live document, not a page load, and `autofocus` is
   * only honoured for the latter.
   */
  private focusEmployeeId(): void {
    this.employeeIdField().nativeElement.focus();
  }

  /**
   * Read at navigation time, not captured on init, so it reflects the query
   * string this screen was actually reached with. A destination the guard
   * preserved is only a request: the guard re-runs on arrival and still turns
   * away a route this employee's role doesn't cover.
   */
  private destination(): string {
    const returnUrl = inAppReturnUrl(
      this.activatedRoute.snapshot.queryParamMap.get(RETURN_URL_PARAM),
    );

    return returnUrl ?? DEFAULT_SIGNED_IN_ROUTE;
  }
}
