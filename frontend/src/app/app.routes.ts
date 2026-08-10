import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { AppShellComponent } from './core/layout/app-shell/app-shell';
import { navPermissionGuard } from './core/permissions/nav-permission.guard';
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
        canActivate: [navPermissionGuard],
      },
      {
        path: 'products',
        component: ProductsComponent,
        canActivate: [navPermissionGuard],
      },
      {
        path: 'sales',
        component: SalesComponent,
        canActivate: [navPermissionGuard],
      },
      {
        path: 'buyers',
        component: BuyersComponent,
        canActivate: [navPermissionGuard],
      },
      {
        path: 'payment',
        component: PaymentComponent,
        canActivate: [activeSaleGuard, navPermissionGuard],
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
