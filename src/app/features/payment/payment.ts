import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PaymentReceipt, TenderSelection, TenderType } from '../../core/models/payment/payment.model';
import { SaleService } from '../../core/sale/sale.service';
import { PAYMENT_SERVICE } from '../../core/tokens';
import { PaymentConfirmation } from '../../shared/payment-confirmation/payment-confirmation';
import { SaleSummaryComponent } from '../../shared/sale-summary/sale-summary.component';
import { TenderSelector } from '../../shared/tender-selector/tender-selector';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    PaymentConfirmation,
    SaleSummaryComponent,
    TenderSelector,
  ],
  templateUrl: './payment.html',
  styleUrl: './payment.scss',
})
export class PaymentComponent {
  private readonly paymentService = inject(PAYMENT_SERVICE);
  private readonly router = inject(Router);
  private readonly saleService = inject(SaleService);

  readonly customerName = this.saleService.customerName;
  readonly lineItems = this.saleService.lineItems;
  readonly subtotal = this.saleService.subtotal;
  readonly tax = this.saleService.tax;
  readonly total = this.saleService.total;

  readonly tenderType = signal<TenderType>('cash');
  readonly tenderedAmount = signal(this.total());
  readonly isProcessing = signal(false);
  readonly errorMessage = signal('');
  readonly receipt = signal<PaymentReceipt | null>(null);

  readonly canProcess = computed(() => {
    return (
      this.total() > 0 &&
      this.tenderedAmount() >= this.total() &&
      !this.isProcessing() &&
      this.receipt() === null
    );
  });

  readonly amountRemaining = computed(() => {
    return Math.max(this.total() - this.tenderedAmount(), 0);
  });

  updateTender(selection: TenderSelection): void {
    this.tenderType.set(selection.tenderType);
    this.tenderedAmount.set(selection.tenderedAmount);
    this.errorMessage.set('');
  }

  processPayment(): void {
    if (!this.canProcess()) {
      this.errorMessage.set('Tendered amount must cover the sale total.');
      return;
    }

    this.errorMessage.set('');
    this.isProcessing.set(true);

    this.paymentService.processPayment({
      customerName: this.customerName(),
      lineItemCount: this.lineItems().length,
      saleTotal: this.total(),
      tenderType: this.tenderType(),
      tenderedAmount: this.tenderedAmount(),
    }).subscribe({
      next: (receipt) => {
        this.receipt.set(receipt);
        this.isProcessing.set(false);
        this.saleService.reset();
      },
      error: (error: Error) => {
        this.errorMessage.set(error.message);
        this.isProcessing.set(false);
      },
    });
  }

  goBackToSale(): void {
    this.router.navigateByUrl('/sale');
  }

  startNewSale(): void {
    this.router.navigateByUrl('/sale');
  }
}
