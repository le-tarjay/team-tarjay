import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sale-summary',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './sale-summary.component.html',
  styleUrl: './sale-summary.component.scss',
})
export class SaleSummaryComponent {
  readonly customerName = input('');
  readonly subtotal = input(0);
  readonly tax = input(0);
  readonly total = input(0);
  readonly isReadonly = input(false, { alias: 'readonly' });

  readonly customerNameChanged = output<string>();
}
