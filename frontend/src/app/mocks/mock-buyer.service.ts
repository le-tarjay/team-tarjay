import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';

import { IBuyerService } from '../core/buyer/buyer.service';
import { Buyer } from '../core/models/buyer/buyer.model';

@Injectable()
export class MockBuyerService implements IBuyerService {
  private readonly buyers: Buyer[] = [
    {
      id: 'buyer-001',
      name: 'Maya Chen',
      email: 'maya.chen@example.com',
      phone: '(555) 010-1042',
      loyaltyLevel: 'Gold',
      totalSpent: 842.75,
      lastVisit: new Date('2026-05-03T13:20:00'),
    },
    {
      id: 'buyer-002',
      name: 'Diego Morales',
      email: 'diego.morales@example.com',
      phone: '(555) 010-9981',
      loyaltyLevel: 'Silver',
      totalSpent: 318.4,
      lastVisit: new Date('2026-04-27T09:45:00'),
    },
    {
      id: 'buyer-003',
      name: 'Ava Patel',
      email: 'ava.patel@example.com',
      phone: '(555) 010-7720',
      loyaltyLevel: 'Platinum',
      totalSpent: 1294.1,
      lastVisit: new Date('2026-05-09T16:05:00'),
    },
    {
      id: 'buyer-004',
      name: 'Noah Brooks',
      email: 'noah.brooks@example.com',
      phone: '(555) 010-4408',
      loyaltyLevel: 'Standard',
      totalSpent: 89.99,
      lastVisit: new Date('2026-04-12T11:10:00'),
    },
  ];

  list(): Observable<Buyer[]> {
    return of([...this.buyers]).pipe(delay(150));
  }
}
