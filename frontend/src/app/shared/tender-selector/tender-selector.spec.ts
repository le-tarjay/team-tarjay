import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TenderSelector } from './tender-selector';

describe('TenderSelector', () => {
  let component: TenderSelector;
  let fixture: ComponentFixture<TenderSelector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TenderSelector],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TenderSelector);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
