import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { ShiftState, ShiftStatus } from '../models/shift/shift-status.model';
import { ALL_NAV_ITEMS, roleSpecificNavItem, SHARED_NAV_ITEMS } from './role-navigation';
import {
  HOME_NAV_ITEM,
  isFullNavSuspended,
  isRouteAllowedForShift,
  mainNavItemsFor,
} from './shift-navigation';

const ALL_ROLES: readonly EmployeeRole[] = [
  'Associate',
  'DepartmentManager',
  'StoreManager',
  'ReceivingAssociate',
];

const FULL_NAV_AND_SALE_FLOW_ROUTES = ['/sale', '/products', '/sales', '/buyers', '/payment'];

function employee(role: EmployeeRole): Employee {
  return {
    id: 'e-1',
    name: 'Avery Brooks',
    role,
    department: 'Grocery',
    jobFunction: 'Sales Floor',
  };
}

function shift(status: ShiftStatus): ShiftState {
  return { status, onDuty: status === 'OnShift' };
}

function labels(status: ShiftStatus | null, role: EmployeeRole = 'Associate'): string[] {
  return mainNavItemsFor(employee(role), status === null ? null : shift(status)).map(
    (item) => item.label,
  );
}

describe('shift navigation', () => {
  describe('the main nav', () => {
    it.each(ALL_ROLES)('is exactly Home then My schedule off shift, for a %s', (role) => {
      expect(labels('OffShift', role)).toEqual(['Home', 'My schedule']);
    });

    it.each(ALL_ROLES)('is exactly Home then My schedule on break, for a %s', (role) => {
      expect(labels('OnBreak', role)).toEqual(['Home', 'My schedule']);
    });

    it.each(ALL_ROLES)('is the full role-based set on shift, for a %s', (role) => {
      const expected = [...SHARED_NAV_ITEMS, roleSpecificNavItem(employee(role))].map(
        (item) => item.label,
      );

      expect(labels('OnShift', role)).toEqual(expected);
    });

    it('is empty while no shift status is held', () => {
      expect(labels(null)).toEqual([]);
    });
  });

  describe('suspension', () => {
    it('follows the server\'s onDuty fact', () => {
      expect(isFullNavSuspended({ status: 'OnShift', onDuty: true })).toBe(false);
      expect(isFullNavSuspended({ status: 'OffShift', onDuty: false })).toBe(true);
      expect(isFullNavSuspended({ status: 'OnBreak', onDuty: false })).toBe(true);
    });

    it('never treats an unread status as off shift', () => {
      expect(isFullNavSuspended(null)).toBe(false);
    });
  });

  describe('the shift gate', () => {
    it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
      'lets only Home and My schedule through when %s',
      (status) => {
        expect(isRouteAllowedForShift(shift(status), '/home')).toBe(true);
        expect(isRouteAllowedForShift(shift(status), '/schedule?week=next')).toBe(true);

        for (const url of FULL_NAV_AND_SALE_FLOW_ROUTES) {
          expect(isRouteAllowedForShift(shift(status), url)).toBe(false);
        }
      },
    );

    it.each<ShiftState | null>([shift('OnShift'), null])(
      'lets every route through for %o',
      (state) => {
        for (const url of [...FULL_NAV_AND_SALE_FLOW_ROUTES, '/home', '/schedule']) {
          expect(isRouteAllowedForShift(state, url)).toBe(true);
        }
      },
    );
  });

  /**
   * The role gate turns away any route an item in `ALL_NAV_ITEMS` governs.
   * Home and My schedule must stay out of it, or a role could lose them.
   */
  it('keeps Home and My schedule out of the list the role gate governs by', () => {
    const governed = ALL_NAV_ITEMS.map((item) => item.label);

    expect(governed).not.toContain(HOME_NAV_ITEM.label);
    expect(governed).not.toContain('My schedule');
  });
});
