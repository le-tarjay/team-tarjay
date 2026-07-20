import { Component, inject, OnInit, signal } from '@angular/core';

import { Product } from '../../core/models/product/product.model';
import { PRODUCT_SERVICE } from '../../core/tokens';
import { DataTableColumn, DataTableComponent } from '../../shared/data-table/data-table.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class ProductsComponent implements OnInit {
  private readonly productService = inject(PRODUCT_SERVICE);

  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly columns: DataTableColumn[] = [
    {
      key: 'sku',
      label: 'SKU',
    },
    {
      key: 'name',
      label: 'Product',
    },
    {
      key: 'price',
      label: 'Price',
      type: 'currency',
      align: 'end',
    },
  ];

  ngOnInit(): void {
    this.loadProducts();
  }

  private loadProducts(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.productService.list().subscribe({
      next: (products) => {
        this.products.set(products);
        this.isLoading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.errorMessage.set('Products could not be loaded.');
        this.isLoading.set(false);
      },
    });
  }
}
