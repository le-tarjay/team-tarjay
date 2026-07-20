import { Component, inject, OnInit, signal } from '@angular/core';

import { SaleRecord } from '../../core/models/sales/sale-record.model';
import { SALES_SERVICE } from '../../core/tokens';
import { DataTableColumn, DataTableComponent } from '../../shared/data-table/data-table.component';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class SalesComponent implements OnInit {
  private readonly salesService = inject(SALES_SERVICE);

  readonly sales = signal<SaleRecord[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly columns: DataTableColumn[] = [
    {
      key: 'confirmationNumber',
      label: 'Confirmation #',
    },
    {
      key: 'customerName',
      label: 'Customer',
    },
    {
      key: 'itemCount',
      label: 'Items',
      type: 'number',
      align: 'end',
    },
    {
      key: 'total',
      label: 'Total',
      type: 'currency',
      align: 'end',
    },
    {
      key: 'tenderType',
      label: 'Tender',
    },
    {
      key: 'soldAt',
      label: 'Sold At',
      type: 'date',
    },
    {
      key: 'status',
      label: 'Status',
    },
  ];

  ngOnInit(): void {
    this.loadSales();
  }

  private loadSales(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.salesService.list().subscribe({
      next: (sales) => {
        this.sales.set(sales);
        this.isLoading.set(false);
      },
      error: () => {
        this.sales.set([]);
        this.errorMessage.set('Sales could not be loaded.');
        this.isLoading.set(false);
      },
    });
  }
}
