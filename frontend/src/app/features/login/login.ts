import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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

  protected readonly employeeId = signal('');
  protected readonly pin = signal('');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/sale');
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
        this.router.navigateByUrl('/sale');
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(error.message);
      },
    });
  }
}
