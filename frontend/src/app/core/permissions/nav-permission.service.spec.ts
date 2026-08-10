import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Employee } from '../models/auth/employee.model';
import { NavPermissionService } from './nav-permission.service';

describe('NavPermissionService', () => {
  let service: NavPermissionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
      ],
    });

    service = TestBed.inject(NavPermissionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it("delegates to the permission model, returning a Store Manager's mapped visible set", () => {
    const employee: Employee = {
      id: '1',
      name: 'Sam Patel',
      tier: 'Store Manager',
      department: 'Customer Support',
    };

    const visible = service.getVisibleDestinations(employee);

    expect([...visible].sort()).toEqual(['buyers', 'payment', 'products', 'sale', 'sales']);
  });

  it('returns an empty set for a Receiving Associate on routes outside its mapping', () => {
    const employee: Employee = {
      id: '2',
      name: 'Casey Kim',
      tier: 'Receiving Associate',
      department: 'storewide',
    };

    const visible = service.getVisibleDestinations(employee);

    expect(visible.has('sale')).toBe(false);
    expect(visible.has('products')).toBe(true);
  });
});
