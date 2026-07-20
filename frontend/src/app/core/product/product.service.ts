import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { Product } from '../models/product/product.model';

export interface IProductService {
  list(): Observable<Product[]>;
  search(query: string): Observable<Product[]>;
}

@Injectable({
  providedIn: 'root',
})
export class ProductService implements IProductService {
  list(): Observable<Product[]> {
    return throwError(() => new Error('Real product service is not configured yet.'));
  }

  search(_query: string): Observable<Product[]> {
    return throwError(() => new Error('Real product service is not configured yet.'));
  }
}
