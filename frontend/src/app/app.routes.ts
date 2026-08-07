import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { rolePermissionGuard } from './core/auth/role-permission.guard';
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
        canActivate: [rolePermissionGuard],
      },
      {
        path: 'products',
        component: ProductsComponent,
        canActivate: [rolePermissionGuard],
      },
      {
        path: 'sales',
        component: SalesComponent,
        canActivate: [rolePermissionGuard],
      },
      {
        path: 'buyers',
        component: BuyersComponent,
        canActivate: [rolePermissionGuard],
      },
      {
        path: 'payment',
        component: PaymentComponent,
        // Role check first: an employee whose visible set excludes /payment
        // should be redirected for that reason, not told there's no active
        // sale. Only once the role check passes does activeSaleGuard's
        // existing "no active sale" redirect to /sale apply.
        canActivate: [rolePermissionGuard, activeSaleGuard],
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
