import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '../../tokens';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly router = inject(Router);

  readonly currentEmployee = this.authService.currentEmployee;

  protected readonly menuOpen = signal(false);

  /** Avatar initials derived from the employee's name — no avatar-image upload exists, so this is the steady state, not a fallback. */
  protected readonly initials = computed(() => {
    const employee = this.currentEmployee();

    if (!employee) {
      return '';
    }

    return employee.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  });

  /** "department · role" string, e.g. "Grocery · Associate"; reads 'storewide' for a Receiving Associate. */
  protected readonly departmentRole = computed(() => {
    const employee = this.currentEmployee();

    if (!employee) {
      return '';
    }

    return `${employee.department} · ${employee.tier}`;
  });

  toggleIdentityMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  logout(): void {
    this.menuOpen.set(false);
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
