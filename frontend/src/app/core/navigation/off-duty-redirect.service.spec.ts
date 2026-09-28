import { provideZonelessChangeDetection, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { routes } from '../../app.routes';
import { HomeComponent } from '../../features/home/home';
import { MockProductService } from '../../mocks/mock-product.service';
import { StubAuthService } from '../auth/testing/stub-auth.service';
import { AppShellComponent } from '../layout/app-shell/app-shell';
import { ShiftStatus } from '../models/shift/shift-status.model';
import { StubScheduleService } from '../schedule/testing/stub-schedule.service';
import { StubShiftService } from '../shift/testing/stub-shift.service';
import { AUTH_SERVICE, PRODUCT_SERVICE, SCHEDULE_SERVICE, SHIFT_SERVICE } from '../tokens';
import { OffDutyRedirectService } from './off-duty-redirect.service';

/**
 * The service against the app's real route table, so "moved to Home" means
 * the router actually lands on Home, through the real gate.
 */
describe('OffDutyRedirectService', () => {
  let authService: StubAuthService;
  let shiftService: StubShiftService;
  let router: Router;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: AUTH_SERVICE, useClass: StubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
        { provide: SCHEDULE_SERVICE, useClass: StubScheduleService },
        { provide: PRODUCT_SERVICE, useClass: MockProductService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    router = TestBed.inject(Router);

    TestBed.inject(OffDutyRedirectService);
    harness = await RouterTestingHarness.create();
  });

  /** Signed in, status not yet read, and on `url`: the gate fails open. */
  async function standOn(url: string): Promise<void> {
    authService.signIn();
    await harness.navigateByUrl(url);

    expect(router.url).toBe(url);
  }

  /** The status arriving in the background, and whatever it sets off. */
  async function arrive(status: ShiftStatus | null): Promise<void> {
    if (status === null) {
      shiftService.clear();
    } else {
      shiftService.report(status);
    }

    TestBed.tick();
    await harness.fixture.whenStable();
  }

  it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
    'moves the employee from Sale to Home when %s arrives',
    async (status) => {
      await standOn('/sale');
      await arrive(status);

      expect(router.url).toBe('/home');
      expect(harness.routeNativeElement?.querySelector('app-home')).not.toBeNull();
    },
  );

  it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
    'moves the employee off any full-nav route, query string and all, when %s arrives',
    async (status) => {
      await standOn('/products?query=milk');
      await arrive(status);

      expect(router.url).toBe('/home');
    },
  );

  it('moves an on-shift employee to Home when they clock out on Sale', async () => {
    await standOn('/sale');
    await arrive('OnShift');

    expect(router.url).toBe('/sale');

    await arrive('OffShift');

    expect(router.url).toBe('/home');
  });

  it('renders no screen between the full-nav route and Home', async () => {
    await standOn('/sale');

    const activated: (Type<unknown> | string | null)[] = [];
    const subscription = router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        activated.push(event.snapshot.component);
      }
    });

    await arrive('OffShift');
    subscription.unsubscribe();

    expect(new Set(activated)).toEqual(new Set([HomeComponent, AppShellComponent]));
    expect(harness.routeNativeElement?.querySelector('app-sale-builder')).toBeNull();
  });

  it('does not move an employee on Home when on shift arrives', async () => {
    await standOn('/home');
    await arrive('OnShift');

    expect(router.url).toBe('/home');
  });

  it.each<ShiftStatus>(['OffShift', 'OnBreak'])(
    'leaves an employee on My schedule where they are when %s arrives',
    async (status) => {
      await standOn('/schedule');
      await arrive(status);

      expect(router.url).toBe('/schedule');
    },
  );

  it('leaves an on-shift employee on Sale when a later read fails', async () => {
    await standOn('/sale');
    await arrive('OnShift');
    await arrive(null);

    expect(router.url).toBe('/sale');
  });

  it('leaves an off-shift employee on Home when a later read fails', async () => {
    await standOn('/home');
    await arrive('OffShift');
    await arrive(null);

    expect(router.url).toBe('/home');
  });

  it('does not move anyone while the status is still unknown', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');

    await standOn('/sale');
    navigate.mockClear();
    await arrive(null);

    expect(navigate).not.toHaveBeenCalled();
    expect(router.url).toBe('/sale');
  });

  /**
   * Login forwards a signed-in employee on its own, to their `returnUrl` when
   * they have one. The status can land while that navigation is in flight.
   */
  it('leaves Login to forward the employee itself', async () => {
    await harness.navigateByUrl('/login?returnUrl=%2Fschedule');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    authService.signIn();
    shiftService.report('OffShift');
    TestBed.tick();

    expect(navigate).not.toHaveBeenCalledWith('/home');
  });
});
