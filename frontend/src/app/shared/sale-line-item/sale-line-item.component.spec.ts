import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { SaleLineItemComponent } from './sale-line-item.component';
import { SaleLineItem } from '../../core/models/sale/sale-line-item.model';

const lineItem: SaleLineItem = {
  product: {
    id: 'prod-001',
    sku: 'LT-COF-001',
    name: 'House Blend Coffee',
    price: 4.99,
  },
  quantity: 2,
};

describe('SaleLineItemComponent', () => {
  let component: SaleLineItemComponent;
  let fixture: ComponentFixture<SaleLineItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleLineItemComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleLineItemComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', lineItem);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
