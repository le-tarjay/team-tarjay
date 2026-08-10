import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { MockAuthService } from './mock-auth.service';

describe('MockAuthService', () => {
  let service: MockAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), MockAuthService],
    });

    service = TestBed.inject(MockAuthService);
  });

  it('resolves the Cashier-department Associate to tier Associate and department Cashier', async () => {
    const employee = await firstValueFrom(service.login({ employeeId: 'cashier', pin: '1234' }));

    expect(employee.tier).toBe('Associate');
    expect(employee.department).toBe('Cashier');
  });

  it('resolves a Department Manager to tier Department Manager and its seeded department', async () => {
    const employee = await firstValueFrom(service.login({ employeeId: 'jlee', pin: '2345' }));

    expect(employee.tier).toBe('Department Manager');
    expect(employee.department).toBe('Electronics');
  });

  it('resolves a Store Manager to tier Store Manager and its seeded department', async () => {
    const employee = await firstValueFrom(service.login({ employeeId: 'spatel', pin: '3456' }));

    expect(employee.tier).toBe('Store Manager');
    expect(employee.department).toBe('Customer Support');
  });

  it('resolves a Receiving Associate to tier Receiving Associate and department storewide', async () => {
    const employee = await firstValueFrom(service.login({ employeeId: 'ckim', pin: '4567' }));

    expect(employee.tier).toBe('Receiving Associate');
    expect(employee.department).toBe('storewide');
  });

  it('is case-insensitive on employee ID and trims whitespace, same as the prior single-credential lookup', async () => {
    const employee = await firstValueFrom(
      service.login({ employeeId: '  CASHIER  ', pin: '1234' }),
    );

    expect(employee.id).toBe('cashier');
  });

  it('rejects an unseeded Employee ID + PIN pair with the existing invalid-credential error, not a silent default identity', async () => {
    await expect(
      firstValueFrom(service.login({ employeeId: 'nobody', pin: '0000' })),
    ).rejects.toThrow('Invalid employee ID or PIN.');
  });

  it('rejects a seeded Employee ID paired with the wrong PIN', async () => {
    await expect(
      firstValueFrom(service.login({ employeeId: 'cashier', pin: '0000' })),
    ).rejects.toThrow('Invalid employee ID or PIN.');
  });

  it('sets currentEmployee and isAuthenticated after a successful login', async () => {
    await firstValueFrom(service.login({ employeeId: 'ckim', pin: '4567' }));

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentEmployee()?.id).toBe('ckim');
  });

  it('clears currentEmployee and isAuthenticated on logout', async () => {
    await firstValueFrom(service.login({ employeeId: 'cashier', pin: '1234' }));

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentEmployee()).toBeNull();
  });
});
