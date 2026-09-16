import { DEFAULT_SIGNED_IN_ROUTE, isRouteAllowedForEmployee, navItemsFor } from './route-access';
import { Employee, EmployeeRole } from '../models/auth/employee.model';

const ALL_ROLES: readonly EmployeeRole[] = [
  'Associate',
  'DepartmentManager',
  'StoreManager',
  'ReceivingAssociate',
];

const SHARED_ROUTES = ['/sale', '/products', '/sales', '/buyers'];

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e-1',
    name: 'Avery Brooks',
    role: 'Associate',
    department: 'Grocery',
    jobFunction: 'Sales Floor',
    ...overrides,
  };
}

describe('route access', () => {
  describe("a route the employee's nav covers", () => {
    it.each(ALL_ROLES)('lets a %s reach every shared route', (role) => {
      for (const route of SHARED_ROUTES) {
        expect(isRouteAllowedForEmployee(employee({ role }), route)).toBe(true);
      }
    });

    it('lets a Receiving Associate reach the route their own item names', () => {
      const receiving = employee({ role: 'ReceivingAssociate', department: 'Receiving' });

      expect(isRouteAllowedForEmployee(receiving, '/receiving', 'Receiving')).toBe(true);
    });

    it('lets a Store Manager reach both admin destinations', () => {
      const manager = employee({ role: 'StoreManager' });

      expect(isRouteAllowedForEmployee(manager, '/employee-roster', 'Employee roster')).toBe(true);
      expect(isRouteAllowedForEmployee(manager, '/register-status', 'Register status')).toBe(true);
    });

    it('lets the Customer Support job function reach Fulfillment', () => {
      const support = employee({ jobFunction: 'Customer Support' });

      expect(isRouteAllowedForEmployee(support, '/fulfillment', 'Fulfillment')).toBe(true);
    });
  });

  describe("a route the employee's nav does not cover", () => {
    it.each(ALL_ROLES.filter((role) => role !== 'StoreManager'))(
      'turns a %s away from a Store Manager admin destination',
      (role) => {
        expect(
          isRouteAllowedForEmployee(employee({ role }), '/employee-roster', 'Employee roster'),
        ).toBe(false);
      },
    );

    it('turns an Associate away from Receiving', () => {
      expect(isRouteAllowedForEmployee(employee(), '/receiving', 'Receiving')).toBe(false);
    });

    it('turns an employee away from the stocking item the other tier gets', () => {
      const associate = employee({ role: 'Associate' });
      const manager = employee({ role: 'DepartmentManager' });

      expect(isRouteAllowedForEmployee(associate, '/stocking', 'Stocking')).toBe(false);
      expect(isRouteAllowedForEmployee(manager, '/my-tasks', 'My tasks')).toBe(false);
    });

    it('turns an employee away from Fulfillment when their job function is not Customer Support', () => {
      expect(
        isRouteAllowedForEmployee(
          employee({ jobFunction: 'Register' }),
          '/fulfillment',
          'Fulfillment',
        ),
      ).toBe(false);
    });

    /**
     * Fails closed. A route naming an item no identity can produce is a typo,
     * and the safe reading of a typo in a permission rule is "nobody", not
     * "everybody".
     */
    it.each(ALL_ROLES)('turns a %s away from a route naming an item nav never produces', (role) => {
      expect(isRouteAllowedForEmployee(employee({ role }), '/whatever', 'Not a nav item')).toBe(
        false,
      );
    });
  });

  describe('a route no nav item governs', () => {
    it.each(ALL_ROLES)('leaves /payment to the guards that do cover it, for a %s', (role) => {
      expect(isRouteAllowedForEmployee(employee({ role }), '/payment')).toBe(true);
    });
  });

  describe('matching the URL to a nav item', () => {
    it('ignores a query string', () => {
      expect(isRouteAllowedForEmployee(employee(), '/products?query=milk')).toBe(true);
    });

    it('ignores a fragment', () => {
      expect(isRouteAllowedForEmployee(employee(), '/products#top')).toBe(true);
    });

    it('gates the path, not the query string, when the two disagree', () => {
      const associate = employee();

      expect(isRouteAllowedForEmployee(associate, '/receiving?from=/products', 'Receiving')).toBe(
        false,
      );
    });
  });

  describe('the default destination', () => {
    it.each(ALL_ROLES)('is reachable by a %s, so nobody is redirected in a loop', (role) => {
      expect(isRouteAllowedForEmployee(employee({ role }), DEFAULT_SIGNED_IN_ROUTE)).toBe(true);
    });
  });

  describe('the item set the gate reads', () => {
    it('is the nav bar and the account menu together', () => {
      const labels = navItemsFor(employee({ role: 'StoreManager' })).map((item) => item.label);

      expect(labels).toEqual([
        'Sale',
        'Products',
        'Sales',
        'Buyers',
        'Stocking',
        'Employee roster',
        'Register status',
      ]);
    });

    it('gives a non-manager no admin entries', () => {
      const labels = navItemsFor(employee()).map((item) => item.label);

      expect(labels).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'My tasks']);
    });
  });
});
