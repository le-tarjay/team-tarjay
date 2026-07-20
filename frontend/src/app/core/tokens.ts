import { InjectionToken } from '@angular/core';

import { IAuthService } from './auth/auth.service';
import { IBuyerService } from './buyer/buyer.service';
import { IPaymentService } from './payment/payment.service';
import { IProductService } from './product/product.service';
import { ISalesService } from './sales/sales.service';

export const AUTH_SERVICE = new InjectionToken<IAuthService>('AUTH_SERVICE');
export const BUYER_SERVICE = new InjectionToken<IBuyerService>('BUYER_SERVICE');
export const PAYMENT_SERVICE = new InjectionToken<IPaymentService>('PAYMENT_SERVICE');
export const PRODUCT_SERVICE = new InjectionToken<IProductService>('PRODUCT_SERVICE');
export const SALES_SERVICE = new InjectionToken<ISalesService>('SALES_SERVICE');
