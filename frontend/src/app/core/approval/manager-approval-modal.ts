import {
  AfterViewInit,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { APPROVAL_UNCHECKED_MESSAGE } from './approval-messages';
import { Approver, ManagerApproval } from '../models/approval/approval.model';
import { APPROVAL_SERVICE } from '../tokens';

export const EMPLOYEE_ID_LENGTH = 5;
export const PIN_LENGTH = 4;

type ApprovalField = 'employeeId' | 'pin';

interface KeypadKey {
  readonly action: 'digit' | 'clear' | 'backspace';

  /** What the key shows. For a digit key, also the digit it enters. */
  readonly label: string;

  /** The accessible name, when the label alone is not one. */
  readonly ariaLabel: string | null;
}

const digitKey = (digit: string): KeypadKey => ({ action: 'digit', label: digit, ariaLabel: null });

/** The mockup's keypad, row by row: Clear sits left of 0, backspace right of it. */
const KEYPAD: readonly KeypadKey[] = [
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digitKey),
  { action: 'clear', label: 'Clear', ariaLabel: null },
  digitKey('0'),
  { action: 'backspace', label: '\u232B', ariaLabel: 'Backspace' },
];

/**
 * The one approval surface every restricted action opens (API map, design
 * rows D1–D13). The action mounts it with its own title, reason and button
 * label, and unmounts it on either output.
 *
 * It sits beside the approval service rather than in `shared/`, because it
 * injects `APPROVAL_SERVICE`.
 */
@Component({
  selector: 'app-manager-approval-modal',
  standalone: true,
  imports: [],
  templateUrl: './manager-approval-modal.html',
  styleUrl: './manager-approval-modal.scss',
})
export class ManagerApprovalModal implements AfterViewInit {
  private readonly approvalService = inject(APPROVAL_SERVICE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  readonly title = input.required<string>();
  readonly reason = input.required<string>();
  readonly confirmLabel = input.required<string>();

  /** The manager and their credentials. Emitted once, and only on approval. */
  readonly approved = output<ManagerApproval>();

  /** Carries nothing: a cancelled approval hands the action no credentials. */
  readonly cancelled = output<void>();

  protected readonly keypad = KEYPAD;
  protected readonly pinSlots = Array.from({ length: PIN_LENGTH }, (_, index) => index);
  protected readonly employeeIdLength = EMPLOYEE_ID_LENGTH;
  protected readonly pinLength = PIN_LENGTH;

  protected readonly employeeId = signal('');
  protected readonly pin = signal('');
  protected readonly activeField = signal<ApprovalField>('employeeId');
  protected readonly isChecking = signal(false);
  protected readonly errorMessage = signal('');

  /**
   * Set once the modal has handed back an answer. The modal stops rendering
   * then, whether or not the action has unmounted it yet.
   */
  protected readonly isClosed = signal(false);

  protected readonly canConfirm = computed(
    () =>
      !this.isChecking() &&
      this.employeeId().length === EMPLOYEE_ID_LENGTH &&
      this.pin().length === PIN_LENGTH,
  );

  ngAfterViewInit(): void {
    this.focusDialog();
  }

  protected press(key: KeypadKey): void {
    if (this.isChecking()) {
      return;
    }

    this.errorMessage.set('');

    switch (key.action) {
      case 'digit':
        this.enterDigit(key.label);
        break;
      case 'clear':
        this.clearActiveField();
        break;
      case 'backspace':
        this.deleteDigit();
        break;
    }
  }

  protected approve(): void {
    if (!this.canConfirm()) {
      return;
    }

    this.isChecking.set(true);
    this.errorMessage.set('');

    this.approvalService
      .check({ employeeId: this.employeeId(), pin: this.pin() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (approver) => this.handBack(approver),
        error: (error: Error) => {
          this.isChecking.set(false);
          this.errorMessage.set(error.message);
        },
      });
  }

  protected cancel(): void {
    if (this.isChecking()) {
      return;
    }

    this.discardEntry();
    this.approvalService.discardCredentials();
    this.isClosed.set(true);
    this.cancelled.emit();
  }

  /**
   * A digit typed while the ID is already full goes to the PIN. That is what
   * happens anyway when the fifth ID digit lands, and it is the only way
   * forward after backspacing out of an empty PIN onto a full ID.
   */
  private enterDigit(digit: string): void {
    if (this.activeField() === 'employeeId' && this.employeeId().length < EMPLOYEE_ID_LENGTH) {
      this.employeeId.update((value) => value + digit);

      if (this.employeeId().length === EMPLOYEE_ID_LENGTH) {
        this.activeField.set('pin');
      }

      return;
    }

    this.activeField.set('pin');

    // Reaching four digits does not submit. Confirm still has to be pressed.
    if (this.pin().length < PIN_LENGTH) {
      this.pin.update((value) => value + digit);
    }
  }

  private clearActiveField(): void {
    if (this.activeField() === 'pin') {
      this.pin.set('');
    } else {
      this.employeeId.set('');
    }
  }

  private deleteDigit(): void {
    if (this.activeField() === 'pin') {
      if (this.pin().length === 0) {
        this.activeField.set('employeeId');
      } else {
        this.pin.update((value) => value.slice(0, -1));
      }

      return;
    }

    this.employeeId.update((value) => value.slice(0, -1));
  }

  /**
   * The credentials come back out of the service rather than from the keypad,
   * so the action holds the only copy (API map, technical row T7). The service
   * hands over nothing if the signed-in employee changed during the check,
   * and an approval given for someone else's request approves nothing here.
   */
  private handBack(approver: Approver): void {
    const credentials = this.approvalService.takeCredentials();

    this.isChecking.set(false);

    if (credentials === null) {
      this.errorMessage.set(APPROVAL_UNCHECKED_MESSAGE);
      return;
    }

    this.discardEntry();
    this.isClosed.set(true);
    this.approved.emit({ approver, credentials });
  }

  private discardEntry(): void {
    this.employeeId.set('');
    this.pin.set('');
    this.activeField.set('employeeId');
    this.errorMessage.set('');
  }

  /**
   * Focus moves into the modal as it opens, so keyboard and screen reader
   * users land on it rather than on the screen behind it.
   */
  private focusDialog(): void {
    this.dialog()?.nativeElement.focus();
  }
}
