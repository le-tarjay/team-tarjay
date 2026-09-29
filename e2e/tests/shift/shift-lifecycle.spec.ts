import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  ON_SHIFT_URL,
  resetToOffShift,
  SHIFT_LABELS,
  shiftIndicator,
  SIGNED_IN_URL,
  signIn,
  signInOnShift,
} from '../../fixtures/auth';
import { ASSOCIATE } from '../../fixtures/credentials';
import { LOGIN_URL, SESSION_REFRESH_INTERVAL_MS } from '../../fixtures/session';

/**
 * The assembled shift lifecycle (LET-108), end to end against the real stack:
 * sign in, clock in, take a break, end it, clock out, with the nav, the route
 * gate, the header and My Schedule checked at each step.
 *
 * Every story in the epic proved its own piece against a double. This spec is
 * what proves the pieces meet: the API holds attendance, the shell reads it,
 * the nav and the route gate act on it, and the schedule stays readable in
 * every state.
 *
 * Attendance is held by the API for as long as the stack runs, so a sign-in in
 * an earlier spec can leave the Associate on the clock. Every test here starts
 * from a known shift state rather than trusting the order specs run in.
 */

/** The full role-based nav's links: the shared four, identical for every role. */
const FULL_NAV_LINKS = ['Sale', 'Products', 'Sales', 'Buyers'] as const;

/**
 * The Associate's role-specific item. It renders as a disabled button because
 * its screen belongs to a later epic. See `tests/identity/role-navigation.spec.ts`.
 */
const ASSOCIATE_ROLE_ITEM = 'My tasks';

/** The whole nav while off shift or on break (API map, design row D9). */
const SUSPENDED_NAV_LINKS = ['Home', 'My schedule'] as const;

const MY_SCHEDULE_URL = /\/schedule$/;

/**
 * The failure messages for a shift action, mirroring
 * `frontend: core/shift/shift-action-messages.ts`. Kept as this suite's own
 * copy, per CONVENTIONS.md's Test data.
 */
const START_BREAK_UNREACHABLE_MESSAGE =
  'Your break couldn’t start because the store system couldn’t be reached. Try again.';

const START_BREAK_REJECTED_MESSAGE =
  'Your break couldn’t start because you’re not on shift. Your shift status has been updated.';

/**
 * The browser's request to start a break. The frontend calls the API on its
 * own origin, and nginx proxies it, so this matches the request as it leaves
 * the page.
 */
const START_BREAK_ENDPOINT_GLOB = '**/v1/employees/me/start-break';

/**
 * Two days of the Associate's seeded week, mirroring
 * `api: Tarjay.Team.Domain/Schedule/ScheduleSeed` for employee 10041.
 *
 * Tuesday and Wednesday rather than Monday on purpose. The API builds its
 * schedule window from its own clock and the page builds the calendar week
 * from the browser's. When those disagree about the date, Monday is the only
 * day of the week that can fall outside the API's window.
 */
const ASSOCIATE_TUESDAY = { timeRange: '9:00 AM – 3:00 PM', hours: '6h' } as const;
const ASSOCIATE_DAY_OFF = 'Wednesday';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** What the header says about the signed-in Associate: name, department, role. */
const ASSOCIATE_IDENTITY = `${ASSOCIATE.name} · ${ASSOCIATE.department} · Associate`;

function nav(page: Page) {
  return page.getByRole('navigation');
}

function accountMenuButton(page: Page, name: string) {
  return nav(page).getByRole('button', { name, exact: true });
}

async function openAccountMenu(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: 'Account', exact: true }).click();
}

/** Only Home and My schedule. Every full-nav item is absent, not disabled. */
async function expectSuspendedNav(page: Page): Promise<void> {
  for (const item of SUSPENDED_NAV_LINKS) {
    await expect(nav(page).getByRole('link', { name: item, exact: true })).toBeVisible();
  }

  for (const item of FULL_NAV_LINKS) {
    await expect(nav(page).getByRole('link', { name: item, exact: true })).toHaveCount(0);
  }

  await expect(nav(page).getByRole('button', { name: ASSOCIATE_ROLE_ITEM, exact: true })).toHaveCount(0);
}

/** The Associate's full role-based nav, with Home gone from it. */
async function expectFullNav(page: Page): Promise<void> {
  for (const item of FULL_NAV_LINKS) {
    await expect(nav(page).getByRole('link', { name: item, exact: true })).toBeVisible();
  }

  await expect(nav(page).getByRole('button', { name: ASSOCIATE_ROLE_ITEM, exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
}

/**
 * The current calendar week, Monday to Sunday, as the page labels it.
 *
 * Worked out here rather than read from the page, so the assertion does not
 * pass merely because the page agrees with itself. The runner and the browser
 * share a clock and a time zone.
 */
function currentCalendarWeek(today: Date): { day: string; date: string }[] {
  const daysSinceMonday = (today.getDay() + 6) % 7;

  return WEEKDAYS.map((day, offset) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - daysSinceMonday + offset,
    );

    return { day, date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  });
}

/** "38h" or "7.5h", as the page writes an hour count. */
function parseHours(text: string): number {
  const match = /^(\d+(?:\.\d+)?)h$/.exec(text.trim());

  return match ? Number(match[1]) : 0;
}

/**
 * My Schedule shows the current calendar week, with the Associate's seeded
 * shifts in it and a total-hours figure that adds them up.
 */
async function expectCurrentWeekSchedule(page: Page): Promise<void> {
  await expect(page).toHaveURL(MY_SCHEDULE_URL);
  await expect(page.getByRole('heading', { name: 'My schedule', level: 1 })).toBeVisible();

  const rows = page.getByRole('table').getByRole('row');

  // A header row and seven days. While the schedule loads, the table holds a
  // single "Loading..." row, so this also waits for the real data.
  await expect(rows).toHaveCount(1 + WEEKDAYS.length);

  const week = currentCalendarWeek(new Date());

  for (const [index, { day, date }] of week.entries()) {
    const cells = rows.nth(index + 1).getByRole('cell');

    await expect(cells.nth(0)).toHaveText(day);
    await expect(cells.nth(1)).toHaveText(date);
  }

  // The Associate's own seeded shifts reached the page, from the API.
  const tuesday = rows.filter({ hasText: 'Tuesday' }).getByRole('cell');
  await expect(tuesday.nth(2)).toHaveText(ASSOCIATE.department);
  await expect(tuesday.nth(3)).toHaveText(ASSOCIATE_TUESDAY.timeRange);
  await expect(tuesday.nth(4)).toHaveText(ASSOCIATE_TUESDAY.hours);

  const dayOff = rows.filter({ hasText: ASSOCIATE_DAY_OFF }).getByRole('cell');
  await expect(dayOff.nth(3)).toHaveText('Off');

  // The week's total is shown, and it is the sum of the days above.
  const total = page.getByRole('group', { name: 'This week' });
  await expect(total).toContainText(/\d+(\.\d+)?h/);

  const dayHours = await Promise.all(
    week.map((_, index) => rows.nth(index + 1).getByRole('cell').nth(4).textContent()),
  );
  const expectedTotal = dayHours.reduce((sum, text) => sum + parseHours(text ?? ''), 0);

  expect(expectedTotal).toBeGreaterThan(0);
  await expect(total).toHaveText(
    new RegExp(`^\\s*This week\\s*${Math.round(expectedTotal * 100) / 100}h\\s*$`),
  );
}

/**
 * Records every path the page settles on from now on, client-side navigations
 * included. Used to prove where a transition did not pass through, which an
 * assertion on the destination alone cannot.
 */
function recordPaths(page: Page): string[] {
  const paths: string[] = [];

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      paths.push(new URL(frame.url()).pathname);
    }
  });

  return paths;
}

interface Device {
  readonly page: Page;
  /** When this device's sign-in was submitted, which starts its token refresh timer. */
  readonly signedInAt: number;
  readonly close: () => Promise<void>;
}

/** A terminal of its own: a separate browser context shares nothing with another. */
async function openDevice(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();

  return { page: await context.newPage(), close: () => context.close() };
}

test.describe('clock-in, break, and shift gating', () => {
  test(
    'an associate works a whole shift: clock in, take a break, end it, clock out',
    { tag: '@smoke' },
    async ({ page, browser }) => {
      await resetToOffShift(browser, ASSOCIATE);

      await test.step('signing in shows the employee off the clock, with the nav collapsed', async () => {
        await signIn(page, ASSOCIATE);

        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OffShift);
        await expect(page).toHaveURL(SIGNED_IN_URL);
        await expectSuspendedNav(page);

        // Home previews the next three scheduled shifts, from the seeded data.
        const preview = page.getByRole('region', { name: 'My schedule' });
        await expect(preview.getByRole('listitem')).toHaveCount(3);
      });

      await test.step('My Schedule shows the current week while off shift', async () => {
        await nav(page).getByRole('link', { name: 'My schedule', exact: true }).click();

        await expectCurrentWeekSchedule(page);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OffShift);

        await nav(page).getByRole('link', { name: 'Home', exact: true }).click();
        await expect(page).toHaveURL(SIGNED_IN_URL);
      });

      await test.step('clocking in from Home lands on Sale with the full nav', async () => {
        await page.getByRole('main').getByRole('button', { name: 'Clock in', exact: true }).click();

        await expect(page).toHaveURL(ON_SHIFT_URL);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);
        await expectFullNav(page);
      });

      await test.step('My Schedule shows the current week while on shift, from the account menu', async () => {
        await openAccountMenu(page);
        await nav(page).getByRole('link', { name: 'My schedule', exact: true }).click();

        await expectCurrentWeekSchedule(page);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);

        await nav(page).getByRole('link', { name: 'Sale', exact: true }).click();
        await expect(page).toHaveURL(ON_SHIFT_URL);
      });

      await test.step('starting a break from the account menu collapses the nav again', async () => {
        await openAccountMenu(page);
        await accountMenuButton(page, 'Start break').click();

        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnBreak);
        await expect(page).toHaveURL(SIGNED_IN_URL);
        await expectSuspendedNav(page);
      });

      await test.step('going back to Sale while on break is turned away to Home, silently', async () => {
        // Sale is the previous history entry. Going back to it is a client-side
        // navigation, so the session survives it and the route gate decides.
        // A typed URL would reload the app and sign the employee out, which
        // tests the sign-in guard instead.
        await page.goBack();

        await expect(page).toHaveURL(SIGNED_IN_URL);
        await expect(
          page.getByRole('heading', { name: `You’re on break, ${ASSOCIATE.name.split(' ')[0]}` }),
        ).toBeVisible();

        // No interstitial: Sale never rendered, and nothing explains the bounce.
        await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnBreak);
        await expectSuspendedNav(page);
      });

      await test.step('My Schedule shows the current week while on break', async () => {
        await nav(page).getByRole('link', { name: 'My schedule', exact: true }).click();

        await expectCurrentWeekSchedule(page);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnBreak);
      });

      await test.step('ending the break lands straight on Sale, never on Home', async () => {
        // Ended from My Schedule rather than from Home, so that passing
        // through Home on the way to Sale would be observable.
        const paths = recordPaths(page);

        await openAccountMenu(page);
        await accountMenuButton(page, 'End break').click();

        await expect(page).toHaveURL(ON_SHIFT_URL);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);
        await expectFullNav(page);

        expect(paths.at(-1)).toBe('/sale');
        expect(paths).not.toContain('/home');
      });

      await test.step('clocking out lands on Home, still signed in, with the nav collapsed', async () => {
        await openAccountMenu(page);
        await accountMenuButton(page, 'Clock out').click();

        await expect(page).toHaveURL(SIGNED_IN_URL);
        await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OffShift);
        await expectSuspendedNav(page);

        // Still signed in: the header still names the employee, and the Home
        // hero offers to clock back in.
        await expect(nav(page).getByText(ASSOCIATE_IDENTITY)).toBeVisible();
        await expect(
          page.getByRole('main').getByRole('button', { name: 'Clock in', exact: true }),
        ).toBeVisible();
      });
    },
  );

  test(
    'signing out mid-shift and back in finds the shift still running',
    { tag: '@regression' },
    async ({ page }) => {
      await signInOnShift(page, ASSOCIATE);

      await openAccountMenu(page);
      await accountMenuButton(page, 'Logout').click();
      await expect(page).toHaveURL(LOGIN_URL);

      await signIn(page, ASSOCIATE);

      await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);
      await expect(page).toHaveURL(ON_SHIFT_URL);
      await expectFullNav(page);
    },
  );

  test(
    'a shift action that cannot reach the store system says so, and changes nothing',
    { tag: '@regression' },
    async ({ page }) => {
      await signInOnShift(page, ASSOCIATE);

      // Only the transport is simulated: the browser's request is dropped the
      // way a lost link would drop it. The app, the API and the shift the API
      // holds are real and untouched. Same approach as
      // `tests/session/refresh-fail-open.spec.ts`.
      await page.route(START_BREAK_ENDPOINT_GLOB, (route) => route.abort('failed'));

      await openAccountMenu(page);
      await accountMenuButton(page, 'Start break').click();

      await expect(nav(page).getByRole('alert')).toHaveText(START_BREAK_UNREACHABLE_MESSAGE);

      // The displayed shift is left exactly as it was.
      await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnShift);
      await expect(page).toHaveURL(ON_SHIFT_URL);
      await expectFullNav(page);

      // The store system comes back, and the same action goes through.
      await page.unroute(START_BREAK_ENDPOINT_GLOB);
      await accountMenuButton(page, 'Start break').click();

      await expect(shiftIndicator(page)).toHaveText(SHIFT_LABELS.OnBreak);
      await expect(page).toHaveURL(SIGNED_IN_URL);
      await expectSuspendedNav(page);
      await expect(page.getByRole('alert')).toHaveCount(0);
    },
  );

  test(
    'a shift action the server rejects says why, and the display catches up with the server',
    { tag: '@regression' },
    async ({ browser }) => {
      // Nothing is simulated. Device A is on shift. The same employee signs in
      // on Device B and clocks out there, so the server now holds off shift
      // while Device A still shows on shift. Starting a break on Device A is
      // then a transition the server genuinely rejects.
      const first = await openDevice(browser);
      const deviceA: Device = { ...first, signedInAt: Date.now() };
      await signInOnShift(deviceA.page, ASSOCIATE);

      const deviceB = await openDevice(browser);

      try {
        await signIn(deviceB.page, ASSOCIATE);
        await expect(shiftIndicator(deviceB.page)).toHaveText(SHIFT_LABELS.OnShift);

        await openAccountMenu(deviceB.page);
        await accountMenuButton(deviceB.page, 'Clock out').click();
        await expect(shiftIndicator(deviceB.page)).toHaveText(SHIFT_LABELS.OffShift);

        // Device B's sign-in ended Device A's session, and Device A finds out
        // at its next token refresh. Its access token stays valid until then,
        // which is what lets it reach the API below. Bound that rather than
        // assume it, the same way `tests/session/single-active-session.spec.ts`
        // does.
        const windowUsedMs = Date.now() - deviceA.signedInAt;
        expect(
          windowUsedMs,
          `Device A's first refresh was due ${SESSION_REFRESH_INTERVAL_MS}ms after its ` +
            `sign-in, and setting this test up took ${windowUsedMs}ms. Past that tick ` +
            'Device A is signed out, so this run proves nothing about the rejected ' +
            'transition. Treat it as a slow runner, not as a defect.',
        ).toBeLessThan(SESSION_REFRESH_INTERVAL_MS);

        await expect(shiftIndicator(deviceA.page)).toHaveText(SHIFT_LABELS.OnShift);

        await openAccountMenu(deviceA.page);
        await accountMenuButton(deviceA.page, 'Start break').click();

        await expect(nav(deviceA.page).getByRole('alert')).toHaveText(START_BREAK_REJECTED_MESSAGE);

        // The display re-reads the server and follows it: off shift, nav
        // collapsed, turned away from Sale to Home, and offered the one action
        // that makes sense now.
        await expect(shiftIndicator(deviceA.page)).toHaveText(SHIFT_LABELS.OffShift);
        await expect(deviceA.page).toHaveURL(SIGNED_IN_URL);
        await expectSuspendedNav(deviceA.page);
        await expect(accountMenuButton(deviceA.page, 'Clock in')).toBeVisible();
        await expect(accountMenuButton(deviceA.page, 'Start break')).toHaveCount(0);
      } finally {
        await deviceB.close();
        await deviceA.close();
      }
    },
  );
});
