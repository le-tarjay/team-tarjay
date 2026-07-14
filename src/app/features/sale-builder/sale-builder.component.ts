import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Product } from '../../core/models/product/product.model';
import { SaleService } from '../../core/sale/sale.service';
import { ProductSearchComponent } from '../../shared/product-search/product-search.component';
import { SaleLineItemComponent } from '../../shared/sale-line-item/sale-line-item.component';
import { SaleSummaryComponent } from '../../shared/sale-summary/sale-summary.component';

@Component({
  selector: 'app-sale-builder',
  standalone: true,
  imports: [
    ProductSearchComponent,
    SaleLineItemComponent,
    SaleSummaryComponent,
  ],
  templateUrl: './sale-builder.component.html',
  styleUrl: './sale-builder.component.scss',
})
export class SaleBuilderComponent {
  private readonly saleService = inject(SaleService);
  private readonly router = inject(Router);

  readonly lineItems = this.saleService.lineItems;
  readonly customerName = this.saleService.customerName;
  readonly subtotal = this.saleService.subtotal;
  readonly tax = this.saleService.tax;
  readonly total = this.saleService.total;
  readonly hasActiveSale = this.saleService.hasActiveSale;

  addProduct(product: Product): void {
    this.saleService.addProduct(product);
  }

  updateQuantity(productId: string, quantity: number): void {
    this.saleService.updateQuantity(productId, quantity);
  }

  removeProduct(productId: string): void {
    this.saleService.removeProduct(productId);
  }

  updateCustomerName(customerName: string): void {
    this.saleService.setCustomerName(customerName);
  }

  goToPayment(): void {
    if (!this.hasActiveSale()) {
      return;
    }

    this.router.navigateByUrl('/payment');
  }
}
