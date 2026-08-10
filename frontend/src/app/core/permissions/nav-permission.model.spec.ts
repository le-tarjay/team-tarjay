import { Employee } from '../models/auth/employee.model';
import { NavDestination, resolveVisibleDestinations } from './nav-permission.model';

function destinationsOf(visible: ReadonlySet<NavDestination>): NavDestination[] {
  return [...visible].sort();
}

describe('resolveVisibleDestinations', () => {
  it('resolves an Associate (Cashier) to the full route set defined for Associate', () => {
    const employee: Employee = {
      id: '1',
      name: 'Alex Rivera',
      tier: 'Associate',
      department: 'Cashier',
    };

    expect(destinationsOf(resolveVisibleDestinations(employee))).toEqual(
      ['buyers', 'payment', 'products', 'sale', 'sales'],
    );
  });

  it('resolves a Department Manager (Grocery) to the full route set defined for Department Manager', () => {
    const employee: Employee = {
      id: '2',
      name: 'Jordan Lee',
      tier: 'Department Manager',
      department: 'Grocery',
    };

    expect(destinationsOf(resolveVisibleDestinations(employee))).toEqual(
      ['buyers', 'payment', 'products', 'sale', 'sales'],
    );
  });

  it('resolves a Store Manager (Electronics) to the full route set defined for Store Manager', () => {
    const employee: Employee = {
      id: '3',
      name: 'Sam Patel',
      tier: 'Store Manager',
      department: 'Electronics',
    };

    expect(destinationsOf(resolveVisibleDestinations(employee))).toEqual(
      ['buyers', 'payment', 'products', 'sale', 'sales'],
    );
  });

  it('resolves a Receiving Associate (storewide) to its own mapping, independent of any named department', () => {
    const employee: Employee = {
      id: '4',
      name: 'Casey Kim',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    expect(destinationsOf(resolveVisibleDestinations(employee))).toEqual(['products']);
  });

  it('resolves an undefined tier/department combination to an empty set, not an error and not allow-all', () => {
    // The Employee union can't legally produce this combination — this cast
    // exercises the least-privilege fallback the type system itself can't
    // trigger, e.g. against a department added later without updating the
    // mapping, or data arriving from an untyped source.
    const employee = {
      id: '5',
      name: 'Riley Chen',
      tier: 'Store Manager',
      department: 'Warehouse',
    } as unknown as Employee;

    expect(resolveVisibleDestinations(employee).size).toBe(0);
  });

  it('grants payment visibility to a tier/department that should see it', () => {
    const employee: Employee = {
      id: '6',
      name: 'Morgan Diaz',
      tier: 'Associate',
      department: 'Cashier',
    };

    expect(resolveVisibleDestinations(employee).has('payment')).toBe(true);
  });

  it('withholds payment visibility from a tier/department that should not see it', () => {
    const employee: Employee = {
      id: '7',
      name: 'Taylor Reed',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    expect(resolveVisibleDestinations(employee).has('payment')).toBe(false);
  });

  it("does not conflate the Receiving Associate storewide entry with any single named department's mapping", () => {
    const receivingAssociate: Employee = {
      id: '8',
      name: 'Avery Brooks',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    const cashierAssociate: Employee = {
      id: '9',
      name: 'Drew Nguyen',
      tier: 'Associate',
      department: 'Cashier',
    };

    expect(destinationsOf(resolveVisibleDestinations(receivingAssociate))).not.toEqual(
      destinationsOf(resolveVisibleDestinations(cashierAssociate)),
    );
  });
});
