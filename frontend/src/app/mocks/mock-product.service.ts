import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';

import { Product } from '../core/models/product/product.model';
import { IProductService } from '../core/product/product.service';

@Injectable()
export class MockProductService implements IProductService {
  private readonly products: Product[] = [
    {
      id: 'prod-001',
      sku: 'LT-COF-001',
      name: 'House Blend Coffee',
      price: 4.99,
    },
    {
      id: 'prod-002',
      sku: 'LT-TEA-001',
      name: 'Earl Grey Tea',
      price: 3.49,
    },
    {
      id: 'prod-003',
      sku: 'LT-BAG-001',
      name: 'Butter Croissant',
      price: 2.99,
    },
    {
      id: 'prod-004',
      sku: 'LT-SAN-001',
      name: 'Turkey Club Sandwich',
      price: 8.99,
    },
    {
      id: 'prod-005',
      sku: 'LT-JUI-001',
      name: 'Orange Juice',
      price: 3.99,
    },
    {
      id: 'prod-006',
      sku: 'LT-CKI-001',
      name: 'Chocolate Chip Cookie',
      price: 1.99,
    },
  ];


  list(): Observable<Product[]> {
    return of([...this.products]).pipe(delay(150));
  }

  search(query: string): Observable<Product[]> {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return of(this.products.slice(0, 6)).pipe(delay(150));
    }

    const results = this.products.filter((product) => {
      return (
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.sku.toLowerCase().includes(normalizedQuery)
      );
    });

    return of(results).pipe(delay(150));
  }
}
