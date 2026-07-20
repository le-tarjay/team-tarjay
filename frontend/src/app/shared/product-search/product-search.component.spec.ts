import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProductSearchComponent } from './product-search.component';
import { Product } from '../../core/models/product/product.model';
import { IProductService } from '../../core/product/product.service';
import { PRODUCT_SERVICE } from '../../core/tokens';

describe('ProductSearchComponent', () => {
  let component: ProductSearchComponent;
  let fixture: ComponentFixture<ProductSearchComponent>;
  let productService: {
    search: ReturnType<typeof vi.fn>;
  };

  const products: Product[] = [
    {
      id: 'prod-001',
      sku: 'LT-COF-001',
      name: 'House Blend Coffee',
      price: 4.99,
    },
    {
      id: 'prod-002',
      sku: 'LT-TEA-001',
      name: 'Earl Grey Tea',
      price: 3.49,
    },
  ];

  beforeEach(async () => {
    productService = {
      search: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProductSearchComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: PRODUCT_SERVICE,
          useValue: productService satisfies Partial<IProductService>,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the empty state before searching', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(
      'Search for products to add them to the sale.'
    );
  });

  it('should update the query signal when typing in the search input', () => {
    const input = fixture.nativeElement.querySelector(
      'input[name="query"]'
    ) as HTMLInputElement;

    input.value = 'coffee';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.query()).toBe('coffee');
  });

  it('should call product service with the current query when searching', () => {
    const searchResult$ = new Subject<Product[]>();
    productService.search.mockReturnValue(searchResult$.asObservable());

    component.query.set('coffee');
    component.search();

    expect(productService.search).toHaveBeenCalledWith('coffee');
  });

  it('should show loading state while search is pending', () => {
    const searchResult$ = new Subject<Product[]>();
    productService.search.mockReturnValue(searchResult$.asObservable());

    component.search();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;

    expect(component.isLoading()).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toContain('Searching...');
  });

  it('should render products returned by the service', () => {
    const searchResult$ = new Subject<Product[]>();
    productService.search.mockReturnValue(searchResult$.asObservable());

    component.search();

    searchResult$.next(products);
    searchResult$.complete();

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(component.products()).toEqual(products);
    expect(component.isLoading()).toBe(false);

    expect(compiled.textContent).toContain('House Blend Coffee');
    expect(compiled.textContent).toContain('LT-COF-001');
    expect(compiled.textContent).toContain('Earl Grey Tea');
    expect(compiled.textContent).toContain('LT-TEA-001');
  });

  it('should emit productSelected when a product is clicked', () => {
    const selectedSpy = vi.fn();
    component.productSelected.subscribe(selectedSpy);

    component.products.set(products);
    fixture.detectChanges();

    const productButtons = fixture.nativeElement.querySelectorAll(
      '.list-group-item'
    ) as NodeListOf<HTMLButtonElement>;

    productButtons[0].click();

    expect(selectedSpy).toHaveBeenCalledWith(products[0]);
  });

  it('should clear products and stop loading when search fails', () => {
    productService.search.mockReturnValue(
      throwError(() => new Error('Search failed'))
    );

    component.products.set(products);

    component.search();
    fixture.detectChanges();

    expect(component.products()).toEqual([]);
    expect(component.isLoading()).toBe(false);
  });

  it('should submit the form and perform a search', () => {
    const searchResult$ = new Subject<Product[]>();
    productService.search.mockReturnValue(searchResult$.asObservable());

    const input = fixture.nativeElement.querySelector(
      'input[name="query"]'
    ) as HTMLInputElement;

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    input.value = 'tea';
    input.dispatchEvent(new Event('input'));

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(productService.search).toHaveBeenCalledWith('tea');
  });
});
