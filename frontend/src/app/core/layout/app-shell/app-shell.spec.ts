import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppShellComponent } from './app-shell';
import { AUTH_SERVICE } from '../../tokens';
import { MockAuthService } from '../../../mocks/mock-auth.service';
import { NavPermissionService } from '../../permissions/nav-permission.service';

function navLinkLabels(fixture: ComponentFixture<AppShellComponent>): string[] {
  const links = fixture.nativeElement.querySelectorAll(
    '.navbar-nav a.nav-link',
  ) as NodeListOf<HTMLAnchorElement>;

  return Array.from(links).map((link) => link.textContent?.trim() ?? '');
}

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: MockAuthService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AUTH_SERVICE) as unknown as MockAuthService;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders no nav links before anyone is signed in', () => {
    expect(navLinkLabels(fixture)).toEqual([]);
  });

  it("renders the Associate (Cashier) tier's full nav set, including Payment", async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();

    expect(navLinkLabels(fixture)).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
  });

  it("renders the Department Manager tier's full nav set, including Payment", async () => {
    await firstValueFrom(authService.login({ employeeId: 'jlee', pin: '2345' }));
    fixture.detectChanges();

    expect(navLinkLabels(fixture)).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
  });

  it("renders the Store Manager tier's full nav set, including Payment", async () => {
    await firstValueFrom(authService.login({ employeeId: 'spatel', pin: '3456' }));
    fixture.detectChanges();

    expect(navLinkLabels(fixture)).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);
  });

  it("renders the Receiving Associate tier's storewide nav set, Products only, with no Payment link", async () => {
    await firstValueFrom(authService.login({ employeeId: 'ckim', pin: '4567' }));
    fixture.detectChanges();

    expect(navLinkLabels(fixture)).toEqual(['Products']);
  });

  it('re-renders the nav with no stale links when signing out then back in as a different tier', async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();
    expect(navLinkLabels(fixture)).toEqual(['Sale', 'Products', 'Sales', 'Buyers', 'Payment']);

    authService.logout();
    fixture.detectChanges();
    expect(navLinkLabels(fixture)).toEqual([]);

    await firstValueFrom(authService.login({ employeeId: 'ckim', pin: '4567' }));
    fixture.detectChanges();
    expect(navLinkLabels(fixture)).toEqual(['Products']);
  });
});

describe('AppShellComponent, with an empty permission-model visible set', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: MockAuthService,
        },
        {
          provide: NavPermissionService,
          useValue: { getVisibleDestinations: () => new Set() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    authService = TestBed.inject(AUTH_SERVICE) as unknown as MockAuthService;
    fixture.detectChanges();
  });

  it('renders an empty nav bar, not a fallback menu, for a signed-in employee with no visible destinations', async () => {
    await firstValueFrom(authService.login({ employeeId: 'cashier', pin: '1234' }));
    fixture.detectChanges();

    expect(navLinkLabels(fixture)).toEqual([]);
  });
});
