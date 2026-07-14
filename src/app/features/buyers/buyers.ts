import { Component, inject, OnInit, signal } from '@angular/core';

import { Buyer } from '../../core/models/buyer/buyer.model';
import { BUYER_SERVICE } from '../../core/tokens';
import { DataTableColumn, DataTableComponent } from '../../shared/data-table/data-table.component';

@Component({
  selector: 'app-buyers',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './buyers.html',
  styleUrl: './buyers.scss',
})
export class BuyersComponent implements OnInit {
  private readonly buyerService = inject(BUYER_SERVICE);

  readonly buyers = signal<Buyer[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly columns: DataTableColumn[] = [
    {
      key: 'name',
      label: 'Buyer',
    },
    {
      key: 'email',
      label: 'Email',
    },
    {
      key: 'phone',
      label: 'Phone',
    },
    {
      key: 'loyaltyLevel',
      label: 'Loyalty',
    },
    {
      key: 'totalSpent',
      label: 'Total Spent',
      type: 'currency',
      align: 'end',
    },
    {
      key: 'lastVisit',
      label: 'Last Visit',
      type: 'date',
    },
  ];

  ngOnInit(): void {
    this.loadBuyers();
  }

  private loadBuyers(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.buyerService.list().subscribe({
      next: (buyers) => {
        this.buyers.set(buyers);
        this.isLoading.set(false);
      },
      error: () => {
        this.buyers.set([]);
        this.errorMessage.set('Buyers could not be loaded.');
        this.isLoading.set(false);
      },
    });
  }
}
