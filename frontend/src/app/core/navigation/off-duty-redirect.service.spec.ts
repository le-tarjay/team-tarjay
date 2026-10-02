import { ApplicationRef, Component, provideZonelessChangeDetection, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivationEnd, provideRouter, Router } from '@angular/router';
import { MockInstance, vi } from 'vitest';

import { OffDutyRedirectService } from './off-duty-redirect.service';
import { ShiftStatus } from '../models/shift/shift-status.model';
import { StubShiftService } from '../shift/testing/stub-shift.service';
import { SHIFT_SERVICE } from '../tokens';

@Component({ selector: 'app-test-home', template: '' })
class TestHomeComponent {}

@Component({ selector: 'app-test-schedule', template: '' })
class TestScheduleComponent {}

@Component({ selector: 'app-test-full-nav', template: '' })
class TestFullNavComponent {}

@Component({ selector: 'app-test-login', template: '' })
class TestLoginComponent {}

const OFF_DUTY: readonly ShiftStatus[] = ['OffShift', 'OnBreak'];

/**
 * The watcher alone, with no route guard in the table: whatever moves the
 * employee here is this service, not the gate.
 */
describe('OffDutyRedirectService', () => {
  let shiftService: StubShiftService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'home', component: TestHomeComponent },
          { path: 'schedule', component: TestScheduleComponent },
          { path: 'sale', component: TestFullNavComponent },
          { path: 'products', component: TestFullNavComponent },
          { path: 'payment', component: TestFullNavComponent },
          { path: 'login', component: TestLoginComponent },
        ]),
        { provide: SHIFT_SERVICE, useClass: StubShiftService },
      ],
    });

    shiftService = TestBed.inject(SHIFT_SERVICE) as StubShiftService;
    router = TestBed.inject(Router);
  });

  /** Lands on `url` for real, then starts the watcher and records its navigations. */
  async function settleOn(url: string): Promise<MockInstance<Router['navigateByUrl']>> {
    await router.navigateByUrl(url);
    TestBed.inject(OffDutyRedirectService);
    TestBed.tick();

    return vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  }

  function arrive(status: ShiftStatus): void {
    shiftService.report(status);
    TestBed.tick();
  }

  describe.each(OFF_DUTY)('when %s arrives', (status) => {
    it.each(['/sale', '/products', '/payment', '/products?query=milk'])(
      'moves the employee from %s to Home',
      async (url) => {
        const navigate = await settleOn(url);

        arrive(status);

        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/home');
      },
    );

    it.each(['/home', '/schedule'])('leaves an employee on %s where they are', async (url) => {
      const navigate = await settleOn(url);

      arrive(status);

      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves Login alone, so it can go on to its own destination', async () => {
      const navigate = await settleOn('/login');

      arrive(status);

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('moves the employee when a break starts on Sale', async () => {
    const navigate = await settleOn('/sale');

    arrive('OnShift');
    arrive('OnBreak');

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('does not move an employee on Home when on shift arrives', async () => {
    const navigate = await settleOn('/home');

    arrive('OnShift');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not move an employee on Sale when on shift arrives', async () => {
    const navigate = await settleOn('/sale');

    arrive('OnShift');

    expect(navigate).not.toHaveBeenCalled();
  });

  it.each<ShiftStatus | null>([null, 'OnShift'])(
    'leaves the employee where they are when a read fails after %s',
    async (before) => {
      const navigate = await settleOn('/sale');

      if (before !== null) {
        arrive(before);
      }

      shiftService.clear();
      TestBed.tick();

      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('does nothing before any navigation has ended', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    TestBed.inject(OffDutyRedirectService);
    arrive('OffShift');

    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * The sign-in race: the read lands while the sign-in navigation is still in
   * flight, so the gate has already let Sale through on an unknown shift.
   */
  it('moves the employee when a navigation ends on Sale after an off-shift read', async () => {
    TestBed.inject(OffDutyRedirectService);
    arrive('OffShift');

    await router.navigateByUrl('/sale');
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(router.url).toBe('/home');
  });

  it('renders no screen between the full-nav route and Home', async () => {
    await router.navigateByUrl('/sale');
    TestBed.inject(OffDutyRedirectService);
    TestBed.tick();

    const activated: Type<unknown>[] = [];
    router.events.subscribe((event) => {
      if (event instanceof ActivationEnd && event.snapshot.component) {
        activated.push(event.snapshot.component);
      }
    });

    arrive('OnBreak');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(router.url).toBe('/home');
    expect(activated).toEqual([TestHomeComponent]);
  });
});
