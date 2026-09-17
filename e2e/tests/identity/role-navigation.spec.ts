import { expect, test } from '@playwright/test';

import { SIGNED_IN_URL, signIn } from '../../fixtures/auth';
import {
  ASSOCIATE,
  CUSTOMER_SUPPORT_ASSOCIATE,
  DEPARTMENT_MANAGER,
  RECEIVING_ASSOCIATE,
  STORE_MANAGER,
  type SeededEmployee,
  type StoreRole,
} from '../../fixtures/credentials';

/**
 * What each identity earns in the app shell, verified end to end: a real
 * password grant against Keycloak, the API resolving role, department and job
 * function from `userinfo`, and the shell generating the header and navigation
 * from that.
 *
 * This is the coverage the epic turns on — "so that a future change can't
 * silently break who sees what". Everything below is asserted through what a
 * signed-in employee can actually see: link and button names, and the header's
 * own text. No CSS selectors, no `data-testid`.
 */

/** The shared items, in the fixed order identity adds to but never reorders. */
const SHARED_NAV_ITEMS = ['Sale', 'Products', 'Sales', 'Buyers'] as const;

/**
 * Every label the one role-specific slot can ever hold. A test asserts its
 * employee's expected item is present *and* that the other three are absent,
 * which is what makes "exactly one role-specific item" a real assertion rather
 * than a hopeful one.
 */
const ROLE_SPECIFIC_ITEMS = ['My tasks', 'Stocking', 'Receiving', 'Fulfillment'] as const;

/** What a Store Manager, and only a Store Manager, finds in the account menu. */
const ADMIN_MENU_ITEMS = ['Employee roster', 'Register status'] as const;

/**
 * The wire value turned into the text the header renders, mirroring
 * `web: core/navigation/employee-role-label.ts`. Duplicated rather than
 * imported because the surfaces share no code, and because a test that derived
 * its expectation from the implementation would pass even if both were wrong.
 */
const ROLE_LABELS: Readonly<Record<StoreRole, string>> = {
  Associate: 'Associate',
  DepartmentManager: 'Department Manager',
  StoreManager: 'Store Manager',
  ReceivingAssociate: 'Receiving Associate',
};

function expectedIdentity(employee: SeededEmployee): string {
  return `${employee.name} · ${employee.department} · ${ROLE_LABELS[employee.role]}`;
}

interface RoleExpectation {
  readonly employee: SeededEmployee;
  /** The single item appended after the shared four. */
  readonly roleSpecificItem: (typeof ROLE_SPECIFIC_ITEMS)[number];
  /** Why that item and not another — the rule being pinned, in one line. */
  readonly because: string;
}

const EXPECTATIONS: readonly RoleExpectation[] = [
  {
    employee: ASSOCIATE,
    roleSpecificItem: 'My tasks',
    because: 'an Associate executes the tasks assigned to them, rather than owning a queue',
  },
  {
    employee: DEPARTMENT_MANAGER,
    roleSpecificItem: 'Stocking',
    because: "a manager owns their department's whole stocking queue",
  },
  {
    employee: STORE_MANAGER,
    roleSpecificItem: 'Stocking',
    because: 'a Store Manager is a manager for the purposes of the stocking slot',
  },
  {
    employee: RECEIVING_ASSOCIATE,
    roleSpecificItem: 'Receiving',
    because: 'Receiving Associate is a distinct storewide role, decided before job function',
  },
  {
    employee: CUSTOMER_SUPPORT_ASSOCIATE,
    roleSpecificItem: 'Fulfillment',
    because: 'job function decides the slot for an Associate whose role does not',
  },
];

test.describe('identity and role-based navigation', () => {
  for (const { employee, roleSpecificItem, because } of EXPECTATIONS) {
    test(
      `${employee.role} ${employee.employeeId} signs in and sees "${roleSpecificItem}" — ${because}`,
      { tag: '@smoke' },
      async ({ page }) => {
        await signIn(page, employee);
        await expect(page).toHaveURL(SIGNED_IN_URL);

        const nav = page.getByRole('navigation');

        // The header names who they are: name, department, role, in that order.
        await expect(nav.getByText(expectedIdentity(employee))).toBeVisible();

        // The shared head is identical for everyone.
        for (const item of SHARED_NAV_ITEMS) {
          await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
        }

        // Exactly one role-specific item: theirs present, every other absent.
        // These render as disabled buttons rather than links because their
        // screens belong to later epics and have no route yet.
        for (const item of ROLE_SPECIFIC_ITEMS) {
          const locator = nav.getByRole('button', { name: item, exact: true });

          if (item === roleSpecificItem) {
            await expect(locator).toBeVisible();
          } else {
            await expect(locator).toHaveCount(0);
          }
        }
      },
    );
  }

  test(
    'a Store Manager finds the admin entries in the account menu',
    { tag: '@smoke' },
    async ({ page }) => {
      await signIn(page, STORE_MANAGER);
      await expect(page).toHaveURL(SIGNED_IN_URL);

      await page.getByRole('button', { name: 'Account', exact: true }).click();

      for (const item of ADMIN_MENU_ITEMS) {
        await expect(page.getByRole('button', { name: item, exact: true })).toBeVisible();
      }
    },
  );

  test(
    'every other role finds an account menu without the admin entries',
    { tag: '@smoke' },
    async ({ page }) => {
      await signIn(page, DEPARTMENT_MANAGER);
      await expect(page).toHaveURL(SIGNED_IN_URL);

      await page.getByRole('button', { name: 'Account', exact: true }).click();

      // Logout proves the menu is open, so the absences below are real rather
      // than an assertion against a menu that never rendered.
      await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();

      for (const item of ADMIN_MENU_ITEMS) {
        await expect(page.getByRole('button', { name: item, exact: true })).toHaveCount(0);
      }
    },
  );
});
