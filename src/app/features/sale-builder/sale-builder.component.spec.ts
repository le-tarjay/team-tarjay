import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { SaleBuilderComponent } from './sale-builder.component';
import { PRODUCT_SERVICE } from '../../core/tokens';
import { MockProductService } from '../../mocks/mock-product.service';

describe('SaleBuilderComponent', () => {
  let component: SaleBuilderComponent;
  let fixture: ComponentFixture<SaleBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleBuilderComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: PRODUCT_SERVICE,
          useClass: MockProductService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
