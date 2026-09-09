import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { employeeRoleLabel } from '../../navigation/employee-role-label';
import {
  adminNavItems,
  NavItem,
  roleSpecificNavItem,
  SHARED_NAV_ITEMS,
} from '../../navigation/role-navigation';
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
   * The shared items always, then exactly one role-specific item appended.
   * Signing out drops the tail and leaves the shared head untouched, which is
   * the same nav the shell showed before anyone signed in.
   */
  protected readonly navItems = computed<readonly NavItem[]>(() => {
    const employee = this.currentEmployee();

    if (!employee) {
      return SHARED_NAV_ITEMS;
    }

    return [...SHARED_NAV_ITEMS, roleSpecificNavItem(employee)];
  });

  protected readonly accountMenuItems = computed<readonly NavItem[]>(() => {
    const employee = this.currentEmployee();

    return employee ? adminNavItems(employee) : [];
  });

  /**
   * Bootstrap's dropdown JavaScript is not loaded (only its stylesheet is, in
   * `styles.scss`), and under zoneless change detection a signal write is what
   * makes the menu re-render anyway.
   */
  protected toggleAccountMenu(): void {
    this.isAccountMenuOpen.update((isOpen) => !isOpen);
  }

  protected logout(): void {
    this.isAccountMenuOpen.set(false);
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  /**
   * `/sale` matches exactly so it does not also light up as active for the
   * routes nested under the shell alongside it.
   */
  protected isExactLink(item: NavItem): boolean {
    return item.route === '/sale';
  }
}
