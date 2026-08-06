import { MockAuthService } from './mock-auth.service';

describe('MockAuthService', () => {
  let service: MockAuthService;

  beforeEach(() => {
    service = new MockAuthService();
  });

  it('resolves a valid login to an employee built against the new tier/department shape', async () => {
    const employee = await new Promise((resolve, reject) => {
      service.login({ employeeId: 'cashier', pin: '1234' }).subscribe({
        next: resolve,
        error: reject,
      });
    });

    expect(employee).toEqual({
      id: 'cashier',
      name: 'Alex Rivera',
      tier: 'associate',
      department: 'cashier',
      function: 'cashier',
    });
    expect(service.currentEmployee()).toEqual(employee);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('rejects an invalid login without touching current employee state', async () => {
    await expect(
      new Promise((resolve, reject) => {
        service.login({ employeeId: 'nope', pin: '0000' }).subscribe({
          next: resolve,
          error: reject,
        });
      }),
    ).rejects.toThrow('Invalid employee ID or PIN.');

    expect(service.currentEmployee()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
