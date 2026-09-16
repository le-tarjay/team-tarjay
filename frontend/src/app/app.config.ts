import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import {
  AUTH_SERVICE,
  BUYER_SERVICE,
  PAYMENT_SERVICE,
  PRODUCT_SERVICE,
  SALES_SERVICE,
} from './core/tokens';
import { MockBuyerService } from './mocks/mock-buyer.service';
import { MockPaymentService } from './mocks/mock-payment.service';
import { MockProductService } from './mocks/mock-product.service';
import { MockSalesService } from './mocks/mock-sales.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    {
      // `useExisting`, not `useClass`: AuthService is `providedIn: 'root'`, and
      // the signed-in employee is session state. A second instance would be a
      // second, silently divergent copy of it.
      provide: AUTH_SERVICE,
      useExisting: AuthService,
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
