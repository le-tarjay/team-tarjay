import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SaleService } from './sale.service';

export const activeSaleGuard: CanActivateFn = () => {
  const saleService = inject(SaleService);
  const router = inject(Router);

  if (saleService.hasActiveSale()) {
    return true;
  }

  return router.createUrlTree(['/sale']);
};
