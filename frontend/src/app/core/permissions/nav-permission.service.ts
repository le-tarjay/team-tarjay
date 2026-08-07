import { Injectable } from '@angular/core';

import { Department, Employee } from '../models/auth/employee.model';
import { NavDestination } from './nav-permission.model';

const ALL_DESTINATIONS: readonly NavDestination[] = ['/sale', '/products', '/sales', '/buyers', '/payment'];

const NO_DESTINATIONS: readonly NavDestination[] = [];

// Associate tier's baseline authority (ADR-frontend §4's Associate row: build
// sale, process payment, returns with receipt, product lookup) — granted to
// every Associate regardless of function or department. "Own department"
// scope in that row bounds stocking-task assignment and override
// eligibility, not which of today's five routes render, so department isn't
// part of this lookup.
const ASSOCIATE_BASE_DESTINATIONS: readonly NavDestination[] = ['/sale', '/products', '/sales', '/payment'];

// Function narrows what tier alone would allow (ADR-frontend §4.2). The
// buyer directory is where a buyer is identified for store-credit tender and
// loyalty lookups at checkout (ADR-frontend §4.6) — a Cashier-specific need
// the non-Cashier Associate baseline above doesn't carry.
const ASSOCIATE_CASHIER_DESTINATIONS: readonly NavDestination[] = [...ASSOCIATE_BASE_DESTINATIONS, '/buyers'];

// Department Manager gets everything the Associate baseline has, plus void,
// no-receipt-return, and discount approval (ADR-frontend §4) — none of which
// introduce a new nav destination, so their route-level set is the full
// five. Keyed explicitly by named department (never `'storewide'`, which
// isn't a valid home department for this tier) so a Department Manager
// record that's missing/wrong on department scope falls through to the
// least-privilege default below rather than silently getting full access.
const DEPARTMENT_MANAGER_DESTINATIONS_BY_DEPARTMENT: Partial<Record<Department | 'storewide', readonly NavDestination[]>> = {
  grocery: ALL_DESTINATIONS,
  electronics: ALL_DESTINATIONS,
  'customer-support': ALL_DESTINATIONS,
};

// Store Manager's scope is storewide, all departments, with no caps
// (ADR-frontend §4) — the full route set applies regardless of whichever
// department is recorded as their own, so no department-keyed lookup is
// needed here.
const STORE_MANAGER_DESTINATIONS: readonly NavDestination[] = ALL_DESTINATIONS;

// Receiving is "a new domain, separate from Sale / Product / Sales / Buyers"
// (ADR-frontend §11) — none of today's five destinations belong to it, and
// Receiving Associate is storewide rather than department-bound (ADR-frontend
// §4, §11). Its visible set is empty until Receiving gets its own routes;
// this also satisfies the fringe case that storewide status must never
// accidentally grant access to a department-scoped destination.
const RECEIVING_ASSOCIATE_DESTINATIONS: readonly NavDestination[] = NO_DESTINATIONS;

/**
 * Resolves the nav destinations/routes visible to an employee, per the
 * tier × department × function permission model (ADR-frontend §4.2). This is
 * the single source of visibility logic — both nav generation and
 * route guards call this rather than re-deriving it.
 */
@Injectable({
  providedIn: 'root',
})
export class NavPermissionService {
  resolveVisibleDestinations(employee: Employee): readonly NavDestination[] {
    switch (employee.tier) {
      case 'store-manager':
        return STORE_MANAGER_DESTINATIONS;

      case 'department-manager':
        return DEPARTMENT_MANAGER_DESTINATIONS_BY_DEPARTMENT[employee.department] ?? NO_DESTINATIONS;

      case 'receiving-associate':
        return RECEIVING_ASSOCIATE_DESTINATIONS;

      case 'associate':
        return employee.function === 'cashier' ? ASSOCIATE_CASHIER_DESTINATIONS : ASSOCIATE_BASE_DESTINATIONS;

      default:
        // Least-privilege fallback: a tier that isn't one of the four mapped
        // values (e.g. a bad-data record from a future integration) resolves
        // to no visible destinations — never an error, never allow-all.
        return NO_DESTINATIONS;
    }
  }
}
