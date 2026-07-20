import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';

import { SaleLineItem } from '../../core/models/sale/sale-line-item.model';

@Component({
  selector: 'app-sale-line-item',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './sale-line-item.component.html',
  styleUrl: './sale-line-item.component.scss',
})
export class SaleLineItemComponent {
  readonly item = input.required<SaleLineItem>();

  readonly quantityChanged = output<number>();
  readonly removed = output<void>();

  readonly lineTotal = computed(() => {
    const item = this.item();
    return item.product.price * item.quantity;
  });

  decreaseQuantity(): void {
    this.quantityChanged.emit(this.item().quantity - 1);
  }

  increaseQuantity(): void {
    this.quantityChanged.emit(this.item().quantity + 1);
  }

  remove(): void {
    this.removed.emit();
  }
}
