import { test, expect } from '@playwright/test';

import {
  CASHIER_CREDENTIALS,
  DEPARTMENT_MANAGER_CREDENTIALS,
  STORE_MANAGER_CREDENTIALS,
  RECEIVING_ASSOCIATE_CREDENTIALS,
  type SeededEmployeeCredentials,
} from '../../fixtures/credentials';
import { signIn, simulateDirectNavigation } from '../../fixtures/auth';

/**
 * Verifies LET-84: the assembled sign-in -> identity resolution -> role-
 * based nav/route-guard flow, end to end, for each of the four seeded tiers.
 * This spec builds nothing new — LET-78 through LET-83 already merged the
 * model, mock auth, permission model, nav rendering, route guard, and header
 * display this exercises. Every check below is against observable behavior:
 * header text, which nav links render, and which URL the app lands on.
 */

interface NavLinkInfo {
  label: string;
  path: string;
}

const ALL_NAV_LINKS: readonly NavLinkInfo[] = [
  { label: 'Sale', path: '/sale' },
  { label: 'Products', path: '/products' },
  { label: 'Sales', path: '/sales' },
  { label: 'Buyers', path: '/buyers' },
  { label: 'Payment', path: '/payment' },
];

function departmentRoleText(credentials: SeededEmployeeCredentials): string {
  return `${credentials.department} · ${credentials.tier}`;
}

/**
 * Per LET-80's merged permission model (frontend:
 * core/permissions/nav-permission.model.ts), Associate, Department Manager,
 * and Store Manager all resolve to full access to every one of today's five
 * routes, in every named department (ADR-frontend §4.4: sale-building and
 * payment are storewide authority, not confined to the employee's own
 * department) — so for these three tiers there is no route "outside their
 * visible set" among the five known destinations to exercise a block
 * against. Receiving Associate is the only seeded tier with a restricted
 * set (Products only), so it is the tier used below for the blocked-
 * navigation acceptance criterion and the cross-surface consistency check.
 *
 * Also per this mapping: there is no seeded tier/department combination
 * that resolves to an *empty* visible set — the fringe case the story names
 * as "if such a combination exists in the seeded data." Every combination
 * the Employee model can produce maps to a non-empty set today, so that
 * fringe case has no live scenario to exercise against this seeded data.
 */
const FULL_ACCESS_TIERS: readonly SeededEmployeeCredentials[] = [
  CASHIER_CREDENTIALS,
  DEPARTMENT_MANAGER_CREDENTIALS,
  STORE_MANAGER_CREDENTIALS,
];

for (const credentials of FULL_ACCESS_TIERS) {
  test.describe(`${credentials.tier} — ${credentials.department}`, () => {
    test(
      'signs in, resolves identity, and sees the full nav/route set',
      { tag: '@regression' },
      async ({ page }) => {
        await signIn(page, credentials);
        await expect(page).toHaveURL(/\/sale$/);

        // Header identity display (LET-83).
        await expect(
          page.getByRole('button', { name: `Account menu for ${credentials.name}` }),
        ).toBeVisible();
        await expect(page.getByText(credentials.name, { exact: true })).toBeVisible();
        await expect(page.getByText(departmentRoleText(credentials), { exact: true })).toBeVisible();

        // Nav bar shows exactly the full visible set (LET-81) — asserting
        // all five known destinations are present is exhaustive, since
        // there is no sixth destination anywhere in the app.
        const nav = page.getByRole('navigation');
        for (const link of ALL_NAV_LINKS) {
          await expect(nav.getByRole('link', { name: link.label, exact: true })).toBeVisible();
        }

        // Route access: clicking each visible link actually reaches that
        // route (LET-82). A hidden link and a blocked route are separate
        // guarantees per LET-82's own scope boundary, so this checks the
        // latter via the rendered links, not just that they render.
        for (const link of ALL_NAV_LINKS) {
          if (link.path === '/payment') {
            // activeSaleGuard — a sibling guard unrelated to this story's
            // permission model — blocks /payment without an active sale
            // regardless of tier. Exercising it here would test that guard,
            // not the tier/department permission model this story verifies.
            continue;
          }

          await nav.getByRole('link', { name: link.label, exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`${link.path}$`));
        }
      },
    );
  });
}

test.describe('Receiving Associate — storewide', () => {
  test(
    'signs in, resolves identity, and sees only the storewide-appropriate nav/route set',
    { tag: '@regression' },
    async ({ page }) => {
      const credentials = RECEIVING_ASSOCIATE_CREDENTIALS;
      await signIn(page, credentials);

      // LoginComponent always requests /sale on success; navPermissionGuard
      // (LET-82) redirects a Receiving Associate away from it to the one
      // route they can see, since /sale isn't in their visible set.
      await expect(page).toHaveURL(/\/products$/);

      // Header identity display (LET-83) — storewide reads in the
      // department position, not blank and not a named department.
      await expect(
        page.getByRole('button', { name: `Account menu for ${credentials.name}` }),
      ).toBeVisible();
      await expect(page.getByText(credentials.name, { exact: true })).toBeVisible();
      await expect(page.getByText(departmentRoleText(credentials), { exact: true })).toBeVisible();

      // Nav bar shows exactly the storewide visible set: Products only
      // (LET-81) — every other destination is absent, not just unlabeled.
      const nav = page.getByRole('navigation');
      await expect(nav.getByRole('link', { name: 'Products', exact: true })).toBeVisible();
      for (const link of ALL_NAV_LINKS) {
        if (link.label === 'Products') {
          continue;
        }
        await expect(nav.getByRole('link', { name: link.label, exact: true })).toHaveCount(0);
      }

      // Direct URL navigation to an out-of-set route is blocked (LET-82).
      // See fixtures/auth.ts's simulateDirectNavigation for why a real
      // page.goto() reload can't be used here without losing the signed-in
      // session this check depends on.
      await simulateDirectNavigation(page, '/sale');
      await expect(page).toHaveURL(/\/products$/);

      // Cross-surface consistency check (this story's own requirement,
      // since this repo has no dedicated integration-test surface for this
      // seam per its CONVENTIONS.md): the permission model's visible set
      // (Products only), the rendered nav links above, and the route guard
      // below all agree — every route outside the visible set is blocked
      // and lands back on the one visible route, and that one route is
      // reachable. /payment is excluded from this loop for the same reason
      // it's excluded above: activeSaleGuard, not the permission model,
      // decides it.
      for (const outOfSetPath of ['/sales', '/buyers']) {
        await simulateDirectNavigation(page, outOfSetPath);
        await expect(page).toHaveURL(/\/products$/);
      }

      await simulateDirectNavigation(page, '/products');
      await expect(page).toHaveURL(/\/products$/);
    },
  );
});
