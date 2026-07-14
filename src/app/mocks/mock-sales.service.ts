import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';

import { SaleRecord } from '../core/models/sales/sale-record.model';
import { ISalesService } from '../core/sales/sales.service';

@Injectable()
export class MockSalesService implements ISalesService {
  private readonly sales: SaleRecord[] = [
    {
      id: 'sale-001',
      confirmationNumber: 'LT-839201',
      customerName: 'Maya Chen',
      itemCount: 4,
      total: 31.87,
      tenderType: 'card',
      soldAt: new Date('2026-05-11T10:12:00'),
      status: 'Completed',
    },
    {
      id: 'sale-002',
      confirmationNumber: 'LT-839202',
      customerName: 'Walk-in customer',
      itemCount: 2,
      total: 12.43,
      tenderType: 'cash',
      soldAt: new Date('2026-05-11T10:37:00'),
      status: 'Completed',
    },
    {
      id: 'sale-003',
      confirmationNumber: 'LT-839203',
      customerName: 'Ava Patel',
      itemCount: 6,
      total: 58.71,
      tenderType: 'card',
      soldAt: new Date('2026-05-10T15:04:00'),
      status: 'Pending',
    },
    {
      id: 'sale-004',
      confirmationNumber: 'LT-839204',
      customerName: 'Diego Morales',
      itemCount: 1,
      total: 8.99,
      tenderType: 'cash',
      soldAt: new Date('2026-05-09T12:31:00'),
      status: 'Refunded',
    },
  ];

  list(): Observable<SaleRecord[]> {
    return of([...this.sales]).pipe(delay(150));
  }
}
