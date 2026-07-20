import { CurrencyPipe } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Product } from '../../core/models/product/product.model';
import { PRODUCT_SERVICE } from '../../core/tokens';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './product-search.component.html',
  styleUrl: './product-search.component.scss',
})
export class ProductSearchComponent {
  private readonly productService = inject(PRODUCT_SERVICE);

  readonly productSelected = output<Product>();

  readonly query = signal('');
  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(false);

  search(): void {
    this.isLoading.set(true);

    this.productService.search(this.query()).subscribe({
      next: (products) => {
        this.products.set(products);
        this.isLoading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.isLoading.set(false);
      },
    });
  }

  selectProduct(product: Product): void {
    this.productSelected.emit(product);
  }
}
