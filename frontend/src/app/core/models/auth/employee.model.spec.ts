import { describe, expect, it } from 'vitest';

import { Employee } from './employee.model';

describe('Employee', () => {
  it('type-checks for each of the four tier values', () => {
    const associate: Employee = { id: '1', name: 'Avery Brooks', tier: 'associate', department: 'grocery' };
    const departmentManager: Employee = {
      id: '2',
      name: 'Jordan Lee',
      tier: 'department-manager',
      department: 'electronics',
    };
    const storeManager: Employee = {
      id: '3',
      name: 'Sam Patel',
      tier: 'store-manager',
      department: 'grocery',
    };
    const receivingAssociate: Employee = {
      id: '4',
      name: 'Riley Chen',
      tier: 'receiving-associate',
      department: 'storewide',
    };

    expect(associate.tier).toBe('associate');
    expect(departmentManager.tier).toBe('department-manager');
    expect(storeManager.tier).toBe('store-manager');
    expect(receivingAssociate.tier).toBe('receiving-associate');
  });

  it('requires department: "storewide" (never null/undefined) for a receiving-associate', () => {
    const receivingAssociate: Employee = {
      id: '4',
      name: 'Riley Chen',
      tier: 'receiving-associate',
      department: 'storewide',
    };

    expect(receivingAssociate.department).toBe('storewide');
    expect(receivingAssociate.department).not.toBeNull();
    expect(receivingAssociate.department).not.toBeUndefined();
  });

  it('allows an associate with function: "cashier", with tier remaining "associate"', () => {
    const cashier: Employee = {
      id: '5',
      name: 'Alex Rivera',
      tier: 'associate',
      department: 'grocery',
      function: 'cashier',
    };

    expect(cashier.tier).toBe('associate');
    expect(cashier.function).toBe('cashier');
  });

  it('rejects the old two-value role shape (compile-time regression check)', () => {
    // @ts-expect-error — `role` is no longer part of Employee; `tier` and `department`
    // are required in its place, so this legacy shape must fail to type-check.
    const legacyEmployee: Employee = { id: '6', name: 'Legacy Employee', role: 'cashier' };

    expect(legacyEmployee).toBeDefined();
  });
});
