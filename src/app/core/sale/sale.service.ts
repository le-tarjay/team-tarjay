import { computed, Injectable, signal } from '@angular/core';

import { Product } from '../models/product/product.model';
import { SaleLineItem } from '../models/sale/sale-line-item.model';

@Injectable({
  providedIn: 'root',
})
export class SaleService {
  private readonly lineItemsState = signal<SaleLineItem[]>([]);
  private readonly customerNameState = signal('');

  readonly lineItems = this.lineItemsState.asReadonly();
  readonly customerName = this.customerNameState.asReadonly();

  readonly subtotal = computed(() => {
    return this.lineItems().reduce((total, item) => {
      return total + item.product.price * item.quantity;
    }, 0);
  });

  readonly tax = computed(() => this.subtotal() * 0.0825);

  readonly total = computed(() => this.subtotal() + this.tax());

  readonly hasActiveSale = computed(() => this.lineItems().length > 0);

  addProduct(product: Product): void {
    this.lineItemsState.update((items) => {
      const existingItem = items.find((item) => item.product.id === product.id);

      if (existingItem) {
        return items.map((item) => {
          if (item.product.id !== product.id) {
            return item;
          }

          return {
            ...item,
            quantity: item.quantity + 1,
          };
        });
      }

      return [
        ...items,
        {
          product,
          quantity: 1,
        },
      ];
    });
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeProduct(productId);
      return;
    }

    this.lineItemsState.update((items) => {
      return items.map((item) => {
        if (item.product.id !== productId) {
          return item;
        }

        return {
          ...item,
          quantity,
        };
      });
    });
  }

  removeProduct(productId: string): void {
    this.lineItemsState.update((items) => {
      return items.filter((item) => item.product.id !== productId);
    });
  }

  setCustomerName(customerName: string): void {
    this.customerNameState.set(customerName);
  }

  reset(): void {
    this.lineItemsState.set([]);
    this.customerNameState.set('');
  }
}
