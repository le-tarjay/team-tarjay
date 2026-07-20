import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { PAYMENT_SERVICE } from '../../core/tokens';
import { MockPaymentService } from '../../mocks/mock-payment.service';
import { PaymentComponent } from './payment';

describe('PaymentComponent', () => {
  let component: PaymentComponent;
  let fixture: ComponentFixture<PaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: PAYMENT_SERVICE,
          useClass: MockPaymentService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
