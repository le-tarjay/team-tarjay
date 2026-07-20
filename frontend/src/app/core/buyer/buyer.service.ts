import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { Buyer } from '../models/buyer/buyer.model';

export interface IBuyerService {
  list(): Observable<Buyer[]>;
}

@Injectable({
  providedIn: 'root',
})
export class BuyerService implements IBuyerService {
  list(): Observable<Buyer[]> {
    return throwError(() => new Error('Real buyer service is not configured yet.'));
  }
}
