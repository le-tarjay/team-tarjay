import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Employee } from '../models/auth/employee.model';
import { NavPermissionService } from './nav-permission.service';

describe('NavPermissionService', () => {
  let service: NavPermissionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    service = TestBed.inject(NavPermissionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('each of the four tiers, with no department/function narrowing applied', () => {
    it('resolves a Store Manager to every nav destination', () => {
      const storeManager: Employee = {
        id: '1',
        name: 'Sam Patel',
        tier: 'store-manager',
        department: 'grocery',
      };

      expect(service.resolveVisibleDestinations(storeManager)).toEqual([
        '/sale',
        '/products',
        '/sales',
        '/buyers',
        '/payment',
      ]);
    });

    it('resolves a Department Manager in a named department to every nav destination', () => {
      const departmentManager: Employee = {
        id: '2',
        name: 'Jordan Lee',
        tier: 'department-manager',
        department: 'electronics',
      };

      expect(service.resolveVisibleDestinations(departmentManager)).toEqual([
        '/sale',
        '/products',
        '/sales',
        '/buyers',
        '/payment',
      ]);
    });

    it('resolves a non-Cashier Associate to the baseline set (sale, products, sales, payment — no buyers)', () => {
      const associate: Employee = {
        id: '3',
        name: 'Avery Brooks',
        tier: 'associate',
        department: 'grocery',
      };

      expect(service.resolveVisibleDestinations(associate)).toEqual(['/sale', '/products', '/sales', '/payment']);
    });

    it('resolves a Receiving Associate to an empty set', () => {
      const receivingAssociate: Employee = {
        id: '4',
        name: 'Riley Chen',
        tier: 'receiving-associate',
        department: 'storewide',
      };

      expect(service.resolveVisibleDestinations(receivingAssociate)).toEqual([]);
    });
  });

  it("scopes a Department Manager's visible set to their own (named) department, consistently across departments", () => {
    const groceryManager: Employee = {
      id: '5',
      name: 'Jordan Lee',
      tier: 'department-manager',
      department: 'grocery',
    };
    const electronicsManager: Employee = {
      id: '6',
      name: 'Morgan Diaz',
      tier: 'department-manager',
      department: 'electronics',
    };
    const customerSupportManager: Employee = {
      id: '7',
      name: 'Casey Kim',
      tier: 'department-manager',
      department: 'customer-support',
    };

    const expected = ['/sale', '/products', '/sales', '/buyers', '/payment'];

    expect(service.resolveVisibleDestinations(groceryManager)).toEqual(expected);
    expect(service.resolveVisibleDestinations(electronicsManager)).toEqual(expected);
    expect(service.resolveVisibleDestinations(customerSupportManager)).toEqual(expected);
  });

  it('resolves a Receiving Associate (storewide) correctly without department-based restriction misapplied', () => {
    const receivingAssociate: Employee = {
      id: '8',
      name: 'Riley Chen',
      tier: 'receiving-associate',
      department: 'storewide',
    };

    // Storewide status must not accidentally grant the department-bound
    // tiers' destinations, and Receiving's own (not-yet-built) domain has no
    // nav route to resolve to today.
    expect(service.resolveVisibleDestinations(receivingAssociate)).toEqual([]);
  });

  it('resolves an Associate with function "cashier" to a distinct set from a non-Cashier Associate', () => {
    const cashier: Employee = {
      id: '9',
      name: 'Alex Rivera',
      tier: 'associate',
      department: 'grocery',
      function: 'cashier',
    };
    const nonCashier: Employee = {
      id: '10',
      name: 'Avery Brooks',
      tier: 'associate',
      department: 'grocery',
    };

    const cashierDestinations = service.resolveVisibleDestinations(cashier);
    const nonCashierDestinations = service.resolveVisibleDestinations(nonCashier);

    expect(cashierDestinations).toEqual(['/sale', '/products', '/sales', '/payment', '/buyers']);
    expect(nonCashierDestinations).toEqual(['/sale', '/products', '/sales', '/payment']);
    expect(cashierDestinations).not.toEqual(nonCashierDestinations);
    expect(cashierDestinations).toContain('/buyers');
    expect(nonCashierDestinations).not.toContain('/buyers');
  });

  it('resolves an unmapped tier/department/function combination to an empty (least-privilege) set', () => {
    // A Department Manager is always home-departmented (grocery/electronics/
    // customer-support), never 'storewide' — that value is reserved for
    // Receiving Associate. This simulates a bad-data record that falls
    // outside the explicit department lookup.
    const misTaggedManager: Employee = {
      id: '11',
      name: 'Taylor Nguyen',
      tier: 'department-manager',
      department: 'storewide',
    };

    expect(() => service.resolveVisibleDestinations(misTaggedManager)).not.toThrow();
    expect(service.resolveVisibleDestinations(misTaggedManager)).toEqual([]);
  });

  it('resolves an unrecognized tier to an empty (least-privilege) set rather than throwing or allow-all', () => {
    const unknownTierEmployee = {
      id: '12',
      name: 'Unknown Tier',
      tier: 'district-manager',
      department: 'grocery',
    } as unknown as Employee;

    expect(() => service.resolveVisibleDestinations(unknownTierEmployee)).not.toThrow();
    expect(service.resolveVisibleDestinations(unknownTierEmployee)).toEqual([]);
  });

  it('returns identical results when called twice with the same employee (pure/deterministic)', () => {
    const employee: Employee = {
      id: '13',
      name: 'Avery Brooks',
      tier: 'associate',
      department: 'grocery',
      function: 'cashier',
    };

    const first = service.resolveVisibleDestinations(employee);
    const second = service.resolveVisibleDestinations(employee);

    expect(first).toEqual(second);
  });
});
