import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { MockInstance, vi } from 'vitest';

import { IAuthService } from './auth.service';
import { SessionTeardownService } from './session-teardown.service';
import { Employee } from '../models/auth/employee.model';
import { LOGIN_ROUTE } from '../navigation/route-access';
import { SaleService } from '../sale/sale.service';
import { AUTH_SERVICE } from '../tokens';
import { Product } from '../models/product/product.model';

/**
 * Driven directly rather than through `MockAuthService`, which reports
 * `sessionEnded` as a constant `false` — it reaches no Keycloak, so it has no
 * refresh to be refused. Teaching it to flip would hand it behavior
 * `IAuthService` does not declare, the anti-pattern `CONVENTIONS.md` names, so
 * the signal is driven from a stub here instead (same reasoning, same shape as
 * `app-shell.spec.ts`).
 *
 * `logout()` mirrors the real service in the one respect this teardown depends
 * on: it clears the session and leaves `sessionEnded` set, because the Login
 * screen still has to say why the device is there (LET-135).
 */
class StubAuthService implements IAuthService {
  private readonly employee = signal<Employee | null>(null);
  private readonly ended = signal(false);

  readonly currentEmployee = this.employee.asReadonly();
  readonly isAuthenticated = computed(() => this.employee() !== null);
  readonly accessToken = signal<string | null>(null).asReadonly();
  readonly sessionEnded = this.ended.asReadonly();

  logoutCount = 0;

  login(): Observable<Employee> {
    return throwError(() => new Error('Not exercised by the teardown.'));
  }

  logout(): void {
    this.logoutCount += 1;
    this.employee.set(null);
  }

  signIn(): void {
    this.employee.set({
      id: '100482',
      name: 'Avery Brooks',
      role: 'DepartmentManager',
      department: 'Grocery',
      jobFunction: 'Customer Support',
    });
  }

  endSessionElsewhere(): void {
    this.ended.set(true);
  }
}

function product(id: string): Product {
  return {
    id,
    sku: `SKU-${id}`,
    name: 'Store brand oat milk',
    price: 4.29,
  };
}

describe('SessionTeardownService', () => {
  let authService: StubAuthService;
  let saleService: SaleService;
  let navigate: MockInstance<Router['navigateByUrl']>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useClass: StubAuthService,
        },
      ],
    });

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    saleService = TestBed.inject(SaleService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    // The service is a watcher with no callers; instantiating it is what starts
    // it watching, exactly as `app.config.ts`'s environment initializer does.
    TestBed.inject(SessionTeardownService);
    TestBed.tick();
  });

  /** A signed-in employee, mid-sale, with the account menu's session live. */
  function signInAndStartASale(): void {
    authService.signIn();
    saleService.addProduct(product('p-1'));
    saleService.addProduct(product('p-2'));
    saleService.setCustomerName('Dana Whitfield');
    TestBed.tick();
  }

  function endSessionElsewhere(): void {
    authService.endSessionElsewhere();
    TestBed.tick();
  }

  describe('while the session is alive', () => {
    it('tears nothing down and navigates nowhere', () => {
      signInAndStartASale();

      expect(navigate).not.toHaveBeenCalled();
      expect(authService.logoutCount).toBe(0);
      expect(authService.isAuthenticated()).toBe(true);
      expect(saleService.hasActiveSale()).toBe(true);
    });
  });

  describe('when the session ends elsewhere', () => {
    it('navigates to Login with no employee action', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(navigate).toHaveBeenCalledWith(LOGIN_ROUTE);
      expect(LOGIN_ROUTE).toBe('/login');
    });

    /**
     * Idle is the case the epic turns on — the employee has walked away, so
     * there is no interaction to ride in on. Nothing about the teardown reads
     * what was on screen, and this is the guard on that.
     */
    it('navigates to Login from an idle terminal with no sale in progress', () => {
      authService.signIn();
      TestBed.tick();

      endSessionElsewhere();

      expect(navigate).toHaveBeenCalledWith(LOGIN_ROUTE);
    });

    it('clears the held session, which is what empties the header', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(authService.logoutCount).toBe(1);
      expect(authService.currentEmployee()).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
    });

    /**
     * The order the header depends on: `LoginComponent.ngOnInit` sends a
     * still-signed-in employee straight back to `/sale`, so a redirect that
     * arrived first would land the device back on the screen it was torn down
     * from.
     */
    it('clears the session before it navigates', () => {
      signInAndStartASale();

      navigate.mockImplementation(() => {
        expect(authService.isAuthenticated()).toBe(false);
        return Promise.resolve(true);
      });

      endSessionElsewhere();

      expect(navigate).toHaveBeenCalledTimes(1);
    });

    /**
     * The other half of that sequence. The in-progress sale is discarded while
     * the session it belongs to is still identifiable, so `logout()` is entered
     * with nothing left on screen to belong to a signed-out employee.
     */
    it('discards the sale before it clears the session', () => {
      signInAndStartASale();

      const logout = vi.spyOn(authService, 'logout').mockImplementation(() => {
        expect(saleService.hasActiveSale()).toBe(false);
      });

      endSessionElsewhere();

      expect(logout).toHaveBeenCalledTimes(1);

      logout.mockRestore();
    });

    it('discards the in-progress sale', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(saleService.lineItems()).toEqual([]);
      expect(saleService.customerName()).toBe('');
      expect(saleService.hasActiveSale()).toBe(false);
    });

    /**
     * Mid-task is not a special case with its own path — it is the same
     * teardown, and the absence of a prompt is the assertion. `window.confirm`
     * is the browser-level form of the "you have unsaved work" dialog this
     * story forbids; a route-level `canDeactivate` guard is the Angular form,
     * and `app.routes.ts` declares none.
     */
    it('raises no unsaved-work prompt over a sale in progress', () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

      signInAndStartASale();

      endSessionElsewhere();

      expect(confirm).not.toHaveBeenCalled();
      expect(saleService.hasActiveSale()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(LOGIN_ROUTE);

      confirm.mockRestore();
    });

    /**
     * "No transitional or reconnecting screen": one navigation, and its
     * destination is Login. A holding screen would show up here as a first
     * navigation somewhere else.
     */
    it('goes straight to Login, with no screen in between', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate.mock.calls[0]).toEqual([LOGIN_ROUTE]);
    });

    /**
     * No `returnUrl`: the parameter carries an interrupted employee back to
     * what they were doing, and the next person to sign in at this terminal is
     * someone else.
     */
    it('leaves no return destination for the next employee to be sent to', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(navigate.mock.calls[0]?.[0]).not.toContain('returnUrl');
    });

    /**
     * The signal the Login screen reads to explain itself (LET-135) has to
     * survive the teardown that fires on it — the session is gone by then, so
     * this is the only thing left that says why.
     */
    it('leaves the session-ended signal set for Login to explain', () => {
      signInAndStartASale();

      endSessionElsewhere();

      expect(authService.sessionEnded()).toBe(true);
    });

    it('tears down once, not once per subsequent change', () => {
      signInAndStartASale();

      endSessionElsewhere();
      authService.endSessionElsewhere();
      TestBed.tick();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(authService.logoutCount).toBe(1);
    });
  });

  /**
   * The negative half of the story, and the reason this block asserts a
   * footprint rather than a held sale directly: **neither a held sale nor
   * clock/break state exists in this surface yet.** A held sale is expired by
   * store close and by nothing else, and a shift is not a session — so when
   * either arrives, it stays out of `tearDown`. What is assertable today is
   * that the teardown reaches for exactly two stores and no more, which is what
   * would fail if a later story wired hold-expiry or a clock-out into it. See
   * the story's completion report; the behavioral assertion belongs to the
   * `e2e` surface (LET-136) once the state it needs exists.
   */
  describe('what it deliberately does not touch', () => {
    it('uses only the whole-sale reset, never a line-item edit', () => {
      const reset = vi.spyOn(saleService, 'reset');
      const removeProduct = vi.spyOn(saleService, 'removeProduct');
      const updateQuantity = vi.spyOn(saleService, 'updateQuantity');
      const addProduct = vi.spyOn(saleService, 'addProduct');

      authService.signIn();
      TestBed.tick();

      endSessionElsewhere();

      expect(reset).toHaveBeenCalledTimes(1);
      expect(removeProduct).not.toHaveBeenCalled();
      expect(updateQuantity).not.toHaveBeenCalled();
      expect(addProduct).not.toHaveBeenCalled();
    });
  });
});
