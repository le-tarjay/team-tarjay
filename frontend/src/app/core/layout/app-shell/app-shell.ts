import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '../../tokens';
import { NavDestination } from '../../permissions/nav-permission.model';
import { NavPermissionService } from '../../permissions/nav-permission.service';

interface NavLink {
  destination: NavDestination;
  label: string;
  path: string;
}

/**
 * Every routed destination nav rendering knows about, in display order.
 * Whether a given employee actually sees one is decided entirely by
 * NavPermissionService against the resolved identity below — nothing here
 * is visible by default.
 */
const NAV_LINKS: readonly NavLink[] = [
  { destination: 'sale', label: 'Sale', path: '/sale' },
  { destination: 'products', label: 'Products', path: '/products' },
  { destination: 'sales', label: 'Sales', path: '/sales' },
  { destination: 'buyers', label: 'Buyers', path: '/buyers' },
  { destination: 'payment', label: 'Payment', path: '/payment' },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly navPermissionService = inject(NavPermissionService);
  private readonly router = inject(Router);

  protected readonly currentEmployee = this.authService.currentEmployee;

  /**
   * Recomputes from the resolved identity on every change — including
   * sign-out (employee is null, so the visible set is empty) and signing
   * back in as a different tier — so there's no nav carried over from a
   * prior session's identity.
   */
  protected readonly navLinks = computed<readonly NavLink[]>(() => {
    const employee = this.currentEmployee();
    if (!employee) {
      return [];
    }

    const visibleDestinations = this.navPermissionService.getVisibleDestinations(employee);
    return NAV_LINKS.filter((link) => visibleDestinations.has(link.destination));
  });

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
