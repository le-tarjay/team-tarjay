import { Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import { PaymentReceipt, PaymentRequest } from '../core/models/payment/payment.model';
import { IPaymentService } from '../core/payment/payment.service';

@Injectable()
export class MockPaymentService implements IPaymentService {
  processPayment(request: PaymentRequest): Observable<PaymentReceipt> {
    if (request.saleTotal <= 0) {
      return throwError(() => new Error('Cannot process an empty sale.'));
    }

    if (request.tenderedAmount < request.saleTotal) {
      return throwError(() => new Error('Tendered amount must cover the sale total.'));
    }

    const receipt: PaymentReceipt = {
      confirmationNumber: `LT-${Date.now().toString().slice(-6)}`,
      processedAt: new Date(),
      customerName: request.customerName || 'Walk-in customer',
      lineItemCount: request.lineItemCount,
      saleTotal: request.saleTotal,
      tenderType: request.tenderType,
      tenderedAmount: request.tenderedAmount,
      changeDue: Math.max(request.tenderedAmount - request.saleTotal, 0),
    };

    return of(receipt).pipe(delay(500));
  }
}
