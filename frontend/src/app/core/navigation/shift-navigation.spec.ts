import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { ShiftState, ShiftStatus } from '../models/shift/shift-status.model';
import { MY_SCHEDULE_NAV_ITEM } from './my-schedule-entry';
import { ALL_NAV_ITEMS } from './role-navigation';
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

const FULL_NAV_ROUTES = ['/sale', '/products', '/sales', '/buyers'];

const OFF_DUTY_STATUSES: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

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

function shift(status: ShiftStatus): ShiftState {
  return { status, onDuty: status === 'OnShift' };
}

function labels(items: readonly { label: string }[]): string[] {
  return items.map((item) => item.label);
}

describe('shift navigation', () => {
  describe('isFullNavSuspended', () => {
    it.each(OFF_DUTY_STATUSES)('is true when %s', (status) => {
      expect(isFullNavSuspended(shift(status))).toBe(true);
    });

    it('is false on shift', () => {
      expect(isFullNavSuspended(shift('OnShift'))).toBe(false);
    });

    it('is false while the shift is unknown, never treating that as off shift', () => {
      expect(isFullNavSuspended(null)).toBe(false);
    });

    it("reads the server's on-duty fact rather than re-deriving it from the status", () => {
      expect(isFullNavSuspended({ status: 'OnShift', onDuty: false })).toBe(true);
      expect(isFullNavSuspended({ status: 'OffShift', onDuty: true })).toBe(false);
    });
  });

  describe('mainNavItemsFor', () => {
    it.each(OFF_DUTY_STATUSES)(
      'is exactly Home then My schedule when %s, for every role',
      (status) => {
        for (const role of ALL_ROLES) {
          expect(labels(mainNavItemsFor(employee({ role }), shift(status)))).toEqual([
            'Home',
            'My schedule',
          ]);
        }
      },
    );

    it.each<{ role: EmployeeRole; tail: string }>([
      { role: 'Associate', tail: 'My tasks' },
      { role: 'DepartmentManager', tail: 'Stocking' },
      { role: 'StoreManager', tail: 'Stocking' },
      { role: 'ReceivingAssociate', tail: 'Receiving' },
    ])('is the full role-based set for a $role on shift', ({ role, tail }) => {
      expect(labels(mainNavItemsFor(employee({ role }), shift('OnShift')))).toEqual([
        'Sale',
        'Products',
        'Sales',
        'Buyers',
        tail,
      ]);
    });

    it('is empty while the shift is unknown', () => {
      expect(mainNavItemsFor(employee(), null)).toEqual([]);
    });

    it('links Home to /home and My schedule to /schedule', () => {
      expect(HOME_NAV_ITEM.route).toBe('/home');
      expect(mainNavItemsFor(employee(), shift('OffShift'))).toEqual([
        HOME_NAV_ITEM,
        MY_SCHEDULE_NAV_ITEM,
      ]);
    });
  });

  describe('isRouteAllowedForShift', () => {
    it.each(OFF_DUTY_STATUSES)('turns every full-nav route away when %s', (status) => {
      for (const url of FULL_NAV_ROUTES) {
        expect(isRouteAllowedForShift(shift(status), url)).toBe(false);
      }
    });

    it.each(OFF_DUTY_STATUSES)(
      'turns every role-specific route, and /payment, away when %s',
      (status) => {
        for (const url of ['/receiving', '/fulfillment', '/my-tasks', '/stocking', '/payment']) {
          expect(isRouteAllowedForShift(shift(status), url)).toBe(false);
        }
      },
    );

    it.each(OFF_DUTY_STATUSES)('allows Home and My schedule when %s', (status) => {
      expect(isRouteAllowedForShift(shift(status), '/home')).toBe(true);
      expect(isRouteAllowedForShift(shift(status), '/schedule')).toBe(true);
    });

    it.each(OFF_DUTY_STATUSES)('judges the path, not the query string, when %s', (status) => {
      expect(isRouteAllowedForShift(shift(status), '/schedule?week=next')).toBe(true);
      expect(isRouteAllowedForShift(shift(status), '/sale?from=%2Fhome')).toBe(false);
    });

    it('allows every route on shift', () => {
      for (const url of [...FULL_NAV_ROUTES, '/payment', '/home', '/schedule']) {
        expect(isRouteAllowedForShift(shift('OnShift'), url)).toBe(true);
      }
    });

    it('allows every route while the shift is unknown', () => {
      for (const url of [...FULL_NAV_ROUTES, '/payment', '/home', '/schedule']) {
        expect(isRouteAllowedForShift(null, url)).toBe(true);
      }
    });

    it.each<ShiftStatus | null>(['OffShift', 'OnShift', 'OnBreak', null])(
      'keeps My schedule reachable when the shift is %s',
      (status) => {
        expect(isRouteAllowedForShift(status === null ? null : shift(status), '/schedule')).toBe(
          true,
        );
      },
    );
  });

  /**
   * The role gate turns away any URL an item in `ALL_NAV_ITEMS` governs. My
   * schedule and Home stay out of it so the role gate never governs them.
   */
  it('leaves Home and My schedule out of the list the role gate governs by', () => {
    expect(ALL_NAV_ITEMS).not.toContain(HOME_NAV_ITEM);
    expect(ALL_NAV_ITEMS).not.toContain(MY_SCHEDULE_NAV_ITEM);
  });
});
