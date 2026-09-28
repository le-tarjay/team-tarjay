import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivationEnd, NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { OffDutyRedirectService } from './off-duty-redirect.service';
import { StubAuthService } from '../auth/testing/stub-auth.service';
import { ShiftStatus } from '../models/shift/shift-status.model';
import { StubShiftService } from '../shift/testing/stub-shift.service';
import { AUTH_SERVICE, SHIFT_SERVICE } from '../tokens';

@Component({ selector: 'app-sale-screen', template: '' })
class SaleScreenComponent {}

@Component({ selector: 'app-home-screen', template: '' })
class HomeScreenComponent {}

@Component({ selector: 'app-schedule-screen', template: '' })
class ScheduleScreenComponent {}

@Component({ selector: 'app-login-screen', template: '' })
class LoginScreenComponent {}

/**
 * No route guard here, on purpose. The guard's own spec proves what a
 * navigation is turned away from. This proves what happens when the shift
 * changes under a screen that is already open, which the guard never sees.
 */
describe('OffDutyRedirectService', () => {
  let shiftService: StubShiftService;
  let router: Router;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'login', component: LoginScreenComponent },
          { path: 'home', component: HomeScreenComponent },
          { path: 'schedule', component: ScheduleScreenComponent },
          { path: 'sale', component: SaleScreenComponent },
          { path: 'products', component: SaleScreenComponent },
          { path: 'payment', component: SaleScreenComponent },
        ]),
        { provide: AUTH_SERVICE, useClass: StubAuthService },
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
      ],
    }).compileComponents();

    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    router = TestBed.inject(Router);
    (TestBed.inject(AUTH_SERVICE) as StubAuthService).signIn();
    TestBed.inject(OffDutyRedirectService);

    harness = await RouterTestingHarness.create();
  });

  async function settle(): Promise<void> {
    TestBed.tick();
    await harness.fixture.whenStable();
  }

  async function report(status: ShiftStatus): Promise<void> {
    shiftService.report(status);
    await settle();
  }

  async function open(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    await settle();
  }

  describe.each<ShiftStatus>(['OffShift', 'OnBreak'])('when %s arrives', (status) => {
    it.each(['/sale', '/products', '/payment'])(
      'moves the employee from %s to Home',
      async (url) => {
        await open(url);

        expect(router.url).toBe(url);

        await report(status);

        expect(router.url).toBe('/home');
      },
    );

    it('renders no screen between the full-nav route and Home', async () => {
      await open('/sale');

      const activated: unknown[] = [];
      const ended: string[] = [];
      const subscription = router.events.subscribe((event) => {
        if (event instanceof ActivationEnd && event.snapshot.component) {
          activated.push(event.snapshot.component);
        }

        if (event instanceof NavigationEnd) {
          ended.push(event.urlAfterRedirects);
        }
      });

      await report(status);
      subscription.unsubscribe();

      expect(ended).toEqual(['/home']);
      expect(activated).toEqual([HomeScreenComponent]);
    });

    it.each(['/home', '/schedule'])('leaves the employee on %s', async (url) => {
      await open(url);
      await report(status);

      expect(router.url).toBe(url);
    });

    it('leaves Login to forward the employee itself', async () => {
      await open('/login?returnUrl=%2Fschedule');
      await report(status);

      expect(router.url).toBe('/login?returnUrl=%2Fschedule');
    });
  });

  it('moves an employee who starts a break from Sale to Home', async () => {
    await report('OnShift');
    await open('/sale');
    await report('OnBreak');

    expect(router.url).toBe('/home');
  });

  /**
   * The sign-in race: the read lands before the navigation that sign-in
   * started has finished, so the route it lands on is only known afterwards.
   */
  it('moves the employee when a navigation ends on Sale after an off-shift read', async () => {
    await report('OffShift');
    await open('/sale');

    expect(router.url).toBe('/home');
  });

  it('does not move an employee on Home when on shift arrives', async () => {
    await report('OffShift');
    await open('/home');
    await report('OnShift');

    expect(router.url).toBe('/home');
  });

  it('does not move an employee on Sale when on shift arrives', async () => {
    await open('/sale');
    await report('OnShift');

    expect(router.url).toBe('/sale');
  });

  it('leaves an on-shift employee on Sale when a later read fails', async () => {
    await report('OnShift');
    await open('/sale');

    shiftService.clear();
    await settle();

    expect(router.url).toBe('/sale');
  });

  it('leaves the employee where they are while no shift status has been read', async () => {
    await open('/sale');

    expect(router.url).toBe('/sale');
  });
});
