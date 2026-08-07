import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { MockAuthService } from './mock-auth.service';

describe('MockAuthService', () => {
  it('resolves an Employee with the new tier/department shape on successful login', async () => {
    const service = new MockAuthService();

    const employee = await firstValueFrom(service.login({ employeeId: 'cashier', pin: '1234' }));

    expect(employee.tier).toBe('associate');
    expect(employee.department).toBe('grocery');
    expect(employee.function).toBe('cashier');
    expect(service.currentEmployee()).toEqual(employee);
  });

  it('still rejects invalid credentials', async () => {
    const service = new MockAuthService();

    await expect(firstValueFrom(service.login({ employeeId: 'nope', pin: 'wrong' }))).rejects.toThrow(
      'Invalid employee ID or PIN.',
    );
  });
});
