import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '../../tokens';
import { Department, Employee, EmployeeTier } from '../../models/auth/employee.model';

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

  protected readonly currentEmployee = this.authService.currentEmployee;

  protected readonly initials = computed(() => {
    const employee = this.currentEmployee();
    return employee ? deriveInitials(employee.name) : '';
  });

  protected readonly departmentRoleText = computed(() => {
    const employee = this.currentEmployee();
    return employee ? deriveDepartmentRoleText(employee) : '';
  });

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
