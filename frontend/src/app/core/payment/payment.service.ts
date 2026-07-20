import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { PaymentReceipt, PaymentRequest } from '../models/payment/payment.model';

export interface IPaymentService {
  processPayment(request: PaymentRequest): Observable<PaymentReceipt>;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService implements IPaymentService {
  processPayment(_request: PaymentRequest): Observable<PaymentReceipt> {
    return throwError(() => new Error('Real payment processing is not configured yet.'));
  }
}
