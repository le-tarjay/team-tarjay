import { Employee, Tier } from './employee.model';

describe('Employee model', () => {
  it('type-checks an employee for each of the four tier values', () => {
    const tiers: Tier[] = ['associate', 'department-manager', 'store-manager', 'receiving-associate'];

    const employees: Employee[] = tiers.map((tier) => ({
      id: 'emp-001',
      name: 'Sample Employee',
      tier,
      department: 'grocery',
    }));

    expect(employees).toHaveLength(4);
    expect(employees.map((employee) => employee.tier)).toEqual(tiers);
  });

  it('represents a Receiving Associate with an explicit storewide department', () => {
    const employee: Employee = {
      id: 'emp-002',
      name: 'Jordan Lee',
      tier: 'receiving-associate',
      department: 'storewide',
    };

    expect(employee.department).toBe('storewide');
    expect(employee.department).not.toBeNull();
    expect(employee.department).not.toBeUndefined();
  });

  it('represents a cashier as an Associate-tier function, not a tier of its own', () => {
    const employee: Employee = {
      id: 'emp-003',
      name: 'Alex Rivera',
      tier: 'associate',
      department: 'cashier',
      function: 'cashier',
    };

    expect(employee.tier).toBe('associate');
    expect(employee.function).toBe('cashier');
  });

  it('no longer type-checks the old two-value role shape (compile-time regression check)', () => {
    const legacyShapeEmployee = { id: 'emp-004', name: 'Old Shape', role: 'cashier' as const };

    // @ts-expect-error the old `role: 'cashier' | 'manager'` shape (no `tier`/`department`)
    // must not be assignable to `Employee` anymore.
    const employee: Employee = legacyShapeEmployee;

    expect(employee).toBeTruthy();
  });
});
