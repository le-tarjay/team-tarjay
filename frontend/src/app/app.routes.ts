import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { AppShellComponent } from './core/layout/app-shell/app-shell';
import { activeSaleGuard } from './core/sale/active-sale.guard';
import { BuyersComponent } from './features/buyers/buyers';
import { LoginComponent } from './features/login/login';
import { PaymentComponent } from './features/payment/payment';
import { ProductsComponent } from './features/products/products';
import { SaleBuilderComponent } from './features/sale-builder/sale-builder.component';
import { SalesComponent } from './features/sales/sales';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'sale',
        component: SaleBuilderComponent,
      },
      {
        path: 'products',
        component: ProductsComponent,
      },
      {
        path: 'sales',
        component: SalesComponent,
      },
      {
        path: 'buyers',
        component: BuyersComponent,
      },
      {
        path: 'payment',
        component: PaymentComponent,
        canActivate: [activeSaleGuard],
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'sale',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
