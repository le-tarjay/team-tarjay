import {
  HOME_NAV_ITEM,
  isFullNavSuspended,
  isRouteAllowedForShift,
  mainNavItemsFor,
  shouldLeaveForHome,
} from './shift-navigation';
import { ALL_NAV_ITEMS } from './role-navigation';
import { Employee, EmployeeRole } from '../models/auth/employee.model';
import { ShiftState, ShiftStatus } from '../models/shift/shift-status.model';

const ALL_ROLES: readonly EmployeeRole[] = [
  'Associate',
  'DepartmentManager',
  'StoreManager',
  'ReceivingAssociate',
];

const OFF_DUTY: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

const FULL_NAV_ROUTES = ['/sale', '/products', '/sales', '/buyers', '/payment', '/'];

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
  describe('mainNavItemsFor', () => {
    it.each(OFF_DUTY)('is exactly Home then My schedule for every role when %s', (status) => {
      for (const role of ALL_ROLES) {
        expect(labels(mainNavItemsFor(employee({ role }), shift(status)))).toEqual([
          'Home',
          'My schedule',
        ]);
      }
    });

    it.each(ALL_ROLES)(
      'is the shared items then the role-specific item for a %s on shift',
      (role) => {
        const items = labels(mainNavItemsFor(employee({ role }), shift('OnShift')));

        expect(items.slice(0, 4)).toEqual(['Sale', 'Products', 'Sales', 'Buyers']);
        expect(items).toHaveLength(5);
      },
    );

    it('is empty before the shift status is known', () => {
      expect(mainNavItemsFor(employee({ role: 'StoreManager' }), null)).toEqual([]);
    });

    it('follows onDuty rather than re-deriving it from the status', () => {
      const items = mainNavItemsFor(employee(), { status: 'OnShift', onDuty: false });

      expect(labels(items)).toEqual(['Home', 'My schedule']);
    });
  });

  describe('isFullNavSuspended', () => {
    it.each(OFF_DUTY)('is true when %s', (status) => {
      expect(isFullNavSuspended(shift(status))).toBe(true);
    });

    it('is false on shift', () => {
      expect(isFullNavSuspended(shift('OnShift'))).toBe(false);
    });

    it('is false while the status is unknown, so null is never off shift', () => {
      expect(isFullNavSuspended(null)).toBe(false);
    });
  });

  describe('isRouteAllowedForShift', () => {
    it.each(OFF_DUTY)('denies every full-nav route when %s', (status) => {
      for (const url of FULL_NAV_ROUTES) {
        expect(isRouteAllowedForShift(shift(status), url)).toBe(false);
      }
    });

    it.each(OFF_DUTY)('allows Home and My schedule when %s, query string included', (status) => {
      for (const url of ['/home', '/schedule', '/home?x=1', '/schedule#today']) {
        expect(isRouteAllowedForShift(shift(status), url)).toBe(true);
      }
    });

    it('allows every route on shift', () => {
      for (const url of [...FULL_NAV_ROUTES, '/home', '/schedule']) {
        expect(isRouteAllowedForShift(shift('OnShift'), url)).toBe(true);
      }
    });

    it('allows every route while the status is unknown', () => {
      for (const url of [...FULL_NAV_ROUTES, '/home', '/schedule']) {
        expect(isRouteAllowedForShift(null, url)).toBe(true);
      }
    });
  });

  describe('shouldLeaveForHome', () => {
    it.each(OFF_DUTY)('is true on a full-nav route when %s', (status) => {
      expect(shouldLeaveForHome(shift(status), '/sale')).toBe(true);
    });

    it.each(OFF_DUTY)('is false on Login when %s', (status) => {
      expect(shouldLeaveForHome(shift(status), '/login?returnUrl=%2Fschedule')).toBe(false);
    });

    it('is false on Home when on shift', () => {
      expect(shouldLeaveForHome(shift('OnShift'), '/home')).toBe(false);
    });
  });

  /**
   * The role gate turns away any route an item in `ALL_NAV_ITEMS` governs and
   * the employee's role does not earn. Home and My schedule are open to every
   * role, so neither may be governed that way.
   */
  it('keeps Home and My schedule out of the role gate', () => {
    const governed = labels(ALL_NAV_ITEMS);

    expect(governed).not.toContain(HOME_NAV_ITEM.label);
    expect(governed).not.toContain('My schedule');
  });
});
