import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '../../tokens';
import { Department, Employee, EmployeeTier } from '../../models/auth/employee.model';
import { NAV_DESTINATIONS, NavDestination } from '../../permissions/nav-permission.model';
import { NavPermissionService } from '../../permissions/nav-permission.service';

// Header identity display text (LET-47's "Header identity display" section,
// API map row 9). Pure functions, exported for direct unit testing of the
// initials/label derivation independent of the component's DI-bound state.

const DEPARTMENT_LABELS: Record<Department | 'storewide', string> = {
  grocery: 'Grocery',
  electronics: 'Electronics',
  'customer-support': 'Customer Support',
  storewide: 'Storewide',
};

// Role text follows the tier, not the function (LET-66 fringe case) — an
// Associate with function: 'cashier' still reads "Associate" here.
const TIER_LABELS: Record<EmployeeTier, string> = {
  associate: 'Associate',
  'department-manager': 'Department Manager',
  'store-manager': 'Store Manager',
  'receiving-associate': 'Receiving Associate',
};

// Nav bar display text/behavior per destination (LET-68) — layered on top of
// NAV_DESTINATIONS (the permission model's own list) rather than duplicating
// it, so the two stay in sync automatically. `/sale` keeps the exact-match
// active state it already had as a static link, since it's also the default
// redirect target and would otherwise read as active under every other route.
const NAV_LINK_LABELS: Record<NavDestination, string> = {
  '/sale': 'Sale',
  '/products': 'Products',
  '/sales': 'Sales',
  '/buyers': 'Buyers',
  '/payment': 'Payment',
};

interface NavLink {
  readonly path: NavDestination;
  readonly label: string;
  readonly exact: boolean;
}

const NAV_LINKS: readonly NavLink[] = NAV_DESTINATIONS.map((path) => ({
  path,
  label: NAV_LINK_LABELS[path],
  exact: path === '/sale',
}));

export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

export function deriveDepartmentRoleText(employee: Employee): string {
  return `${DEPARTMENT_LABELS[employee.department]} · ${TIER_LABELS[employee.tier]}`;
}

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
  private readonly navPermissionService = inject(NavPermissionService);

  protected readonly currentEmployee = this.authService.currentEmployee;

  protected readonly initials = computed(() => {
    const employee = this.currentEmployee();
    return employee ? deriveInitials(employee.name) : '';
  });

  protected readonly departmentRoleText = computed(() => {
    const employee = this.currentEmployee();
    return employee ? deriveDepartmentRoleText(employee) : '';
  });

  // Nav links are generated from the tier × department × function permission
  // model (ADR-frontend §4.2), never rendered unconditionally — a null
  // employee (e.g. a mid-navigation edge case before redirect) resolves to no
  // links rather than throwing, and an empty visible set (least-privilege
  // default) resolves to no links rather than a broken/empty-looking bar.
  protected readonly visibleNavLinks = computed<readonly NavLink[]>(() => {
    const employee = this.currentEmployee();
    if (!employee) {
      return [];
    }

    const visibleDestinations = this.navPermissionService.resolveVisibleDestinations(employee);
    return NAV_LINKS.filter((link) => visibleDestinations.includes(link.path));
  });

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
