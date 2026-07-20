import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';

import { PaymentReceipt } from '../../core/models/payment/payment.model';

@Component({
  selector: 'app-payment-confirmation',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, TitleCasePipe],
  templateUrl: './payment-confirmation.html',
  styleUrl: './payment-confirmation.scss',
})
export class PaymentConfirmation {
  readonly canProcess = input(false);
  readonly isProcessing = input(false);
  readonly errorMessage = input('');
  readonly receipt = input<PaymentReceipt | null>(null);

  readonly processPayment = output<void>();
  readonly startNewSale = output<void>();
}
