import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { MockAuthService } from './mock-auth.service';

describe('MockAuthService', () => {
  it('resolves valid Associate (non-Cashier-function) credentials to tier: associate with a named department', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'associate', pin: '1111' }));

    expect(employee.tier).toBe('associate');
    expect(employee.department).toBe('electronics');
    expect(employee.function).toBeUndefined();
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('resolves valid Associate-with-Cashier-function credentials to tier: associate, function: cashier', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'cashier', pin: '1234' }));

    expect(employee.tier).toBe('associate');
    expect(employee.function).toBe('cashier');
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('resolves valid Department Manager credentials to tier: department-manager with a named department', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'deptmgr', pin: '2222' }));

    expect(employee.tier).toBe('department-manager');
    expect(employee.department).toBe('electronics');
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('resolves valid Store Manager credentials to tier: store-manager with a named department', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'storemgr', pin: '3333' }));

    expect(employee.tier).toBe('store-manager');
    expect(employee.department).toBe('grocery');
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('resolves valid Receiving Associate credentials to tier: receiving-associate, department: storewide', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'receiving', pin: '4444' }));

    expect(employee.tier).toBe('receiving-associate');
    expect(employee.department).toBe('storewide');
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('errors with the invalid-login message when the PIN is wrong for a valid employeeId', async () => {
    const service = new MockAuthService();

    await expect(
      firstValueFrom(service.login({ employeeId: 'storemgr', pin: '0000' })),
    ).rejects.toThrow('Invalid employee ID or PIN.');
    expect(service.currentEmployee()).toBeNull();
  });

  it('errors with the invalid-login message when the employeeId is wrong for a valid PIN', async () => {
    const service = new MockAuthService();

    await expect(
      firstValueFrom(service.login({ employeeId: 'nope', pin: '3333' })),
    ).rejects.toThrow('Invalid employee ID or PIN.');
    expect(service.currentEmployee()).toBeNull();
  });

  it('still rejects credentials that match nothing seeded', async () => {
    const service = new MockAuthService();

    await expect(
      firstValueFrom(service.login({ employeeId: 'nope', pin: 'wrong' })),
    ).rejects.toThrow('Invalid employee ID or PIN.');
  });

  it('clears currentEmployee on logout regardless of which tier was signed in', async () => {
    const service = new MockAuthService();

    await firstValueFrom(service.login({ employeeId: 'receiving', pin: '4444' }));
    expect(service.currentEmployee()).not.toBeNull();

    service.logout();

    expect(service.currentEmployee()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
