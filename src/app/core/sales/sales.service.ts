import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { SaleRecord } from '../models/sales/sale-record.model';

export interface ISalesService {
  list(): Observable<SaleRecord[]>;
}

@Injectable({
  providedIn: 'root',
})
export class SalesService implements ISalesService {
  list(): Observable<SaleRecord[]> {
    return throwError(() => new Error('Real sales service is not configured yet.'));
  }
}
