import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {
  AUTH_SERVICE,
  BUYER_SERVICE,
  PAYMENT_SERVICE,
  PRODUCT_SERVICE,
  SALES_SERVICE,
} from './core/tokens';
import { MockAuthService } from './mocks/mock-auth.service';
import { MockBuyerService } from './mocks/mock-buyer.service';
import { MockPaymentService } from './mocks/mock-payment.service';
import { MockProductService } from './mocks/mock-product.service';
import { MockSalesService } from './mocks/mock-sales.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    {
      provide: AUTH_SERVICE,
      useClass: MockAuthService,
    },
    {
      provide: BUYER_SERVICE,
      useClass: MockBuyerService,
    },
    {
      provide: PAYMENT_SERVICE,
      useClass: MockPaymentService,
    },
    {
      provide: PRODUCT_SERVICE,
      useClass: MockProductService,
    },
    {
      provide: SALES_SERVICE,
      useClass: MockSalesService,
    },
  ],
};
