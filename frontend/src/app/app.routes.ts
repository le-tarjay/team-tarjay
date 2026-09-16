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
    /**
     * Not redundant with `canActivate`: the shell is activated once and then
     * reused, so without this a move between two of its children is never
     * checked again. A route whose nav item only some roles see declares it
     * with `data: { navItem: '...' }` — see `core/navigation/route-access.ts`.
     */
    canActivateChild: [authGuard],
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
