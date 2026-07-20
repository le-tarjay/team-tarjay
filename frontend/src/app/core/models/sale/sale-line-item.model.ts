import { Product } from '../product/product.model';

export interface SaleLineItem {
  product: Product;
  quantity: number;
}
