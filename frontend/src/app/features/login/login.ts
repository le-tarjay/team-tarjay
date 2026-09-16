import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

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
export class LoginComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  protected readonly employeeId = signal('');
  protected readonly pin = signal('');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.destination());
    }
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
