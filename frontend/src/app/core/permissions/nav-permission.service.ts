import { Injectable } from '@angular/core';

import { Employee } from '../models/auth/employee.model';
import { NavDestination, resolveVisibleDestinations } from './nav-permission.model';

/**
 * Thin injectable wrapper over resolveVisibleDestinations so nav rendering
 * and route guards (separate, later stories) can inject one consistent
 * seam rather than importing the resolver function directly. No I/O and no
 * owned state — every call is a pure lookup against the current identity,
 * so unlike the backend-facing services in core/ there's no interface,
 * token, or mock to pair this with.
 */
@Injectable({
  providedIn: 'root',
})
export class NavPermissionService {
  getVisibleDestinations(employee: Employee): ReadonlySet<NavDestination> {
    return resolveVisibleDestinations(employee);
  }
}
