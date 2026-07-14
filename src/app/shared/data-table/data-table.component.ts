import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type DataTableCellType = 'text' | 'currency' | 'number' | 'date';
export type DataTableAlignment = 'start' | 'center' | 'end';
export type DataTableCellValue = string | number | Date | null | undefined;

export interface DataTableColumn {
  key: string;
  label: string;
  type?: DataTableCellType;
  align?: DataTableAlignment;
  value?: (row: unknown) => DataTableCellValue;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent {
  readonly title = input('');
  readonly description = input('');
  readonly columns = input<ReadonlyArray<DataTableColumn>>([]);
  readonly rows = input<ReadonlyArray<unknown>>([]);
  readonly emptyMessage = input('No records found.');
  readonly isLoading = input(false);
  readonly enableSearch = input(true);
  readonly searchPlaceholder = input('Search table');

  readonly searchQuery = signal('');

  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  private readonly numberFormatter = new Intl.NumberFormat('en-US');

  private readonly dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  readonly filteredRows = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const rows = this.rows();

    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return this.columns().some((column) => {
        return this.formatCell(row, column).toLowerCase().includes(query);
      });
    });
  });

  formatCell(row: unknown, column: DataTableColumn): string {
    const value = this.getCellValue(row, column);

    if (value === null || value === undefined || value === '') {
      return '—';
    }

    switch (column.type) {
      case 'currency':
        return this.formatCurrency(value);
      case 'number':
        return this.formatNumber(value);
      case 'date':
        return this.formatDate(value);
      default:
        return String(value);
    }
  }

  private getCellValue(row: unknown, column: DataTableColumn): DataTableCellValue {
    if (column.value) {
      return column.value(row);
    }

    if (typeof row !== 'object' || row === null) {
      return undefined;
    }

    return (row as Record<string, DataTableCellValue>)[column.key];
  }

  private formatCurrency(value: DataTableCellValue): string {
    const amount = Number(value);
    return Number.isFinite(amount) ? this.currencyFormatter.format(amount) : String(value);
  }

  private formatNumber(value: DataTableCellValue): string {
    const amount = Number(value);
    return Number.isFinite(amount) ? this.numberFormatter.format(amount) : String(value);
  }

  private formatDate(value: DataTableCellValue): string {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : this.dateFormatter.format(date);
  }
}
