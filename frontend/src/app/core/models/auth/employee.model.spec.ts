import { Department, Employee } from './employee.model';

describe('Employee model', () => {
  it('constructs a valid, correctly-typed record for an Associate', () => {
    const employee: Employee = {
      id: '1',
      name: 'Alex Rivera',
      tier: 'Associate',
      department: 'Cashier',
    };

    expect(employee.tier).toBe('Associate');
    expect(employee.department).toBe('Cashier');
  });

  it('constructs a valid, correctly-typed record for a Department Manager', () => {
    const employee: Employee = {
      id: '2',
      name: 'Jordan Lee',
      tier: 'Department Manager',
      department: 'Electronics',
    };

    expect(employee.tier).toBe('Department Manager');
    expect(employee.department).toBe('Electronics');
  });

  it('constructs a valid, correctly-typed record for a Store Manager', () => {
    const employee: Employee = {
      id: '3',
      name: 'Sam Patel',
      tier: 'Store Manager',
      department: 'Customer Support',
    };

    expect(employee.tier).toBe('Store Manager');
    expect(employee.department).toBe('Customer Support');
  });

  it('constructs a valid, correctly-typed record for a Receiving Associate', () => {
    const employee: Employee = {
      id: '4',
      name: 'Casey Kim',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    expect(employee.tier).toBe('Receiving Associate');
    expect(employee.department).toBe('storewide');
  });

  it("sets a Receiving Associate record's department to 'storewide'", () => {
    const employee: Employee = {
      id: '5',
      name: 'Taylor Reed',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    expect(employee.department).toBe('storewide');
  });

  const namedDepartments: Department[] = ['Grocery', 'Electronics', 'Cashier', 'Customer Support'];

  it.each(namedDepartments)(
    'accepts %s as a named department for a non-Receiving-Associate tier',
    (department) => {
      const employee: Employee = {
        id: '6',
        name: 'Morgan Diaz',
        tier: 'Associate',
        department,
      };

      expect(employee.department).toBe(department);
    },
  );

  it("disallows a Receiving Associate record with anything other than 'storewide'", () => {
    // @ts-expect-error a Receiving Associate's department must be 'storewide', never a named department
    const employee: Employee = {
      id: '7',
      name: 'Riley Chen',
      tier: 'Receiving Associate',
      department: 'Grocery',
    };

    expect(employee).toBeTruthy();
  });

  it('no longer exposes the old two-value role shape', () => {
    const employee: Employee = {
      id: '8',
      name: 'Avery Brooks',
      tier: 'Associate',
      department: 'Grocery',
    };

    // @ts-expect-error `role` is not part of the Employee model's public type anymore
    expect(employee.role).toBeUndefined();
  });
});
