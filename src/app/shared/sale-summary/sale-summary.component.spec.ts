import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleSummaryComponent } from './sale-summary.component';
import { provideZonelessChangeDetection } from '@angular/core';
  
describe('SaleSummaryComponent', () => {
  let component: SaleSummaryComponent;
  let fixture: ComponentFixture<SaleSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleSummaryComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
