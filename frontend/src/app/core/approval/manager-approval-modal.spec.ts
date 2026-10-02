import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import {
  APPROVAL_NOT_ELIGIBLE_MESSAGE,
  APPROVAL_NOT_RECOGNIZED_MESSAGE,
  APPROVAL_UNCHECKED_MESSAGE,
} from './approval-messages';
import { IApprovalService } from './approval.service';
import { ManagerApprovalModal } from './manager-approval-modal';
import { StubAuthService } from '../auth/testing/stub-auth.service';
import { Employee } from '../models/auth/employee.model';
import { Approver, ManagerApproval } from '../models/approval/approval.model';
import { APPROVAL_SERVICE, AUTH_SERVICE } from '../tokens';
import { MockApprovalService } from '../../mocks/mock-approval.service';

/** `MockApprovalService`'s managers, read against `StubAuthService`'s Grocery cashier. */
const GROCERY_MANAGER = { employeeId: '10042', pin: '2468' };
const ELECTRONICS_MANAGER = { employeeId: '10046', pin: '8642' };

const GROCERY_APPROVER: Approver = {
  name: 'Sam Rivera',
  role: 'DepartmentManager',
  department: 'Grocery',
};

/** The mockup's success delay, so a test can sit inside the check. */
const MOCK_CHECK_DELAY_MS = 300;

/** The three places the mockup opens the modal (API map, design row D2). */
const CALLERS = [
  {
    caller: 'Apply discount',
    title: 'Apply discount',
    reason: 'Apply a 10% discount to this sale. Manager approval is required.',
    confirmLabel: 'Approve discount',
  },
  {
    caller: 'No-receipt return',
    title: 'No-receipt return',
    reason: 'Returns without a receipt need manager approval and are issued as store credit only.',
    confirmLabel: 'Approve return',
  },
  {
    caller: 'Till discrepancy',
    title: 'Till discrepancy',
    reason: 'The drawer is $3.20 short, over the $1.00 threshold. A manager must approve this close.',
    confirmLabel: 'Approve & close',
  },
];

const NEXT_EMPLOYEE: Employee = {
  id: '10047',
  name: 'Jamie Ortiz',
  role: 'Associate',
  department: 'Electronics',
  jobFunction: 'Stocking',
};

describe('ManagerApprovalModal', () => {
  let fixture: ComponentFixture<ManagerApprovalModal>;
  let component: ManagerApprovalModal;
  let approvalService: IApprovalService;
  let authService: StubAuthService;
  let approvals: ManagerApproval[];
  let cancellations: number;

  async function render(caller = CALLERS[2]): Promise<void> {
    fixture = TestBed.createComponent(ManagerApprovalModal);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', caller.title);
    fixture.componentRef.setInput('reason', caller.reason);
    fixture.componentRef.setInput('confirmLabel', caller.confirmLabel);

    approvals = [];
    cancellations = 0;
    component.approved.subscribe((approval) => approvals.push(approval));
    component.cancelled.subscribe(() => cancellations++);

    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [ManagerApprovalModal],
      providers: [
        provideZonelessChangeDetection(),
        { provide: APPROVAL_SERVICE, useClass: MockApprovalService },
        { provide: AUTH_SERVICE, useClass: StubAuthService },
      ],
    }).compileComponents();

    authService = TestBed.inject(AUTH_SERVICE) as StubAuthService;
    approvalService = TestBed.inject(APPROVAL_SERVICE);
    authService.signIn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(): HTMLElement | null {
    return root().querySelector('[role="dialog"]');
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(root().querySelectorAll('button'));
  }

  /** By accessible name, the way the e2e suite finds it. */
  function button(name: string): HTMLButtonElement {
    const match = buttons().find(
      (candidate) =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === name,
    );

    if (!match) {
      throw new Error(`No button named "${name}".`);
    }

    return match;
  }

  function confirmButton(): HTMLButtonElement {
    return buttons()[buttons().length - 1];
  }

  function keypadButtons(): HTMLButtonElement[] {
    return Array.from(root().querySelectorAll('.approval-keypad button'));
  }

  function press(...names: string[]): void {
    for (const name of names) {
      button(name).click();
      fixture.detectChanges();
    }
  }

  function type(digits: string): void {
    press(...digits.split(''));
  }

  /** The field a `<label for>` points at, the way `getByLabel` finds it. */
  function field(labelText: string): HTMLElement {
    const label = Array.from(root().querySelectorAll('label')).find(
      (candidate) => candidate.textContent?.trim() === labelText,
    );
    const target = label ? root().querySelector<HTMLElement>(`#${label.htmlFor}`) : null;

    if (!target) {
      throw new Error(`No field labelled "${labelText}".`);
    }

    return target;
  }

  function employeeIdShown(): string {
    return field('Manager Employee ID').textContent?.trim() ?? '';
  }

  function pinDotsFilled(): number {
    return field('Manager PIN').querySelectorAll('.pin-dot.filled').length;
  }

  function activeField(): string {
    return root().querySelector('.approval-field.active')?.id ?? '';
  }

  function errorShown(): string {
    return root().querySelector('[role="alert"]')?.textContent?.trim() ?? '';
  }

  function enterCredentials(credentials: { employeeId: string; pin: string }): void {
    type(credentials.employeeId + credentials.pin);
  }

  async function confirmAndSettle(): Promise<void> {
    confirmButton().click();
    fixture.detectChanges();
    vi.advanceTimersByTime(MOCK_CHECK_DELAY_MS);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('opening (criterion 1)', () => {
    it.each(CALLERS)(
      'shows the title, reason and confirm label it was given by $caller',
      async (caller) => {
        await render(caller);

        expect(dialog()?.querySelector('h2')?.textContent?.trim()).toBe(caller.title);
        expect(root().querySelector('#manager-approval-reason')?.textContent?.trim()).toBe(
          caller.reason,
        );
        expect(confirmButton().textContent?.trim()).toBe(caller.confirmLabel);
      },
    );

    it.each(CALLERS)('takes digits into the Employee ID first, from $caller', async (caller) => {
      await render(caller);

      expect(activeField()).toBe('manager-approval-employee-id');

      type('1');

      expect(employeeIdShown()).toBe('1');
      expect(pinDotsFilled()).toBe(0);
    });

    it('is a modal dialog named by its title and described by its reason', async () => {
      await render();

      expect(dialog()?.getAttribute('aria-modal')).toBe('true');
      expect(dialog()?.getAttribute('aria-labelledby')).toBe('manager-approval-title');
      expect(dialog()?.getAttribute('aria-describedby')).toBe('manager-approval-reason');
      expect(root().querySelector('.approval-eyebrow')?.textContent?.trim()).toBe(
        'Manager approval',
      );
    });

    it('moves focus into the dialog as it opens', async () => {
      await render();

      expect(document.activeElement).toBe(dialog());
    });

    it('has a keypad of 0–9, Clear and Backspace, in the mockup order', async () => {
      await render();

      expect(
        keypadButtons().map((key) => key.getAttribute('aria-label') ?? key.textContent?.trim()),
      ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Backspace']);
    });

    it('does not render the mockup demo PIN hint', async () => {
      await render();

      expect(root().textContent).not.toContain('Demo manager PIN');
      expect(root().textContent).not.toContain('9999');
    });
  });

  describe('keypad entry', () => {
    beforeEach(async () => {
      await render();
    });

    it('shows the Employee ID as typed, takes five digits, then advances to the PIN', () => {
      type('1004');

      expect(employeeIdShown()).toBe('1004');
      expect(activeField()).toBe('manager-approval-employee-id');

      type('2');

      expect(employeeIdShown()).toBe('10042');
      expect(activeField()).toBe('manager-approval-pin');

      type('7');

      expect(employeeIdShown()).toBe('10042');
      expect(pinDotsFilled()).toBe(1);
    });

    it('masks the PIN and never shows its digits', () => {
      type('10042' + '2468');

      expect(pinDotsFilled()).toBe(4);
      expect(field('Manager PIN').textContent).not.toMatch(/2468|[2468]{2,}/);
      expect(root().textContent).not.toContain('2468');
    });

    it('limits the PIN to four digits', () => {
      type('10042' + '24689');

      expect(pinDotsFilled()).toBe(4);
      expect(component['pin']()).toBe('2468');
    });

    it('does not submit when the PIN reaches four digits', () => {
      const check = vi.spyOn(approvalService, 'check');

      enterCredentials(GROCERY_MANAGER);

      expect(check).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
      expect(approvals).toEqual([]);
    });

    it('Clear empties only the PIN while the PIN is active', () => {
      type('10042' + '24');

      press('Clear');

      expect(pinDotsFilled()).toBe(0);
      expect(employeeIdShown()).toBe('10042');
      expect(activeField()).toBe('manager-approval-pin');
    });

    it('Clear empties only the Employee ID while the ID is active', () => {
      type('100');

      press('Clear');

      expect(employeeIdShown()).toBe('');
      expect(activeField()).toBe('manager-approval-employee-id');
    });

    it('Clear in the ID after backspacing out of the PIN leaves the PIN alone', () => {
      type('10042');
      press('Backspace');

      press('Clear');

      expect(employeeIdShown()).toBe('');
      expect(pinDotsFilled()).toBe(0);
    });

    it('Backspace removes the last PIN digit', () => {
      type('10042' + '246');

      press('Backspace');

      expect(pinDotsFilled()).toBe(2);
      expect(activeField()).toBe('manager-approval-pin');
    });

    it('Backspace in an empty PIN moves back into the Employee ID without deleting from it', () => {
      type('10042');
      expect(activeField()).toBe('manager-approval-pin');

      press('Backspace');

      expect(activeField()).toBe('manager-approval-employee-id');
      expect(employeeIdShown()).toBe('10042');

      press('Backspace');

      expect(employeeIdShown()).toBe('1004');
    });

    it('Backspace in an empty Employee ID does nothing further', () => {
      press('Backspace');

      expect(employeeIdShown()).toBe('');
      expect(activeField()).toBe('manager-approval-employee-id');
      expect(dialog()).not.toBeNull();
    });

    it('a digit typed into a full Employee ID goes to the PIN', () => {
      type('10042');
      press('Backspace');

      type('2');

      expect(employeeIdShown()).toBe('10042');
      expect(pinDotsFilled()).toBe(1);
      expect(activeField()).toBe('manager-approval-pin');
    });
  });

  describe('Confirm enabled (criterion 2)', () => {
    beforeEach(async () => {
      await render();
    });

    it('stays disabled while nothing is entered', () => {
      expect(confirmButton().disabled).toBe(true);
    });

    it('stays disabled with a full ID and a short PIN', () => {
      type('10042' + '246');

      expect(confirmButton().disabled).toBe(true);
    });

    it('stays disabled with a short ID', () => {
      type('1004');

      expect(confirmButton().disabled).toBe(true);
    });

    it('becomes enabled once both the ID and the PIN are full', () => {
      enterCredentials(GROCERY_MANAGER);

      expect(confirmButton().disabled).toBe(false);
    });

    it('goes back to disabled when a PIN digit is removed', () => {
      enterCredentials(GROCERY_MANAGER);

      press('Backspace');

      expect(confirmButton().disabled).toBe(true);
    });
  });

  describe('checking', () => {
    let response: Subject<Approver>;

    beforeEach(async () => {
      await render();
      response = new Subject<Approver>();
      vi.spyOn(approvalService, 'check').mockReturnValue(response);
      enterCredentials(GROCERY_MANAGER);
      confirmButton().click();
      fixture.detectChanges();
    });

    it('sends the entered Employee ID and PIN to the approval service', () => {
      expect(approvalService.check).toHaveBeenCalledWith(GROCERY_MANAGER);
    });

    it('disables the keypad and both buttons, and reads "Checking…"', () => {
      expect(keypadButtons().every((key) => key.disabled)).toBe(true);
      expect(button('Cancel').disabled).toBe(true);
      expect(confirmButton().disabled).toBe(true);
      expect(confirmButton().textContent?.trim()).toBe('Checking…');
    });

    it('cannot start a second check while one is in flight', () => {
      confirmButton().click();
      component['approve']();
      fixture.detectChanges();

      expect(approvalService.check).toHaveBeenCalledTimes(1);
    });

    it('ignores keypad and Cancel input while checking', () => {
      component['press']({ action: 'clear', label: 'Clear', ariaLabel: null });
      component['cancel']();
      fixture.detectChanges();

      expect(pinDotsFilled()).toBe(4);
      expect(cancellations).toBe(0);
      expect(dialog()).not.toBeNull();
    });

    it('stops listening for the answer if the action unmounts it mid-check', () => {
      expect(response.observed).toBe(true);

      fixture.destroy();

      expect(response.observed).toBe(false);
    });
  });

  describe('refusals and failures', () => {
    beforeEach(async () => {
      await render();
    });

    it('shows the not-recognized message above the keypad and keeps the digits (criterion 3)', async () => {
      enterCredentials({ employeeId: '10042', pin: '1111' });

      await confirmAndSettle();

      expect(errorShown()).toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);
      expect(errorShown()).toBe("That PIN wasn't recognized.");
      expect(employeeIdShown()).toBe('10042');
      expect(pinDotsFilled()).toBe(4);
      expect(dialog()).not.toBeNull();

      const alert = root().querySelector('[role="alert"]');
      const keypad = root().querySelector('.approval-keypad');
      expect(alert!.compareDocumentPosition(keypad!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('clears the not-recognized message on the next key press (criterion 3)', async () => {
      enterCredentials({ employeeId: '10042', pin: '1111' });
      await confirmAndSettle();

      press('Backspace');

      expect(errorShown()).toBe('');
    });

    it.each(['Clear', '5'])('clears the message on a %s press too', async (key) => {
      enterCredentials({ employeeId: '99999', pin: '1111' });
      await confirmAndSettle();
      expect(errorShown()).toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);

      press(key);

      expect(errorShown()).toBe('');
    });

    it('shows the distinct not-eligible message in the same slot (criterion 4)', async () => {
      enterCredentials(ELECTRONICS_MANAGER);

      await confirmAndSettle();

      expect(errorShown()).toBe(APPROVAL_NOT_ELIGIBLE_MESSAGE);
      expect(errorShown()).toContain("can't approve this right now");
      expect(errorShown()).not.toBe(APPROVAL_NOT_RECOGNIZED_MESSAGE);
      expect(employeeIdShown()).toBe(ELECTRONICS_MANAGER.employeeId);
      expect(pinDotsFilled()).toBe(4);
    });

    it('shows the could-not-be-checked message and stays open with digits intact (criterion 5)', async () => {
      vi.spyOn(approvalService, 'check').mockReturnValue(
        throwError(() => new Error(APPROVAL_UNCHECKED_MESSAGE)),
      );
      enterCredentials(GROCERY_MANAGER);

      await confirmAndSettle();

      expect(errorShown()).toBe('Approval couldn\'t be checked right now. Try again.');
      expect(dialog()).not.toBeNull();
      expect(employeeIdShown()).toBe(GROCERY_MANAGER.employeeId);
      expect(pinDotsFilled()).toBe(4);
      expect(approvals).toEqual([]);
      expect(cancellations).toBe(0);
    });

    it('re-enables the keypad and Confirm after a failure, so the check can be retried', async () => {
      vi.spyOn(approvalService, 'check').mockReturnValue(
        throwError(() => new Error(APPROVAL_UNCHECKED_MESSAGE)),
      );
      enterCredentials(GROCERY_MANAGER);
      await confirmAndSettle();

      expect(keypadButtons().every((key) => !key.disabled)).toBe(true);
      expect(button('Cancel').disabled).toBe(false);
      expect(confirmButton().disabled).toBe(false);
      expect(confirmButton().textContent?.trim()).toBe(CALLERS[2].confirmLabel);
    });
  });

  describe('approval (criterion 6)', () => {
    beforeEach(async () => {
      await render();
    });

    it('closes and hands back the approver name, tier, Employee ID and PIN', async () => {
      enterCredentials(GROCERY_MANAGER);

      await confirmAndSettle();

      expect(dialog()).toBeNull();
      expect(approvals).toEqual([
        { approver: GROCERY_APPROVER, credentials: GROCERY_MANAGER },
      ]);
      expect(approvals[0].approver.name).toBe('Sam Rivera');
      expect(approvals[0].approver.role).toBe('DepartmentManager');
      expect(cancellations).toBe(0);
    });

    it('leaves the action holding the only copy of the credentials', async () => {
      enterCredentials(GROCERY_MANAGER);

      await confirmAndSettle();

      expect(approvalService.takeCredentials()).toBeNull();
      expect(component['employeeId']()).toBe('');
      expect(component['pin']()).toBe('');
    });

    it('approves nothing if the signed-in employee changed during the check', async () => {
      enterCredentials(GROCERY_MANAGER);
      confirmButton().click();
      fixture.detectChanges();

      authService.signIn(NEXT_EMPLOYEE);
      vi.advanceTimersByTime(MOCK_CHECK_DELAY_MS);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(approvals).toEqual([]);
      expect(dialog()).not.toBeNull();
      expect(errorShown()).toBe(APPROVAL_UNCHECKED_MESSAGE);
    });
  });

  describe('Cancel (criterion 7)', () => {
    beforeEach(async () => {
      await render();
    });

    it('closes, hands back nothing, and discards both fields', () => {
      const discard = vi.spyOn(approvalService, 'discardCredentials');
      type('10042' + '24');

      press('Cancel');

      expect(dialog()).toBeNull();
      expect(cancellations).toBe(1);
      expect(approvals).toEqual([]);
      expect(component['employeeId']()).toBe('');
      expect(component['pin']()).toBe('');
      expect(discard).toHaveBeenCalled();
    });

    it('closes the same way with nothing entered', () => {
      press('Cancel');

      expect(dialog()).toBeNull();
      expect(cancellations).toBe(1);
      expect(approvals).toEqual([]);
    });

    it('closes after a refusal without handing anything back', async () => {
      enterCredentials(ELECTRONICS_MANAGER);
      await confirmAndSettle();

      press('Cancel');

      expect(dialog()).toBeNull();
      expect(cancellations).toBe(1);
      expect(approvals).toEqual([]);
      expect(approvalService.takeCredentials()).toBeNull();
    });
  });
});
