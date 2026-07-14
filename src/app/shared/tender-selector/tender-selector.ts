import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TenderSelection, TenderType } from '../../core/models/payment/payment.model';

@Component({
  selector: 'app-tender-selector',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './tender-selector.html',
  styleUrl: './tender-selector.scss',
})
export class TenderSelector {
  readonly total = input(0);
  readonly disabled = input(false);

  readonly tenderChanged = output<TenderSelection>();

  readonly tenderType = signal<TenderType>('cash');
  readonly tenderedAmount = signal(0);

  readonly changeDue = computed(() => {
    return Math.max(this.tenderedAmount() - this.total(), 0);
  });

  constructor() {
    effect(() => {
      const total = this.total();

      untracked(() => {
        if (this.tenderType() === 'card' || this.tenderedAmount() === 0) {
          this.tenderedAmount.set(total);
          this.emitTenderChanged();
        }
      });
    });
  }

  selectTender(tenderType: TenderType): void {
    this.tenderType.set(tenderType);

    if (tenderType === 'card') {
      this.tenderedAmount.set(this.total());
    }

    this.emitTenderChanged();
  }

  updateTenderedAmount(value: string | number): void {
    const amount = Number(value);
    this.tenderedAmount.set(Number.isFinite(amount) ? amount : 0);
    this.emitTenderChanged();
  }

  private emitTenderChanged(): void {
    this.tenderChanged.emit({
      tenderType: this.tenderType(),
      tenderedAmount: this.tenderedAmount(),
    });
  }
}
